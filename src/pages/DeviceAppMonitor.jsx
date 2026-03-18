import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Activity, Search, RefreshCw, Loader2, Monitor, ChevronRight } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import DevicePerformancePanel from "@/components/intune/DevicePerformancePanel";

function fmt(v) {
  if (!v) return "—";
  try { return format(new Date(v), "PP"); } catch { return v; }
}

function ComplianceBadge({ state }) {
  const map = {
    compliant: "bg-emerald-100 text-emerald-700",
    noncompliant: "bg-red-100 text-red-700",
    error: "bg-red-100 text-red-700",
    inGracePeriod: "bg-amber-100 text-amber-700",
    unknown: "bg-slate-100 text-slate-500",
  };
  return <Badge className={`${map[state] || "bg-slate-100 text-slate-500"} text-xs`}>{state || "Unknown"}</Badge>;
}

export default function DeviceAppMonitor({ selectedTenant }) {
  const [search, setSearch] = useState("");
  const [selectedDevice, setSelectedDevice] = useState(null);
  const azureTenantId = selectedTenant?.tenant_id;

  const { data: graphResult, isLoading, refetch } = useQuery({
    queryKey: ["graph-intune-devices-monitor", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "list_intune_devices",
        azure_tenant_id: azureTenantId,
        top: 100,
      }).then(r => r.data),
  });

  const devices = (graphResult?.devices || []).filter(d =>
    !search ||
    d.deviceName?.toLowerCase().includes(search.toLowerCase()) ||
    d.userPrincipalName?.toLowerCase().includes(search.toLowerCase()) ||
    d.model?.toLowerCase().includes(search.toLowerCase())
  );

  if (!azureTenantId) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <PageHeader title="App Monitor & Performance" subtitle="Application monitoring and system health" icon={Activity} />
        <div className="flex items-center justify-center py-24 text-slate-400">
          <div className="text-center">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Select a tenant to view device app monitoring</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="App Monitor & Performance"
        subtitle={selectedTenant ? `${selectedTenant.name} — App usage and system performance` : "Device monitoring"}
        icon={Activity}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Device List */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search devices..."
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading devices…
              </div>
            ) : devices.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">No devices found</div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[calc(100vh-280px)] overflow-y-auto">
                {devices.map(d => {
                  const isSelected = selectedDevice?.id === d.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDevice(d)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${isSelected ? "bg-blue-50 border-l-2 border-blue-500" : ""}`}
                    >
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? "bg-blue-100" : "bg-slate-100"}`}>
                        <Monitor className={`h-4 w-4 ${isSelected ? "text-blue-600" : "text-slate-400"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{d.deviceName}</p>
                        <p className="text-xs text-slate-400 truncate">{d.userPrincipalName || d.operatingSystem}</p>
                        <ComplianceBadge state={d.complianceState} />
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${isSelected ? "text-blue-400" : "text-slate-300"}`} />
                    </button>
                  );
                })}
              </div>
            )}

            <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">
              {devices.length} devices
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-2">
          {!selectedDevice ? (
            <div className="bg-white border border-slate-200 rounded-xl flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center text-slate-400">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Select a device to view app monitoring and performance</p>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Monitor className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{selectedDevice.deviceName}</p>
                  <p className="text-xs text-slate-400">
                    {selectedDevice.manufacturer} {selectedDevice.model} · {selectedDevice.operatingSystem} {selectedDevice.osVersion} · Last sync: {fmt(selectedDevice.lastSyncDateTime)}
                  </p>
                </div>
                <ComplianceBadge state={selectedDevice.complianceState} />
              </div>
              <DevicePerformancePanel device={selectedDevice} azureTenantId={azureTenantId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}