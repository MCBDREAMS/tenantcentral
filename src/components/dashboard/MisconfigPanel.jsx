import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, CheckCircle2, Wrench, Loader2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

const SEVERITY_STYLES = {
  critical: "bg-red-50 border-red-200 text-red-700",
  high: "bg-orange-50 border-orange-200 text-orange-700",
  medium: "bg-amber-50 border-amber-200 text-amber-700",
  info: "bg-blue-50 border-blue-200 text-blue-700",
};

const SEVERITY_BADGE = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  info: "bg-blue-100 text-blue-700 border-blue-200",
};

/**
 * Evaluates local entity data to produce a list of misconfiguration findings.
 * Each finding optionally carries a remediation_action that maps to tenantRemediate.
 */
function detectMisconfigs({ policies, profiles, baselines, devices, users }) {
  const findings = [];

  // ── Entra / CA Policies ──────────────────────────────────────────────────
  const hasMfaPolicy = policies.some(p =>
    p.state === "enabled" &&
    (p.policy_name?.toLowerCase().includes("mfa") || p.grant_controls?.toLowerCase().includes("mfa"))
  );
  if (!hasMfaPolicy) {
    findings.push({
      id: "no_mfa_ca",
      severity: "critical",
      category: "Entra ID / CA",
      title: "No MFA Conditional Access policy detected",
      detail: "No enabled CA policy enforcing MFA was found. All users may be able to sign in without MFA.",
      remediation_action: "create_ca_mfa_policy",
      remediation_label: "Create MFA policy (Report-Only)",
      link: createPageUrl("EntraPolicies"),
    });
  }

  const hasLegacyAuthBlock = policies.some(p =>
    p.state === "enabled" &&
    (p.policy_name?.toLowerCase().includes("legacy") || p.conditions?.toLowerCase().includes("exchangeActiveSync"))
  );
  if (!hasLegacyAuthBlock) {
    findings.push({
      id: "no_legacy_auth_block",
      severity: "high",
      category: "Entra ID / CA",
      title: "Legacy authentication is not blocked",
      detail: "No policy blocking legacy auth protocols (EAS, IMAP, POP, SMTP auth) was found. Legacy auth bypasses MFA.",
      remediation_action: "create_ca_block_legacy_auth",
      remediation_label: "Block legacy auth (Enabled)",
      link: createPageUrl("EntraPolicies"),
    });
  }

  const hasSignInRisk = policies.some(p =>
    p.conditions?.toLowerCase().includes("signInRisk") || p.policy_name?.toLowerCase().includes("sign-in risk")
  );
  if (!hasSignInRisk) {
    findings.push({
      id: "no_sign_in_risk",
      severity: "medium",
      category: "Entra ID / CA",
      title: "No sign-in risk-based CA policy",
      detail: "Risky sign-ins (e.g. impossible travel, atypical location) are not gated by MFA or block. Requires Entra P2.",
      remediation_action: "create_ca_sign_in_risk",
      remediation_label: "Create sign-in risk policy (Report-Only)",
      link: createPageUrl("EntraPolicies"),
    });
  }

  const hasCompliantDevice = policies.some(p =>
    p.grant_controls?.toLowerCase().includes("compliant") || p.policy_name?.toLowerCase().includes("compliant device")
  );
  if (!hasCompliantDevice) {
    findings.push({
      id: "no_compliant_device_ca",
      severity: "medium",
      category: "Intune / CA",
      title: "No 'Require Compliant Device' CA policy",
      detail: "Users can access cloud apps from unmanaged or non-compliant devices. A compliant device grant control is missing.",
      remediation_action: "create_ca_require_compliant_device",
      remediation_label: "Create compliant device policy (Report-Only)",
      link: createPageUrl("EntraPolicies"),
    });
  }

  const disabledPolicies = policies.filter(p => p.state === "disabled");
  if (disabledPolicies.length > 0) {
    findings.push({
      id: "disabled_ca_policies",
      severity: "info",
      category: "Entra ID / CA",
      title: `${disabledPolicies.length} CA polic${disabledPolicies.length > 1 ? "ies are" : "y is"} disabled`,
      detail: `Disabled policies: ${disabledPolicies.map(p => p.policy_name).slice(0, 3).join(", ")}${disabledPolicies.length > 3 ? "…" : ""}. Review if intentional.`,
      remediation_action: null,
      link: createPageUrl("EntraPolicies"),
    });
  }

  // ── Intune Profiles ───────────────────────────────────────────────────────
  const hasWindowsCompliance = profiles.some(p =>
    p.profile_type === "compliance_policy" && (p.platform === "windows" || p.platform === "all") && p.state === "active"
  );
  if (!hasWindowsCompliance) {
    findings.push({
      id: "no_windows_compliance_policy",
      severity: "high",
      category: "Intune",
      title: "No active Windows compliance policy",
      detail: "Without a compliance policy, Windows devices report as 'Not Evaluated' — they are treated as compliant by default.",
      remediation_action: null,
      link: createPageUrl("IntuneProfiles"),
    });
  }

  const hasEndpointSecurity = profiles.some(p => p.profile_type === "endpoint_security" && p.state === "active");
  if (!hasEndpointSecurity) {
    findings.push({
      id: "no_endpoint_security",
      severity: "medium",
      category: "Intune",
      title: "No active Endpoint Security profile",
      detail: "Endpoint security settings (Defender, firewall, attack surface reduction) are not deployed via Intune.",
      remediation_action: null,
      link: createPageUrl("IntuneProfiles"),
    });
  }

  // ── Security Baselines ───────────────────────────────────────────────────
  const deployedBaselines = baselines.filter(b => b.state === "deployed");
  if (deployedBaselines.length === 0 && baselines.length > 0) {
    findings.push({
      id: "no_deployed_baselines",
      severity: "high",
      category: "Intune / Baselines",
      title: "No security baselines are deployed",
      detail: `${baselines.length} baseline(s) exist but none are in 'deployed' state. Devices may lack hardened configurations.`,
      remediation_action: null,
      link: createPageUrl("SecurityBaselines"),
    });
  }

  // ── Devices ───────────────────────────────────────────────────────────────
  const nonCompliant = devices.filter(d => d.compliance_state === "non_compliant");
  if (nonCompliant.length > 0) {
    findings.push({
      id: "non_compliant_devices",
      severity: nonCompliant.length > 5 ? "critical" : "high",
      category: "Intune / Devices",
      title: `${nonCompliant.length} non-compliant device${nonCompliant.length > 1 ? "s" : ""}`,
      detail: `Affected: ${nonCompliant.map(d => d.device_name).slice(0, 4).join(", ")}${nonCompliant.length > 4 ? `… +${nonCompliant.length - 4} more` : ""}.`,
      remediation_action: null,
      link: createPageUrl("ComplianceReporting"),
    });
  }

  // ── Users / MFA ───────────────────────────────────────────────────────────
  const mfaDisabled = users.filter(u => u.mfa_status === "disabled" && u.account_enabled !== false);
  if (mfaDisabled.length > 0) {
    findings.push({
      id: "users_mfa_disabled",
      severity: mfaDisabled.length > 3 ? "critical" : "high",
      category: "Entra ID / Users",
      title: `${mfaDisabled.length} active user${mfaDisabled.length > 1 ? "s have" : " has"} MFA disabled`,
      detail: `Users without MFA: ${mfaDisabled.map(u => u.upn || u.display_name).slice(0, 3).join(", ")}${mfaDisabled.length > 3 ? `… +${mfaDisabled.length - 3} more` : ""}.`,
      remediation_action: null,
      link: createPageUrl("EntraUsers"),
    });
  }

  return findings;
}

