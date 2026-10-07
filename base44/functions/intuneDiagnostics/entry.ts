import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { authorizeAdminAction } from '../../shared/rbacCheck.ts';
import { getAccessToken, getTenantCreds } from '../../shared/graphClient.ts';

// ─────────────────────────────────────────────────────────────────────────────
// intuneDiagnostics
//
// Read-only Microsoft Graph diagnostic engine for Intune, used as a tool by the
// Intune AI Assistant agent so its answers are grounded in live tenant data.
//
// Actions:
//   fleet_diagnosis      - environment-wide health snapshot (compliance, sync, OS mix)
//   compliance_diagnosis - devices failing compliance, with the exact failing
//                          settings and error codes per compliance policy
//   policy_diagnosis     - configuration / settings-catalog policies that are
//                          unassigned, erroring, conflicting or not applicable
//   update_diagnosis     - Windows update rings, update summaries and devices
//                          behind on builds / not checking in
//   device_diagnosis     - full deep dive on one device (by id or name)
//
// Every call is a GET - this function never changes tenant state.
// ─────────────────────────────────────────────────────────────────────────────

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_DEVICE_CAP = 700;
const MAX_DEEP_DIVE = 20;
const GRAPH_HINT =
  'Verify the app registration has DeviceManagementManagedDevices.Read.All, DeviceManagementConfiguration.Read.All and DeviceManagementApps.Read.All consented for this tenant.';

const DEVICE_SELECT = [
  'id', 'deviceName', 'operatingSystem', 'osVersion', 'complianceState',
  'userPrincipalName', 'lastSyncDateTime', 'enrolledDateTime', 'model',
  'manufacturer', 'serialNumber', 'managedDeviceOwnerType', 'managementAgent',
  'deviceEnrollmentType', 'isEncrypted', 'jailBroken',
].join(',');

// ── Graph helpers ────────────────────────────────────────────────────────────

