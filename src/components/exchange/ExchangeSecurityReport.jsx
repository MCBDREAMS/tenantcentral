import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Shield, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  Info, Loader2, TrendingUp, Globe, Users, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const SEV = {
  critical: { border: "border-red-200", bg: "bg-red-50", text: "text-red-700", icon: XCircle, iconCls: "text-red-500" },
  high:     { border: "border-orange-200", bg: "bg-orange-50", text: "text-orange-700", icon: AlertTriangle, iconCls: "text-orange-500" },
  medium:   { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", icon: AlertTriangle, iconCls: "text-amber-500" },
  info:     { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", icon: Info, iconCls: "text-blue-500" },
  pass:     { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2, iconCls: "text-emerald-500" },
};

function FindingCard({ severity, title, description, detail }) {
  const cfg = SEV[severity] || SEV.info;
  const Icon = cfg.icon;
  return (
    <div className={`border ${cfg.border} ${cfg.bg} rounded-xl p-4 flex gap-3`}>
      <Icon className={`h-5 w-5 ${cfg.iconCls} shrink-0 mt-0.5`} />
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className={`text-sm font-semibold ${cfg.text}`}>{title}</p>
          <Badge className={`text-[10px] uppercase border-0 ${cfg.bg} ${cfg.text} shrink-0`}>{severity}</Badge>
        </div>
        <p className="text-xs text-slate-600">{description}</p>
        {detail && <p className="text-xs text-slate-500 mt-1.5 font-mono bg-white/70 px-2 py-1 rounded border border-slate-100">{detail}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
      <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-slate-500" />
      </div>
      <div>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
        {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

function buildFindings(d) {
  const findings = [];

  // External forwarding rules
  if (d.forwardingRisks?.length > 0) {
    findings.push({
      severity: "critical",
      title: "External Email Forwarding Rules Detected",
      description: `${d.forwardingRisks.length} user(s) have inbox rules that automatically forward or redirect mail externally. This is a high-risk data exfiltration vector.`,
      detail: d.forwardingRisks.map(r => r.user.displayName).join(", "),
    });
  } else {
    findings.push({ severity: "pass", title: "No External Forwarding Rules Found", description: "No suspicious external forwarding inbox rules were detected in the scanned mailboxes." });
  }

  // Unverified domains
  const unverified = (d.domains || []).filter(dom => !dom.isVerified);
  if (unverified.length > 0) {
    findings.push({
      severity: "high",
      title: "Unverified Domains",
      description: `${unverified.length} domain(s) are not verified. Unverified domains can be exploited for spoofing attacks.`,
      detail: unverified.map(dom => dom.id).join(", "),
    });
  } else if (d.domains?.length > 0) {
    findings.push({ severity: "pass", title: "All Domains Verified", description: `All ${d.domains.length} domain(s) are verified in Entra ID.` });
  }

  // Federated domains
  const federated = (d.domains || []).filter(dom => dom.authenticationType !== "Managed" && dom.isVerified);
  if (federated.length > 0) {
    findings.push({
      severity: "info",
      title: "Federated Domain Authentication",
      description: `${federated.length} domain(s) use federated authentication. Ensure federation is intentional and properly secured.`,
      detail: federated.map(dom => dom.id).join(", "),
    });
  }

  // Guest users
  if (d.guestUsers?.length > 0) {
    findings.push({
      severity: "medium",
      title: "Guest Users Present",
      description: `${d.guestUsers.length} guest user(s) found. Review whether external guests require mailbox or resource access.`,
      detail: d.guestUsers.slice(0, 5).map(u => u.displayName || u.userPrincipalName).join(", ") + (d.guestUsers.length > 5 ? ` +${d.guestUsers.length - 5} more` : ""),
    });
  }

  // Disabled accounts with licenses
  if (d.disabledWithLicense?.length > 0) {
    findings.push({
      severity: "medium",
      title: "Disabled Accounts with Active Licenses",
      description: `${d.disabledWithLicense.length} disabled account(s) still hold assigned licenses. This represents unnecessary cost and potential security risk.`,
      detail: d.disabledWithLicense.slice(0, 5).map(u => u.displayName || u.userPrincipalName).join(", ") + (d.disabledWithLicense.length > 5 ? ` +${d.disabledWithLicense.length - 5} more` : ""),
    });
  }

  // Secure score controls
  const failed = (d.emailControls || []).filter(c => (c.controlScore ?? 0) < (c.maxScore ?? 1));
  failed.slice(0, 6).forEach(c => {
    findings.push({
      severity: c.tier === "high" ? "high" : "medium",
      title: c.title || "Security Control Not Implemented",
      description: c.userImpact || "This control is not fully implemented. Review in Microsoft Secure Score.",
    });
  });

  return findings;
}

export default function ExchangeSecurityReport({ tenantId }) {
  const { data, isLoading, error, refetch, isFetched } = useQuery({
    queryKey: ["exchange_security_report", tenantId],
    enabled: false,
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "exchange_security_report", azure_tenant_id: tenantId })
        .then(r => r.data),
  });

  const findings = data ? buildFindings(data) : [];
  const critCount = findings.filter(f => f.severity === "critical").length;
  const highCount = findings.filter(f => f.severity === "high").length;
  const passCount = findings.filter(f => f.severity === "pass").length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Button onClick={() => refetch()} disabled={isLoading} className="bg-slate-900 hover:bg-slate-800">
          {isLoading
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analysing…</>
            : <><Shield className="h-4 w-4 mr-2" />Run Security Report</>}
        </Button>
        <p className="text-xs text-slate-400">Scans forwarding risks, domain health, guest access, license waste & Secure Score controls</p>
      </div>

      {error && <div className="text-sm text-red-500 mb-4 p-3 bg-red-50 rounded-lg border border-red-200">Error: {error.message}</div>}

      {!isFetched && !isLoading && (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl">
          <Shield className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400 mb-1">Exchange Security Report</p>
          <p className="text-xs text-slate-400">Click "Run Security Report" to analyse your Exchange security posture</p>
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Total Users" value={data.userCount || 0} icon={Users} sub={`${data.enabledUsers || 0} active`} />
            <Stat label="Domains" value={data.domains?.length || 0} icon={Globe} sub={`${(data.domains || []).filter(d => d.isVerified).length} verified`} />
            <Stat label="Guest Users" value={data.guestUsers?.length || 0} icon={Users} />
            <Stat
              label="Secure Score"
              value={data.secureScore?.currentScore ? `${Math.round(data.secureScore.currentScore)}` : "N/A"}
              icon={TrendingUp}
              sub={data.secureScore?.maxScore ? `of ${Math.round(data.secureScore.maxScore)}` : ""}
            />
          </div>

          {/* Findings summary */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-sm font-semibold text-slate-700">Findings:</span>
            {critCount > 0 && <Badge className="bg-red-100 text-red-700 border-0">{critCount} Critical</Badge>}
            {highCount > 0 && <Badge className="bg-orange-100 text-orange-700 border-0">{highCount} High</Badge>}
            <Badge className="bg-emerald-100 text-emerald-700 border-0">{passCount} Passed</Badge>
            <span className="text-xs text-slate-400">{findings.length} total checks</span>
          </div>

          {/* Findings list - issues first, passes at bottom */}
          <div className="space-y-2.5 mb-8">
            {findings.filter(f => f.severity !== "pass").map((f, i) => <FindingCard key={i} {...f} />)}
            {findings.filter(f => f.severity === "pass").map((f, i) => <FindingCard key={`p${i}`} {...f} />)}
          </div>

          {/* Email Secure Score Controls table */}
          {data.emailControls?.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">
                Email & Apps Secure Score Controls
                <span className="ml-2 text-xs font-normal text-slate-400">({data.emailControls.length} controls)</span>
              </p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Control</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Impact</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Score</th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.emailControls.slice(0, 20).map((c, i) => {
                      const pct = c.maxScore ? Math.round(((c.controlScore ?? 0) / c.maxScore) * 100) : 0;
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{c.title}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{c.userImpact || "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-slate-200 rounded-full">
                                <div className={`h-1.5 rounded-full ${pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-slate-500">{c.controlScore ?? 0}/{c.maxScore ?? "?"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {c.actionUrl && (
                              <a href={c.actionUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700">
                                <ExternalLink className="h-3.5 w-3.5 inline" />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}