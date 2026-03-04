import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
const TENANT_ID = Deno.env.get("AZURE_TENANT_ID");

async function getAccessToken(tenantId) {
  const tid = tenantId || TENANT_ID;
  const url = `https://login.microsoftonline.com/${tid}/oauth2/v2.0/token`;
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
  const data = await res.json();
  if (!res.ok) {
    console.warn(`[graphGet] ${path} -> ${res.status}: ${JSON.stringify(data?.error)}`);
    return null;
  }
  return data;
}

async function graphGetBeta(token, path) {
  const res = await fetch(`https://graph.microsoft.com/beta${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) {
    console.warn(`[graphGetBeta] ${path} -> ${res.status}: ${JSON.stringify(data?.error)}`);
    return null;
  }
  return data;
}

async function graphGetAll(token, path, useBeta = false) {
  let results = [];
  const base = useBeta ? "https://graph.microsoft.com/beta" : "https://graph.microsoft.com/v1.0";
  let url = `${base}${path}`;
  let pageCount = 0;
  while (url && pageCount < 20) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) {
      console.warn(`[graphGetAll] FAILED ${path}: ${res.status}`);
      break;
    }
    results = results.concat(data.value || []);
    url = data["@odata.nextLink"] || null;
    pageCount++;
  }
  return results;
}

async function graphPost(token, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} - ${JSON.stringify(data?.error)}`);
  return data;
}

