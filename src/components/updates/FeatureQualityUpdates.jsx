import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, RefreshCw, Package, ArrowUp, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const MOCK_FEATURE = [
  { name: "Windows 11 24H2", version: "24H2", devices: 45, total: 200, type: "feature" },
  { name: "Windows 11 23H2", version: "23H2", devices: 110, total: 200, type: "feature" },
  { name: "Windows 10 22H2", version: "22H2", devices: 45, total: 200, type: "feature" },
];

const MOCK_QUALITY = [
  { name: "2025-04 Cumulative Update for Windows 11", kb: "KB5034441", installed: 145, total: 155, severity: "Critical" },
  { name: "2025-03 Cumulative Update for Windows 10", kb: "KB5035536", installed: 38, total: 45, severity: "Important" },
  { name: "2025-04 .NET Framework Update", kb: "KB5034765", installed: 190, total: 200, severity: "Important" },
];

const severityColor = {
  Critical: "bg-red-100 text-red-700",
  Important: "bg-amber-100 text-amber-700",
  Moderate: "bg-blue-100 text-blue-700",
};

export default function FeatureQualityUpdates({ selectedTenant }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["feature_quality_updates", selectedTenant?.tenant_id],
    enabled: !!selectedTenant?.tenant_id,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_feature_quality_updates",
        azure_tenant_id: selectedTenant?.tenant_id,
      }).then(r => r.data),
  });

  const featureUpdates = data?.featureUpdates || MOCK_FEATURE;
  const qualityUpdates = data?.qualityUpdates || MOCK_QUALITY;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Feature &amp; Quality Updates</p>
          <p className="text-xs text-slate-400 mt-0.5">OS version distribution and patch deployment status</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="text-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400 mx-auto mb-3" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* Feature Updates */}
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
        </>
      )}
    </div>
  );
}