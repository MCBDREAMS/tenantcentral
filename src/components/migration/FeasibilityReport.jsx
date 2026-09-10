import React from "react";
import {
  CheckCircle2, AlertTriangle, XCircle, Info, Download, ShieldCheck, Gauge, FileWarning,
  ArrowRight, MinusCircle,
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

function gapTone(gap) {
  if (gap === null || gap === undefined) return "text-slate-400";
  if (gap > 0) return "text-red-600 font-semibold";
  if (gap < 0) return "text-emerald-600 font-semibold";
  return "text-slate-500";
}
function gapLabel(gap) {
  if (gap === null || gap === undefined) return "—";
  if (gap > 0) return `${gap} short`;
  if (gap < 0) return `${Math.abs(gap)} surplus`;
  return "Balanced";
}

export default function FeasibilityReport({ report }) {
  const style = STATUS_STYLE[report.overallStatus] || STATUS_STYLE.insufficient_data;
  const sorted = [...report.findings].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2, info: 3 };
    return order[a.severity] - order[b.severity];
  });

  const c = report.counts || { source: {}, target: {} };
  const gapRows = [
    { label: "Users", src: c.source.users, tgt: c.target.users, gap: (c.source.users ?? 0) - (c.target.users ?? 0) },
    { label: "Mailboxes (source to move)", src: c.source.mailboxes, tgt: c.target.availableLicenses, gap: (c.source.mailboxes ?? 0) - (c.target.availableLicenses ?? 0) },
    { label: "Teams", src: c.source.teams, tgt: c.target.teams, gap: null },
    { label: "SharePoint sites", src: c.source.sharepointSites, tgt: c.target.sharepointSites, gap: null },
    { label: "Guest users (source)", src: c.source.guests, tgt: 0, gap: c.source.guests ?? 0 },
    { label: "Available licenses (target)", src: c.target.availableLicenses, tgt: c.target.availableLicenses, gap: report.licenseGap ?? 0 },
  ];

  const downloadMd = () => {
    const lines = [];
    lines.push(`# Tenant-to-Tenant Migration Feasibility / Gap Report`);
    lines.push(`**Source:** ${report.sourceTenant}  •  **Target:** ${report.targetTenant}`);
    lines.push(`**Workloads:** ${report.workloads.join(", ")}  •  **Generated:** ${new Date(report.generatedAt).toLocaleString()}`);
    lines.push("");
    lines.push(`## Overall status: ${report.statusLabel}`);
    lines.push(`**Readiness score:** ${report.readinessScore}/100`);
    lines.push("");
    lines.push(`### Recommendation`);
    lines.push(report.recommendation);
    lines.push("");
    lines.push(`## Gap analysis (source vs target)`);
    lines.push(`| Metric | Source | Target | Gap |`);
    lines.push(`|---|---|---|---|`);
    gapRows.forEach(r => {
      lines.push(`| ${r.label} | ${r.src ?? "—"} | ${r.tgt ?? "—"} | ${gapLabel(r.gap)} |`);
    });
    lines.push("");
    if (report.sourceSkus?.length || report.targetSkus?.length) {
      lines.push(`## License / SKU comparison`);
      lines.push(`| Tenant | SKU | Consumed | Enabled |`);
      lines.push(`|---|---|---|---|`);
      (report.sourceSkus || []).forEach(s => lines.push(`| Source | ${s.sku} | ${s.consumed} | ${s.enabled} |`));
      (report.targetSkus || []).forEach(s => lines.push(`| Target | ${s.sku} | ${s.consumed} | ${s.enabled} |`));
      lines.push("");
    }
    lines.push(`## Findings`);
    sorted.forEach(f => {
      lines.push(`### [${SEVERITY[f.severity].label}] ${f.area}`);
      lines.push(`- ${f.detail}`);
      lines.push(`- **Recommendation:** ${f.recommendation}`);
      lines.push("");
    });
    if (report.warnings?.length) {
      lines.push(`## Inventory warnings`);
      report.warnings.forEach(w => lines.push(`- ${w}`));
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GapReport_${report.sourceTenant}_to_${report.targetTenant}.md`.replace(/\s+/g, "_");
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
            <Download className="h-3.5 w-3.5" /> Gap report (.md)
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

      {/* Gap analysis table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-slate-400" />
          <h4 className="font-semibold text-slate-700">Gap analysis — source vs target</h4>
        </div>
        <div className="grid grid-cols-4 px-5 py-2 bg-slate-50/50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
          <div>Metric</div>
          <div className="text-center">Source</div>
          <div className="text-center">Target</div>
          <div className="text-right pr-2">Gap</div>
        </div>
        {gapRows.map((r, i) => (
          <div key={r.label} className={`grid grid-cols-4 px-5 py-2.5 items-center text-sm ${i % 2 ? "bg-slate-50/40" : ""}`}>
            <div className="text-slate-700 font-medium">{r.label}</div>
            <div className="text-center text-slate-800 font-semibold">{r.src ?? "—"}</div>
            <div className="text-center text-slate-800 font-semibold">{r.tgt ?? "—"}</div>
            <div className={`text-right pr-2 ${gapTone(r.gap)}`}>
              {r.gap === null || r.gap === undefined ? <MinusCircle className="h-3.5 w-3.5 inline text-slate-300" /> : gapLabel(r.gap)}
            </div>
          </div>
        ))}
      </div>

      {/* SKU comparison */}
      {(report.sourceSkus?.length > 0 || report.targetSkus?.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-slate-400" />
            <h4 className="font-semibold text-slate-700">License / SKU comparison</h4>
          </div>
          <div className="grid grid-cols-4 px-5 py-2 bg-slate-50/50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            <div>Tenant</div><div>SKU</div><div className="text-center">Consumed</div><div className="text-center">Enabled</div>
          </div>
          {(report.sourceSkus || []).map((s, i) => (
            <div key={`s${i}`} className="grid grid-cols-4 px-5 py-2 items-center text-sm">
              <div className="text-blue-600 font-medium">Source</div>
              <div className="text-slate-700 font-mono text-xs">{s.sku}</div>
              <div className="text-center text-slate-700">{s.consumed}</div>
              <div className="text-center text-slate-700">{s.enabled}</div>
            </div>
          ))}
          {(report.targetSkus || []).map((s, i) => (
            <div key={`t${i}`} className="grid grid-cols-4 px-5 py-2 items-center text-sm bg-slate-50/40">
              <div className="text-emerald-600 font-medium">Target</div>
              <div className="text-slate-700 font-mono text-xs">{s.sku}</div>
              <div className="text-center text-slate-700">{s.consumed}</div>
              <div className="text-center text-slate-700">{s.enabled}</div>
            </div>
          ))}
        </div>
      )}

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

      {report.warnings?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          <span className="font-semibold">Inventory warnings ({report.warnings.length}):</span> {report.warnings.join("; ")}
        </div>
      )}
    </div>
  );
}