async function graphFetch(token, path, version = 'v1.0', timeoutMs = 15000) {
  const res = await fetch(`https://graph.microsoft.com/${version}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`Graph ${res.status} on ${path.split('?')[0]}: ${detail.slice(0, 400)}`);
  }
  return res.json();
}

// Returns the fallback instead of throwing, so one permission gap does not
// discard an otherwise useful diagnosis.
async function safeGet(token, path, version = 'v1.0', fallback = { value: [] }) {
  try {
    return await graphFetch(token, path, version);
  } catch (e) {
    console.warn('[intuneDiagnostics] ' + e.message);
    return fallback;
  }
}

async function listCapped(token, path, cap = DEFAULT_DEVICE_CAP, version = 'v1.0') {
  let url = `https://graph.microsoft.com/${version}${path}`;
  const out = [];
  let page = 0;
  while (url && out.length < cap && page < 10) {
    page++;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch { /* ignore */ }
      throw new Error(`Graph ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out.slice(0, cap);
}

// Batches of 6 concurrent Graph calls (the worker holds 6 connections).
async function inBatches(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...(await Promise.allSettled(chunk.map(fn))));
  }
  return results;
}

function settledValue(settled) {
  return settled && settled.status === 'fulfilled' ? settled.value : null;
}

function listOf(settled) {
  const v = settledValue(settled);
  return (v && v.value) || [];
}

// ── Small utilities ──────────────────────────────────────────────────────────

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function escapeOData(value) {
  return String(value).replace(/'/g, "''");
}

function hoursSince(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((Date.now() - t) / 3600000);
}

function toHex(code) {
  const n = Number(code);
  if (!Number.isFinite(n) || n === 0) return null;
  return '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function finding(severity, area, detail, recommendation) {
  return { severity, area, detail, recommendation };
}

function trimDevice(d) {
  return {
    id: d.id,
    deviceName: d.deviceName,
    user: d.userPrincipalName,
    os: d.operatingSystem,
    osVersion: d.osVersion,
    complianceState: d.complianceState,
    ownership: d.managedDeviceOwnerType,
    enrollmentType: d.deviceEnrollmentType,
    managementAgent: d.managementAgent,
    encrypted: d.isEncrypted,
    jailBroken: d.jailBroken,
    model: d.model,
    manufacturer: d.manufacturer,
    serialNumber: d.serialNumber,
    enrolledDateTime: d.enrolledDateTime,
    lastSyncDateTime: d.lastSyncDateTime,
    lastSyncHoursAgo: hoursSince(d.lastSyncDateTime),
  };
}

// Windows build -> version label + support status (as of the Windows lifecycle).
function winVersionInfo(osVersion) {
  const raw = String(osVersion || '');
  const parts = raw.split('.');
  const build = parseInt(parts[2] || parts[1] || '0', 10) || 0;
  if (build >= 26100) return { label: 'Windows 11 24H2', build, generation: 'Windows 11', support: 'supported' };
  if (build >= 22631) return { label: 'Windows 11 23H2', build, generation: 'Windows 11', support: 'ended' };
  if (build >= 22621) return { label: 'Windows 11 22H2', build, generation: 'Windows 11', support: 'ended' };
  if (build >= 22000) return { label: 'Windows 11 21H2', build, generation: 'Windows 11', support: 'ended' };
  if (build >= 19045) return { label: 'Windows 10 22H2', build, generation: 'Windows 10', support: 'ended' };
  if (build >= 19044) return { label: 'Windows 10 21H2', build, generation: 'Windows 10', support: 'ended' };
  if (build >= 19043) return { label: 'Windows 10 21H1', build, generation: 'Windows 10', support: 'ended' };
  if (build >= 19042) return { label: 'Windows 10 20H2', build, generation: 'Windows 10', support: 'ended' };
  if (build > 0) return { label: `Windows 10 (older build ${build})`, build, generation: 'Windows 10', support: 'ended' };
  return { label: raw || 'Unknown', build: 0, generation: 'Unknown', support: 'unknown' };
}

const SUPPORT_NOTE = {
  ended: 'End of support already passed for this build.',
  supported: 'Within the supported lifecycle.',
  unknown: 'Could not determine the build.',
};

function mapPolicyStates(list, limit = 20) {
  const problemStates = ['error', 'conflict', 'noncompliant', 'notapplicable'];
  return (list || [])
    .slice()
    .sort((a, b) => {
      const aBad = problemStates.includes(String(a.state || '').toLowerCase()) ? 0 : 1;
      const bBad = problemStates.includes(String(b.state || '').toLowerCase()) ? 0 : 1;
      return aBad - bBad;
    })
    .slice(0, limit)
    .map((p) => ({
      policy: p.displayName || p.settingName || p.name,
      state: p.state,
      platform: p.platformType,
      errorCode: p.errorCode,
      errorCodeHex: toHex(p.errorCode),
      lastReported: p.lastReportedDateTime,
      failingSettings: (p.settingStates || [])
        .filter((s) => s.state && String(s.state).toLowerCase() !== 'compliant')
        .slice(0, 8)
        .map((s) => ({
          setting: s.settingName || s.setting,
          state: s.state,
          errorCode: s.errorCode,
          errorCodeHex: toHex(s.errorCode),
          errorDescription: s.errorDescription ? String(s.errorDescription).slice(0, 200) : undefined,
          currentValue: s.currentValue === undefined || s.currentValue === null
            ? undefined
            : String(typeof s.currentValue === 'object' ? JSON.stringify(s.currentValue) : s.currentValue).slice(0, 160),
        })),
    }));
}

function summariseTargets(list) {
  return (list || []).map((a) => {
    const type = String(a.target?.['@odata.type'] || '').replace('#microsoft.graph.', '') || 'unknown';
    if (type === 'groupAssignmentTarget' || type === 'exclusionGroupAssignmentTarget') {
      return { type, groupId: a.target?.groupId || null };
    }
    return { type };
  });
}

function pickUpdateSummary(s) {
  if (!s) return null;
  const keys = [
    'compliantDeviceCount', 'nonCompliantDeviceCount', 'notCompliantDeviceCount',
    'errorDeviceCount', 'conflictDeviceCount', 'notApplicableDeviceCount',
    'unknownDeviceCount', 'remediatedDeviceCount',
  ];
  const out = {};
  keys.forEach((k) => { if (typeof s[k] === 'number') out[k] = s[k]; });
  return Object.keys(out).length ? out : null;
}

function devicePath(cap) {
  return `/deviceManagement/managedDevices?$select=${DEVICE_SELECT}&$top=${cap > 200 ? 200 : cap}`;
}

// ── Action: fleet_diagnosis ──────────────────────────────────────────────────

async function fleetDiagnosis(token, tenantId, deviceCap) {
  const [devicesRes, compRes, cfgRes, updRes, compSettingRes] = await Promise.allSettled([
    listCapped(token, devicePath(deviceCap), deviceCap),
    safeGet(token, '/deviceManagement/deviceCompliancePolicyDeviceStateSummary', 'v1.0', null),
    safeGet(token, '/deviceManagement/deviceConfigurationDeviceStateSummary', 'v1.0', null),
    safeGet(token, '/deviceManagement/softwareUpdateStatusSummary', 'v1.0', null),
    safeGet(token, '/deviceManagement/deviceCompliancePolicySettingStateSummaries?$top=200', 'v1.0', { value: [] }),
  ]);

  if (devicesRes.status === 'rejected') {
    return {
      success: false,
      action: 'fleet_diagnosis',
      error: devicesRes.reason?.message || 'Could not read managed devices from Microsoft Graph.',
      hint: GRAPH_HINT,
    };
  }

  const devices = devicesRes.value || [];
  const byCompliance = countBy(devices, (d) => String(d.complianceState || 'unknown'));
  const byOs = countBy(devices, (d) => String(d.operatingSystem || 'unknown'));

  const stale = { under8h: 0, from8to24h: 0, from1to7d: 0, over7days: 0, neverReported: 0 };
  const windowsBuilds = {};

  devices.forEach((d) => {
    const hrs = hoursSince(d.lastSyncDateTime);
    if (hrs === null) stale.neverReported++;
    else if (hrs <= 8) stale.under8h++;
    else if (hrs <= 24) stale.from8to24h++;
    else if (hrs <= 168) stale.from1to7d++;
    else stale.over7days++;

    if (d.operatingSystem === 'Windows') {
      const v = winVersionInfo(d.osVersion);
      windowsBuilds[v.label] = (windowsBuilds[v.label] || 0) + 1;
    }
  });

  const compSettings = listOf(compSettingRes);
  const failingSettings = compSettings
    .filter((s) => (s.nonCompliantDeviceCount || 0) + (s.errorDeviceCount || 0) + (s.conflictDeviceCount || 0) > 0)
    .sort((a, b) =>
      ((b.nonCompliantDeviceCount || 0) + (b.errorDeviceCount || 0)) -
      ((a.nonCompliantDeviceCount || 0) + (a.errorDeviceCount || 0)))
    .slice(0, 10)
    .map((s) => ({
      setting: s.setting || s.settingName,
      platform: s.platformType,
      nonCompliantDevices: s.nonCompliantDeviceCount || 0,
      errorDevices: s.errorDeviceCount || 0,
      conflictDevices: s.conflictDeviceCount || 0,
      compliantDevices: s.compliantDeviceCount || 0,
    }));

  const staleDevices = devices
    .map(trimDevice)
    .filter((d) => d.lastSyncHoursAgo === null || d.lastSyncHoursAgo > 24)
    .sort((a, b) => (b.lastSyncHoursAgo ?? 99999) - (a.lastSyncHoursAgo ?? 99999))
    .slice(0, 12)
    .map((d) => ({ deviceName: d.deviceName, user: d.user, os: d.os, complianceState: d.complianceState, lastSyncHoursAgo: d.lastSyncHoursAgo }));

  const nonCompliantDevices = devices
    .map(trimDevice)
    .filter((d) => ['nonCompliant', 'error', 'conflict'].includes(String(d.complianceState)))
    .slice(0, 12)
    .map((d) => ({ id: d.id, deviceName: d.deviceName, user: d.user, os: d.os, osVersion: d.osVersion, complianceState: d.complianceState, lastSyncHoursAgo: d.lastSyncHoursAgo }));

  const findings = [];
  const nonCompliantCount = (byCompliance.nonCompliant || 0);
  if (nonCompliantCount > 0) {
    findings.push(finding(
      nonCompliantCount >= 10 || nonCompliantCount / Math.max(devices.length, 1) > 0.1 ? 'high' : 'medium',
      'Compliance',
      `${nonCompliantCount} of ${devices.length} managed devices are not compliant.`,
      'Run compliance_diagnosis to get the exact failing compliance settings and error codes per device.',
    ));
  }
  const notReporting = (byCompliance.unknown || 0) + (byCompliance.notEvaluated || 0) + (byCompliance.error || 0) + (byCompliance.conflict || 0);
  if (notReporting > 0) {
    findings.push(finding('medium', 'Compliance',
      `${notReporting} devices have no clean compliance result (unknown, not evaluated, error or conflict).`,
      'Devices in error/conflict usually have a policy conflict or a device agent problem. Check per-device states with device_diagnosis.'));
  }
  if (stale.over7days > 0) {
    findings.push(finding('high', 'Device check-in',
      `${stale.over7days} devices have not checked in to Intune for more than 7 days.`,
      'These devices receive no policy or update changes. Verify power, network and enrolment, then trigger a manual sync once reachable.'));
  }
  if (stale.from1to7d > 0) {
    findings.push(finding('medium', 'Device check-in',
      `${stale.from1to7d} devices last checked in between 1 and 7 days ago.`,
      'Check whether these are shared or rarely used devices; enforce a sync schedule if they should report daily.'));
  }
  const eosWindows10 = Object.entries(windowsBuilds)
    .filter(([label]) => label.startsWith('Windows 10'))
    .reduce((sum, [, n]) => sum + n, 0);
  if (eosWindows10 > 0) {
    findings.push(finding('high', 'Windows updates',
      `${eosWindows10} devices are still on Windows 10, which reached end of support on 14 October 2025.`,
      'Run update_diagnosis for the update ring configuration and upgrade readiness, then plan a Windows 11 upgrade for these devices.'));
  }
  if (failingSettings.length > 0) {
    findings.push(finding('info', 'Compliance',
      'The most widespread failing compliance settings are listed in failingSettings.',
      'Fix the top setting first, as it usually affects the most devices.'));
  }
  if (findings.length === 0) {
    findings.push(finding('info', 'Environment', 'No obvious Intune issues detected in this snapshot.', 'No action required.'));
  }

  return {
    success: true,
    action: 'fleet_diagnosis',
    tenant: tenantId,
    scope: { devicesScanned: devices.length, deviceCap, capReached: devices.length >= deviceCap },
    summary: {
      totalDevices: devices.length,
      byComplianceState: byCompliance,
      byOperatingSystem: byOs,
      checkInFreshness: stale,
      windowsBuilds,
    },
    graphRollups: {
      complianceDeviceStateSummary: settledValue(compRes),
      configurationDeviceStateSummary: settledValue(cfgRes),
      softwareUpdateStatusSummary: pickUpdateSummary(settledValue(updRes)),
    },
    mostFailingComplianceSettings: failingSettings,
    nonCompliantDevices,
    staleDevices,
    findings,
  };
}

// ── Action: compliance_diagnosis ─────────────────────────────────────────────

async function complianceDiagnosis(token, tenantId, deviceCap, deepLimit) {
  let devices;
  try {
    devices = await listCapped(token, devicePath(deviceCap), deviceCap);
  } catch (e) {
    return { success: false, action: 'compliance_diagnosis', error: e.message, hint: GRAPH_HINT };
  }

  const problemStates = ['nonCompliant', 'error', 'conflict'];
  const problemDevices = devices.filter((d) => problemStates.includes(String(d.complianceState))).slice(0, deepLimit);
  const notReporting = devices.filter((d) => ['unknown', 'notEvaluated', undefined, null].includes(d.complianceState));

  const [policiesRes, summaryRes, settingSummaryRes] = await Promise.allSettled([
    safeGet(token, '/deviceManagement/deviceCompliancePolicies?$select=id,displayName,lastModifiedDateTime,createdDateTime&$top=200', 'v1.0', { value: [] }),
    safeGet(token, '/deviceManagement/deviceCompliancePolicyDeviceStateSummary', 'v1.0', null),
    safeGet(token, '/deviceManagement/deviceCompliancePolicySettingStateSummaries?$top=200', 'v1.0', { value: [] }),
  ]);

  const stateResults = await inBatches(problemDevices, 6, (d) =>
    safeGet(token, `/deviceManagement/managedDevices/${d.id}/deviceCompliancePolicyStates?$expand=settingStates&$top=50`, 'v1.0', { value: [] }));

  const deviceFindings = problemDevices.map((d, i) => {
    const states = listOf(stateResults[i]);
    const trimmed = trimDevice(d);
    const policies = mapPolicyStates(states, 15);
    const codes = [];
    policies.forEach((p) => {
      if (p.errorCodeHex) codes.push({ policy: p.policy, errorCode: p.errorCode, errorCodeHex: p.errorCodeHex });
      p.failingSettings.forEach((s) => {
        if (s.errorCodeHex) codes.push({ policy: p.policy, setting: s.setting, errorCode: s.errorCode, errorCodeHex: s.errorCodeHex });
      });
    });
    return {
      device: { id: trimmed.id, deviceName: trimmed.deviceName, user: trimmed.user, os: trimmed.os, osVersion: trimmed.osVersion, complianceState: trimmed.complianceState, lastSyncHoursAgo: trimmed.lastSyncHoursAgo },
      failingCompliancePolicies: policies.filter((p) => String(p.state || '').toLowerCase() !== 'compliant'),
      allPolicyStates: policies,
      errorCodes: codes.slice(0, 12),
    };
  });

  const policies = listOf(policiesRes).slice(0, 30);
  const assignResults = await inBatches(policies, 6, (p) =>
    safeGet(token, `/deviceManagement/deviceCompliancePolicies/${p.id}/assignments?$top=25`, 'v1.0', { value: [] }));

  const policyInventory = policies.map((p, i) => {
    const targets = summariseTargets(listOf(assignResults[i]));
    return {
      name: p.displayName,
      id: p.id,
      lastModified: p.lastModifiedDateTime,
      assignedTo: targets,
      unassigned: targets.length === 0,
    };
  });

  const unassigned = policyInventory.filter((p) => p.unassigned);
  const settingsSummary = listOf(settingSummaryRes)
    .filter((s) => (s.nonCompliantDeviceCount || 0) + (s.errorDeviceCount || 0) > 0)
    .sort((a, b) => ((b.nonCompliantDeviceCount || 0) + (b.errorDeviceCount || 0)) - ((a.nonCompliantDeviceCount || 0) + (a.errorDeviceCount || 0)))
    .slice(0, 12)
    .map((s) => ({
      setting: s.setting || s.settingName,
      platform: s.platformType,
      nonCompliantDevices: s.nonCompliantDeviceCount || 0,
      errorDevices: s.errorDeviceCount || 0,
      conflictDevices: s.conflictDeviceCount || 0,
    }));

  const findings = [];
  if (problemDevices.length > 0) {
    findings.push(finding('high', 'Compliance',
      `${problemDevices.length} of ${devices.length} devices are non-compliant, in error or in conflict.`,
      'Review failingCompliancePolicies per device below; the failing settings carry the precise reason.'));
  }
  if (notReporting.length > 0) {
    findings.push(finding('medium', 'Compliance reporting',
      `${notReporting.length} devices have no compliance result yet (never evaluated or unknown).`,
      'A device reports compliance only after it checks in and evaluates its assigned policies. Confirm the policy is assigned to a group the device is a member of.'));
  }
  if (unassigned.length > 0) {
    findings.push(finding('high', 'Policy assignment',
      `${unassigned.length} compliance policies are not assigned to any group, so they never apply: ${unassigned.slice(0, 5).map((p) => `"${p.name}"`).join(', ')}${unassigned.length > 5 ? ', and more' : ''}.`,
      'Assign each policy to a device or user group (and exclude groups where needed) before expecting any device to evaluate it.'));
  }
  if (settingsSummary.length > 0) {
    findings.push(finding('info', 'Compliance',
      'The compliance settings failing across the most devices are listed in mostFailingSettings.',
      'Start with the top setting: it explains the largest share of non-compliance.'));
  }
  if (findings.length === 0) {
    findings.push(finding('info', 'Compliance', 'No compliance problems found in this snapshot.', 'No action required.'));
  }

  return {
    success: true,
    action: 'compliance_diagnosis',
    tenant: tenantId,
    scope: {
      devicesScanned: devices.length,
      deviceCap,
      devicesDeepDived: problemDevices.length,
      deepDiveLimit: deepLimit,
      note: 'Per-device policy detail is limited to the first devices in a problem state; raise device_limit for more.',
    },
    graphRollups: {
      complianceDeviceStateSummary: settledValue(summaryRes),
    },
    mostFailingSettings: settingsSummary,
    policies: policyInventory,
    unassignedPolicies: unassigned.map((p) => p.name),
    devices: deviceFindings,
    findings,
  };
}

// ── Action: policy_diagnosis ─────────────────────────────────────────────────

async function policyDiagnosis(token, tenantId, policyNameFilter) {
  const [configsRes, summaryRes, catalogRes] = await Promise.allSettled([
    safeGet(token, '/deviceManagement/deviceConfigurations?$select=id,displayName,lastModifiedDateTime,createdDateTime,platforms,technologies&$top=200', 'v1.0', { value: [] }),
    safeGet(token, '/deviceManagement/deviceConfigurationDeviceStateSummary', 'v1.0', null),
    safeGet(token, '/deviceManagement/configurationPolicies?$select=id,name,platforms,technologies,lastModifiedDateTime,isAssigned,settingCount&$top=200', 'beta', { value: [] }),
  ]);

  const nameFilter = policyNameFilter ? String(policyNameFilter).toLowerCase() : null;
  const matches = (name) => !nameFilter || String(name || '').toLowerCase().includes(nameFilter);

  const classic = listOf(configsRes).filter((p) => matches(p.displayName)).slice(0, 30);
  const catalog = listOf(catalogRes).filter((p) => matches(p.name)).slice(0, 30);

  const assignResults = await inBatches(classic, 6, (p) =>
    safeGet(token, `/deviceManagement/deviceConfigurations/${p.id}/assignments?$top=25`, 'v1.0', { value: [] }));

  const statusProbe = classic.slice(0, 10);
  const statusResults = await inBatches(statusProbe, 6, (p) =>
    safeGet(token, `/deviceManagement/deviceConfigurations/${p.id}/deviceStatuses?$top=25`, 'v1.0', { value: [] }));

  const policyList = classic.map((p, i) => {
    const targets = summariseTargets(listOf(assignResults[i]));
    const probeIndex = statusProbe.findIndex((s) => s.id === p.id);
    const statuses = probeIndex >= 0 ? listOf(statusResults[probeIndex]) : [];
    const counts = countBy(statuses, (s) => String(s.status || 'unknown'));
    return {
      source: 'deviceConfiguration',
      name: p.displayName,
      id: p.id,
      lastModified: p.lastModifiedDateTime,
      assignedTo: targets,
      unassigned: targets.length === 0,
      deviceStatusSample: statuses.length ? counts : null,
      errorDevices: statuses.filter((s) => ['error', 'conflict'].includes(String(s.status))).slice(0, 5).map((s) => ({
        device: s.deviceDisplayName,
        user: s.userPrincipalName,
        status: s.status,
        errorCode: s.errorCode,
        errorCodeHex: toHex(s.errorCode),
        lastReported: s.lastReportedDateTime,
      })),
    };
  });

  const catalogList = catalog.map((p) => ({
    source: 'settingsCatalog',
    name: p.name,
    id: p.id,
    lastModified: p.lastModifiedDateTime,
    platforms: p.platforms,
    technologies: p.technologies,
    settingCount: p.settingCount,
    unassigned: p.isAssigned === false,
  }));

  const unassignedClassic = policyList.filter((p) => p.unassigned);
  const unassignedCatalog = catalogList.filter((p) => p.unassigned);
  const erroringPolicies = policyList.filter((p) => (p.deviceStatusSample?.error || 0) + (p.deviceStatusSample?.conflict || 0) > 0);

  const findings = [];
  if (unassignedClassic.length + unassignedCatalog.length > 0) {
    const names = [...unassignedClassic, ...unassignedCatalog].slice(0, 6).map((p) => `"${p.name}"`).join(', ');
    findings.push(finding('high', 'Policy assignment',
      `${unassignedClassic.length + unassignedCatalog.length} configuration policies are not assigned to any group and can never apply: ${names}.`,
      'Assign each policy to the correct device or user group, and add exclusion groups for devices that must not receive it.'));
  }
  if (erroringPolicies.length > 0) {
    findings.push(finding('high', 'Policy delivery',
      `These policies report errors or conflicts on devices: ${erroringPolicies.slice(0, 5).map((p) => `"${p.name}"`).join(', ')}.`,
      'Conflicts mean two policies set the same setting on one device. Errors with a 0x87D... code usually mean the device did not reach the required state or the platform in the policy does not match the device.'));
  }
  const summary = settledValue(summaryRes);
  if (summary && (summary.errorDeviceCount || 0) + (summary.conflictDeviceCount || 0) > 0) {
    findings.push(finding('medium', 'Policy delivery',
      `${(summary.errorDeviceCount || 0) + (summary.conflictDeviceCount || 0)} device-policy pairs are in error or conflict across the tenant.`,
      'Drill into the affected devices with device_diagnosis to see which setting is failing.'));
  }
  if (findings.length === 0) {
    findings.push(finding('info', 'Policies',
      nameFilter ? `No unassigned or failing policies matched "${policyNameFilter}".` : 'No unassigned or failing configuration policies detected.',
      'No action required.'));
  }

  return {
    success: true,
    action: 'policy_diagnosis',
    tenant: tenantId,
    scope: {
      classicPoliciesScanned: classic.length,
      settingsCatalogPoliciesScanned: catalog.length,
      deviceStatusSampleSize: 25,
      note: 'deviceStatusSample counts come from up to 25 device statuses per policy, so they indicate presence of failures, not exact totals.',
    },
    graphRollups: { configurationDeviceStateSummary: summary },
    policies: policyList,
    settingsCatalogPolicies: catalogList,
    unassignedPolicies: [...unassignedClassic, ...unassignedCatalog].map((p) => p.name),
    findings,
  };
}

// ── Action: update_diagnosis ─────────────────────────────────────────────────

function trimRing(r) {
  return {
    id: r.id,
    name: r.displayName,
    automaticUpdateMode: r.automaticUpdateMode,
    qualityUpdateDeferralDays: r.qualityUpdatesDeferralPeriodInDays,
    featureUpdateDeferralDays: r.featureUpdatesDeferralPeriodInDays,
    qualityDeadlineDays: r.deadlineForQualityUpdatesInDays,
    deadlineGracePeriodDays: r.deadlineGracePeriodInDays,
    allowWindows11Upgrade: r.allowWindows11Upgrade,
    businessReadyOnly: r.businessReadyUpdatesOnly,
    microsoftUpdateServiceAllowed: r.microsoftUpdateServiceAllowed,
    driversExcluded: r.driversExcluded,
    scheduledInstallDay: r.scheduledInstallDay,
    scheduledInstallTime: r.scheduledInstallTime,
    lastModified: r.lastModifiedDateTime,
  };
}

async function updateDiagnosis(token, tenantId, deviceCap) {
  const [devicesRes, summaryRes, ringsRes, catalogRes, qualityRes, featureRes] = await Promise.allSettled([
    listCapped(token, devicePath(deviceCap), deviceCap),
    safeGet(token, '/deviceManagement/softwareUpdateStatusSummary', 'v1.0', null),
    safeGet(token, `/deviceManagement/deviceConfigurations?$filter=${encodeURIComponent("isof('microsoft.graph.windowsUpdateForBusinessConfiguration')")}`, 'v1.0', { value: [] }),
    safeGet(token, '/deviceManagement/windowsUpdateCatalogItems?$top=50', 'beta', { value: [] }),
    safeGet(token, '/deviceManagement/windowsQualityUpdateProfiles?$top=50', 'beta', { value: [] }),
    safeGet(token, '/deviceManagement/windowsFeatureUpdateProfiles?$top=50', 'beta', { value: [] }),
  ]);

  if (devicesRes.status === 'rejected') {
    return { success: false, action: 'update_diagnosis', error: devicesRes.reason?.message, hint: GRAPH_HINT };
  }

  const devices = devicesRes.value || [];
  const windows = devices.filter((d) => d.operatingSystem === 'Windows');

  const buildCounts = {};
  const endOfSupport = [];
  windows.forEach((d) => {
    const v = winVersionInfo(d.osVersion);
    buildCounts[v.label] = (buildCounts[v.label] || 0) + 1;
    if (v.support === 'ended') {
      endOfSupport.push({
        id: d.id,
        deviceName: d.deviceName,
        user: d.userPrincipalName,
        osVersion: d.osVersion,
        buildLabel: v.label,
        complianceState: d.complianceState,
        lastSyncHoursAgo: hoursSince(d.lastSyncDateTime),
      });
    }
  });

  const rings = listOf(ringsRes);
  const ringAssignments = await inBatches(rings.slice(0, 10), 6, (r) =>
    safeGet(token, `/deviceManagement/deviceConfigurations/${r.id}/assignments?$top=25`, 'v1.0', { value: [] }));

  const ringList = rings.slice(0, 10).map((r, i) => ({
    ...trimRing(r),
    assignedTo: summariseTargets(listOf(ringAssignments[i])),
  }));

  const silentDevices = windows
    .filter((d) => (hoursSince(d.lastSyncDateTime) ?? 99999) > 168)
    .slice(0, 12)
    .map((d) => ({ deviceName: d.deviceName, user: d.userPrincipalName, osVersion: d.osVersion, lastSyncHoursAgo: hoursSince(d.lastSyncDateTime) }));

  const updateSummary = pickUpdateSummary(settledValue(summaryRes));
  const findings = [];

  if (endOfSupport.length > 0) {
    findings.push(finding('high', 'Windows updates',
      `${endOfSupport.length} Windows devices are running a build that has passed end of support (mostly Windows 10).`,
      'Assign a Windows 11 upgrade policy or update ring with allowWindows11Upgrade enabled, and confirm the devices meet the Windows 11 hardware requirements.'));
  }
  if (rings.length === 0) {
    findings.push(finding('high', 'Update rings',
      'No Windows Update for Business ring (feature or quality update policy) is configured for this tenant.',
      'Devices are taking updates from Windows Update defaults, which gives no control over deferrals or deadlines. Create an update ring and assign it to a device group.'));
  } else {
    const unassignedRings = ringList.filter((r) => r.assignedTo.length === 0);
    if (unassignedRings.length > 0) {
      findings.push(finding('high', 'Update rings',
        `These update rings are not assigned to any group, so they apply to no device: ${unassignedRings.map((r) => `"${r.name}"`).join(', ')}.`,
        'Assign each ring to a device group. An unassigned ring has no effect even though it looks configured.'));
    }
    if (ringList.length > 0 && ringList.every((r) => (r.qualityUpdateDeferralDays || 0) === 0)) {
      findings.push(finding('info', 'Update rings',
        'No ring defers quality updates, so patches install as soon as they are released.',
        'Consider a small pilot ring with a deferral to catch bad patches before broad rollout.'));
    }
  }
  if (updateSummary && (updateSummary.nonCompliantDeviceCount || updateSummary.notCompliantDeviceCount || 0) > 0) {
    findings.push(finding('medium', 'Windows updates',
      `${updateSummary.nonCompliantDeviceCount || updateSummary.notCompliantDeviceCount} devices are behind on Windows updates.`,
      'Check those devices are covered by an update ring and syncing; devices that stopped checking in will not receive updates.'));
  }
  if (silentDevices.length > 0) {
    findings.push(finding('medium', 'Windows updates',
      `${silentDevices.length} Windows devices have not checked in for over 7 days.`,
      'A device that is not checking in cannot apply updates. Confirm the device is powered on and connected, then trigger a sync.'));
  }
  if (findings.length === 0) {
    findings.push(finding('info', 'Windows updates', 'Update rings are configured and no devices are on an out-of-support build.', 'No action required.'));
  }

  return {
    success: true,
    action: 'update_diagnosis',
    tenant: tenantId,
    scope: {
      devicesScanned: devices.length,
      windowsDevices: windows.length,
      deviceCap,
      note: 'Software update summary counts come from Microsoft Graph; catalogue and profile data requires Windows Update for Business reporting to be enabled.',
      supportReference: SUPPORT_NOTE.ended,
    },
    graphRollups: {
      softwareUpdateStatusSummary: updateSummary,
      updateCatalogItemsAvailable: listOf(catalogRes).length,
      qualityUpdateProfiles: listOf(qualityRes).length,
      featureUpdateProfiles: listOf(featureRes).length,
    },
    windowsBuilds: buildCounts,
    updateRings: ringList,
    devicesPastEndOfSupport: endOfSupport.slice(0, 15),
    devicesNotCheckingIn: silentDevices,
    findings,
  };
}

// ── Action: device_diagnosis ─────────────────────────────────────────────────

async function deviceDiagnosis(token, tenantId, body) {
  const deviceId = body.device_id ? String(body.device_id).trim() : null;
  const deviceName = body.device_name ? String(body.device_name).trim() : null;

  if (!deviceId && !deviceName) {
    return { success: false, action: 'device_diagnosis', error: 'Provide device_id or device_name.' };
  }

  let device = null;
  if (deviceId) {
    device = await safeGet(token, `/deviceManagement/managedDevices/${deviceId}?$select=${DEVICE_SELECT}`, 'v1.0', null);
    if (!device) {
      return { success: false, action: 'device_diagnosis', error: `No managed device found with id ${deviceId}.` };
    }
  } else {
    const exact = await listCapped(
      token,
      `/deviceManagement/managedDevices?$filter=${encodeURIComponent(`deviceName eq '${escapeOData(deviceName)}'`)}&$select=${DEVICE_SELECT}&$top=25`,
      50,
    );
    if (exact.length > 0) {
      device = exact[0];
    } else {
      const prefix = await listCapped(
        token,
        `/deviceManagement/managedDevices?$filter=${encodeURIComponent(`startswith(deviceName,'${escapeOData(deviceName)}')`)}&$select=${DEVICE_SELECT}&$top=25`,
        50,
      );
      if (prefix.length === 0) {
        return {
          success: false,
          action: 'device_diagnosis',
          error: `No managed device name matched "${deviceName}".`,
          hint: 'Use the exact device name as it appears in Intune, or run fleet_diagnosis to list devices.',
        };
      }
      device = prefix[0];
    }
  }

  const [compStatesRes, cfgStatesRes, protectionRes] = await Promise.allSettled([
    safeGet(token, `/deviceManagement/managedDevices/${device.id}/deviceCompliancePolicyStates?$expand=settingStates&$top=50`, 'v1.0', { value: [] }),
    safeGet(token, `/deviceManagement/managedDevices/${device.id}/deviceConfigurationStates?$expand=settingStates&$top=50`, 'v1.0', { value: [] }),
    safeGet(token, `/deviceManagement/managedDevices/${device.id}/windowsProtectionState`, 'beta', null),
  ]);

  const trimmed = trimDevice(device);
  const version = device.operatingSystem === 'Windows' ? winVersionInfo(device.osVersion) : null;
  const compliancePolicies = mapPolicyStates(listOf(compStatesRes), 20);
  const configurationPolicies = mapPolicyStates(listOf(cfgStatesRes), 20);

  const failingCompliance = compliancePolicies.filter((p) => String(p.state || '').toLowerCase() !== 'compliant');
  const failingConfiguration = configurationPolicies.filter((p) => !['success', 'compliant'].includes(String(p.state || '').toLowerCase()));

  const findings = [];
  const staleHours = trimmed.lastSyncHoursAgo;
  if (staleHours === null) {
    findings.push(finding('high', 'Device check-in', 'This device has never reported a check-in time.', 'Re-enrol or verify the device is still managed.'));
  } else if (staleHours > 168) {
    findings.push(finding('high', 'Device check-in', `Last check-in was ${staleHours} hours (${Math.round(staleHours / 24)} days) ago.`,
      'Policies and updates cannot reach the device. Confirm the device is on, connected and still enrolled, then trigger a sync.'));
  } else if (staleHours > 24) {
    findings.push(finding('medium', 'Device check-in', `Last check-in was ${staleHours} hours ago.`,
      'Recent policy changes may not have been applied yet. A manual sync from the Devices page will pull them down.'));
  }
  if (trimmed.complianceState !== 'compliant') {
    findings.push(finding('high', 'Compliance', `Device compliance state is "${trimmed.complianceState}".`,
      failingCompliance.length
        ? `Failing policies: ${failingCompliance.map((p) => `"${p.policy}"`).join(', ')}. Fix the failing settings listed below (they carry the error codes).`
        : 'No per-policy detail was returned; the device may not have evaluated its compliance policies yet.'));
  }
  if (failingConfiguration.length > 0) {
    findings.push(finding('medium', 'Configuration policies',
      `${failingConfiguration.length} configuration policies are not applied successfully on this device: ${failingConfiguration.slice(0, 5).map((p) => `"${p.policy}" (${p.state})`).join(', ')}.`,
      'A "notApplicable" state means the policy targets a different platform, edition or OS version than this device runs. Errors and conflicts carry an error code you can look up.'));
  }
  if (version && version.support === 'ended') {
    findings.push(finding('high', 'Windows updates', `Device runs ${version.label}, which has passed end of support.`,
      'Plan an upgrade to a supported Windows 11 build via an update ring or upgrade policy.'));
  }
  if (device.operatingSystem === 'Windows' && !device.lastSyncDateTime) {
    findings.push(finding('medium', 'Enrolment', 'No last sync timestamp is recorded for this device.',
      'Check enrolment state and whether the device still has a valid management certificate.'));
  }
  if (findings.length === 0) {
    findings.push(finding('info', 'Device', 'No device issues detected.', 'No action required.'));
  }

  return {
    success: true,
    action: 'device_diagnosis',
    tenant: tenantId,
    device: trimmed,
    windowsVersion: version ? { ...version, supportNote: SUPPORT_NOTE[version.support] } : null,
    compliancePolicies,
    configurationPolicies,
    failingCompliancePolicies: failingCompliance.map((p) => p.policy),
    failingConfigurationPolicies: failingConfiguration.map((p) => ({ policy: p.policy, state: p.state, errorCodeHex: p.errorCodeHex })),
    protectionState: settledValue(protectionRes)
      ? {
        deviceState: settledValue(protectionRes).deviceState,
        malwareProtectionEnabled: settledValue(protectionRes).malwareProtectionEnabled,
        realTimeProtectionEnabled: settledValue(protectionRes).realTimeProtectionEnabled,
        antivirusRequired: settledValue(protectionRes).antivirusRequired,
        antiSpywareEnabled: settledValue(protectionRes).antiSpywareEnabled,
        lastReported: settledValue(protectionRes).lastReportedDateTime,
      }
      : null,
    findings,
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'fleet_diagnosis';
    const azureTenantId = body.azure_tenant_id;

    const denied = await authorizeAdminAction(base44, user, [azureTenantId]);
    if (denied) return denied;

    if (!azureTenantId || !GUID_REGEX.test(String(azureTenantId))) {
      return Response.json({
        success: false,
        error: 'Invalid or missing azure_tenant_id. Pass the Azure Tenant ID (GUID) of the tenant to diagnose.',
      }, { status: 400 });
    }

    const { clientId, clientSecret } = await getTenantCreds(base44, azureTenantId);
    const token = await getAccessToken(azureTenantId, clientId, clientSecret);

    const deviceCap = clampInt(body.device_cap, DEFAULT_DEVICE_CAP, 50, 1200);
    const deepLimit = clampInt(body.device_limit, 12, 1, MAX_DEEP_DIVE);

    if (action === 'fleet_diagnosis') return Response.json(await fleetDiagnosis(token, azureTenantId, deviceCap));
    if (action === 'compliance_diagnosis') return Response.json(await complianceDiagnosis(token, azureTenantId, deviceCap, deepLimit));
    if (action === 'policy_diagnosis') return Response.json(await policyDiagnosis(token, azureTenantId, body.policy_name));
    if (action === 'update_diagnosis') return Response.json(await updateDiagnosis(token, azureTenantId, deviceCap));
    if (action === 'device_diagnosis') return Response.json(await deviceDiagnosis(token, azureTenantId, body));

    return Response.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[intuneDiagnostics] failed:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}