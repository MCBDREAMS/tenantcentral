import React from "react";
import {
  CheckCircle2, AlertTriangle, XCircle, Info, Download, ShieldCheck, Gauge, FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const SEVERITY = {
  high: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "High" },
  medium: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Medium" },
  low: { icon: FileWarning, color: "text-blue-600", bg: "bg-blue-50 border-blue-200", label: "Low" },
  info: { icon: Info, color: "text-slate-500", bg: "bg-slate-50 border-slate-200", label: "Info" },
};

const STATUS_STYLE = {
  feasible: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", badge: "bg-emerald-100 text-emerald-700" },
  feasible_with_conditions: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-700" },
  not_recommended: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", badge: "bg-red-100 text-red-700" },
  insufficient_data: { icon: Info, color: "text-slate-600", bg: "bg-slate-50 border-slate-200", badge: "bg-slate-200 text-slate-700" },
};

export default function FeasibilityReport({ report }) {
  const style = STATUS_STYLE[report.overallStatus] || STATUS_STYLE.insufficient_data;
  const sorted = [...report.findings].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2, info: 3 };
    return order[a.severity] - order[b.severity];
  });

  const downloadMd = () => {
    const lines = [];
    lines.push(`# Tenant-to-Tenant Migration Feasibility Report`);
    lines.push(`**Source:** ${report.sourceTenant}  •  **Target:** ${report.targetTenant}`);
    lines.push(`**Workloads:** ${report.workloads.join(", ")}  •  **Generated:** ${new Date(report.generatedAt).toLocaleString()}`);
    lines.push("");
    lines.push(`## Overall status: ${report.statusLabel}`);
    lines.push(`**Readiness score:** ${report.readinessScore}/100`);
    lines.push("");
    lines.push(`### Recommendation`);
    lines.push(report.recommendation);
    lines.push("");
    lines.push(`## Inventory counts`);
    lines.push(`| Metric | Source | Target |`);
    lines.push(`|---|---|---|`);
    lines.push(`| Users | ${report.counts.source.users} | ${report.counts.target.users} |`);
    lines.push(`| Mailboxes | ${report.counts.source.mailboxes} | — |`);
    lines.push(`| Teams | ${report.counts.source.teams} | — |`);
    lines.push(`| SharePoint sites | ${report.counts.source.sharepointSites} | — |`);
    lines.push(`| Available licenses | — | ${report.counts.target.availableLicenses} |`);
    lines.push(`| License gap | ${report.licenseGap > 0 ? report.licenseGap + " short" : "none"} | — |`);
    lines.push("");
    lines.push(`## Findings`);
    sorted.forEach(f => {
      lines.push(`### [${SEVERITY[f.severity].label}] ${f.area}`);
      lines.push(`- ${f.detail}`);
      lines.push(`- **Recommendation:** ${f.recommendation}`);
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FeasibilityReport_${report.sourceTenant}_to_${report.targetTenant}.md`.replace(/\s+/g, "_");
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className={`flex items-center justify-between p-5 rounded-xl border ${style.bg}`}>
        <div className="flex items-center gap-3">
          <style.icon className={`h-8 w-8 ${style.color}`} />
          <div>
            <p className="font-semibold text-slate-800">{report.statusLabel}</p>
            <p className="text-sm text-slate-600">{report.sourceTenant} → {report.targetTenant}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Gauge className={`h-5 w-5 ${style.color}`} />
            <span className="text-2xl font-bold text-slate-800">{report.readinessScore}</span>
            <span className="text-sm text-slate-400">/100</span>
          </div>
          <Button variant="outline" size="sm" onClick={downloadMd} className="gap-2 bg-white">
            <Download className="h-3.5 w-3.5" /> Report (.md)
          </Button>
        </div>
      </div>

      {/* Recommendation */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" /> Recommendation
        </p>
        <p className="text-sm text-slate-700">{report.recommendation}</p>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CountCard label="Source users" value={report.counts.source.users} />
        <CountCard label="Source mailboxes" value={report.counts.source.mailboxes} />
        <CountCard label="Source teams" value={report.counts.source.teams} />
        <CountCard label="Source SP sites" value={report.counts.source.sharepointSites} />
        <CountCard label="Target users" value={report.counts.target.users} />
        <CountCard label="Target avail. licenses" value={report.counts.target.availableLicenses} />
        <CountCard label="License gap" value={report.licenseGap > 0 ? `${report.licenseGap} short` : "None"} highlight={report.licenseGap > 0 ? "bad" : "good"} />
        <CountCard label="Source guest users" value={report.counts.source.guests} />
      </div>

      {/* Findings */}
      <div>
        <h4 className="font-semibold text-slate-800 mb-2">Findings ({sorted.length})</h4>
        <div className="space-y-2">
          {sorted.map((f, i) => {
            const s = SEVERITY[f.severity];
            return (
              <div key={i} className={`flex gap-3 p-3 rounded-lg border ${s.bg}`}>
                <s.icon className={`h-4 w-4 ${s.color} mt-0.5 shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-slate-800 text-sm">{f.area}</span>
                    <Badge className={`text-[10px] border-0 ${s.severity === "high" ? "bg-red-100 text-red-700" : s.severity === "medium" ? "bg-amber-100 text-amber-700" : s.severity === "low" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{s.label}</Badge>
                  </div>
                  <p className="text-sm text-slate-700">{f.detail}</p>
                  <p className="text-xs text-slate-500 mt-1"><span className="font-semibold">Recommendation:</span> {f.recommendation}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CountCard({ label, value, highlight }) {
  const tone = highlight === "bad" ? "text-red-600" : highlight === "good" ? "text-emerald-600" : "text-slate-800";
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold ${tone} mt-0.5`}>{value}</p>
    </div>
  );
}