async function graphPatch(token, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (res.status === 204) return { success: true };
  const data = await res.json();
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status} - ${JSON.stringify(data?.error)}`);
  return data;
}

// ─── ANALYZE ────────────────────────────────────────────────────────────────

async function analyzeSecurityPosture(token) {
  console.log("[analyze] Starting security analysis...");
  
  const findings = [];

  // Fetch data in parallel buckets
  const [
    caPolicies,
    users,
    org,
    authMethodsPolicy,
    secureScore,
    mfaRegistration,
    adminUsers,
    guestUsers,
    namedLocations,
    appRegistrations
  ] = await Promise.all([
    graphGetAll(token, "/identity/conditionalAccess/policies?$top=200"),
    graphGetAll(token, "/users?$select=id,displayName,userPrincipalName,accountEnabled,userType,assignedLicenses,createdDateTime&$top=999"),
    graphGet(token, "/organization"),
    graphGet(token, "/policies/authenticationMethodsPolicy"),
    graphGet(token, "/security/secureScores?$top=1"),
    graphGet(token, "/reports/authenticationMethods/userRegistrationDetails?$top=1"),
    graphGetAll(token, "/directoryRoles?$expand=members"),
    graphGetAll(token, "/users?$filter=userType eq 'Guest'&$select=id,displayName,userPrincipalName,createdDateTime&$top=999"),
    graphGetAll(token, "/identity/conditionalAccess/namedLocations?$top=200"),
    graphGetAll(token, "/applications?$select=id,displayName,appId,signInAudience,passwordCredentials,keyCredentials,createdDateTime&$top=999")
  ]);

  // 1. MFA / Conditional Access checks
  const enabledCAPolicies = caPolicies.filter(p => p.state === "enabled");
  const mfaPolicies = enabledCAPolicies.filter(p => {
    const controls = p.grantControls?.builtInControls || [];
    return controls.includes("mfa") || controls.includes("compliantDevice") || controls.includes("domainJoinedDevice");
  });

  if (mfaPolicies.length === 0) {
    findings.push({
      id: "ca-mfa-missing",
      category: "Identity",
      severity: "critical",
      title: "No MFA Conditional Access Policy Enabled",
      description: "No Conditional Access policy requiring MFA is currently enabled. This leaves all users vulnerable to credential-based attacks.",
      recommendation: "Create and enable a Conditional Access policy that requires MFA for all users. Microsoft recommends MFA for all cloud apps.",
      standard: "Microsoft Best Practice, CIS Microsoft 365 Foundations v2.0 – Control 1.1.1",
      remediation_action: "create_ca_mfa_policy",
      remediation_label: "Create MFA Policy",
      status: "fail"
    });
  } else {
    findings.push({
      id: "ca-mfa-present",
      category: "Identity",
      severity: "info",
      title: "MFA Conditional Access Policy Present",
      description: `${mfaPolicies.length} CA policy(ies) require MFA or compliant device.`,
      recommendation: "Ensure all users and all cloud apps are covered.",
      standard: "Microsoft Best Practice",
      status: "pass"
    });
  }

  // 2. Legacy Auth Block
  const blockLegacyAuth = enabledCAPolicies.filter(p => {
    const clientTypes = p.conditions?.clientAppTypes || [];
    const block = p.grantControls?.operator === "OR" && (p.grantControls?.builtInControls || []).includes("block");
    return (clientTypes.includes("exchangeActiveSync") || clientTypes.includes("other")) && block;
  });

  if (blockLegacyAuth.length === 0) {
    findings.push({
      id: "ca-legacy-auth",
      category: "Identity",
      severity: "high",
      title: "Legacy Authentication Not Blocked",
      description: "No Conditional Access policy is blocking legacy authentication protocols. Over 99% of password spray attacks use legacy auth.",
      recommendation: "Create a CA policy to block legacy authentication for all users.",
      standard: "Microsoft Best Practice, CIS M365 1.1.3",
      remediation_action: "create_ca_block_legacy_auth",
      remediation_label: "Block Legacy Auth",
      status: "fail"
    });
  } else {
    findings.push({
      id: "ca-legacy-auth-ok",
      category: "Identity",
      severity: "info",
      title: "Legacy Authentication Blocked",
      description: "A CA policy blocking legacy auth is in place.",
      standard: "CIS M365 1.1.3",
      status: "pass"
    });
  }

  // 3. Global Admin count
  const globalAdminRole = (adminUsers || []).find(r => r.displayName === "Global Administrator");
  const globalAdmins = globalAdminRole?.members || [];
  if (globalAdmins.length > 5) {
    findings.push({
      id: "too-many-global-admins",
      category: "Privileged Access",
      severity: "high",
      title: `Too Many Global Administrators (${globalAdmins.length})`,
      description: `There are ${globalAdmins.length} Global Admins. Microsoft recommends 2–4 emergency accounts only. Excess global admins increase blast radius.`,
      recommendation: "Reduce Global Admins to 2–4. Use Privileged Identity Management (PIM) for just-in-time access.",
      standard: "Microsoft Best Practice, CIS M365 1.1.6",
      status: "fail"
    });
  } else if (globalAdmins.length === 0) {
    findings.push({
      id: "no-global-admins",
      category: "Privileged Access",
      severity: "medium",
      title: "Could Not Read Global Admin Count",
      description: "Unable to retrieve Global Administrator role members. Ensure Directory.Read.All permission is granted.",
      recommendation: "Grant Directory.Read.All and re-run analysis.",
      standard: "Microsoft Best Practice",
      status: "warn"
    });
  } else {
    findings.push({
      id: "global-admins-ok",
      category: "Privileged Access",
      severity: "info",
      title: `Global Admin Count OK (${globalAdmins.length})`,
      description: `${globalAdmins.length} Global Administrator(s) configured – within recommended range.`,
      standard: "Microsoft Best Practice",
      status: "pass"
    });
  }

  // 4. Guest user access review
  const guestCount = (guestUsers || []).length;
  const totalUsers = (users || []).length;
  const guestRatio = totalUsers > 0 ? guestCount / totalUsers : 0;

  if (guestRatio > 0.3) {
    findings.push({
      id: "high-guest-ratio",
      category: "Identity",
      severity: "medium",
      title: `High Guest User Ratio (${guestCount} guests / ${totalUsers} total)`,
      description: "More than 30% of your directory users are guests. Guest accounts should be regularly reviewed and removed if not needed.",
      recommendation: "Implement a recurring Access Review for guest users. Set a guest expiry policy in Azure AD.",
      standard: "CIS M365 1.1.9, Microsoft Best Practice",
      status: "fail"
    });
  } else {
    findings.push({
      id: "guest-ratio-ok",
      category: "Identity",
      severity: "info",
      title: `Guest User Count Acceptable (${guestCount})`,
      description: `${guestCount} guest users out of ${totalUsers} total.`,
      standard: "CIS M365 1.1.9",
      status: "pass"
    });
  }

  // 5. Secure Score
  const latestScore = secureScore?.value?.[0];
  if (latestScore) {
    const pct = Math.round((latestScore.currentScore / latestScore.maxScore) * 100);
    const sev = pct < 40 ? "critical" : pct < 60 ? "high" : pct < 75 ? "medium" : "info";
    const st = pct >= 75 ? "pass" : "fail";
    findings.push({
      id: "secure-score",
      category: "Overall",
      severity: sev,
      title: `Microsoft Secure Score: ${pct}% (${Math.round(latestScore.currentScore)} / ${Math.round(latestScore.maxScore)})`,
      description: `Your Microsoft Secure Score is ${pct}%. Industry average is approximately 55%.`,
      recommendation: "Review Microsoft Secure Score recommendations in the Microsoft 365 Defender portal and action high-impact items.",
      standard: "Microsoft Secure Score",
      status: st
    });
  }

  // 6. Password protection / SSPR
  const orgData = org?.value?.[0];
  if (orgData) {
    // Check if self-service password reset is configured
    const sspr = orgData?.selfServePasswordResetPolicy;
    if (!sspr || sspr === "none") {
      findings.push({
        id: "sspr-disabled",
        category: "Identity",
        severity: "medium",
        title: "Self-Service Password Reset (SSPR) May Not Be Fully Enabled",
        description: "SSPR reduces helpdesk load and ensures users can recover accounts securely.",
        recommendation: "Enable SSPR for all users. Configure at least 2 authentication methods.",
        standard: "Microsoft Best Practice",
        status: "warn"
      });
    }
  }

  // 7. Named locations configured
  if ((namedLocations || []).length === 0) {
    findings.push({
      id: "no-named-locations",
      category: "Identity",
      severity: "medium",
      title: "No Named Locations Configured",
      description: "Named locations allow you to define trusted IP ranges and countries for Conditional Access policies. Without them, location-based controls cannot be applied.",
      recommendation: "Create Named Locations for your office IPs and trusted countries to enhance CA policy granularity.",
      standard: "Microsoft Best Practice",
      status: "warn"
    });
  } else {
    findings.push({
      id: "named-locations-ok",
      category: "Identity",
      severity: "info",
      title: `Named Locations Configured (${namedLocations.length})`,
      description: `${namedLocations.length} named location(s) defined.`,
      standard: "Microsoft Best Practice",
      status: "pass"
    });
  }

  // 8. App registrations with expiring/expired credentials
  const now = new Date();
  const expiredApps = (appRegistrations || []).filter(app => {
    const allCreds = [...(app.passwordCredentials || []), ...(app.keyCredentials || [])];
    return allCreds.some(c => c.endDateTime && new Date(c.endDateTime) < now);
  });
  const expiringApps = (appRegistrations || []).filter(app => {
    const allCreds = [...(app.passwordCredentials || []), ...(app.keyCredentials || [])];
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return allCreds.some(c => c.endDateTime && new Date(c.endDateTime) > now && new Date(c.endDateTime) < in30);
  });

  if (expiredApps.length > 0) {
    findings.push({
      id: "expired-app-creds",
      category: "Applications",
      severity: "high",
      title: `${expiredApps.length} App Registration(s) with Expired Credentials`,
      description: `The following apps have expired secrets/certificates: ${expiredApps.slice(0, 5).map(a => a.displayName).join(", ")}`,
      recommendation: "Rotate expired credentials immediately to prevent application outages or security incidents.",
      standard: "Microsoft Best Practice",
      status: "fail"
    });
  }

  if (expiringApps.length > 0) {
    findings.push({
      id: "expiring-app-creds",
      category: "Applications",
      severity: "medium",
      title: `${expiringApps.length} App Registration(s) with Credentials Expiring in 30 Days`,
      description: `Apps expiring soon: ${expiringApps.slice(0, 5).map(a => a.displayName).join(", ")}`,
      recommendation: "Rotate credentials proactively to avoid service interruptions.",
      standard: "Microsoft Best Practice",
      status: "warn"
    });
  }

  if (expiredApps.length === 0 && expiringApps.length === 0 && appRegistrations.length > 0) {
    findings.push({
      id: "app-creds-ok",
      category: "Applications",
      severity: "info",
      title: `App Credentials OK (${appRegistrations.length} apps checked)`,
      description: "No expired or soon-to-expire app registration credentials found.",
      standard: "Microsoft Best Practice",
      status: "pass"
    });
  }

  // 9. Multi-person approval / PIM check (via roles)
  const privilegedRoleNames = ["Global Administrator", "Privileged Role Administrator", "Security Administrator", "Exchange Administrator"];
  const overPrivileged = (adminUsers || []).filter(r => privilegedRoleNames.includes(r.displayName) && (r.members || []).length > 10);
  if (overPrivileged.length > 0) {
    findings.push({
      id: "over-privileged-roles",
      category: "Privileged Access",
      severity: "high",
      title: `Over-Privileged Admin Roles Detected`,
      description: `Roles with >10 members: ${overPrivileged.map(r => `${r.displayName} (${r.members.length})`).join(", ")}. Excessive privileged memberships increase attack surface.`,
      recommendation: "Implement PIM (Privileged Identity Management) with just-in-time activation and time-limited access.",
      standard: "CIS M365 1.1.6, NIST 800-53 AC-2",
      status: "fail"
    });
  }

  // 10. Sign-in risk policy
  const signInRiskPolicies = enabledCAPolicies.filter(p => p.conditions?.signInRiskLevels?.length > 0);
  if (signInRiskPolicies.length === 0) {
    findings.push({
      id: "no-sign-in-risk-policy",
      category: "Identity",
      severity: "medium",
      title: "No Sign-In Risk Conditional Access Policy",
      description: "No CA policy is configured to respond to sign-in risk (e.g., requiring MFA on medium risk, blocking on high risk). This requires Entra ID P2.",
      recommendation: "Create a CA policy that requires MFA on medium sign-in risk and blocks high risk sign-ins.",
      standard: "Microsoft Best Practice, CIS M365",
      status: "warn"
    });
  } else {
    findings.push({
      id: "sign-in-risk-ok",
      category: "Identity",
      severity: "info",
      title: "Sign-In Risk Policy Configured",
      description: `${signInRiskPolicies.length} CA policy(ies) respond to sign-in risk.`,
      standard: "Microsoft Best Practice",
      status: "pass"
    });
  }

  // 11. User risk policy
  const userRiskPolicies = enabledCAPolicies.filter(p => p.conditions?.userRiskLevels?.length > 0);
  if (userRiskPolicies.length === 0) {
    findings.push({
      id: "no-user-risk-policy",
      category: "Identity",
      severity: "medium",
      title: "No User Risk Conditional Access Policy",
      description: "No CA policy blocks or challenges users flagged as high-risk. Compromised credentials may go unmitigated.",
      recommendation: "Create a CA policy requiring password change or blocking high user risk. Requires Entra ID P2.",
      standard: "Microsoft Best Practice",
      status: "warn"
    });
  } else {
    findings.push({
      id: "user-risk-ok",
      category: "Identity",
      severity: "info",
      title: "User Risk Policy Configured",
      description: `${userRiskPolicies.length} CA policy(ies) respond to user risk.`,
      standard: "Microsoft Best Practice",
      status: "pass"
    });
  }

  // 12. Admin accounts without dedicated admin UPN
  const allAdminMembers = (adminUsers || [])
    .filter(r => privilegedRoleNames.includes(r.displayName))
    .flatMap(r => r.members || []);
  const adminWithPersonalAccounts = allAdminMembers.filter(u =>
    u.userPrincipalName && !u.userPrincipalName.includes(".adm") && !u.userPrincipalName.includes("admin")
  );
  if (adminWithPersonalAccounts.length > 0) {
    findings.push({
      id: "admin-no-dedicated-account",
      category: "Privileged Access",
      severity: "medium",
      title: "Admins Using Non-Dedicated Admin Accounts",
      description: `${adminWithPersonalAccounts.length} admin(s) appear to use regular user accounts for privileged roles. Best practice requires dedicated admin accounts (e.g., admin@domain or username.adm@domain).`,
      recommendation: "Create dedicated cloud-only admin accounts for all privileged role holders. Disable email on admin accounts.",
      standard: "CIS M365 1.1.7, Microsoft Best Practice",
      status: "fail"
    });
  }

  // 13. Device compliance policies
  // (we check via previously loaded CA policies for compliant device requirement)
  const deviceCompliancePolicies = enabledCAPolicies.filter(p => {
    const controls = p.grantControls?.builtInControls || [];
    return controls.includes("compliantDevice") || controls.includes("domainJoinedDevice");
  });
  if (deviceCompliancePolicies.length === 0) {
    findings.push({
      id: "no-device-compliance-ca",
      category: "Devices",
      severity: "medium",
      title: "No Device Compliance Required by Conditional Access",
      description: "No Conditional Access policy requires devices to be compliant or Hybrid Azure AD joined.",
      recommendation: "Add device compliance requirement to CA policies for accessing sensitive applications.",
      standard: "Microsoft Best Practice, CIS M365",
      status: "warn"
    });
  } else {
    findings.push({
      id: "device-compliance-ca-ok",
      category: "Devices",
      severity: "info",
      title: "Device Compliance Required by CA Policy",
      description: `${deviceCompliancePolicies.length} CA policy(ies) require compliant or domain-joined devices.`,
      standard: "Microsoft Best Practice",
      status: "pass"
    });
  }

  console.log(`[analyze] Completed with ${findings.length} findings`);
  return findings;
}

// ─── REMEDIATION ACTIONS ─────────────────────────────────────────────────────

async function remediateMfaPolicy(token) {
  const policy = {
    displayName: "[Auto-Hardening] Require MFA for All Users",
    state: "enabled",
    conditions: {
      users: { includeUsers: ["All"], excludeUsers: [] },
      applications: { includeApplications: ["All"] },
      clientAppTypes: ["all"]
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"]
    }
  };
  return await graphPost(token, "/identity/conditionalAccess/policies", policy);
}

async function remediateBlockLegacyAuth(token) {
  const policy = {
    displayName: "[Auto-Hardening] Block Legacy Authentication",
    state: "enabled",
    conditions: {
      users: { includeUsers: ["All"] },
      applications: { includeApplications: ["All"] },
      clientAppTypes: ["exchangeActiveSync", "other"]
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["block"]
    }
  };
  return await graphPost(token, "/identity/conditionalAccess/policies", policy);
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { action, azure_tenant_id } = await req.json();
    const token = await getAccessToken(azure_tenant_id);

    if (action === "analyze") {
      const findings = await analyzeSecurityPosture(token);
      
      // Calculate score
      const weights = { critical: 25, high: 15, medium: 8, info: 0 };
      const failFindings = findings.filter(f => f.status === "fail" || f.status === "warn");
      const totalDeductions = failFindings.reduce((sum, f) => sum + (weights[f.severity] || 0), 0);
      const score = Math.max(0, 100 - totalDeductions);
      
      return Response.json({
        success: true,
        findings,
        score,
        summary: {
          total: findings.length,
          critical: findings.filter(f => f.severity === "critical" && f.status !== "pass").length,
          high: findings.filter(f => f.severity === "high" && f.status !== "pass").length,
          medium: findings.filter(f => f.severity === "medium" && f.status !== "pass").length,
          passed: findings.filter(f => f.status === "pass").length,
          failed: findings.filter(f => f.status === "fail").length,
          warned: findings.filter(f => f.status === "warn").length,
        }
      });
    }

    return Response.json({ error: "Unknown action. Use action: 'analyze'" }, { status: 400 });

  } catch (err) {
    console.error("[tenantAnalyzer] Error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});