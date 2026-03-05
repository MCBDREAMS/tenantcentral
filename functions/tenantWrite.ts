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

// Single-page fetch (no pagination loop) to stay within CPU limits
async function graphGetPage(token, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) { console.warn(`graphGetPage FAILED ${path}: ${res.status}`); return []; }
  const data = await res.json();
  return data.value || [];
}

// Compliance Reporting: single-page fetch capped at 200 devices
async function getComplianceReport(token) {
  const [devices, policies] = await Promise.all([
    graphGetPage(token, "/deviceManagement/managedDevices?$select=id,deviceName,complianceState,operatingSystem,userPrincipalName,lastSyncDateTime&$top=200"),
    graphGetPage(token, "/deviceManagement/deviceCompliancePolicies?$select=id,displayName,lastModifiedDateTime&$top=50"),
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
  let pages = 0;
  while (url && pages < 5) { // max 5 pages to avoid CPU limit
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) { console.warn(`fetchAll FAILED ${path}: ${res.status}`); break; }
    results = results.concat(data.value || []);
    url = data["@odata.nextLink"] || null;
    pages++;
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

    // ── Read enterprise app permissions from a tenant ───────────────────────
    if (action === "read_app_permissions") {
      const { azure_tenant_id: srcTenantId } = body;
      const srcToken = await getAccessToken(srcTenantId);

      // Get all service principals (enterprise apps)
      const sps = await graphGetPage(srcToken, "/servicePrincipals?$select=id,displayName,appId,servicePrincipalType&$top=100&$filter=servicePrincipalType eq 'Application'");

      const results = [];
      for (const sp of sps.slice(0, 40)) { // cap at 40 to avoid CPU limit
        // OAuth2 delegated permission grants
        const grants = await graphGetPage(srcToken, `/servicePrincipals/${sp.id}/oauth2PermissionGrants`);
        // App role assignments (application permissions)
        const appRoles = await graphGetPage(srcToken, `/servicePrincipals/${sp.id}/appRoleAssignments`);
        if (grants.length > 0 || appRoles.length > 0) {
          results.push({ sp, grants, appRoles });
        }
      }
      return Response.json({ success: true, apps: results });
    }

    // ── Copy enterprise app permissions to a new tenant ─────────────────────
    if (action === "copy_app_permissions") {
      const { source_tenant_id, target_tenant_id, apps } = body;
      // apps = array of { sp: {appId, displayName}, grants: [...], appRoles: [...] }
      const targetToken = await getAccessToken(target_tenant_id);

      const report = [];
      for (const { sp, grants, appRoles } of apps) {
        try {
          // Find or create the service principal in target tenant by appId
          let targetSps = await graphGetPage(targetToken, `/servicePrincipals?$filter=appId eq '${sp.appId}'&$select=id,displayName,appId`);
          let targetSp = targetSps[0];
          if (!targetSp) {
            // Create the SP in the target tenant
            targetSp = await graphPost(targetToken, "/servicePrincipals", { appId: sp.appId });
          }

          // Apply app role assignments (application permissions)
          for (const ar of appRoles) {
            // Find the resource SP in target
            const resourceSps = await graphGetPage(targetToken, `/servicePrincipals?$filter=appId eq '${ar.resourceId}'&$select=id`);
            const resourceSp = resourceSps[0];
            if (!resourceSp) continue;
            await graphPost(targetToken, `/servicePrincipals/${targetSp.id}/appRoleAssignments`, {
              principalId: targetSp.id,
              resourceId: resourceSp.id,
              appRoleId: ar.appRoleId,
            }).catch(() => {}); // ignore if already exists
          }

          // Apply OAuth2 delegated grants
          for (const g of grants) {
            const resourceSps = await graphGetPage(targetToken, `/servicePrincipals?$filter=appId eq '${g.resourceId}'&$select=id`);
            const resourceSp = resourceSps[0];
            if (!resourceSp) continue;
            await graphPost(targetToken, "/oauth2PermissionGrants", {
              clientId: targetSp.id,
              consentType: g.consentType,
              resourceId: resourceSp.id,
              scope: g.scope,
            }).catch(() => {});
          }

          report.push({ appId: sp.appId, displayName: sp.displayName, status: "ok" });
        } catch (e) {
          report.push({ appId: sp.appId, displayName: sp.displayName, status: "error", error: e.message });
        }
      }
      return Response.json({ success: true, report });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[tenantWrite]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});