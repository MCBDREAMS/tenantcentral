import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Shield, RefreshCw, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/shared/PageHeader";

const SEVERITY_COLORS = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-blue-100 text-blue-700",
  informational: "bg-slate-100 text-slate-600",
};

const STATUS_COLORS = {
  active: "bg-red-50 text-red-700",
  resolved: "bg-emerald-50 text-emerald-700",
  inProgress: "bg-amber-50 text-amber-700",
  new: "bg-blue-50 text-blue-700",
};

export default function PortalDefender({ selectedTenant }) {
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState(null);
  const queryClient = useQueryClient();

  const tenantId = selectedTenant?.tenant_id;

  const { data: alerts = [], isLoading, error, refetch } = useQuery({
    queryKey: ["defender_alerts", tenantId, severity, status],
    enabled: !!tenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "list_alerts", azure_tenant_id: tenantId, severity, status, top: 100 })
        .then(r => r.data.alerts || []),
  });

  const updateMutation = useMutation({
    mutationFn: ({ alert_id, newStatus }) =>
      base44.functions.invoke("portalData", { action: "update_alert", azure_tenant_id: tenantId, alert_id, status: newStatus }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["defender_alerts", tenantId] }),
  });

  if (!tenantId) return (
    <div className="p-6">
      <PageHeader title="Defender" subtitle="Security alerts & incidents" icon={Shield} />
      <div className="text-sm text-slate-500 mt-4">Select a tenant to continue.</div>
    </div>
  );

  const stats = {
    high: alerts.filter(a => a.severity === "high").length,
    medium: alerts.filter(a => a.severity === "medium").length,
    active: alerts.filter(a => a.status === "active" || a.status === "new").length,
    resolved: alerts.filter(a => a.status === "resolved").length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Microsoft Defender"
        subtitle={`Security alerts for ${selectedTenant?.name}`}
        icon={Shield}
        actions={
          <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "High Severity", value: stats.high, color: "text-red-600", bg: "bg-red-50" },
          { label: "Medium", value: stats.medium, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Active", value: stats.active, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Resolved", value: stats.resolved, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl px-4 py-3`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="informational">Informational</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inProgress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <div className="text-sm text-red-500 mb-4">{error.message}</div>}

      <div className="flex gap-6">
        {/* Alert list */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Alert</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Severity</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" /></td></tr>
                  ))
                  : alerts.map(a => (
                    <tr key={a.id} onClick={() => setSelected(a)} className={`cursor-pointer hover:bg-blue-50/40 transition-colors ${selected?.id === a.id ? "bg-blue-50" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 line-clamp-1">{a.title}</div>
                        {a.providerAlertId && <div className="text-xs text-slate-400 mt-0.5">{a.providerAlertId}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`border-0 text-[10px] ${SEVERITY_COLORS[a.severity] || "bg-slate-100 text-slate-600"}`}>{a.severity}</Badge>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge className={`border-0 text-[10px] ${STATUS_COLORS[a.status] || "bg-slate-100 text-slate-600"}`}>{a.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">
                        {a.createdDateTime ? new Date(a.createdDateTime).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!isLoading && alerts.length === 0 && (
              <div className="text-center py-12 text-sm text-slate-400 flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-300" />
                No alerts match the current filters
              </div>
            )}
          </div>
          {!isLoading && <div className="mt-2 text-xs text-slate-400">{alerts.length} alert(s)</div>}
        </div>

        {/* Detail */}
        {selected && (
          <div className="w-72 shrink-0 space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start gap-2 mb-4">
                <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${selected.severity === "high" ? "text-red-500" : selected.severity === "medium" ? "text-amber-500" : "text-blue-500"}`} />
                <p className="text-sm font-semibold text-slate-800 leading-tight">{selected.title}</p>
              </div>
              <dl className="space-y-3 text-xs">
                <div>
                  <dt className="text-slate-400 uppercase tracking-wide text-[10px] font-medium">Description</dt>
                  <dd className="text-slate-600 mt-0.5 leading-relaxed line-clamp-4">{selected.description || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 uppercase tracking-wide text-[10px] font-medium">Category</dt>
                  <dd className="text-slate-700 mt-0.5">{selected.category || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 uppercase tracking-wide text-[10px] font-medium">Detection Source</dt>
                  <dd className="text-slate-700 mt-0.5">{selected.detectionSource || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 uppercase tracking-wide text-[10px] font-medium">Service Source</dt>
                  <dd className="text-slate-700 mt-0.5">{selected.serviceSource || "—"}</dd>
                </div>
              </dl>
              {/* Update status */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-2">Update Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {["new", "active", "inProgress", "resolved"].map(s => (
                    <button
                      key={s}
                      onClick={() => updateMutation.mutate({ alert_id: selected.id, newStatus: s })}
                      disabled={updateMutation.isPending}
                      className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${selected.status === s ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}