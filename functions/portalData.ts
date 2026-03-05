import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");

async function getAccessToken(tenantId) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
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
    const token = await getAccessToken(azure_tenant_id);

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
      // Try search endpoint first, fall back to root subsites
      let sites = [];
      try {
        const data = await graphGet(token, `/sites/root/sites?$select=id,displayName,webUrl,description,createdDateTime,lastModifiedDateTime&$top=${top}`);
        sites = data.value || [];
      } catch {
        // If root/sites also fails, return empty with message
        return Response.json({ success: true, sites: [], warning: "Sites.Read.All permission required in Azure App Registration to list SharePoint sites." });
      }
      return Response.json({ success: true, sites });
    }

    // ── Intune: list devices from Graph ─────────────────────────────────────
    if (action === "list_intune_devices") {
      const data = await graphGetBeta(token, `/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,managedDeviceOwnerType,userPrincipalName,model,manufacturer,serialNumber,lastSyncDateTime,enrolledDateTime,azureADDeviceId,emailAddress,managementAgent,deviceEnrollmentType,isEncrypted,deviceHealthAttestationState&$top=${top}`);
      return Response.json({ success: true, devices: data.value || [] });
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
      // Also try deviceManagementScripts run states
      const scripts = await graphGetBeta(token, `/deviceManagement/deviceManagementScripts?$top=50`).catch(() => ({ value: [] }));
      return Response.json({ success: true, scriptRunStates: data.value || [], scripts: scripts.value || [] });
    }

    // ── Intune: get device app deployment status ─────────────────────────────
    if (action === "get_device_apps") {
      const { device_id } = body;
      const data = await graphGetBeta(token, `/deviceManagement/managedDevices/${device_id}/deviceInstallStates?$top=100`).catch(() => ({ value: [] }));
      return Response.json({ success: true, appInstallStates: data.value || [] });
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

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[portalData]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});