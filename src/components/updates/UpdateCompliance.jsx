import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Monitor, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { exportToCSV } from "@/components/shared/exportUtils";

const severityColor = {
  Critical: "bg-red-100 text-red-700",
  Important: "bg-amber-100 text-amber-700",
  Moderate: "bg-blue-100 text-blue-700",
  Low: "bg-slate-100 text-slate-500",
};

export default function UpdateCompliance({ selectedTenant }) {
  const [filter, setFilter] = useState("all");

  // Fetch real devices for this tenant from local DB
  const { data: localDevices = [], isLoading: loadingLocal, refetch: refetchLocal } = useQuery({
    queryKey: ["intune_devices_compliance", selectedTenant?.id],
    enabled: !!selectedTenant?.id,
    queryFn: () => base44.entities.IntuneDevice.filter({ tenant_id: selectedTenant.id }),
  });

  // Fetch live compliance data from Graph
  const { data: graphData, isLoading: loadingGraph, refetch: refetchGraph } = useQuery({
    queryKey: ["update_compliance_report", selectedTenant?.tenant_id],
    enabled: !!selectedTenant?.tenant_id,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_update_compliance_report",
        azure_tenant_id: selectedTenant?.tenant_id,
      }).then(r => r.data),
  });

  const isLoading = loadingLocal || loadingGraph;
  const handleRefresh = () => { refetchLocal(); refetchGraph(); };

  // Use graph data if available, otherwise derive from local devices
  const devices = graphData?.devices || localDevices.map(d => ({
    name: d.device_name,
    user: d.primary_user || "—",
    os: d.os || "Unknown",
    last_scan: d.last_check_in || d.updated_date,
    missing_updates: 0,
    status: d.compliance_state === "compliant" ? "compliant" : d.compliance_state === "non_compliant" ? "noncompliant" : "unknown",
  }));

  const missingUpdates = graphData?.missingUpdates || [];

  const filtered = filter === "all" ? devices : devices.filter(d => d.status === filter);
  const compliant = devices.filter(d => d.status === "compliant").length;
  const nonCompliant = devices.filter(d => d.status === "noncompliant").length;
  const pct = devices.length ? Math.round((compliant / devices.length) * 100) : 0;

  const handleExport = () => {
    exportToCSV(devices.map(d => ({
      "Device": d.name,
      "User": d.user,
      "OS": d.os,
      "Last Scan": d.last_scan,
      "Missing Updates": d.missing_updates,
      "Status": d.status,
    })), `update_compliance_${selectedTenant?.name || "report"}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Update Compliance Report</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {selectedTenant?.name} — {devices.length} device{devices.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={devices.length === 0}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading device compliance data…</p>
        </div>
      )}

      {!isLoading && devices.length === 0 && (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
          No devices found for {selectedTenant?.name}. Sync devices from Intune first.
        </div>
      )}

      {!isLoading && devices.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700">{compliant}</p>
              <p className="text-xs text-emerald-600 mt-1">Compliant Devices</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{nonCompliant}</p>
              <p className="text-xs text-red-600 mt-1">Non-Compliant</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{pct}%</p>
              <p className="text-xs text-slate-500 mt-1">Compliance Rate</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-600">Overall Update Compliance</p>
              <span className="text-sm font-bold text-slate-800">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>

          {/* Missing Updates */}
          {missingUpdates.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-amber-50">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Missing Critical/Important Updates
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {missingUpdates.map((mu, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Badge className={`${severityColor[mu.severity]} border-0 text-xs`}>{mu.severity}</Badge>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{mu.title}</p>
                        <p className="text-xs text-slate-400 font-mono">{mu.kb}</p>
                      </div>
                    </div>
                    <Badge className="bg-red-50 text-red-700 border-0 text-xs">
                      {mu.devices_missing} device{mu.devices_missing !== 1 ? "s" : ""} missing
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Device Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-700">Devices ({filtered.length})</p>
              <div className="flex gap-1">
                {["all", "compliant", "noncompliant"].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filter === f ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                  >
                    {f === "all" ? "All" : f === "compliant" ? "Compliant" : "Non-Compliant"}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
              {filtered.map((d, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <Monitor className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{d.name}</p>
                      <p className="text-xs text-slate-400 truncate">{d.user} · {d.os}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {d.missing_updates > 0 && (
                      <Badge className="bg-amber-50 text-amber-700 border-0 text-xs">
                        {d.missing_updates} missing
                      </Badge>
                    )}
                    <Badge className={d.status === "compliant" ? "bg-emerald-100 text-emerald-700 border-0 text-xs" : "bg-red-100 text-red-700 border-0 text-xs"}>
                      {d.status === "compliant" ? <CheckCircle2 className="h-3 w-3 mr-1 inline" /> : <XCircle className="h-3 w-3 mr-1 inline" />}
                      {d.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}