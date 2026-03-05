import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Server, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";

const STATUS_CONFIG = {
  serviceOperational: { label: "Operational", color: "bg-emerald-50 text-emerald-700", icon: CheckCircle2, iconColor: "text-emerald-500" },
  investigating: { label: "Investigating", color: "bg-amber-50 text-amber-700", icon: AlertTriangle, iconColor: "text-amber-500" },
  restoringService: { label: "Restoring", color: "bg-amber-50 text-amber-700", icon: AlertTriangle, iconColor: "text-amber-500" },
  serviceRestored: { label: "Restored", color: "bg-blue-50 text-blue-700", icon: CheckCircle2, iconColor: "text-blue-500" },
  serviceInterruption: { label: "Interrupted", color: "bg-red-50 text-red-700", icon: XCircle, iconColor: "text-red-500" },
  extendedRecovery: { label: "Extended Recovery", color: "bg-orange-50 text-orange-700", icon: AlertTriangle, iconColor: "text-orange-500" },
  falsePositive: { label: "False Positive", color: "bg-slate-50 text-slate-600", icon: CheckCircle2, iconColor: "text-slate-400" },
};

export default function PortalServiceHealth({ selectedTenant }) {
  const tenantId = selectedTenant?.tenant_id;

  const { data: services = [], isLoading, error, refetch } = useQuery({
    queryKey: ["service_health", tenantId],
    enabled: !!tenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "service_health", azure_tenant_id: tenantId })
        .then(r => r.data.services || []),
  });

  if (!tenantId) return (
    <div className="p-6">
      <PageHeader title="Service Health" subtitle="Microsoft 365 service status" icon={Server} />
      <div className="text-sm text-slate-500 mt-4">Select a tenant to continue.</div>
    </div>
  );

  const operational = services.filter(s => s.status === "serviceOperational").length;
  const issues = services.filter(s => s.status !== "serviceOperational").length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Service Health"
        subtitle={`Microsoft 365 service status for ${selectedTenant?.name}`}
        icon={Server}
        actions={
          <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="flex gap-4 mb-6">
        <div className="bg-emerald-50 rounded-xl px-5 py-3">
          <div className="text-2xl font-bold text-emerald-600">{operational}</div>
          <div className="text-xs text-slate-500">Operational</div>
        </div>
        <div className="bg-amber-50 rounded-xl px-5 py-3">
          <div className="text-2xl font-bold text-amber-600">{issues}</div>
          <div className="text-xs text-slate-500">With Issues</div>
        </div>
        <div className="bg-slate-50 rounded-xl px-5 py-3">
          <div className="text-2xl font-bold text-slate-600">{services.length}</div>
          <div className="text-xs text-slate-500">Total Services</div>
        </div>
      </div>

      {error && <div className="text-sm text-red-500 mb-4">{error.message}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-slate-100 rounded w-2/3 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/3" />
            </div>
          ))
          : services.map(s => {
            const cfg = STATUS_CONFIG[s.status] || { label: s.status, color: "bg-slate-50 text-slate-600", icon: CheckCircle2, iconColor: "text-slate-400" };
            const Icon = cfg.icon;
            const hasIssues = s.issues?.length > 0;
            return (
              <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`h-4 w-4 shrink-0 ${cfg.iconColor}`} />
                    <p className="text-sm font-semibold text-slate-800 truncate">{s.service}</p>
                  </div>
                  <Badge className={`border-0 text-[10px] shrink-0 ${cfg.color}`}>{cfg.label}</Badge>
                </div>
                {hasIssues && (
                  <div className="mt-3 space-y-1">
                    {s.issues.slice(0, 2).map(issue => (
                      <div key={issue.id} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 leading-snug">
                        {issue.impactDescription || issue.title || "Active issue"}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}