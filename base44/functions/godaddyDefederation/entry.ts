import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { authorizeAdminAction } from '../../shared/rbacCheck.ts';
import { getAccessToken, graphGet, graphGetAll, graphPatch, getTenantCreds } from '../../shared/graphClient.ts';

const GLOBAL_ADMIN_ROLE_TEMPLATE = "62e90394-69f5-4237-9190-012177145f10";

function looksLikeGodaddy(fed) {
  const hay = `${fed.displayName || ""} ${fed.issuerUri || ""} ${fed.passiveSignInUri || ""} ${fed.activeSignInUri || ""} ${fed.signOutUri || ""} ${fed.metadataExchangeUri || ""}`.toLowerCase();
  return hay.includes("godaddy") || hay.includes("secureserver");
}

function generateTempPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const sym = "!@#$%^*-_=+";
  const all = upper + lower + digits + sym;
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  let pwd = [pick(upper), pick(lower), pick(digits), pick(sym)];
  for (let i = 0; i < 12; i++) pwd.push(pick(all));
  // shuffle
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join("");
}

async function findJob(base44, tenantId) {
  const recs = await base44.asServiceRole.entities.DefederationJob.filter({ tenant_id: tenantId });
  return recs[0];
}

async function saveJob(base44, tenantId, patch) {
  const existing = await findJob(base44, tenantId);
  if (existing) {
    return base44.asServiceRole.entities.DefederationJob.update(existing.id, patch);
  }
  return base44.asServiceRole.entities.DefederationJob.create({ tenant_id: tenantId, ...patch });
}

// ── Phase 1: Detect federation ──────────────────────────────────────────
async function detectFederation(token) {
  const domains = await graphGetAll(token, "/domains?$select=id,authenticationType,isVerified,availabilityStatus&$top=999");
  const federated = [];
  for (const d of domains) {
    if (d.authenticationType !== "Federated") continue;
    let configs = [];
    try {
      const r = await graphGet(token, `/domains/${d.id}/federationConfiguration`);
      configs = r.value || [];
    } catch (e) {
      console.warn(`[detect] federationConfiguration for ${d.id}: ${e.message}`);
    }
    if (configs.length === 0) {
      federated.push({ domain: d.id, authenticationType: d.authenticationType, isVerified: d.isVerified, isGodaddy: false, displayName: "", issuerUri: "", passiveSignInUri: "" });
    }
    for (const fc of configs) {
      federated.push({
        domain: d.id,
        authenticationType: d.authenticationType,
        isVerified: d.isVerified,
        displayName: fc.displayName || "",
        issuerUri: fc.issuerUri || "",
        passiveSignInUri: fc.passiveSignInUri || "",
        signOutUri: fc.signOutUri || "",
        isGodaddy: looksLikeGodaddy(fc)
      });
    }
  }
  const isGodaddy = federated.some(f => f.isGodaddy);
  const federationType = isGodaddy ? "godaddy" : (federated.length ? "third_party" : "none");
  return { domains, federated, isGodaddy, federationType };
}

// ── Phase 2: Analyze ──────────────────────────────────────────────────────
async function analyzeTenant(token, federatedDomains) {
  const fedNames = federatedDomains.map((f) => f.domain.toLowerCase());
  const users = await graphGetAll(token, "/users?$select=id,displayName,userPrincipalName,mail,accountEnabled,userType,onPremisesImmutableId,onPremisesSyncEnabled,assignedLicenses&$top=999");
  const fedUsers = users.filter((u) =>
    fedNames.some((d) => (u.userPrincipalName || "").toLowerCase().endsWith("@" + d))
  );

  let globalAdmins = [];
  try {
    globalAdmins = await graphGetAll(token, `/directoryRoles/${GLOBAL_ADMIN_ROLE_TEMPLATE}/members`);
  } catch (e) {
    console.warn("[analyze] global admins:", e.message);
  }
  const onMicrosoftAdmins = globalAdmins
    .filter((a) => (a.userPrincipalName || "").toLowerCase().endsWith(".onmicrosoft.com"))
    .map((a) => a.userPrincipalName);

  let appRegistrations = 0;
  try {
    const r = await graphGet(token, "/applications?$count=true&$top=1");
    appRegistrations = r["@odata.count"] ?? (r.value || []).length;
  } catch (e) { console.warn("[analyze] apps:", e.message); }

  const syncedUsers = fedUsers.filter((u) => u.onPremisesSyncEnabled === true).length;
  const disabledAccounts = fedUsers.filter((u) => u.accountEnabled === false).length;

  const flags = [];
  if (onMicrosoftAdmins.length === 0) {
    flags.push({
      severity: "critical",
      area: "Admin Access",
      detail: "No global admin with an .onmicrosoft.com UPN was found. You may be locked out after defederation.",
      recommendation: "Obtain the admin@<tenant>.onmicrosoft.com credentials from the GoDaddy portal before proceeding."
    });
  }
  if (syncedUsers > 0) {
    flags.push({
      severity: "high",
      area: "On-Prem Sync",
      detail: `${syncedUsers} federated user(s) have onPremisesSyncEnabled=true. Passwords cannot be set and immutableId cannot be cleared via Graph.`,
      recommendation: "Disable on-prem sync for these accounts or exclude them from defederation."
    });
  }

  return {
    federated_user_count: fedUsers.length,
    users_sample: fedUsers.slice(0, 25).map((u) => ({
      upn: u.userPrincipalName,
      immutableId: !!u.onPremisesImmutableId,
      onPremSync: !!u.onPremisesSyncEnabled,
      enabled: u.accountEnabled
    })),
    globalAdmins: globalAdmins.length,
    onMicrosoftAdmins,
    appRegistrations,
    syncedUsers,
    disabledAccounts,
    flags
  };
}

