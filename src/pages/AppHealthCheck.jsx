import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2,
  Database, Shield, Zap, Clock, Server, Users, ClipboardList
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG = {
  ok:      { color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2, label: "OK" },
  warn:    { color: "text-amber-600",   bg: "bg-amber-50 border-amber-200",     icon: AlertTriangle, label: "Warning" },
  error:   { color: "text-red-600",     bg: "bg-red-50 border-red-200",         icon: XCircle,       label: "Error" },
};

const OVERALL_CONFIG = {
  healthy:  { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-300", label: "All Systems Healthy", icon: CheckCircle2 },
  warning:  { color: "text-amber-700",   bg: "bg-amber-50 border-amber-300",     label: "Warning — Check Items", icon: AlertTriangle },
  degraded: { color: "text-red-700",     bg: "bg-red-50 border-red-300",         label: "Degraded — Action Required", icon: XCircle },
};

function CheckRow({ check }) {
  const cfg = STATUS_CONFIG[check.status] || STATUS_CONFIG.ok;
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center justify-between p-4 rounded-xl border ${cfg.bg}`}>
      <div className="flex items-center gap-3">
        <Icon className={`h-5 w-5 ${cfg.color}`} />
        <div>
          <p className="text-sm font-semibold text-slate-800">{check.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{check.value}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {check.ms && <span className="text-xs text-slate-400">{check.ms}ms</span>}
        <Badge className={`text-xs ${
          check.status === "ok"   ? "bg-emerald-100 text-emerald-700" :
          check.status === "warn" ? "bg-amber-100 text-amber-700" :
                                    "bg-red-100 text-red-700"
        }`}>{cfg.label}</Badge>
      </div>
    </div>
  );
}

export default function AppHealthCheck() {
  const [lastRun, setLastRun] = useState(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["app-health"],
    queryFn: async () => {
      const res = await base44.functions.invoke("windowsUpgradeEngine", { action: "app_health_check" });
      setLastRun(new Date().toLocaleTimeString());
      return res.data;
    },
    enabled: false,
    staleTime: Infinity,
  });

  const { data: entityStats } = useQuery({
    queryKey: ["health-entity-stats"],
    queryFn: async () => {
      const [tenants, devices, workflows, approvals, auditLogs, users] = await Promise.all([
        base44.entities.Tenant.list(),
        base44.entities.IntuneDevice.list(),
        base44.entities.WorkflowRule.list(),
        base44.entities.ApprovalRequest.filter({ status: "pending" }),
        base44.entities.AuditLog.list("-created_date", 5),
        base44.entities.EntraUser.list(),
      ]);
      return { tenants, devices, workflows, approvals, auditLogs, users };
    },
  });

  const overall = data?.overallStatus;
  const overallCfg = overall ? OVERALL_CONFIG[overall] : null;
  const OverallIcon = overallCfg?.icon || Activity;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Application Health Check"
        subtitle="System status, connectivity, and database integrity"
        icon={Activity}
        actions={
          <Button
            onClick={() => refetch()}
            disabled={isFetching}
            className="bg-slate-900 hover:bg-slate-800 gap-2"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Run Health Check
          </Button>
        }
      />

      {/* Overall Status Banner */}
      {overallCfg && (
        <div className={`flex items-center gap-4 p-5 rounded-2xl border-2 ${overallCfg.bg}`}>
          <OverallIcon className={`h-8 w-8 ${overallCfg.color}`} />
          <div>
            <p className={`text-lg font-bold ${overallCfg.color}`}>{overallCfg.label}</p>
            {lastRun && <p className="text-xs text-slate-500 mt-0.5">Last checked at {lastRun} · {data?.totalMs}ms total</p>}
          </div>
        </div>
      )}

      {!data && !isLoading && (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl">
          <Activity className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Click "Run Health Check" to test all system components</p>
        </div>
      )}

      {isFetching && (
        <div className="text-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Running diagnostics…</p>
        </div>
      )}

      {data?.checks && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-3">Service Checks</h3>
          <div className="space-y-2">
            {data.checks.map((check, i) => <CheckRow key={i} check={check} />)}
          </div>
        </div>
      )}

      {/* Live Entity Stats (always visible) */}
      {entityStats && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-3">Live Database Snapshot</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: "Tenants", value: entityStats.tenants.length, icon: Server, color: "bg-blue-50 text-blue-600" },
              { label: "Managed Devices", value: entityStats.devices.length, icon: Database, color: "bg-violet-50 text-violet-600" },
              { label: "Workflow Rules", value: entityStats.workflows.length, icon: Zap, color: "bg-amber-50 text-amber-600" },
              { label: "Pending Approvals", value: entityStats.approvals.length, icon: Shield, color: entityStats.approvals.length > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600" },
              { label: "Entra Users (synced)", value: entityStats.users.length, icon: Users, color: "bg-cyan-50 text-cyan-600" },
              { label: "Recent Audit Entries", value: entityStats.auditLogs.length, icon: ClipboardList, color: "bg-slate-50 text-slate-600" },
            ].map(stat => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                    <p className="text-xs text-slate-500">{stat.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timestamp */}
      {data?.timestamp && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Clock className="h-3 w-3" />
          <span>Check completed at {new Date(data.timestamp).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}