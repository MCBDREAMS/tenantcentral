import React from "react";
import { Users, Mail, UsersRound, FileStack, BadgeCheck } from "lucide-react";

// Side-by-side source vs target inventory comparison.
export default function InventoryCompare({ source, target }) {
  const rows = [
    { label: "Users", icon: Users, src: source?.users?.total, tgt: target?.users?.total },
    { label: "Mailboxes", icon: Mail, src: source?.exchange?.mailboxes?.length, tgt: target?.exchange?.mailboxes?.length },
    { label: "Teams", icon: UsersRound, src: source?.teams?.teamCount, tgt: target?.teams?.teamCount },
    { label: "SharePoint sites", icon: FileStack, src: source?.sharepoint?.siteCount, tgt: target?.sharepoint?.siteCount },
    { label: "Subscribed SKUs", icon: BadgeCheck, src: source?.subscribedSkus?.length, tgt: target?.subscribedSkus?.length },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="grid grid-cols-3 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
        <div>Workload</div>
        <div className="text-center">Source</div>
        <div className="text-center">Target</div>
      </div>
      {rows.map((r, i) => (
        <div key={r.label} className={`grid grid-cols-3 px-5 py-3 items-center text-sm ${i % 2 ? "bg-slate-50/50" : ""}`}>
          <div className="flex items-center gap-2 text-slate-700 font-medium">
            <r.icon className="h-4 w-4 text-slate-400" />
            {r.label}
          </div>
          <div className="text-center text-slate-800 font-semibold">{r.src ?? "—"}</div>
          <div className="text-center text-slate-800 font-semibold">{r.tgt ?? "—"}</div>
        </div>
      ))}
      {source?.warnings?.length > 0 && (
        <div className="px-5 py-2 border-t border-slate-200 text-xs text-amber-600">
          Some source sections could not be read ({source.warnings.length} warning{source.warnings.length > 1 ? "s" : ""}). The plan will note these gaps.
        </div>
      )}
    </div>
  );
}