import React from "react";

export default function SummaryBar({ summary }) {
  if (!summary) return null;
  const items = [
    { label: "Critical", count: summary.critical, color: "bg-red-500", text: "text-red-600" },
    { label: "High", count: summary.high, color: "bg-orange-500", text: "text-orange-600" },
    { label: "Medium", count: summary.medium, color: "bg-amber-500", text: "text-amber-600" },
    { label: "Passed", count: summary.passed, color: "bg-emerald-500", text: "text-emerald-600" },
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <div className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
          <span className={`text-lg font-bold ${item.text}`}>{item.count}</span>
          <span className="text-xs text-slate-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}