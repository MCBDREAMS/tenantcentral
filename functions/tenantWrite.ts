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

async function graphPatch(token, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PATCH ${path} failed ${res.status}: ${err}`);
  }
  return res.status === 204 ? {} : res.json();
}

async function graphPost(token, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`POST ${path} failed ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function graphDelete(token, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    throw new Error(`DELETE ${path} failed ${res.status}: ${err}`);
  }
  return { success: true };
}

// Compliance Reporting: fetch all devices + their compliance status
async function getComplianceReport(token) {
  const [devices, policies] = await Promise.all([
    fetchAll(token, "/deviceManagement/managedDevices?$select=id,deviceName,complianceState,operatingSystem,userPrincipalName,lastSyncDateTime&$top=999"),
    fetchAll(token, "/deviceManagement/deviceCompliancePolicies?$select=id,displayName,lastModifiedDateTime&$top=999"),
  ]);
  const compliant = devices.filter(d => d.complianceState === "compliant").length;
  const nonCompliant = devices.filter(d => d.complianceState === "noncompliant").length;
  const inGrace = devices.filter(d => d.complianceState === "inGracePeriod").length;
  const unknown = devices.filter(d => !["compliant","noncompliant","inGracePeriod"].includes(d.complianceState)).length;
  return { devices, policies, stats: { compliant, nonCompliant, inGrace, unknown, total: devices.length } };
}

async function fetchAll(token, path) {
  let results = [];
  let url = `https://graph.microsoft.com/v1.0${path}`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) { console.warn(`fetchAll FAILED ${path}: ${res.status}`); break; }
    results = results.concat(data.value || []);
    url = data["@odata.nextLink"] || null;
  }
  return results;
}

// Remediation actions
async function remediateDevice(token, deviceId, action) {
  const actionMap = {
    sync: `/deviceManagement/managedDevices/${deviceId}/syncDevice`,
    reboot: `/deviceManagement/managedDevices/${deviceId}/rebootNow`,
    retire: `/deviceManagement/managedDevices/${deviceId}/retire`,
    wipe: `/deviceManagement/managedDevices/${deviceId}/wipe`,
  };
  const path = actionMap[action];
  if (!path) throw new Error(`Unknown device action: ${action}`);
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    throw new Error(`Device ${action} failed: ${err}`);
  }
  return { success: true, action, deviceId };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, azure_tenant_id } = body;
    const token = await getAccessToken(azure_tenant_id);

    // ── CA Policy: toggle state ──────────────────────────────────────────────
    if (action === "update_ca_policy") {
      const { graph_policy_id, state, display_name } = body;
      await graphPatch(token, `/identity/conditionalAccess/policies/${graph_policy_id}`, { state, displayName: display_name });
      return Response.json({ success: true });
    }

    // ── CA Policy: delete ────────────────────────────────────────────────────
    if (action === "delete_ca_policy") {
      const { graph_policy_id } = body;
      await graphDelete(token, `/identity/conditionalAccess/policies/${graph_policy_id}`);
      return Response.json({ success: true });
    }

    // ── Intune Profile: update description / display name ────────────────────
    if (action === "update_intune_profile") {
      const { graph_profile_id, profile_type, display_name, description } = body;
      const endpoint = profile_type === "compliance_policy"
        ? `/deviceManagement/deviceCompliancePolicies/${graph_profile_id}`
        : `/deviceManagement/deviceConfigurations/${graph_profile_id}`;
      await graphPatch(token, endpoint, { displayName: display_name, description });
      return Response.json({ success: true });
    }

    // ── Compliance report ────────────────────────────────────────────────────
    if (action === "compliance_report") {
      const report = await getComplianceReport(token);
      return Response.json({ success: true, ...report });
    }

    // ── Device remediation ───────────────────────────────────────────────────
    if (action === "remediate_device") {
      const { graph_device_id, remediation_action } = body;
      const result = await remediateDevice(token, graph_device_id, remediation_action);
      return Response.json(result);
    }

    // ── Bulk remediation: sync all non-compliant ─────────────────────────────
    if (action === "bulk_sync_noncompliant") {
      const devices = await fetchAll(token, "/deviceManagement/managedDevices?$filter=complianceState eq 'noncompliant'&$select=id,deviceName&$top=200");
      let synced = 0, failed = 0;
      for (const d of devices) {
        try {
          await remediateDevice(token, d.id, "sync");
          synced++;
        } catch { failed++; }
      }
      return Response.json({ success: true, synced, failed, total: devices.length });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[tenantWrite]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});