// ── Phase 3: Dry run ──────────────────────────────────────────────────────
function dryRun(analysis) {
  const failurePoints = [...(analysis.flags || [])];
  failurePoints.push({
    severity: analysis.federated_user_count > 0 ? "high" : "low",
    area: "User Passwords",
    detail: `${analysis.federated_user_count} user(s) will require new passwords after the domain is converted to managed.`,
    recommendation: "A temporary password will be set with forceChangePasswordNextSignIn enabled."
  });
  failurePoints.push({
    severity: "medium",
    area: "DNS / Mail Flow",
    detail: "MX and autodiscover DNS records may still point to GoDaddy. Mail delivery can stop until DNS is repointed to Microsoft (EOP).",
    recommendation: "Prepare updated DNS records (MX → outlook.office365.com, autodiscover CNAME → autodiscover.outlook.com) to apply post-defederation."
  });
  failurePoints.push({
    severity: "medium",
    area: "Licensing",
    detail: "Licenses may be provisioned through the GoDaddy reseller. Defederation can interrupt license renewal.",
    recommendation: "Confirm direct billing/licensing with Microsoft is in place, or migrate licenses before defederation."
  });
  const blocking = failurePoints.filter((f) => f.severity === "critical").length;
  return { failure_points: failurePoints, canProceed: blocking === 0, blockingCount: blocking };
}