export default function MisconfigPanel({ selectedTenant, policies, profiles, baselines, devices, users }) {
  const [remediating, setRemediating] = useState({});
  const [results, setResults] = useState({});
  const [expanded, setExpanded] = useState(true);

  const findings = useMemo(
    () => detectMisconfigs({ policies, profiles, baselines, devices, users }),
    [policies, profiles, baselines, devices, users]
  );

  const criticalCount = findings.filter(f => f.severity === "critical").length;
  const highCount = findings.filter(f => f.severity === "high").length;

  async function runRemediation(finding) {
    if (!selectedTenant?.tenant_id) {
      alert("Select a specific tenant with Azure credentials before remediating.");
      return;
    }
    setRemediating(prev => ({ ...prev, [finding.id]: true }));
    setResults(prev => ({ ...prev, [finding.id]: null }));
    const res = await base44.functions.invoke("tenantRemediate", {
      remediation_action: finding.remediation_action,
      azure_tenant_id: selectedTenant.tenant_id,
      finding_id: finding.id,
    });
    setRemediating(prev => ({ ...prev, [finding.id]: false }));
    setResults(prev => ({ ...prev, [finding.id]: res.data }));
  }

  if (findings.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-slate-800">No misconfigurations detected</p>
          <p className="text-xs text-slate-400">All checked controls appear to be in place based on local data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        className="w-full px-5 py-4 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <h3 className="font-semibold text-slate-900 text-sm">Misconfiguration Findings</h3>
          <div className="flex gap-1.5">
            {criticalCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-red-200">
                {criticalCount} Critical
              </Badge>
            )}
            {highCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 border-orange-200">
                {highCount} High
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{findings.length} finding{findings.length > 1 ? "s" : ""}</span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Findings list */}
      {expanded && (
        <div className="divide-y divide-slate-100">
          {findings.map(finding => {
            const result = results[finding.id];
            const busy = remediating[finding.id];
            return (
              <div key={finding.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${SEVERITY_BADGE[finding.severity]}`}>
                        {finding.severity}
                      </Badge>
                      <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{finding.category}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 truncate">{finding.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{finding.detail}</p>

                    {/* Result feedback */}
                    {result && (
                      <div className={`mt-2 text-xs rounded-lg px-3 py-2 border ${result.success ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                        {result.success ? <CheckCircle2 className="h-3 w-3 inline mr-1" /> : <AlertTriangle className="h-3 w-3 inline mr-1" />}
                        {result.message || result.error || "Done."}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 mt-1">
                    {finding.link && (
                      <Link to={finding.link}>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700">
                          <ExternalLink className="h-3 w-3 mr-1" />View
                        </Button>
                      </Link>
                    )}
                    {finding.remediation_action && !result?.success && (
                      <Button
                        size="sm"
                        className="h-7 px-3 text-xs bg-slate-800 hover:bg-slate-700 text-white gap-1.5"
                        disabled={busy}
                        onClick={() => runRemediation(finding)}
                      >
                        {busy ? (
                          <><Loader2 className="h-3 w-3 animate-spin" />Running…</>
                        ) : (
                          <><Wrench className="h-3 w-3" />Remediate</>
                        )}
                      </Button>
                    )}
                    {result?.success && (
                      <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />Fixed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      {expanded && (
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400">
          Findings are based on locally synced data. Run a Graph sync for the latest state.
          Remediations with "Report-Only" create policies in non-enforced mode — review in Azure before enabling.
        </div>
      )}
    </div>
  );
}