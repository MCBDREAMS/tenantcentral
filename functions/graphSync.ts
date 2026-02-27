import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
const TENANT_ID = Deno.env.get("AZURE_TENANT_ID");

async function getAccessToken() {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
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
  if (!res.ok) throw new Error(`Graph ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function graphGetAll(token, path) {
  let results = [];
  let url = `https://graph.microsoft.com/v1.0${path}`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
    results = results.concat(data.value || []);
    url = data["@odata.nextLink"] || null;
  }
  return results;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { action, tenant_id } = await req.json();
    const token = await getAccessToken();

    if (action === "test") {
      const org = await graphGet(token, "/organization");
      return Response.json({ success: true, org: org.value?.[0]?.displayName, tenantId: org.value?.[0]?.id });
    }

    if (action === "sync_users") {
      const users = await graphGetAll(token, "/users?$select=id,displayName,userPrincipalName,mail,accountEnabled,userType,jobTitle,department,assignedLicenses,createdDateTime&$top=999");
      const tid = tenant_id;
      let created = 0, updated = 0;

      for (const u of users) {
        const existing = await base44.asServiceRole.entities.EntraUser.filter({ tenant_id: tid, upn: u.userPrincipalName });
        const payload = {
          tenant_id: tid,
          display_name: u.displayName || "",
          upn: u.userPrincipalName || "",
          email: u.mail || u.userPrincipalName || "",
          account_enabled: u.accountEnabled !== false,
          user_type: u.userType === "Guest" ? "guest" : "member",
          job_title: u.jobTitle || "",
          department: u.department || "",
          licenses: (u.assignedLicenses || []).length > 0 ? `${u.assignedLicenses.length} license(s)` : "",
        };
        if (existing.length > 0) {
          await base44.asServiceRole.entities.EntraUser.update(existing[0].id, payload);
          updated++;
        } else {
          await base44.asServiceRole.entities.EntraUser.create(payload);
          created++;
        }
      }
      return Response.json({ success: true, action, created, updated, total: users.length });
    }

    if (action === "sync_groups") {
      const groups = await graphGetAll(token, "/groups?$select=id,displayName,groupTypes,membershipRule,description,mail,mailEnabled,securityEnabled&$top=999");
      const tid = tenant_id;
      let created = 0, updated = 0;

      for (const g of groups) {
        let group_type = "security";
        if (g.groupTypes?.includes("Unified")) group_type = "microsoft_365";
        else if (g.mailEnabled && !g.securityEnabled) group_type = "distribution";
        else if (g.mailEnabled && g.securityEnabled) group_type = "mail_enabled_security";

        const membership_type = g.membershipRule ? "dynamic_user" : "assigned";

        const existing = await base44.asServiceRole.entities.EntraGroup.filter({ tenant_id: tid, display_name: g.displayName });
        const payload = {
          tenant_id: tid,
          display_name: g.displayName || "",
          group_type,
          membership_type,
          description: g.description || "",
          mail: g.mail || "",
        };
        if (existing.length > 0) {
          await base44.asServiceRole.entities.EntraGroup.update(existing[0].id, payload);
          updated++;
        } else {
          await base44.asServiceRole.entities.EntraGroup.create(payload);
          created++;
        }
      }
      return Response.json({ success: true, action, created, updated, total: groups.length });
    }

    if (action === "sync_devices") {
      const devices = await graphGetAll(token, "/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,ownerType,userPrincipalName,enrolledDateTime,lastSyncDateTime,serialNumber,model&$top=999");
      const tid = tenant_id;
      let created = 0, updated = 0;

      for (const d of devices) {
        const osMap = { Windows: "Windows 11", macOS: "macOS", iOS: "iOS", Android: "Android" };
        const os = osMap[d.operatingSystem] || d.operatingSystem || "Windows 11";
        const compMap = { compliant: "compliant", noncompliant: "non_compliant", inGracePeriod: "in_grace_period", unknown: "not_evaluated" };

        const existing = await base44.asServiceRole.entities.IntuneDevice.filter({ tenant_id: tid, device_name: d.deviceName });
        const payload = {
          tenant_id: tid,
          device_name: d.deviceName || "",
          os,
          compliance_state: compMap[d.complianceState] || "not_evaluated",
          ownership: d.ownerType === "personal" ? "personal" : "corporate",
          primary_user: d.userPrincipalName || "",
          enrolled_date: d.enrolledDateTime ? d.enrolledDateTime.split("T")[0] : "",
          last_check_in: d.lastSyncDateTime ? d.lastSyncDateTime.split("T")[0] : "",
          serial_number: d.serialNumber || "",
          model: d.model || "",
        };
        if (existing.length > 0) {
          await base44.asServiceRole.entities.IntuneDevice.update(existing[0].id, payload);
          updated++;
        } else {
          await base44.asServiceRole.entities.IntuneDevice.create(payload);
          created++;
        }
      }
      return Response.json({ success: true, action, created, updated, total: devices.length });
    }

    if (action === "sync_policies") {
      const policies = await graphGetAll(token, "/identity/conditionalAccess/policies?$select=id,displayName,state,description,conditions,grantControls,modifiedDateTime&$top=200");
      const tid = tenant_id;
      let created = 0, updated = 0;

      for (const p of policies) {
        const stateMap = { enabled: "enabled", disabled: "disabled", enabledForReportingButNotEnforced: "report_only" };
        const existing = await base44.asServiceRole.entities.EntraPolicy.filter({ tenant_id: tid, policy_name: p.displayName });
        const payload = {
          tenant_id: tid,
          policy_name: p.displayName || "",
          policy_type: "conditional_access",
          state: stateMap[p.state] || "disabled",
          description: p.description || "",
          last_modified: p.modifiedDateTime ? p.modifiedDateTime.split("T")[0] : "",
        };
        if (existing.length > 0) {
          await base44.asServiceRole.entities.EntraPolicy.update(existing[0].id, payload);
          updated++;
        } else {
          await base44.asServiceRole.entities.EntraPolicy.create(payload);
          created++;
        }
      }
      return Response.json({ success: true, action, created, updated, total: policies.length });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});