// ── Phase 6: Execute defederation ─────────────────────────────────────────
async function executeDefederation(token, federatedDomains, tempPassword) {
  const log = [];
  const fedNames = federatedDomains.map((f) => f.domain.toLowerCase());
  const users = await graphGetAll(token, "/users?$select=id,userPrincipalName,accountEnabled,onPremisesImmutableId,onPremisesSyncEnabled&$top=999");
  const fedUsers = users.filter((u) =>
    fedNames.some((d) => (u.userPrincipalName || "").toLowerCase().endsWith("@" + d))
  );

  const pwd = tempPassword || generateTempPassword();
  let pwdSet = 0, pwdFail = 0, pwdSkip = 0;
  for (const u of fedUsers) {
    if (u.onPremisesSyncEnabled) { pwdSkip++; log.push({ step: "password", upn: u.userPrincipalName, status: "skipped", reason: "onPremisesSyncEnabled" }); continue; }
    try {
      await graphPatch(token, `/users/${u.id}`, { passwordProfile: { password: pwd, forceChangePasswordNextSignIn: true } });
      pwdSet++;
      log.push({ step: "password", upn: u.userPrincipalName, status: "ok" });
    } catch (e) { pwdFail++; log.push({ step: "password", upn: u.userPrincipalName, status: "fail", error: e.message }); }
  }

  let domOk = 0, domFail = 0;
  for (const f of federatedDomains) {
    try {
      await graphPatch(token, `/domains/${f.domain}`, { authenticationType: "Managed" });
      domOk++;
      log.push({ step: "domain_convert", domain: f.domain, status: "ok" });
    } catch (e) { domFail++; log.push({ step: "domain_convert", domain: f.domain, status: "fail", error: e.message }); }
  }

  let immCleared = 0, immFail = 0, immSkip = 0;
  for (const u of fedUsers) {
    if (u.onPremisesSyncEnabled) { immSkip++; continue; }
    if (!u.onPremisesImmutableId) { immSkip++; continue; }
    try {
      await graphPatch(token, `/users/${u.id}`, { onPremisesImmutableId: null });
      immCleared++;
      log.push({ step: "clear_immutable", upn: u.userPrincipalName, status: "ok" });
    } catch (e) { immFail++; log.push({ step: "clear_immutable", upn: u.userPrincipalName, status: "fail", error: e.message }); }
  }

  let verify = [];
  try {
    const d = await graphGetAll(token, "/domains?$select=id,authenticationType&$top=999");
    verify = d.filter((x) => fedNames.includes((x.id || "").toLowerCase())).map((x) => ({ domain: x.id, auth: x.authenticationType }));
  } catch (e) { console.warn("[execute] verify:", e.message); }

  return {
    pwdSet, pwdFail, pwdSkip,
    domOk, domFail,
    immCleared, immFail, immSkip,
    verify,
    log,
    tempPassword: tempPassword ? undefined : pwd
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, tenant_id, azure_tenant_id, temp_password } = body;

    if (!azure_tenant_id) return Response.json({ error: "azure_tenant_id is required" }, { status: 400 });

    const denied = await authorizeAdminAction(base44, user, [azure_tenant_id, tenant_id]);
    if (denied) return denied;

    const { clientId, clientSecret } = await getTenantCreds(base44, azure_tenant_id);
    const token = await getAccessToken(azure_tenant_id, clientId, clientSecret);

    console.log(`[godaddyDefederation] action=${action} azure_tenant_id=${azure_tenant_id}`);

    // ── detect ──────────────────────────────────────────────────────────
    if (action === "detect") {
      const det = await detectFederation(token);
      const jobPatch = {
        tenant_id,
        azure_tenant_id,
        started_by: user.email,
        federated_domains: JSON.stringify(det.federated),
        is_godaddy_linked: det.isGodaddy,
        federation_type: det.federation_type,
        status: det.federated.length === 0 ? "not_federated" : "detected",
        federated_user_count: 0,
        analysis_report: "",
        dry_run_report: "",
        failure_points: "",
        issues_resolved: false,
        execution_log: "",
        current_step: "detect",
        error_message: ""
      };
      await saveJob(base44, tenant_id, jobPatch);
      return Response.json({ success: true, action, ...det });
    }

    // remaining actions require an existing detected job + federated domains
    const job = await findJob(base44, tenant_id);
    if (!job) return Response.json({ error: "Run 'Check Federation' (detect) first" }, { status: 400 });
    const federatedDomains = JSON.parse(job.federated_domains || "[]");
    if (!federatedDomains.length) return Response.json({ error: "No federated domains detected for this tenant" }, { status: 400 });

    // ── analyze ────────────────────────────────────────────────────────
    if (action === "analyze") {
      await saveJob(base44, tenant_id, { status: "analyzing", current_step: "analyze" });
      const analysis = await analyzeTenant(token, federatedDomains);
      await saveJob(base44, tenant_id, {
        status: "analyzed",
        analysis_report: JSON.stringify(analysis),
        federated_user_count: analysis.federated_user_count,
        current_step: "analyze"
      });
      return Response.json({ success: true, action, analysis });
    }

    // ── dry_run ────────────────────────────────────────────────────────
    if (action === "dry_run") {
      const analysis = JSON.parse(job.analysis_report || "null");
      if (!analysis) return Response.json({ error: "Run Analyze first" }, { status: 400 });
      const dr = dryRun(analysis);
      const status = dr.canProceed ? "ready" : "issues_pending";
      await saveJob(base44, tenant_id, {
        status,
        dry_run_report: JSON.stringify(dr),
        failure_points: JSON.stringify(dr.failure_points),
        current_step: "dry_run"
      });
      return Response.json({ success: true, action, ...dr });
    }

    // ── reanalyze (analyze + dry run again after fixes) ────────────────
    if (action === "reanalyze") {
      const analysis = await analyzeTenant(token, federatedDomains);
      await saveJob(base44, tenant_id, {
        analysis_report: JSON.stringify(analysis),
        federated_user_count: analysis.federated_user_count,
        current_step: "reanalyze"
      });
      const dr = dryRun(analysis);
      const status = dr.canProceed && job.issues_resolved ? "ready" : (dr.canProceed ? "ready" : "issues_pending");
      await saveJob(base44, tenant_id, {
        status,
        dry_run_report: JSON.stringify(dr),
        failure_points: JSON.stringify(dr.failure_points),
        current_step: "reanalyze"
      });
      return Response.json({ success: true, action, analysis, ...dr });
    }

    // ── mark_resolved (operator confirms issues are corrected) ─────────
    if (action === "mark_resolved") {
      const dryReport = JSON.parse(job.dry_run_report || "null");
      const ready = dryReport?.canProceed;
      await saveJob(base44, tenant_id, {
        issues_resolved: true,
        status: ready ? "ready" : "issues_pending",
        current_step: "mark_resolved"
      });
      return Response.json({ success: true, action, status: ready ? "ready" : "issues_pending" });
    }

    // ── execute ───────────────────────────────────────────────────────
    if (action === "execute") {
      if (job.status !== "ready") {
        return Response.json({ error: "Defederation is not in 'ready' state. Complete detect → analyze → dry run → resolve first." }, { status: 400 });
      }
      await saveJob(base44, tenant_id, { status: "executing", current_step: "execute", started_by: user.email });
      try {
        const result = await executeDefederation(token, federatedDomains, temp_password);
        const failed = result.domFail + result.pwdFail + result.immFail;
        const status = failed > 0 && result.domOk === 0 ? "failed" : "completed";
        await saveJob(base44, tenant_id, {
          status,
          execution_log: JSON.stringify(result),
          current_step: "execute",
          completed_at: new Date().toISOString()
        });
        return Response.json({ success: status === "completed", action, ...result });
      } catch (e) {
        await saveJob(base44, tenant_id, {
          status: "failed",
          execution_log: JSON.stringify({ error: e.message, log: [] }),
          error_message: e.message,
          current_step: "execute"
        });
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[godaddyDefederation] error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}