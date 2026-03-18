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

async function graphPost(token, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} - ${JSON.stringify(data?.error?.message)}`);
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
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status} - ${JSON.stringify(data?.error?.message)}`);
  return data;
}

const remediations = {
  create_ca_mfa_policy: async (token) => {
    const policy = await graphPost(token, "/identity/conditionalAccess/policies", {
      displayName: "[Auto-Hardening] Require MFA for All Users",
      state: "enabledForReportingButNotEnforced", // report-only mode for safety
      conditions: {
        users: { includeUsers: ["All"] },
        applications: { includeApplications: ["All"] },
        clientAppTypes: ["all"]
      },
      grantControls: {
        operator: "OR",
        builtInControls: ["mfa"]
      }
    });
    return { message: `MFA policy created in Report-Only mode (ID: ${policy.id}). Review and enable in the Azure portal.`, policy_id: policy.id };
  },

  create_ca_block_legacy_auth: async (token) => {
    const policy = await graphPost(token, "/identity/conditionalAccess/policies", {
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
    });
    return { message: `Legacy auth block policy created and ENABLED (ID: ${policy.id}).`, policy_id: policy.id };
  },

  enable_security_defaults: async (token) => {
    // Enable security defaults (disables CA policies if any)
    await graphPatch(token, "/policies/identitySecurityDefaultsEnforcementPolicy", {
      isEnabled: true
    });
    return { message: "Security Defaults enabled. Note: This will override existing Conditional Access policies." };
  },

  create_ca_sign_in_risk: async (token) => {
    const policy = await graphPost(token, "/identity/conditionalAccess/policies", {
      displayName: "[Auto-Hardening] Require MFA on Medium Sign-In Risk",
      state: "enabledForReportingButNotEnforced",
      conditions: {
        users: { includeUsers: ["All"] },
        applications: { includeApplications: ["All"] },
        signInRiskLevels: ["medium", "high"]
      },
      grantControls: {
        operator: "OR",
        builtInControls: ["mfa"]
      }
    });
    return { message: `Sign-in risk policy created in Report-Only mode (ID: ${policy.id}). Requires Entra P2. Review and enable.`, policy_id: policy.id };
  },

  create_ca_user_risk: async (token) => {
    const policy = await graphPost(token, "/identity/conditionalAccess/policies", {
      displayName: "[Auto-Hardening] Block High User Risk",
      state: "enabledForReportingButNotEnforced",
      conditions: {
        users: { includeUsers: ["All"] },
        applications: { includeApplications: ["All"] },
        userRiskLevels: ["high"]
      },
      grantControls: {
        operator: "OR",
        builtInControls: ["block"]
      }
    });
    return { message: `User risk block policy created in Report-Only mode (ID: ${policy.id}). Requires Entra P2. Review and enable.`, policy_id: policy.id };
  },

  create_ca_require_compliant_device: async (token) => {
    const policy = await graphPost(token, "/identity/conditionalAccess/policies", {
      displayName: "[Auto-Hardening] Require Compliant Device",
      state: "enabledForReportingButNotEnforced",
      conditions: {
        users: { includeUsers: ["All"] },
        applications: { includeApplications: ["All"] },
        platforms: { includePlatforms: ["windows", "macOS"] }
      },
      grantControls: {
        operator: "OR",
        builtInControls: ["compliantDevice", "domainJoinedDevice"]
      }
    });
    return { message: `Compliant device requirement policy created in Report-Only mode (ID: ${policy.id}). Review before enabling.`, policy_id: policy.id };
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { remediation_action, azure_tenant_id, finding_id } = await req.json();

    if (!remediation_action) {
      return Response.json({ error: "remediation_action is required" }, { status: 400 });
    }

    const handler = remediations[remediation_action];
    if (!handler) {
      return Response.json({ error: `Unknown remediation: ${remediation_action}` }, { status: 400 });
    }

    console.log(`[remediate] Running: ${remediation_action} for tenant ${azure_tenant_id} by ${user.email}`);
    const token = await getAccessToken(azure_tenant_id);
    const result = await handler(token);

    // Log to audit
    await base44.asServiceRole.entities.AuditLog.create({
      action: `REMEDIATE_${remediation_action.toUpperCase()}`,
      category: "security_baseline",
      actor: user.email,
      details: JSON.stringify({ remediation_action, finding_id, result }),
      severity: "warning",
      status: "success"
    });

    return Response.json({ success: true, ...result });

  } catch (err) {
    console.error("[tenantRemediate] Error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});