import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

import { format, startOfDay } from 'npm:date-fns@3.6.0';

const GLOBAL_CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
const GLOBAL_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");

async function getAccessToken(tenantId, clientId, clientSecret) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default"
  });
  const res = await fetch(url, { method: "POST", body });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function graphGet(token, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph ${path} failed ${res.status}: ${err}`);
  }
  return res.json();
}

async function graphGetBeta(token, path) {
  const res = await fetch(`https://graph.microsoft.com/beta${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph beta ${path} failed ${res.status}: ${err}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, azure_tenant_id, top = 50 } = body;

    // ── Look up per-tenant credentials ───────────────────────────────────────
    let clientId = GLOBAL_CLIENT_ID;
    let clientSecret = GLOBAL_CLIENT_SECRET;
    try {
      const tenantRecords = await base44.asServiceRole.entities.Tenant.filter({ tenant_id: azure_tenant_id });
      const tenantRecord = tenantRecords[0];
      if (tenantRecord?.azure_client_id) clientId = tenantRecord.azure_client_id;
      if (tenantRecord?.azure_client_secret) clientSecret = tenantRecord.azure_client_secret;
    } catch (e) {
      console.warn("[portalData] Could not look up per-tenant creds:", e.message);
    }

    const token = await getAccessToken(azure_tenant_id, clientId, clientSecret);

    // ── Exchange: list mailboxes ─────────────────────────────────────────────
    if (action === "list_mailboxes") {
      const data = await graphGet(token, `/users?$select=id,displayName,mail,userPrincipalName,accountEnabled,jobTitle,department,assignedLicenses&$top=${top}`);
      return Response.json({ success: true, mailboxes: data.value || [] });
    }

    // ── Exchange: get mailbox details ────────────────────────────────────────
    if (action === "get_mailbox") {
      const { user_id } = body;
      const [details, mailSettings] = await Promise.all([
        graphGet(token, `/users/${user_id}?$select=id,displayName,mail,userPrincipalName,accountEnabled,jobTitle,department,assignedLicenses,createdDateTime,lastPasswordChangeDateTime`),
        graphGet(token, `/users/${user_id}/mailboxSettings`).catch(() => ({})),
      ]);
      return Response.json({ success: true, details, mailSettings });
    }

    // ── Defender: list incidents ─────────────────────────────────────────────
    if (action === "list_incidents") {
      const data = await graphGet(token, `/security/incidents?$top=${top}&$orderby=lastUpdateDateTime desc`);
      return Response.json({ success: true, incidents: data.value || [] });
    }

    // ── Defender: list alerts ────────────────────────────────────────────────
    if (action === "list_alerts") {
      const { severity, status } = body;
      let filter = "";
      if (severity && severity !== "all") filter += `severity eq '${severity}'`;
      if (status && status !== "all") filter += (filter ? " and " : "") + `status eq '${status}'`;
      const qs = filter ? `&$filter=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`https://graph.microsoft.com/v1.0/security/alerts_v2?$top=${top}&$orderby=createdDateTime desc${qs}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 403) {
        return Response.json({ success: false, permission_error: true, alerts: [], message: "Missing permission: SecurityAlert.Read.All must be granted in your Azure App Registration." });
      }
      if (!res.ok) throw new Error(`Defender alerts failed: ${res.status}`);
      const data = await res.json();
      return Response.json({ success: true, alerts: data.value || [] });
    }

    // ── Defender: update alert status ────────────────────────────────────────
    if (action === "update_alert") {
      const { alert_id, status: alertStatus, classification, determination } = body;
      const patchBody = {};
      if (alertStatus) patchBody.status = alertStatus;
      if (classification) patchBody.classification = classification;
      if (determination) patchBody.determination = determination;
      const res = await fetch(`https://graph.microsoft.com/v1.0/security/alerts_v2/${alert_id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patchBody)
      });
      if (!res.ok) throw new Error(`Alert update failed: ${res.status}`);
      return Response.json({ success: true });
    }

    // ── Service Health ───────────────────────────────────────────────────────
    if (action === "service_health") {
      const data = await graphGet(token, "/admin/serviceAnnouncement/healthOverviews?$expand=issues");
      return Response.json({ success: true, services: data.value || [] });
    }

    // ── Teams: list teams ────────────────────────────────────────────────────
    if (action === "list_teams") {
      const data = await graphGet(token, `/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')&$select=id,displayName,description,mail,visibility,createdDateTime&$top=${top}`);
      return Response.json({ success: true, teams: data.value || [] });
    }

    // ── SharePoint: list sites ───────────────────────────────────────────────
    if (action === "list_sites") {
      let sites = [];
      try {
        const data = await graphGet(token, `/sites/root/sites?$select=id,displayName,webUrl,description,createdDateTime,lastModifiedDateTime&$top=${top}`);
        sites = data.value || [];
      } catch {
        return Response.json({ success: true, sites: [], warning: "Sites.Read.All permission required in Azure App Registration to list SharePoint sites." });
      }
      return Response.json({ success: true, sites });
    }

    // ── Intune: list devices from Graph ─────────────────────────────────────
    if (action === "list_intune_devices") {
      const data = await graphGetBeta(token, `/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,managedDeviceOwnerType,userPrincipalName,model,manufacturer,serialNumber,lastSyncDateTime,enrolledDateTime,azureADDeviceId,emailAddress,managementAgent,deviceEnrollmentType,isEncrypted,deviceHealthAttestationState&$top=${top}`);
      return Response.json({ success: true, devices: data.value || [] });
    }

    // ── Entra: get MFA auth methods for a user ───────────────────────────────
    if (action === "get_user_mfa_methods") {
      const { user_upn } = body;
      if (!user_upn) return Response.json({ error: "user_upn required" }, { status: 400 });
      // Lookup user ID first
      const userRes = await graphGet(token, `/users/${encodeURIComponent(user_upn)}?$select=id`);
      const userId = userRes.id;
      if (!userId) return Response.json({ methods: [] });
      const methodsRes = await graphGet(token, `/users/${userId}/authentication/methods`);
      return Response.json({ success: true, methods: methodsRes.value || [] });
    }

    // ── Intune: get Windows Update compliance across all devices ─────────────
    if (action === "get_windows_update_compliance") {
      const { age_days = 90 } = body;
      const data = await graphGetBeta(token, `/deviceManagement/managedDevices?$filter=operatingSystem eq 'Windows'&$select=id,deviceName,operatingSystem,osVersion,complianceState,userPrincipalName,lastSyncDateTime,manufacturer,model&$top=100`);
      const devices = data.value || [];
      const cutoff = new Date(Date.now() - age_days * 86400000);
      const staleCount = devices.filter(d => !d.lastSyncDateTime || new Date(d.lastSyncDateTime) < cutoff).length;
      const compliant = devices.filter(d => d.complianceState === "compliant").length;
      const nonCompliant = devices.filter(d => d.complianceState === "noncompliant").length;
      return Response.json({
        success: true,
        devices,
        summary: { total: devices.length, compliant, nonCompliant, stale: staleCount },
      });
    }

    // ── Intune: get Windows Update states for a device ──────────────────────
    if (action === "get_device_updates") {
      const { device_id } = body;
      const [protectionState, compliancePolicies, configStates, deviceDetail] = await Promise.all([
        graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}/windowsProtectionState`).catch(() => ({})),
        graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}/deviceCompliancePolicyStates?$top=50`).catch(() => ({ value: [] })),
        graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}/deviceConfigurationStates?$top=50`).catch(() => ({ value: [] })),
        graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}?$select=id,deviceName,osVersion,complianceState,lastSyncDateTime,lastLogOnDateTime`).catch(() => ({})),
      ]);
      // Filter update-related config/compliance states
      const updatePolicies = (compliancePolicies.value || []).filter(p =>
        p.displayName?.toLowerCase().includes("update") ||
        p.displayName?.toLowerCase().includes("windows") ||
        p.platformType?.toLowerCase().includes("windows")
      );
      const updateConfigs = (configStates.value || []).filter(c =>
        c.displayName?.toLowerCase().includes("update") ||
        c.displayName?.toLowerCase().includes("windows update") ||
        c.displayName?.toLowerCase().includes("wu ")
      );
      return Response.json({
        success: true,
        protectionState,
        updatePolicies,
        updateConfigs,
        allCompliancePolicies: compliancePolicies.value || [],
        allConfigStates: configStates.value || [],
        deviceDetail,
      });
    }

    // ── Intune: remediate device (sync/scan) ─────────────────────────────────
    if (action === "remediate_device") {
      const { device_id, remediation_type } = body;
      let url = `https://graph.microsoft.com/beta/deviceManagement/managedDevices/${device_id}/`;
      if (remediation_type === "sync") url += "syncDevice";
      else if (remediation_type === "defender_scan_quick") url += "windowsDefenderScan";
      else if (remediation_type === "defender_scan_full") url += "windowsDefenderScan";
      else if (remediation_type === "restart") url += "rebootNow";
      else if (remediation_type === "update_policies") url += "syncDevice";
      else throw new Error("Unknown remediation type");

      const body2 = remediation_type === "defender_scan_full"
        ? JSON.stringify({ quickScan: false })
        : remediation_type === "defender_scan_quick"
        ? JSON.stringify({ quickScan: true })
        : null;

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, ...(body2 ? { "Content-Type": "application/json" } : {}) },
        ...(body2 ? { body: body2 } : {}),
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.text();
        return Response.json({ success: false, error: err }, { status: res.status });
      }
      return Response.json({ success: true });
    }

    // ── Intune: get single device full detail ────────────────────────────────
    if (action === "get_device_detail") {
      const { device_id } = body;
      const [detail, health, configStatuses, compliancePolicies] = await Promise.all([
        graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}`),
        graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}/deviceHealthAttestationState`).catch(() => ({})),
        graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}/deviceConfigurationStates?$top=50`).catch(() => ({ value: [] })),
        graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}/deviceCompliancePolicyStates?$top=50`).catch(() => ({ value: [] })),
      ]);
      return Response.json({
        success: true,
        detail,
        health,
        configStatuses: configStatuses.value || [],
        compliancePolicies: compliancePolicies.value || [],
      });
    }

    // ── Intune: get device script deployment status ──────────────────────────
    if (action === "get_device_scripts") {
      const { device_id } = body;
      const data = await graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}/deviceRunStates?$expand=deviceHealthScriptRunSummary&$top=50`).catch(() => ({ value: [] }));
      const scripts = await graphGetBeta(token, `/deviceManagement/deviceManagementScripts?$top=50`).catch(() => ({ value: [] }));
      return Response.json({ success: true, scriptRunStates: data.value || [], scripts: scripts.value || [] });
    }

    // ── Intune: get device app deployment status ─────────────────────────────
    if (action === "get_device_apps") {
      const { device_id } = body;
      const data = await graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}/deviceInstallStates?$top=100`).catch(() => ({ value: [] }));
      return Response.json({ success: true, appInstallStates: data.value || [] });
    }

    // ── Intune: get all installed apps on a device (discovered apps) ──────────
    if (action === "get_device_installed_apps") {
      const { device_id } = body;
      const data = await graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}/detectedApps?$top=200`).catch(() => ({ value: [] }));
      const apps = data.value || [];
      // Check for Automate agent presence
      const automateKeywords = ["automate", "connectwise automate", "labtech", "labtech agent", "automate agent"];
      const automateAgent = apps.find(a =>
        automateKeywords.some(kw => (a.displayName || "").toLowerCase().includes(kw))
      );
      const sophosKeywords = ["sophos", "sophos endpoint", "sophos agent", "sophos anti-virus", "sophos intercept"];
      const sophosAgent = apps.find(a =>
        sophosKeywords.some(kw => (a.displayName || "").toLowerCase().includes(kw))
      );
      return Response.json({
        success: true,
        installedApps: apps,
        automateAgentFound: !!automateAgent,
        automateAgentDetails: automateAgent || null,
        sophosAgentFound: !!sophosAgent,
        sophosAgentDetails: sophosAgent || null,
      });
    }

    // ── Intune: sync device ──────────────────────────────────────────────────
    if (action === "sync_device") {
      const { device_id } = body;
      const res = await fetch(`https://graph.microsoft.com/beta/deviceManagement/managedDevices/${device_id}/syncDevice`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
      return Response.json({ success: true });
    }

    // ── Exchange: list mail-enabled groups ───────────────────────────────────
    if (action === "list_mail_groups") {
      const data = await graphGet(token, `/groups?$filter=mailEnabled eq true&$select=id,displayName,mail,groupTypes,mailNickname,description,createdDateTime&$top=${top}`);
      return Response.json({ success: true, groups: data.value || [] });
    }

    // ── Exchange: get group members ───────────────────────────────────────────
    if (action === "get_group_members") {
      const { group_id } = body;
      const data = await graphGet(token, `/groups/${group_id}/members?$select=id,displayName,mail,userPrincipalName&$top=100`);
      return Response.json({ success: true, members: data.value || [] });
    }

    // ── Exchange: scan all users' inbox rules ─────────────────────────────────
    if (action === "get_all_mailbox_rules") {
      const usersData = await graphGet(token, `/users?$select=id,displayName,mail,userPrincipalName,accountEnabled&$top=50`);
      const allUsers = (usersData.value || []).slice(0, 40);
      const results = [];
      let errorCount = 0;
      const errors = [];

      await Promise.all(allUsers.map(async u => {
        try {
          const rules = await graphGet(token, `/users/${u.id}/mailFolders/inbox/messageRules`);
          results.push({ user: u, rules: rules.value || [] });
        } catch (e) {
          errorCount++;
          errors.push({ user: u.userPrincipalName, error: e.message });
          console.error(`[mailbox rules] ${u.userPrincipalName}: ${e.message}`);
        }
      }));

      const usersWithRules = results.filter(r => r.rules.length > 0);
      const permissionError = errorCount > 0 && usersWithRules.length === 0;

      return Response.json({
        success: true,
        userRules: usersWithRules,
        scannedCount: allUsers.length,
        successCount: results.length,
        errorCount,
        permissionError,
        permissionNote: permissionError
          ? "Could not read inbox rules. Ensure MailboxSettings.Read or Mail.ReadBasic app permission is granted in your Azure App Registration."
          : null,
        sampleError: errors[0]?.error || null,
      });
    }

    // ── Exchange: delete a mailbox rule ──────────────────────────────────────
    if (action === "delete_mailbox_rule") {
      const { user_id, rule_id } = body;
      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${user_id}/mailFolders/inbox/messageRules/${rule_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.text();
        return Response.json({ success: false, error: err }, { status: res.status });
      }
      return Response.json({ success: true });
    }

    // ── Exchange: update/disable a mailbox rule ───────────────────────────────
    if (action === "update_mailbox_rule") {
      const { user_id, rule_id, patch } = body;
      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${user_id}/mailFolders/inbox/messageRules/${rule_id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!res.ok) {
        const err = await res.text();
        return Response.json({ success: false, error: err }, { status: res.status });
      }
      const updated = await res.json();
      return Response.json({ success: true, rule: updated });
    }

    // ── Device: performance & compliance state timeline ───────────────────────
    if (action === "get_device_performance") {
      const { device_id } = body;
      const [detail, complianceStates, configStates] = await Promise.all([
        graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}?$select=id,deviceName,operatingSystem,osVersion,complianceState,isEncrypted,totalStorageSpaceInBytes,freeStorageSpaceInBytes,processorArchitecture,lastSyncDateTime,deviceHealthAttestationState,model,manufacturer`).catch(() => ({})),
        graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}/deviceCompliancePolicyStates?$top=50`).catch(() => ({ value: [] })),
        graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}/deviceConfigurationStates?$top=50`).catch(() => ({ value: [] })),
      ]);
      return Response.json({
        success: true,
        device: detail,
        complianceStates: complianceStates.value || [],
        configStates: configStates.value || [],
      });
    }

    // ── Exchange: import / create a single mailbox rule ───────────────────────
    if (action === "import_mailbox_rule") {
      const { user_id, rule } = body;
      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${user_id}/mailFolders/inbox/messageRules`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(rule)
      });
      if (!res.ok) {
        const err = await res.text();
        return Response.json({ success: false, error: err }, { status: res.status });
      }
      const created = await res.json();
      return Response.json({ success: true, rule: created });
    }

    // ── Exchange: security posture report ─────────────────────────────────────
    if (action === "exchange_security_report") {
      const [secureScores, controlProfiles, domains, usersData] = await Promise.all([
        graphGet(token, `/security/secureScores?$top=1`).catch(() => ({ value: [] })),
        graphGet(token, `/security/secureScoreControlProfiles?$top=100`).catch(() => ({ value: [] })),
        graphGet(token, `/domains?$select=id,isDefault,isVerified,authenticationType`).catch(() => ({ value: [] })),
        graphGet(token, `/users?$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses,userType&$top=100`).catch(() => ({ value: [] })),
      ]);
      const userList = usersData.value || [];
      const forwardingRisks = [];
      await Promise.all(userList.slice(0, 25).map(async u => {
        try {
          const rules = await graphGet(token, `/users/${u.id}/mailFolders/inbox/messageRules`);
          const fwd = (rules.value || []).filter(r =>
            r.actions?.forwardTo?.length > 0 ||
            r.actions?.redirectTo?.length > 0 ||
            r.actions?.forwardAsAttachmentTo?.length > 0
          );
          if (fwd.length > 0) forwardingRisks.push({ user: u, rules: fwd });
        } catch {}
      }));
      const emailControls = (controlProfiles.value || []).filter(c =>
        c.actionUrl?.toLowerCase().includes('exchange') ||
        c.title?.toLowerCase().includes('mail') ||
        c.title?.toLowerCase().includes('phish') ||
        c.title?.toLowerCase().includes('spam') ||
        c.title?.toLowerCase().includes('email') ||
        c.controlCategory === 'Apps'
      );
      return Response.json({
        success: true,
        secureScore: secureScores.value?.[0] || null,
        emailControls,
        domains: domains.value || [],
        userCount: userList.length,
        enabledUsers: userList.filter(u => u.accountEnabled).length,
        guestUsers: userList.filter(u => u.userType === 'Guest'),
        disabledWithLicense: userList.filter(u => !u.accountEnabled && (u.assignedLicenses?.length || 0) > 0),
        forwardingRisks,
      });
    }

    // ── Defender: aggregate threat insights across all Windows devices ────────
    if (action === "get_threat_insights") {
      // Fetch all Windows devices with protection state
      const devicesData = await graphGetBeta(token, `/deviceManagement/managedDevices?$filter=operatingSystem eq 'Windows'&$select=id,deviceName,userPrincipalName,complianceState,lastSyncDateTime&$top=100`).catch(() => ({ value: [] }));
      const allDevices = devicesData.value || [];

      // Fetch protection states in parallel (batch of 40 max)
      const batch = allDevices.slice(0, 40);
      const protectionResults = await Promise.all(
        batch.map(d =>
          graphGetBeta(token, `/deviceManagement/managedDevices/${d.id}/windowsProtectionState`)
            .then(ps => ({ ...d, ...ps }))
            .catch(() => ({ ...d }))
        )
      );

      // Extract threat detections from detected malware state
      const detectedThreats = [];
      const alertsByDayMap = {};

      for (const dev of protectionResults) {
        if (!dev.id) continue;
        try {
          const malware = await graphGetBeta(token, `/deviceManagement/managedDevices/${dev.id}/windowsProtectionState/detectedMalwareState?$top=50`).catch(() => ({ value: [] }));
          (malware.value || []).forEach(m => {
            const dateKey = m.detectedDateTime
              ? format(startOfDay(new Date(m.detectedDateTime)), "MMM d")
              : null;
            if (dateKey) alertsByDayMap[dateKey] = (alertsByDayMap[dateKey] || 0) + 1;
            detectedThreats.push({
              ...m,
              deviceName: dev.deviceName,
              userPrincipalName: dev.userPrincipalName,
            });
          });
        } catch {}
      }

      const alertsByDay = Object.entries(alertsByDayMap)
        .map(([date, detections]) => ({ date, detections }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      // Build simplified device list with AV freshness info
      const devices = protectionResults.map(d => ({
        id: d.id,
        deviceName: d.deviceName,
        userPrincipalName: d.userPrincipalName,
        complianceState: d.complianceState,
        lastSyncDateTime: d.lastSyncDateTime,
        realTimeProtectionEnabled: d.realTimeProtectionEnabled,
        antivirusSignatureVersion: d.antivirusSignatureVersion,
        signatureLastUpdateDateTime: d.signatureUpdateOverdue ? null : d.lastReportedDateTime,
        signatureUpdateOverdue: d.signatureUpdateOverdue,
        malwareProtectionEnabled: d.malwareProtectionEnabled,
      }));

      return Response.json({ success: true, detectedThreats, devices, alertsByDay });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[portalData]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});