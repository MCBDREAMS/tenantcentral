import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, RefreshCw, Package, ArrowUp, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const severityColor = {
  Critical: "bg-red-100 text-red-700",
  Important: "bg-amber-100 text-amber-700",
  Moderate: "bg-blue-100 text-blue-700",
};

export default function FeatureQualityUpdates({ selectedTenant }) {
  // Fetch real devices for this tenant from local DB
  const { data: devices = [], isLoading: loadingDevices, refetch: refetchDevices } = useQuery({
    queryKey: ["intune_devices_fq", selectedTenant?.id],
    enabled: !!selectedTenant?.id,
    queryFn: () => base44.entities.IntuneDevice.filter({ tenant_id: selectedTenant.id }),
  });

  // Fetch live update data from Graph
  const { data: graphData, isLoading: loadingGraph, refetch: refetchGraph } = useQuery({
    queryKey: ["feature_quality_updates", selectedTenant?.tenant_id],
    enabled: !!selectedTenant?.tenant_id,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_feature_quality_updates",
        azure_tenant_id: selectedTenant?.tenant_id,
      }).then(r => r.data),
  });

  const isLoading = loadingDevices || loadingGraph;
  const handleRefresh = () => { refetchDevices(); refetchGraph(); };

  // Derive OS distribution from real local device data
  const total = devices.length;
  const osCounts = devices.reduce((acc, d) => {
    const os = d.os || "Unknown";
    acc[os] = (acc[os] || 0) + 1;
    return acc;
  }, {});

  const featureUpdates = graphData?.featureUpdates ||
    Object.entries(osCounts).map(([name, count]) => ({ name, devices: count, total }));

  const qualityUpdates = graphData?.qualityUpdates || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Feature &amp; Quality Updates</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {selectedTenant?.name} — {total} device{total !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRefresh} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="text-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400 mx-auto mb-3" />
        </div>
      )}

      {!isLoading && total === 0 && (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
          No devices found for {selectedTenant?.name}.
        </div>
      )}

      {!isLoading && total > 0 && (
        <>
          {/* OS Version Distribution */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <ArrowUp className="h-4 w-4 text-slate-500" />
              <p className="text-sm font-semibold text-slate-700">OS Version Distribution</p>
            </div>
            <div className="p-4 space-y-4">
              {featureUpdates.map((fu, i) => {
                const pct = fu.total ? Math.round((fu.devices / fu.total) * 100) : 0;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm font-medium text-slate-800">{fu.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{fu.devices} / {fu.total} devices</span>
                        <span className="text-xs font-semibold text-slate-700">{pct}%</span>
                      </div>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quality Updates */}
          {qualityUpdates.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-500" />
                <p className="text-sm font-semibold text-slate-700">Quality Update Deployment</p>
              </div>
              <div className="divide-y divide-slate-100">
                {qualityUpdates.map((qu, i) => {
                  const pct = qu.total ? Math.round((qu.installed / qu.total) * 100) : 0;
                  return (
                    <div key={i} className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-slate-800">{qu.name}</p>
                            <Badge className={`${severityColor[qu.severity] || "bg-slate-100 text-slate-500"} border-0 text-xs`}>
                              {qu.severity}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-400 font-mono">{qu.kb}</p>
                        </div>
                        <span className="text-xs text-slate-500 shrink-0 ml-4">{qu.installed} / {qu.total}</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {qualityUpdates.length === 0 && (
            <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
              No quality update data available from Graph API for this tenant.
            </div>
          )}
        </>
      )}
    </div>
  );
}