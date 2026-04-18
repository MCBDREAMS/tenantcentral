import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Users, Loader2, RefreshCw, Settings, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const MOCK_GROUPS = [
  { id: "1", name: "Autopatch Test", ring: "Test", devices: 12, deferral_days: 0, status: "active" },
  { id: "2", name: "Autopatch Ring 1", ring: "First", devices: 45, deferral_days: 7, status: "active" },
  { id: "3", name: "Autopatch Ring 2", ring: "Fast", devices: 120, deferral_days: 14, status: "active" },
  { id: "4", name: "Autopatch Ring 3", ring: "Broad", devices: 380, deferral_days: 28, status: "active" },
];

export default function AutopatchGroups({ selectedTenant }) {
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["autopatch_groups", selectedTenant?.tenant_id],
    enabled: !!selectedTenant?.tenant_id,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_autopatch_groups",
        azure_tenant_id: selectedTenant?.tenant_id,
      }).then(r => r.data),
  });

  const groups = data?.groups || MOCK_GROUPS;

  const handleSync = async () => {
    setSyncing(true);
    try {
      await base44.functions.invoke("portalData", {
        action: "sync_autopatch_groups",
        azure_tenant_id: selectedTenant?.tenant_id,
      });
      refetch();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Windows Autopatch Groups</p>
          <p className="text-xs text-slate-400 mt-0.5">Manage Intune update rings and deferral policies</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSync} disabled={syncing || isLoading}>
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Sync from Intune
        </Button>
      </div>

      {isLoading && (
        <div className="text-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading autopatch groups…</p>
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((group, i) => (
            <div key={group.id || i} className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{group.name}</p>
                    <p className="text-xs text-slate-400">{group.devices} device{group.devices !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <Badge className={group.status === "active" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                  {group.status === "active" ? <CheckCircle2 className="h-3 w-3 mr-1 inline" /> : null}
                  {group.status}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Ring</span>
                  <Badge variant="outline" className="text-xs">{group.ring}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 flex items-center gap-1"><Clock className="h-3 w-3" />Deferral</span>
                  <span className="font-medium text-slate-700">{group.deferral_days} day{group.deferral_days !== 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
          No autopatch groups found. Ensure Windows Autopatch is enabled in Intune.
        </div>
      )}
    </div>
  );
}