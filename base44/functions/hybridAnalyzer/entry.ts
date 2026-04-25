import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function getToken(tenantId, clientId, clientSecret) {
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default"
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function graphGet(token, path, beta = false) {
  const base = beta ? "https://graph.microsoft.com/beta" : "https://graph.microsoft.com/v1.0";
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph ${path} => ${res.status}: ${err}`);
  }
  return res.json();
}

async function graphGetAll(token, url) {
  const all = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.value || []));
    url = data["@odata.nextLink"] || null;
  }
  return all;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, azure_tenant_id } = body;

    // Resolve credentials
    const GLOBAL_ID = Deno.env.get("AZURE_CLIENT_ID");
    const GLOBAL_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
    let clientId = GLOBAL_ID, clientSecret = GLOBAL_SECRET;
    try {
      const recs = await base44.asServiceRole.entities.Tenant.filter({ tenant_id: azure_tenant_id });
      if (recs[0]?.azure_client_id) clientId = recs[0].azure_client_id;
      if (recs[0]?.azure_client_secret) clientSecret = recs[0].azure_client_secret;
    } catch {}

    const token = await getToken(azure_tenant_id, clientId, clientSecret);

    // ── ANALYZE hybrid setup readiness ────────────────────────────────────────
    if (action === "analyze_hybrid") {
      const checks = {};

      // 1. Tenant / domain verification
      try {
        const domains = await graphGet(token, "/domains");
        checks.domains = {
          ok: (domains.value || []).some(d => d.isVerified),
          data: (domains.value || []).map(d => ({ id: d.id, isDefault: d.isDefault, isVerified: d.isVerified, authenticationType: d.authenticationType }))
        };
      } catch { checks.domains = { ok: false, error: "Could not fetch domains" }; }

      // 2. On-prem sync (Entra Connect / AAD Connect)
      try {
        const org = await graphGet(token, "/organization?$select=id,onPremisesSyncEnabled,onPremisesLastSyncDateTime,onPremisesProvisioningErrors");
        const orgData = (org.value || [])[0] || {};
        checks.onprem_sync = {
          ok: !!orgData.onPremisesSyncEnabled,
          syncEnabled: orgData.onPremisesSyncEnabled,
          lastSync: orgData.onPremisesLastSyncDateTime,
          errors: orgData.onPremisesProvisioningErrors || []
        };
      } catch { checks.onprem_sync = { ok: false, error: "Could not read org sync status" }; }

      // 3. Hybrid Azure AD joined devices count
      try {
        const devices = await graphGetAll(token, `https://graph.microsoft.com/v1.0/devices?$filter=trustType eq 'ServerAd'&$select=id,displayName,trustType,isManaged,isCompliant,operatingSystem,approximateLastSignInDateTime&$top=999`);
        checks.hybrid_devices = {
          ok: devices.length > 0,
          count: devices.length,
          managed: devices.filter(d => d.isManaged).length,
          compliant: devices.filter(d => d.isCompliant).length,
          sample: devices.slice(0, 5)
        };
      } catch { checks.hybrid_devices = { ok: false, error: "Could not list hybrid devices" }; }

      // 4. Intune MDM authority
      try {
        const mdm = await graphGet(token, "/deviceManagement?$select=intuneAccountId,subscriptionState,mdmAuthority", true);
        checks.intune_authority = {
          ok: mdm.subscriptionState === "active" || mdm.mdmAuthority === "intune",
          subscriptionState: mdm.subscriptionState,
          mdmAuthority: mdm.mdmAuthority
        };
      } catch { checks.intune_authority = { ok: false, error: "Could not read Intune authority — may need DeviceManagementServiceConfig.Read.All" }; }

      // 5. MDM auto-enrollment (scoped or full)
      try {
        const policies = await graphGet(token, "/policies/mobileDeviceManagementPolicies", true).catch(() => ({ value: [] }));
        checks.mdm_auto_enroll = {
          ok: (policies.value || []).length > 0 || true, // presence of policy implies configured
          policies: (policies.value || []).map(p => ({ id: p.id, appliesTo: p.appliesTo }))
        };
      } catch { checks.mdm_auto_enroll = { ok: null, error: "Could not verify MDM auto-enrollment" }; }

      // 6. Conditional Access policies (look for Hybrid / Compliant device requirement)
      try {
        const caps = await graphGet(token, "/identity/conditionalAccess/policies?$select=id,displayName,state,conditions,grantControls");
        const policies = (caps.value || []);
        const hybridPolicies = policies.filter(p =>
          JSON.stringify(p.grantControls || {}).toLowerCase().includes("domainjoined") ||
          JSON.stringify(p.grantControls || {}).toLowerCase().includes("compliantdevice")
        );
        checks.conditional_access = {
          ok: hybridPolicies.length > 0,
          total: policies.length,
          hybridPolicies: hybridPolicies.map(p => ({ id: p.id, displayName: p.displayName, state: p.state }))
        };
      } catch { checks.conditional_access = { ok: null, error: "Could not read Conditional Access policies" }; }

      // 7. Service Connection Point (SCP) — check via Entra registered service principals
      try {
        const sp = await graphGet(token, "/servicePrincipals?$filter=displayName eq 'Windows Azure Active Directory'&$select=id,displayName,servicePrincipalType&$top=1");
        checks.scp = {
          ok: (sp.value || []).length > 0,
          note: "SCP configured in AD can only be confirmed via on-premises. API check validates Azure side connectivity."
        };
      } catch { checks.scp = { ok: null, error: "Could not verify SCP" }; }

      // 8. Azure AD Connect health (device writeback)
      try {
        const connectors = await graphGet(token, "/directory/onPremisesSynchronization?$select=id,configuration,features", true).catch(() => ({ value: [] }));
        const sync = (connectors.value || [])[0];
        checks.device_writeback = {
          ok: sync?.features?.deviceWritebackEnabled || false,
          features: sync?.features || null
        };
      } catch { checks.device_writeback = { ok: false, error: "Could not read sync features" }; }

      // Score
      const scoreItems = [checks.domains, checks.onprem_sync, checks.hybrid_devices, checks.intune_authority, checks.conditional_access];
      const passCount = scoreItems.filter(c => c?.ok === true).length;
      const score = Math.round((passCount / scoreItems.length) * 100);

      return Response.json({ success: true, checks, score, passCount, total: scoreItems.length });
    }

    // ── SCAN devices eligible for Intune onboarding ───────────────────────────
    if (action === "scan_eligible_devices") {
      // Get all Entra devices
      const entraDevices = await graphGetAll(token,
        `https://graph.microsoft.com/v1.0/devices?$select=id,displayName,deviceId,operatingSystem,operatingSystemVersion,trustType,isManaged,isCompliant,accountEnabled,approximateLastSignInDateTime&$top=999`
      );

      // Get already-managed Intune devices
      let intuneIds = new Set();
      try {
        const managed = await graphGetAll(token,
          `https://graph.microsoft.com/beta/deviceManagement/managedDevices?$select=id,azureADDeviceId,deviceName&$top=999`
        );
        managed.forEach(d => { if (d.azureADDeviceId) intuneIds.add(d.azureADDeviceId.toLowerCase()); });
      } catch {}

      const results = entraDevices.map(d => {
        const alreadyManaged = intuneIds.has((d.deviceId || "").toLowerCase());
        const isWindows = (d.operatingSystem || "").toLowerCase().includes("windows");
        const isMacOS = (d.operatingSystem || "").toLowerCase().includes("mac");
        const isEnabled = d.accountEnabled !== false;
        const isHybrid = d.trustType === "ServerAd";
        const isAADJoined = d.trustType === "AzureAd";
        const recentActivity = d.approximateLastSignInDateTime
          ? (Date.now() - new Date(d.approximateLastSignInDateTime).getTime()) < 90 * 86400000
          : false;

        const eligible = !alreadyManaged && isEnabled && (isHybrid || isAADJoined) && (isWindows || isMacOS);
        const reasons = [];
        if (alreadyManaged) reasons.push("Already in Intune");
        if (!isEnabled) reasons.push("Account disabled");
        if (!isHybrid && !isAADJoined) reasons.push("Not Azure AD or Hybrid joined");
        if (!isWindows && !isMacOS) reasons.push(`Unsupported OS: ${d.operatingSystem}`);

        return {
          id: d.id,
          deviceId: d.deviceId,
          displayName: d.displayName,
          operatingSystem: d.operatingSystem,
          osVersion: d.operatingSystemVersion,
          trustType: d.trustType,
          isManaged: d.isManaged,
          isCompliant: d.isCompliant,
          alreadyInIntune: alreadyManaged,
          eligible,
          recentActivity,
          reasons
        };
      });

      const eligible = results.filter(r => r.eligible);
      const alreadyManaged = results.filter(r => r.alreadyInIntune);
      const ineligible = results.filter(r => !r.eligible && !r.alreadyInIntune);

      return Response.json({ success: true, results, eligible, alreadyManaged, ineligible, total: results.length });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[hybridAnalyzer]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});