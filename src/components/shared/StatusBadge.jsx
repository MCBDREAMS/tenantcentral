import React from "react";
import { Badge } from "@/components/ui/badge";

const presets = {
  connected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  disconnected: "bg-red-50 text-red-700 border-red-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  enabled: "bg-emerald-50 text-emerald-700 border-emerald-200",
  disabled: "bg-slate-100 text-slate-600 border-slate-200",
  report_only: "bg-blue-50 text-blue-700 border-blue-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-slate-100 text-slate-600 border-slate-200",
  draft: "bg-amber-50 text-amber-700 border-amber-200",
  deployed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  not_deployed: "bg-slate-100 text-slate-600 border-slate-200",
  conflict: "bg-red-50 text-red-700 border-red-200",
  compliant: "bg-emerald-50 text-emerald-700 border-emerald-200",
  non_compliant: "bg-red-50 text-red-700 border-red-200",
  in_grace_period: "bg-amber-50 text-amber-700 border-amber-200",
  not_evaluated: "bg-slate-100 text-slate-600 border-slate-200",
  enforced: "bg-violet-50 text-violet-700 border-violet-200",
  member: "bg-blue-50 text-blue-700 border-blue-200",
  guest: "bg-slate-100 text-slate-600 border-slate-200",
  corporate: "bg-blue-50 text-blue-700 border-blue-200",
  personal: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function StatusBadge({ status }) {
  if (!status) return null;
  const className = presets[status] || "bg-slate-100 text-slate-600 border-slate-200";
  const label = String(status).replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

  return (
    <Badge variant="outline" className={`${className} border text-xs font-medium`}>
      {label}
    </Badge>
  );
}