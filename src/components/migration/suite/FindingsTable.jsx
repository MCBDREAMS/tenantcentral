import React from "react";
import { Badge } from "@/components/ui/badge";

const SEVERITY = {
  critical: { label: "Blocking", className: "bg-rose-50 text-rose-700 border-rose-200" },
  warning: { label: "Warning", className: "bg-amber-50 text-amber-800 border-amber-200" },
  info: { label: "Info", className: "bg-slate-100 text-slate-700 border-slate-200" },
};

function prettyCode(code) {
  return String(code || "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function FindingsTable({ findings = [], emptyText = "No findings for this scan." }) {
  if (findings.length === 0) {
    return <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/60">
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Severity</th>
            <th className="px-3 py-2 font-semibold">Finding</th>
            <th className="px-3 py-2 font-semibold">Item</th>
            <th className="px-3 py-2 font-semibold">Detail</th>
            <th className="px-3 py-2 font-semibold">Recommended action</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding, index) => {
            const meta = SEVERITY[finding.severity] || SEVERITY.info;
            return (
              <tr key={`${finding.code}-${index}`} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  <Badge variant="outline" className={meta.className}>
                    {meta.label}
                  </Badge>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-foreground">
                  {prettyCode(finding.code)}
                </td>
                <td className="px-3 py-2 font-mono text-[11.5px] text-muted-foreground">{finding.item}</td>
                <td className="px-3 py-2 text-xs text-foreground">{finding.detail}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{finding.recommendation}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}