import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, CheckCircle2, XCircle, Loader2, CloudDownload } from "lucide-react";
import { Button } from "@/components/ui/button";

const SYNC_ACTIONS = [
  { action: "sync_users", label: "Users", description: "Entra ID Users" },
  { action: "sync_groups", label: "Groups", description: "Entra ID Groups" },
  { action: "sync_devices", label: "Devices", description: "Intune Managed Devices" },
  { action: "sync_policies", label: "CA Policies", description: "Conditional Access" },
  { action: "sync_intune_profiles", label: "Intune Profiles", description: "Compliance, Config & Endpoint Security" },
  { action: "sync_intune_apps", label: "Intune Apps", description: "Managed Apps & Packages" },
];

export default function GraphSyncPanel({ selectedTenant, tenants }) {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [syncing, setSyncing] = useState(false);

  const tenant_id = selectedTenant?.id || tenants?.[0]?.id;

  const runSync = async (action) => {
    if (!tenant_id) return;
    setLoading(p => ({ ...p, [action]: true }));
    setResults(p => ({ ...p, [action]: null }));
    try {
      const res = await base44.functions.invoke("graphSync", { action, tenant_id });
      setResults(p => ({ ...p, [action]: { success: true, ...res.data } }));
    } catch (err) {
      setResults(p => ({ ...p, [action]: { success: false, error: err.message } }));
    } finally {
      setLoading(p => ({ ...p, [action]: false }));
    }
  };

  const syncAll = async () => {
    setSyncing(true);
    for (const { action } of SYNC_ACTIONS) {
      await runSync(action);
    }
    setSyncing(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CloudDownload className="h-4 w-4 text-blue-600" />
          <h3 className="font-semibold text-slate-900 text-sm">Microsoft Graph Live Sync</h3>
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">MCBConsulting</span>
        </div>
        <Button
          size="sm"
          onClick={syncAll}
          disabled={syncing || !tenant_id}
          className="gap-1.5 bg-blue-600 hover:bg-blue-700 h-8 text-xs"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Sync All
        </Button>
      </div>
      <div className="divide-y divide-slate-100">
        {SYNC_ACTIONS.map(({ action, label, description }) => {
          const result = results[action];
          const isLoading = loading[action];
          return (
            <div key={action} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-800">{label}</div>
                  <div className="text-xs text-slate-400">{description}</div>
                </div>
                {result && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {result.success ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-emerald-600">{result.total} total · +{result.created} new · {result.updated} updated</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                        <span className="text-red-600 truncate max-w-[200px]">{result.error}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 shrink-0"
                onClick={() => runSync(action)}
                disabled={isLoading || !tenant_id}
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Sync
              </Button>
            </div>
          );
        })}
      </div>
      {!tenant_id && (
        <div className="px-5 py-4 text-xs text-amber-600 bg-amber-50 border-t border-amber-100">
          ⚠ Select a tenant first to enable sync
        </div>
      )}
    </div>
  );
}