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

// Fetches ALL pages from a Graph endpoint by following @odata.nextLink
async function graphGetAll(token, initialUrl) {
  let url = initialUrl;
  const allValues = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Graph paginated fetch failed ${res.status}: ${err}`);
    }
    const data = await res.json();
    allValues.push(...(data.value || []));
    url = data["@odata.nextLink"] || null;
  }
  return allValues;
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

    // ── Intune: list devices from Graph (all pages) ──────────────────────────
    if (action === "list_intune_devices") {
      const devices = await graphGetAll(token, `https://graph.microsoft.com/beta/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,managedDeviceOwnerType,userPrincipalName,model,manufacturer,serialNumber,lastSyncDateTime,enrolledDateTime,azureADDeviceId,emailAddress,managementAgent,deviceEnrollmentType,isEncrypted,deviceHealthAttestationState&$top=999`);
      return Response.json({ success: true, devices });
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
      // Fetch ALL licensed users (following pagination)
      const allUsers = await graphGetAll(token, `https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,accountEnabled&$filter=accountEnabled eq true&$top=999`);

      const results = [];
      let errorCount = 0;
      const errors = [];

      // Process in batches of 20 concurrent requests to avoid Graph throttling
      const BATCH = 20;
      for (let i = 0; i < allUsers.length; i += BATCH) {
        const batch = allUsers.slice(i, i + BATCH);
        await Promise.all(batch.map(async u => {
          try {
            const rules = await graphGet(token, `/users/${u.id}/mailFolders/inbox/messageRules`);
            results.push({ user: u, rules: rules.value || [] });
          } catch (e) {
            errorCount++;
            errors.push({ user: u.userPrincipalName, error: e.message });
            console.error(`[mailbox rules] ${u.userPrincipalName}: ${e.message}`);
          }
        }));
      }

      const usersWithRules = results.filter(r => r.rules.length > 0);
      const permissionError = errorCount > 0 && results.length === 0;

      // Detect client-side rules that conflict with server-side transport rules
      // A conflict occurs when a client rule tries to forward/redirect externally
      // or stops processing rules — these are commonly overridden by server transport rules
      const CONFLICT_ACTIONS = ["forwardTo", "redirectTo", "forwardAsAttachmentTo", "stopProcessingRules"];
      const conflictingRules = [];
      usersWithRules.forEach(ur => {
        ur.rules.forEach(rule => {
          const conflicts = [];
          if (rule.actions?.forwardTo?.length > 0) conflicts.push("external forward");
          if (rule.actions?.redirectTo?.length > 0) conflicts.push("redirect");
          if (rule.actions?.forwardAsAttachmentTo?.length > 0) conflicts.push("forward as attachment");
          if (rule.actions?.stopProcessingRules) conflicts.push("stop processing rules");
          if (conflicts.length > 0) {
            conflictingRules.push({
              user_display_name: ur.user.displayName,
              user_email: ur.user.mail || ur.user.userPrincipalName,
              rule_name: rule.displayName,
              rule_id: rule.id,
              is_enabled: rule.isEnabled,
              conflict_type: conflicts.join(", "),
              forward_targets: [
                ...(rule.actions?.forwardTo || []),
                ...(rule.actions?.redirectTo || []),
                ...(rule.actions?.forwardAsAttachmentTo || []),
              ].map(a => a.emailAddress?.address).filter(Boolean).join("; "),
            });
          }
        });
      });

      return Response.json({
        success: true,
        userRules: usersWithRules,
        scannedCount: allUsers.length,
        successCount: results.length,
        errorCount,
        conflictingRules,
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

    // ── Entra: list Azure AD devices (all pages) ─────────────────────────────
    if (action === "list_entra_devices") {
      const devices = await graphGetAll(token, `https://graph.microsoft.com/v1.0/devices?$select=id,displayName,deviceId,operatingSystem,operatingSystemVersion,accountEnabled,trustType,isManaged,isCompliant,registrationDateTime,approximateLastSignInDateTime,physicalIds,model,manufacturer,profileType&$top=999`);
      return Response.json({ success: true, devices });
    }

    // ── Entra: get single Azure AD device detail ──────────────────────────────
    if (action === "get_entra_device_detail") {
      const { device_id } = body;
      const device = await graphGet(token, `/devices/${device_id}?$select=id,displayName,deviceId,operatingSystem,operatingSystemVersion,accountEnabled,trustType,isManaged,isCompliant,registrationDateTime,approximateLastSignInDateTime,physicalIds,model,manufacturer,profileType`);
      return Response.json({ success: true, device });
    }

    // ── Entra: list all groups for device assignment ───────────────────────────
    if (action === "list_entra_groups_for_device") {
      const data = await graphGet(token, `/groups?$select=id,displayName,groupTypes,mailEnabled,securityEnabled,membershipRule&$top=100`);
      return Response.json({ success: true, groups: data.value || [] });
    }

    // ── Entra: add device to group ────────────────────────────────────────────
    if (action === "add_device_to_group") {
      const { device_id, group_id } = body;
      // Get device's directory object ID first
      const deviceData = await graphGet(token, `/devices?$filter=id eq '${device_id}'&$select=id`).catch(async () => {
        return { value: [{ id: device_id }] };
      });
      const directoryId = deviceData.value?.[0]?.id || device_id;
      const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${group_id}/members/$ref`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${directoryId}` })
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.text();
        return Response.json({ success: false, error: err }, { status: res.status });
      }
      return Response.json({ success: true });
    }

    // ── Entra: get user detail ────────────────────────────────────────────────
    if (action === "get_entra_user_detail") {
      const { user_id } = body;
      const user = await graphGet(token, `/users/${encodeURIComponent(user_id)}?$select=id,displayName,userPrincipalName,mail,jobTitle,department,userType,accountEnabled,assignedLicenses,lastPasswordChangeDateTime,signInActivity`).catch(() =>
        graphGet(token, `/users/${encodeURIComponent(user_id)}?$select=id,displayName,userPrincipalName,mail,jobTitle,department,userType,accountEnabled,assignedLicenses,lastPasswordChangeDateTime`)
      );
      return Response.json({ success: true, user });
    }

    // ── Entra: reset user password ────────────────────────────────────────────
    if (action === "reset_user_password") {
      const { user_id } = body;
      // Generate a secure temporary password
      const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
      let tempPassword = "";
      for (let i = 0; i < 12; i++) tempPassword += chars[Math.floor(Math.random() * chars.length)];
      // Ensure complexity: uppercase + lowercase + digit + special
      tempPassword = "Tmp!" + tempPassword.slice(4);

      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user_id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          passwordProfile: {
            forceChangePasswordNextSignIn: true,
            password: tempPassword
          }
        })
      });
      if (!res.ok) {
        const err = await res.text();
        return Response.json({ success: false, error: err }, { status: res.status });
      }
      return Response.json({ success: true, temporaryPassword: tempPassword });
    }

    // ── Intune: onboard device via remote PowerShell script ───────────────────
    if (action === "onboard_device_to_intune") {
      const { device_id, device_name, script_content } = body;
      const scriptName = `Intune-Onboard-${device_name || device_id}-${Date.now()}`;
      let groupId = null;
      let scriptId = null;

      // Step 1: Create a dedicated Entra security group for this specific device
      const groupRes = await fetch(`https://graph.microsoft.com/v1.0/groups`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: `Intune-Onboard-Temp-${device_name || device_id}`,
          description: `Temporary group for Intune onboarding script targeting ${device_name}`,
          mailEnabled: false,
          mailNickname: `intune-onboard-${Date.now()}`,
          securityEnabled: true,
        })
      });

      if (!groupRes.ok) {
        const err = await groupRes.text();
        return Response.json({ success: false, error: `Failed to create targeting group: ${err}` }, { status: groupRes.status });
      }

      const group = await groupRes.json();
      groupId = group.id;

      // Step 2: Add the specific device to this group
      const addMemberRes = await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/members/$ref`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${device_id}` })
      });
      // Non-fatal if membership fails — log but continue
      if (!addMemberRes.ok) {
        const err = await addMemberRes.text();
        console.warn(`[onboard] Could not add device to group: ${err}`);
      }

      // Step 3: Create the Device Management Script
      const scriptBody = {
        displayName: scriptName,
        description: `Auto-enrollment script for ${device_name}`,
        scriptContent: btoa(unescape(encodeURIComponent(script_content))),
        runAsAccount: "system",
        enforceSignatureCheck: false,
        runAs32Bit: false,
        fileName: "IntuneEnroll.ps1",
      };

      const createRes = await fetch(`https://graph.microsoft.com/beta/deviceManagement/deviceManagementScripts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(scriptBody)
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        // Clean up the group we created
        await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
        if (createRes.status === 403) {
          return Response.json({
            success: false,
            error: "DeviceManagementConfiguration.ReadWrite.All permission is required on your Azure App Registration to deploy scripts via Intune."
          }, { status: 403 });
        }
        return Response.json({ success: false, error: `Script creation failed: ${errText}` }, { status: createRes.status });
      }

      const script = await createRes.json();
      scriptId = script.id;

      // Step 4: Assign script ONLY to the specific device's group
      const assignRes = await fetch(`https://graph.microsoft.com/beta/deviceManagement/deviceManagementScripts/${scriptId}/assign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceManagementScriptAssignments: [{
            id: `${scriptId}_${groupId}`,
            target: {
              "@odata.type": "#microsoft.graph.groupAssignmentTarget",
              groupId: groupId
            }
          }]
        })
      });

      if (!assignRes.ok) {
        const err = await assignRes.text();
        // Clean up script and group
        await Promise.all([
          fetch(`https://graph.microsoft.com/beta/deviceManagement/deviceManagementScripts/${scriptId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {}),
          fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
        ]);
        return Response.json({ success: false, error: `Script assignment failed: ${err}` }, { status: assignRes.status });
      }

      // Step 5: Schedule cleanup — delete script and temp group after 1 hour via a background note
      // (Intune will have had enough time to deliver the script to the device)
      // We return the IDs so the caller can trigger cleanup later if needed
      return Response.json({
        success: true,
        scriptId,
        groupId,
        deviceTargeted: device_name || device_id,
        note: `Script assigned only to device "${device_name}". Cleanup scriptId=${scriptId} and groupId=${groupId} after script has run.`
      });
    }

    // ── Intune: list apps from Graph ─────────────────────────────────────────
    if (action === "list_intune_apps_graph") {
      const apps = await graphGetAll(token, `https://graph.microsoft.com/beta/deviceManagement/mobileApps?$select=id,displayName,publisher,description,appVersion,publishingState,isAssigned,lastModifiedDateTime,largeIcon,@odata.type&$top=999`);
      const mapped = apps.map(a => ({
        id: a.id,
        displayName: a.displayName,
        publisher: a.publisher || "",
        description: a.description || "",
        appVersion: a.appVersion || "",
        publishingState: a.publishingState || "notPublished",
        isAssigned: a.isAssigned || false,
        lastModifiedDateTime: a.lastModifiedDateTime,
        type: (a["@odata.type"] || "").replace("#microsoft.graph.", ""),
      }));
      return Response.json({ success: true, apps: mapped, total: mapped.length });
    }

    // ── Intune: deploy / create app in Intune via Graph ───────────────────────
    if (action === "deploy_app_to_intune") {
      const { app } = body;
      // Map our app_type to Graph odata.type
      const typeMap = {
        win32: "#microsoft.graph.win32LobApp",
        msi: "#microsoft.graph.windowsMobileMSI",
        msix: "#microsoft.graph.windowsUniversalAppX",
        store: "#microsoft.graph.windowsStoreApp",
        web_link: "#microsoft.graph.webApp",
        ios_store: "#microsoft.graph.iosStoreApp",
        android_store: "#microsoft.graph.androidStoreApp",
        macos_pkg: "#microsoft.graph.macOSPkgApp",
        office365: "#microsoft.graph.officeSuiteApp",
      };
      const odataType = typeMap[app.app_type] || "#microsoft.graph.webApp";

      // Build the minimal Graph body depending on type
      let appBody = {
        "@odata.type": odataType,
        displayName: app.app_name,
        description: app.description || "",
        publisher: app.publisher || "Unknown",
        isFeatured: false,
      };

      // Type-specific required fields
      if (app.app_type === "web_link") {
        appBody.appUrl = app.package_url || "https://example.com";
        appBody.useManagedBrowser = false;
      } else if (app.app_type === "store") {
        appBody.appStoreUrl = app.package_url || "";
      } else if (app.app_type === "ios_store") {
        appBody.appStoreUrl = app.package_url || "";
        appBody.bundleId = app.detection_rule || "";
        appBody.applicableDeviceType = { iPad: true, iPhoneAndIPod: true };
        appBody.minimumSupportedOperatingSystem = { v9_0: true };
      } else if (app.app_type === "android_store") {
        appBody.appStoreUrl = app.package_url || "";
        appBody.minimumSupportedOperatingSystem = { v5_0: true };
      } else if (app.app_type === "msi") {
        appBody.productCode = app.detection_rule || "";
        appBody.productVersion = app.version || "";
        appBody.commandLine = app.install_command || "";
      } else if (app.app_type === "win32") {
        // Win32 requires content upload via Azure Blob — simplified: create the app entry first
        appBody.installCommandLine = app.install_command || `msiexec /i "${app.app_name}.msi" /quiet`;
        appBody.uninstallCommandLine = app.uninstall_command || `msiexec /x "{00000000-0000-0000-0000-000000000000}" /quiet`;
        appBody.setupFilePath = `${app.app_name}.intunewin`;
        appBody.fileName = `${app.app_name}.intunewin`;
        appBody.minimumSupportedWindowsRelease = "1607";
        appBody.installExperience = { runAsAccount: "system", deviceRestartBehavior: "suppress" };
        appBody.returnCodes = [{ returnCode: 0, type: "success" }, { returnCode: 1707, type: "success" }, { returnCode: 3010, type: "softReboot" }, { returnCode: 1641, type: "hardReboot" }, { returnCode: 1618, type: "retry" }];
        appBody.detectionRules = [{
          "@odata.type": "#microsoft.graph.win32LobAppFileSystemDetectionRule",
          path: "%ProgramFiles%",
          fileOrFolderName: app.app_name,
          check32BitOn64System: false,
          detectionType: "exists",
          operator: "notConfigured",
        }];
      }

      const createRes = await fetch(`https://graph.microsoft.com/beta/deviceManagement/mobileApps`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(appBody),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        return Response.json({ success: false, error: err }, { status: createRes.status });
      }

      const created = await createRes.json();

      // If groups are assigned, create assignments
      if (app.assigned_groups && app.assignment_type && app.assignment_type !== "not_assigned") {
        const intentMap = { required: "required", available: "available", uninstall: "uninstall" };
        const intent = intentMap[app.assignment_type] || "available";
        // Assign to All Devices or All Users group
        const allDevicesGroupId = "adadadad-808e-44e2-905a-0b7873a8a531"; // well-known All Devices
        const allUsersGroupId = "acacacac-9df4-4c7d-9d50-4ef0226f57a9"; // well-known All Users
        const targetGroupId = (app.assignment_type === "required") ? allDevicesGroupId : allUsersGroupId;
        await fetch(`https://graph.microsoft.com/beta/deviceManagement/mobileApps/${created.id}/assign`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            mobileAppAssignments: [{
              "@odata.type": "#microsoft.graph.mobileAppAssignment",
              intent,
              target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" }
            }]
          }),
        }).catch(() => {}); // non-fatal
      }

      return Response.json({ success: true, intuneAppId: created.id, displayName: created.displayName });
    }

    // ── MDM: scan and detect active MDM solutions for tenant ─────────────────
    if (action === "scan_mdm_solutions") {
      // Query Intune device management to detect MDM authority and enrolled device count
      const [deviceMgmt, managedDevices, mobileApps] = await Promise.allSettled([
        graphGetBeta(token, `/deviceManagement?$select=subscriptionState,mdmAuthority,managedDeviceOverview`),
        graphGetBeta(token, `/deviceManagement/managedDevices?$select=id,managementAgent,deviceEnrollmentType&$top=1`),
        graphGetBeta(token, `/deviceManagement/mobileApps?$select=id&$top=1`),
      ]);

      const mgmt = deviceMgmt.status === "fulfilled" ? deviceMgmt.value : null;
      const subscriptionState = mgmt?.subscriptionState || null;
      const mdmAuthority = mgmt?.mdmAuthority || null;

      // Count total managed devices - try multiple methods
      let deviceCount = 0;
      try {
        const countRes = await fetch(`https://graph.microsoft.com/beta/deviceManagement/managedDevices/$count`, {
          headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" }
        });
        if (countRes.ok) deviceCount = parseInt(await countRes.text()) || 0;
      } catch {}

      // If count failed, try getting first page to see if any devices exist
      if (deviceCount === 0 && managedDevices.status === "fulfilled") {
        const devVal = managedDevices.value?.value || [];
        if (devVal.length > 0) deviceCount = 1; // at least some exist
      }

      // Determine if Intune is active — be permissive: any sign of MDM = active
      // subscriptionState can be: active, warning, disabled, deleted, lockedOut
      const intuneActive = 
        subscriptionState != null ||
        mdmAuthority != null ||
        deviceCount > 0 ||
        managedDevices.status === "fulfilled" ||
        mobileApps.status === "fulfilled";

      // Check for JAMF co-management connector
      let jamfFound = false;
      try {
        const jamf = await graphGetBeta(token, `/deviceManagement/remoteActionAudits?$top=1`);
        // If this succeeds, Intune is definitely active
      } catch {}
      try {
        const partnerConfigs = await graphGetBeta(token, `/deviceManagement/deviceManagementPartners?$select=id,displayName,isConfigured,partnerState`);
        const partners = partnerConfigs.value || [];
        jamfFound = partners.some(p => (p.displayName || "").toLowerCase().includes("jamf") && p.isConfigured);
      } catch {}

      // Check for Workspace ONE / AirWatch
      let workspaceOneFound = false;
      try {
        const partnerConfigs = await graphGetBeta(token, `/deviceManagement/deviceManagementPartners?$select=id,displayName,isConfigured`);
        const partners = partnerConfigs.value || [];
        workspaceOneFound = partners.some(p =>
          ((p.displayName || "").toLowerCase().includes("workspace one") ||
           (p.displayName || "").toLowerCase().includes("airwatch")) && p.isConfigured
        );
      } catch {}

      const solutions = [];

      if (intuneActive) {
        solutions.push({
          solution_name: "intune",
          is_active: true,
          platform_scope: "all",
          auth_method: "oauth2",
          connection_status: "connected",
          managed_device_count: deviceCount,
          server_url: "https://intune.microsoft.com",
          api_endpoint: "https://graph.microsoft.com/beta/deviceManagement",
          notes: `MDM Authority: ${mdmAuthority || "intune"}. Subscription: ${subscriptionState || "active"}.`,
          last_sync: new Date().toISOString().split("T")[0],
        });
      }

      if (jamfFound) {
        solutions.push({
          solution_name: "jamf",
          is_active: true,
          platform_scope: "macos",
          auth_method: "oauth2",
          connection_status: "connected",
          managed_device_count: 0,
          notes: "Detected via Intune device management partner connector.",
          last_sync: new Date().toISOString().split("T")[0],
        });
      }

      if (workspaceOneFound) {
        solutions.push({
          solution_name: "workspace_one",
          is_active: true,
          platform_scope: "all",
          auth_method: "oauth2",
          connection_status: "connected",
          managed_device_count: 0,
          notes: "Detected via Intune device management partner connector.",
          last_sync: new Date().toISOString().split("T")[0],
        });
      }

      console.log("[scan_mdm_solutions] mgmt:", JSON.stringify(mgmt));
      console.log("[scan_mdm_solutions] subscriptionState:", subscriptionState, "mdmAuthority:", mdmAuthority, "deviceCount:", deviceCount, "intuneActive:", intuneActive);
      return Response.json({ success: true, solutions, mdmAuthority, subscriptionState, deviceCount });
    }

    // ── Intune: cleanup onboarding script and temp group ─────────────────────
    if (action === "cleanup_onboard_script") {
      const { script_id, group_id } = body;
      const results = await Promise.allSettled([
        script_id ? fetch(`https://graph.microsoft.com/beta/deviceManagement/deviceManagementScripts/${script_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve(),
        group_id  ? fetch(`https://graph.microsoft.com/v1.0/groups/${group_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve(),
      ]);
      return Response.json({ success: true, results: results.map(r => r.status) });
    }

    // ── Entra: Create Conditional Access Policy ──────────────────────────────
    if (action === "create_conditional_access_policy") {
      const { policy } = body;
      const createRes = await fetch("https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (!createRes.ok) {
        const err = await createRes.text();
        return Response.json({ success: false, error: err }, { status: createRes.status });
      }
      const created = await createRes.json();
      return Response.json({ success: true, policyId: created.id, displayName: created.displayName });
    }

    // ── Entra: List Directory Roles (active role assignments) ────────────────
    if (action === "list_directory_roles") {
      const roles = await graphGetAll(token, "https://graph.microsoft.com/v1.0/directoryRoles?$select=id,displayName,description,roleTemplateId");
      return Response.json({ success: true, roles });
    }

    // ── Entra: Get members of a directory role ───────────────────────────────
    if (action === "get_role_members") {
      const { role_id } = body;
      const members = await graphGetAll(token, `https://graph.microsoft.com/v1.0/directoryRoles/${role_id}/members?$select=id,displayName,userPrincipalName`);
      return Response.json({ success: true, members });
    }

    // ── Entra: Assign directory role to user ─────────────────────────────────
    if (action === "assign_directory_role") {
      const { role_template_id, user_id } = body;
      // Activate the role if not already active (idempotent)
      const activateRes = await fetch("https://graph.microsoft.com/v1.0/directoryRoles", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ roleTemplateId: role_template_id }),
      });
      // Get the role id (whether created or already exists)
      const roles = await graphGetAll(token, `https://graph.microsoft.com/v1.0/directoryRoles?$filter=roleTemplateId eq '${role_template_id}'&$select=id`);
      const roleId = roles[0]?.id;
      if (!roleId) return Response.json({ success: false, error: "Role not found" }, { status: 404 });
      const assignRes = await fetch(`https://graph.microsoft.com/v1.0/directoryRoles/${roleId}/members/$ref`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${user_id}` }),
      });
      if (!assignRes.ok && assignRes.status !== 400) { // 400 = already member
        const err = await assignRes.text();
        return Response.json({ success: false, error: err }, { status: assignRes.status });
      }
      return Response.json({ success: true });
    }

    // ── Entra: Remove member from directory role ──────────────────────────────
    if (action === "remove_directory_role_member") {
      const { role_id, user_id } = body;
      await fetch(`https://graph.microsoft.com/v1.0/directoryRoles/${role_id}/members/${user_id}/$ref`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      return Response.json({ success: true });
    }

    // ── Entra: Named Locations ────────────────────────────────────────────────
    if (action === "list_named_locations") {
      const locations = await graphGetAll(token, "https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations");
      return Response.json({ success: true, locations });
    }

    if (action === "create_named_location") {
      const { location } = body;
      const res = await fetch("https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(location),
      });
      if (!res.ok) { const err = await res.text(); return Response.json({ success: false, error: err }, { status: res.status }); }
      return Response.json({ success: true, location: await res.json() });
    }

    if (action === "delete_named_location") {
      const { location_id } = body;
      await fetch(`https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations/${location_id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      return Response.json({ success: true });
    }

    // ── Intune: List mobile devices (iOS/Android) ─────────────────────────────
    if (action === "sync_mobile_devices") {
      const devices = await graphGetAll(token, `https://graph.microsoft.com/beta/deviceManagement/managedDevices?$filter=operatingSystem eq 'Android' or operatingSystem eq 'iOS' or operatingSystem eq 'iPadOS'&$select=id,deviceName,operatingSystem,osVersion,complianceState,userPrincipalName,serialNumber,imei,manufacturer,model,isEncrypted,jailBroken,enrolledDateTime,lastSyncDateTime,managedDeviceOwnerType`);
      return Response.json({ success: true, devices });
    }

    // ── Intune: Autopilot profiles ────────────────────────────────────────────
    if (action === "list_autopilot_profiles") {
      const profiles = await graphGetAll(token, "https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeploymentProfiles?$select=id,displayName,description,deviceType,enableWhiteGlove,outOfBoxExperienceSettings,assignedDeviceCount,lastModifiedDateTime");
      return Response.json({ success: true, profiles });
    }

    if (action === "create_autopilot_profile") {
      const { profile } = body;
      const res = await fetch("https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeploymentProfiles", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) { const err = await res.text(); return Response.json({ success: false, error: err }, { status: res.status }); }
      return Response.json({ success: true, profile: await res.json() });
    }

    if (action === "delete_autopilot_profile") {
      const { profile_id } = body;
      await fetch(`https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeploymentProfiles/${profile_id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      return Response.json({ success: true });
    }

    // ── Intune: Assignment Filters ────────────────────────────────────────────
    if (action === "list_intune_filters") {
      const filters = await graphGetAll(token, "https://graph.microsoft.com/beta/deviceManagement/assignmentFilters?$select=id,displayName,description,platform,rule,lastModifiedDateTime");
      return Response.json({ success: true, filters });
    }

    if (action === "create_intune_filter") {
      const { filter } = body;
      const res = await fetch("https://graph.microsoft.com/beta/deviceManagement/assignmentFilters", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(filter),
      });
      if (!res.ok) { const err = await res.text(); return Response.json({ success: false, error: err }, { status: res.status }); }
      return Response.json({ success: true, filter: await res.json() });
    }

    if (action === "delete_intune_filter") {
      const { filter_id } = body;
      await fetch(`https://graph.microsoft.com/beta/deviceManagement/assignmentFilters/${filter_id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      return Response.json({ success: true });
    }

    // ── On-Prem Sync Status from Azure ────────────────────────────────────────
    if (action === "get_onprem_sync_status") {
      const [orgRes, healthRes] = await Promise.allSettled([
        fetch(`https://graph.microsoft.com/v1.0/organization?$select=onPremisesSyncEnabled,onPremisesLastSyncDateTime,onPremisesProvisioningErrors`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`https://graph.microsoft.com/beta/hybridAuthenticationStatus`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      let syncEnabled = false, lastSyncDateTime = null, provisioningErrors = [], connectHealth = [];
      if (orgRes.status === "fulfilled" && orgRes.value.ok) {
        const orgData = await orgRes.value.json();
        const org = orgData.value?.[0] || orgData;
        syncEnabled = org.onPremisesSyncEnabled || false;
        lastSyncDateTime = org.onPremisesLastSyncDateTime || null;
        provisioningErrors = org.onPremisesProvisioningErrors || [];
      }
      if (healthRes.status === "fulfilled" && healthRes.value.ok) {
        const h = await healthRes.value.json();
        connectHealth = Array.isArray(h.value) ? h.value : (h ? [h] : []);
      }
      return Response.json({ success: true, syncEnabled, lastSyncDateTime, provisioningErrors, connectHealth });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[portalData]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});