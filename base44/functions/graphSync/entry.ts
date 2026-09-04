import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { authorizeAdminAction } from '../../shared/rbacCheck.ts';

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
  if (!data.access_token) throw new Error(`Token error for tenant ${tenantId}: ${data.error_description || JSON.stringify(data)}`);
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
    const data = await res.json();
    if (!res.ok) {
      console.error(`[graphGetAll] FAILED ${path}: ${res.status} - ${JSON.stringify(data)}`);
      break;
    }
    console.log(`[graphGetAll] ${path} -> ${(data.value || []).length} items`);
    results = results.concat(data.value || []);
    url = data["@odata.nextLink"] || null;
  }
  return results;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Batched upsert: one read of existing tenant records, then bulkCreate +
 * bulkUpdate. Replaces the per-record filter+create/update loop that was
 * tripping the Base44 DB rate limit (≈2N calls → 3 calls per action).
 */
async function batchUpsert(base44, entityName, tid, items, keyFn, payloadFn) {
  const existing = await base44.asServiceRole.entities[entityName].filter({ tenant_id: tid });
  const byKey = new Map();
  for (const e of existing) byKey.set(keyFn(e), e);

  const toCreate = [];
  const toUpdate = [];
  for (const item of items) {
    const key = keyFn(item);
    const payload = payloadFn(item);
    const ex = key != null ? byKey.get(key) : null;
    if (ex) toUpdate.push({ id: ex.id, ...payload });
    else toCreate.push(payload);
  }

  for (const batch of chunk(toCreate, 500)) {
    await base44.asServiceRole.entities[entityName].bulkCreate(batch);
  }
  for (const batch of chunk(toUpdate, 500)) {
    await base44.asServiceRole.entities[entityName].bulkUpdate(batch);
  }
  return { created: toCreate.length, updated: toUpdate.length };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { action, tenant_id, azure_tenant_id } = await req.json();

    if (!azure_tenant_id) {
      return Response.json({ error: "azure_tenant_id is required" }, { status: 400 });
    }

    // ── Authorization: Graph sync mutates tenant-scoped entities — require admin/scoped role ──
    const denied = await authorizeAdminAction(base44, user, [azure_tenant_id, tenant_id]);
    if (denied) return denied;

    // ── Look up per-tenant credentials (fall back to global) ─────────────────
    let clientId = GLOBAL_CLIENT_ID;
    let clientSecret = GLOBAL_CLIENT_SECRET;
    try {
      const tenantRecords = await base44.asServiceRole.entities.Tenant.filter({ tenant_id: azure_tenant_id });
      const tenantRecord = tenantRecords[0];
      if (tenantRecord?.azure_client_id) clientId = tenantRecord.azure_client_id;
      if (tenantRecord?.azure_client_secret) clientSecret = tenantRecord.azure_client_secret;
    } catch (e) {
      console.warn("[graphSync] Could not look up per-tenant credentials:", e.message);
    }

    console.log(`[graphSync] action=${action} azure_tenant_id=${azure_tenant_id} using_custom_creds=${clientId !== GLOBAL_CLIENT_ID}`);

    const token = await getAccessToken(azure_tenant_id, clientId, clientSecret);

    if (action === "test") {
      const org = await graphGet(token, "/organization");
      return Response.json({ success: true, org: org.value?.[0]?.displayName, tenantId: org.value?.[0]?.id });
    }

    if (action === "sync_users") {
      const users = await graphGetAll(token, "/users?$select=id,displayName,userPrincipalName,mail,accountEnabled,userType,jobTitle,department,assignedLicenses,createdDateTime&$top=999");
      console.log(`[sync_users] fetched ${users.length} users from Azure tenant ${azure_tenant_id}`);
      const { created, updated } = await batchUpsert(base44, "EntraUser", tenant_id, users,
        (u) => u.userPrincipalName,
        (u) => ({
          tenant_id: tenant_id,
          display_name: u.displayName || "",
          upn: u.userPrincipalName || "",
          email: u.mail || u.userPrincipalName || "",
          account_enabled: u.accountEnabled !== false,
          user_type: u.userType === "Guest" ? "guest" : "member",
          job_title: u.jobTitle || "",
          department: u.department || "",
          licenses: (u.assignedLicenses || []).length > 0 ? `${u.assignedLicenses.length} license(s)` : "",
        })
      );
      return Response.json({ success: true, action, created, updated, total: users.length });
    }

    if (action === "sync_groups") {
      const groups = await graphGetAll(token, "/groups?$select=id,displayName,groupTypes,membershipRule,description,mail,mailEnabled,securityEnabled&$top=999");
      const { created, updated } = await batchUpsert(base44, "EntraGroup", tenant_id, groups,
        (g) => g.displayName,
        (g) => {
          let group_type = "security";
          if (g.groupTypes?.includes("Unified")) group_type = "microsoft_365";
          else if (g.mailEnabled && !g.securityEnabled) group_type = "distribution";
          else if (g.mailEnabled && g.securityEnabled) group_type = "mail_enabled_security";
          return {
            tenant_id: tenant_id,
            display_name: g.displayName || "",
            group_type,
            membership_type: g.membershipRule ? "dynamic_user" : "assigned",
            description: g.description || "",
            mail: g.mail || "",
          };
        }
      );
      return Response.json({ success: true, action, created, updated, total: groups.length });
    }

    if (action === "sync_devices") {
      const devices = await graphGetAll(token, "/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,managedDeviceOwnerType,userPrincipalName,enrolledDateTime,lastSyncDateTime,serialNumber,model&$top=999");
      const osMap = { Windows: "Windows 11", macOS: "macOS", iOS: "iOS", Android: "Android" };
      const compMap = { compliant: "compliant", noncompliant: "non_compliant", inGracePeriod: "in_grace_period", unknown: "not_evaluated" };
      const { created, updated } = await batchUpsert(base44, "IntuneDevice", tenant_id, devices,
        (d) => d.deviceName,
        (d) => ({
          tenant_id: tenant_id,
          device_name: d.deviceName || "",
          os: osMap[d.operatingSystem] || d.operatingSystem || "Windows 11",
          compliance_state: compMap[d.complianceState] || "not_evaluated",
          ownership: d.managedDeviceOwnerType === "personal" ? "personal" : "corporate",
          primary_user: d.userPrincipalName || "",
          enrolled_date: d.enrolledDateTime ? d.enrolledDateTime.split("T")[0] : "",
          last_check_in: d.lastSyncDateTime ? d.lastSyncDateTime.split("T")[0] : "",
          serial_number: d.serialNumber || "",
          model: d.model || "",
        })
      );
      return Response.json({ success: true, action, created, updated, total: devices.length });
    }

    if (action === "sync_policies") {
      const policies = await graphGetAll(token, "/identity/conditionalAccess/policies?$select=id,displayName,state,conditions,grantControls,modifiedDateTime&$top=200");
      const stateMap = { enabled: "enabled", disabled: "disabled", enabledForReportingButNotEnforced: "report_only" };
      const { created, updated } = await batchUpsert(base44, "EntraPolicy", tenant_id, policies,
        (p) => p.displayName,
        (p) => ({
          tenant_id: tenant_id,
          policy_name: p.displayName || "",
          policy_type: "conditional_access",
          state: stateMap[p.state] || "disabled",
          last_modified: p.modifiedDateTime ? p.modifiedDateTime.split("T")[0] : "",
        })
      );
      return Response.json({ success: true, action, created, updated, total: policies.length });
    }

    if (action === "sync_intune_profiles") {
      const [compliancePolicies, configProfiles] = await Promise.all([
        graphGetAll(token, "/deviceManagement/deviceCompliancePolicies?$select=id,displayName,description,lastModifiedDateTime&$top=999"),
        graphGetAll(token, "/deviceManagement/deviceConfigurations?$select=id,displayName,description,lastModifiedDateTime&$top=999"),
      ]);

      const platformMap = { windows10: "windows", macOS: "macos", iOS: "ios", android: "android", linux: "linux" };
      const buildPayload = (p, profile_type) => ({
        tenant_id: tenant_id,
        profile_name: p.displayName || "",
        profile_type,
        platform: platformMap[p.platforms || p.platform || ""] || "windows",
        state: "active",
        description: p.description || "",
        last_modified: p.lastModifiedDateTime ? p.lastModifiedDateTime.split("T")[0] : "",
      });

      const r1 = await batchUpsert(base44, "IntuneProfile", tenant_id, compliancePolicies,
        (p) => p.displayName, (p) => buildPayload(p, "compliance_policy"));
      const r2 = await batchUpsert(base44, "IntuneProfile", tenant_id, configProfiles,
        (p) => p.displayName, (p) => buildPayload(p, "configuration_profile"));

      return Response.json({ success: true, action, created: r1.created + r2.created, updated: r1.updated + r2.updated, total: compliancePolicies.length + configProfiles.length });
    }

    if (action === "sync_intune_apps") {
      // @odata.type cannot be in $select (Graph rejects it), but Graph returns it by default.
      const apps = await graphGetAll(token, "/deviceAppManagement/mobileApps?$select=id,displayName,publisher,lastModifiedDateTime&$top=999");
      const typeMap = {
        "#microsoft.graph.win32LobApp": "win32",
        "#microsoft.graph.windowsMobileMSI": "msi",
        "#microsoft.graph.windowsUniversalAppX": "msix",
        "#microsoft.graph.microsoftStoreForBusinessApp": "store",
        "#microsoft.graph.webApp": "web_link",
        "#microsoft.graph.iosStoreApp": "ios_store",
        "#microsoft.graph.androidStoreApp": "android_store",
        "#microsoft.graph.macOSPkgApp": "macos_pkg",
        "#microsoft.graph.officeSuiteApp": "office365",
      };
      const { created, updated } = await batchUpsert(base44, "IntuneApp", tenant_id, apps,
        (a) => a.displayName,
        (a) => {
          const typeRaw = a["@odata.type"] || "";
          const app_type = typeMap[typeRaw] || "win32";
          const platformRaw = typeRaw.toLowerCase();
          const platform = platformRaw.includes("ios") ? "ios"
            : platformRaw.includes("android") ? "android"
            : platformRaw.includes("macos") ? "macos"
            : platformRaw.includes("office") ? "all"
            : "windows";
          return {
            tenant_id: tenant_id,
            app_name: a.displayName || "",
            publisher: a.publisher || "",
            version: "",
            app_type,
            platform,
            state: "published",
            last_modified: a.lastModifiedDateTime ? a.lastModifiedDateTime.split("T")[0] : "",
          };
        }
      );
      return Response.json({ success: true, action, created, updated, total: apps.length });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[graphSync] error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});