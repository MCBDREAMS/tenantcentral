import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Building2, Activity, ShieldCheck, AlertTriangle, Clock,
  MonitorSmartphone, Terminal, Wifi, WifiOff, ChevronRight, CircleDot,
} from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import { Progress } from "@/components/ui/progress";

const timeAgo = (iso) => {
  if (!iso) return "never";
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export default function TenantHealthCard({ tenant, health, onOpen }) {
  const level = health.level;
  const levelStyles = {
    healthy: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    critical: "bg-red-50 text-red-700 border-red-200",
    unknown: "bg-slate-50 text-slate-500 border-slate-200",
  };
  const levelIcon = {
    healthy: <ShieldCheck className="h-3.5 w-3.5" />,
    warning: <AlertTriangle className="h-3.5 w-3.5" />,
    critical: <AlertTriangle className="h-3.5 w-3.5" />,
    unknown: <CircleDot className="h-3.5 w-3.5" />,
  };

  const total = health.totalDevices;
  const compliant = health.compliantDevices;
  const nonCompliant = health.nonCompliantDevices;
  const stale = health.staleDevices;
  const pct = health.compliancePct;
  const pendingScripts = health.pendingScripts;
  const runningScripts = health.runningScripts;
  const posture = health.postureScore;

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
      onClick={() => onOpen?.(tenant)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-slate-500" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate">{tenant.name}</p>
            <p className="text-xs text-slate-400 truncate">{tenant.domain}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={tenant.status} />
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${levelStyles[level]}`}>
            {levelIcon[level]}
            {level}
          </span>
        </div>
      </div>

      {/* Compliance */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <MonitorSmartphone className="h-3.5 w-3.5" /> Compliance
          </span>
          <span className="text-sm font-bold text-slate-800">{total > 0 ? `${pct}%` : "—"}</span>
        </div>
        <Progress value={pct} className="h-1.5 mb-1.5" />
        <div className="flex justify-between text-[11px] text-slate-500">
          <span className="text-emerald-600">{compliant} compliant</span>
          <span className="text-red-500">{nonCompliant} non-compliant</span>
        </div>
      </div>

      {/* Sync + Posture */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 rounded-lg px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1">
            {health.syncStale ? <WifiOff className="h-3 w-3 text-red-500" /> : <Wifi className="h-3 w-3 text-emerald-500" />} Last Sync
          </p>
          <p className={`text-xs font-semibold ${health.syncStale ? "text-red-600" : "text-slate-700"}`}>{timeAgo(health.lastSync)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Posture
          </p>
          <p className="text-xs font-semibold text-slate-700">{posture !== null ? `${posture}/100` : "—"}</p>
        </div>
      </div>

      {/* Stale devices */}
      {stale > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span><strong>{stale}</strong> stale device(s) — no check-in {">"} 8h</span>
        </div>
      )}

      {/* Script deployments */}
      <Link
        to={createPageUrl("DeviceScripts")}
        onClick={(e) => e.stopPropagation()}
        className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-colors ${
          pendingScripts + runningScripts > 0
            ? "bg-blue-50 border-blue-200 hover:bg-blue-100"
            : "bg-slate-50 border-slate-200 hover:bg-slate-100"
        }`}
      >
        <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <Terminal className="h-3.5 w-3.5" /> Script deployments
        </span>
        <span className="flex items-center gap-1.5 text-xs">
          {pendingScripts > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
              <Activity className="h-3 w-3" /> {pendingScripts} pending
            </span>
          )}
          {runningScripts > 0 && (
            <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
              <Activity className="h-3 w-3 animate-pulse" /> {runningScripts} running
            </span>
          )}
          {pendingScripts + runningScripts === 0 && <span className="text-slate-400">none pending</span>}
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        </span>
      </Link>
    </div>
  );
}