import React, { useState } from "react";
import { ChevronDown, ChevronRight, Download, Terminal, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Renders the Microsoft-aligned phased migration plan with expandable tasks + PowerShell.
export default function MigrationPlan({ plan }) {
  const [open, setOpen] = useState({});

  const downloadMd = () => {
    const lines = [];
    lines.push(`# Tenant-to-Tenant Migration Plan`);
    lines.push(`**Source:** ${plan.sourceTenant}  •  **Target:** ${plan.targetTenant}`);
    lines.push(`**Workloads:** ${plan.workloads.join(", ")}  •  **Generated:** ${new Date(plan.generatedAt).toLocaleString()}`);
    lines.push("");
    if (plan.disclaimer) { lines.push(`> ${plan.disclaimer}`); lines.push(""); }
    if (plan.prerequisites?.length) {
      lines.push(`## Prerequisites`);
      plan.prerequisites.forEach(p => lines.push(`- ${p}`));
      lines.push("");
    }
    plan.phases.forEach(ph => {
      lines.push(`## ${ph.name}`);
      if (ph.description) lines.push(`\n${ph.description}`);
      if (ph.tasks?.length) {
        lines.push("");
        ph.tasks.forEach(t => lines.push(`- ${t}`));
      }
      if (ph.powershell) {
        lines.push("");
        lines.push("```powershell");
        lines.push(ph.powershell.trim());
        lines.push("```");
      }
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MigrationPlan_${plan.sourceTenant}_to_${plan.targetTenant}.md`.replace(/\s+/g, "_");
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <span className="font-semibold text-slate-800">Migration plan generated</span>
          <Badge className="bg-blue-100 text-blue-700 border-0">{plan.phases.length} phases</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={downloadMd} className="gap-2">
          <Download className="h-3.5 w-3.5" /> Download plan (.md)
        </Button>
      </div>

      {plan.prerequisites?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Prerequisites</p>
          <ul className="space-y-1">
            {plan.prerequisites.map((p, i) => (
              <li key={i} className="text-sm text-amber-800 flex gap-2"><span>•</span>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.phases.map((ph, idx) => {
        const isOpen = open[ph.id];
        return (
          <div key={ph.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpen(o => ({ ...o, [ph.id]: !o[ph.id] }))}
              className="flex items-center justify-between w-full px-5 py-3 hover:bg-slate-50 transition-colors text-left"
            >
              <span className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <span className="font-semibold text-slate-800 text-sm">{ph.name}</span>
              </span>
              <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">{ph.tasks?.length || 0} tasks</Badge>
            </button>
            {isOpen && (
              <div className="px-5 pb-4 border-t border-slate-100">
                {ph.description && <p className="text-sm text-slate-600 mt-3 mb-3">{ph.description}</p>}
                {ph.tasks?.length > 0 && (
                  <ul className="space-y-1.5 mb-3">
                    {ph.tasks.map((t, i) => <li key={i} className="text-sm text-slate-600 flex gap-2"><span className="text-slate-300">▸</span>{t}</li>)}
                  </ul>
                )}
                {ph.powershell && (
                  <div className="mt-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5">
                      <Terminal className="h-3.5 w-3.5" /> PowerShell (template — review before running)
                    </div>
                    <pre className="bg-slate-900 text-slate-100 text-xs rounded-lg p-3 overflow-auto font-mono">{ph.powershell.trim()}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {plan.disclaimer && (
        <p className="text-xs text-slate-400 italic">{plan.disclaimer}</p>
      )}
    </div>
  );
}