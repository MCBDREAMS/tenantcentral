import React from "react";

export default function StatCard({ label, value, icon: Icon, color = "blue", subtitle }) {
  const colors = {
    blue: "from-blue-500 to-blue-600 shadow-blue-200",
    emerald: "from-emerald-500 to-emerald-600 shadow-emerald-200",
    violet: "from-violet-500 to-violet-600 shadow-violet-200",
    amber: "from-amber-500 to-amber-600 shadow-amber-200",
    rose: "from-rose-500 to-rose-600 shadow-rose-200",
    cyan: "from-cyan-500 to-cyan-600 shadow-cyan-200",
    slate: "from-slate-500 to-slate-600 shadow-slate-200",
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${colors[color]} shadow-lg flex items-center justify-center`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}