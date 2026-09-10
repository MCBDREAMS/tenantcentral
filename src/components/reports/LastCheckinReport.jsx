import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Download, Clock, Activity, AlertTriangle } from "lucide-react";
import { exportToCSV } from "@/components/shared/exportUtils";
import { useDeviceInventoryReport, timeSince, checkinBucket } from "./useDeviceInventory";

const BUCKET_STYLE = {
  recent: { badge: "bg-emerald-100 text-emerald-700", label: "Recent (<1h)" },
  aging: { badge: "bg-blue-100 text-blue-700", label: "Aging (1–8h)" },
  stale: { badge: "bg-amber-100 text-amber-700", label: "Stale (>8h)" },
  critical: { badge: "bg-red-100 text-red-700", label: "Critical (>7d)" },
  never: { badge: "bg-slate-100 text-slate-600", label: "Never synced" },
};

export default function LastCheckinReport({ selectedTenant }) {
  const { data, isLoading, refetch, isFetched } = useDeviceInventoryReport(selectedTenant?.tenant_id);

  const devices = useMemo(() => {
    const list = data?.devices || [];
    return [...list].sort((a, b) => {
      if (!a.lastSyncDateTime) return 1;
      if (!b.lastSyncDateTime) return -1;
      return new Date(a.lastSyncDateTime).getTime() - new Date(b.lastSyncDateTime).getTime();
    });
  }, [data]);

  const stats = useMemo(() => {
    const c = { recent: 0, aging: 0, stale: 0, critical: 0, never: 0 };
    devices.forEach(d => { c[checkinBucket(d.lastSyncDateTime)]++; });
    return c;
  }, [devices]);

  const exportRows = useMemo(() => devices.map(d => ({
    deviceName: d.deviceName,
    userPrincipalName: d.userPrincipalName,
    lastCheckIn: d.lastSyncDateTime ? new Date(d.lastSyncDateTime).toLocaleString() : "Never",
    timeSince: timeSince(d.lastSyncDateTime)?.label || "Never",
    status: BUCKET_STYLE[checkinBucket(d.lastSyncDateTime)].label,
  })), [devices]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">Last check-in / sync times for each device, oldest first to surface stale devices.</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </Button>
          <Button size="sm" onClick={() => exportToCSV(exportRows, "last_checkin")} disabled={!devices.length} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { k: "recent", icon: Activity, color: "bg-emerald-50 text-emerald-700" },
          { k: "aging", icon: Clock, color: "bg-blue-50 text-blue-700" },
          { k: "stale", icon: AlertTriangle, color: "bg-amber-50 text-amber-700" },
          { k: "critical", icon: AlertTriangle, color: "bg-red-50 text-red-700" },
          { k: "never", icon: Clock, color: "bg-slate-50 text-slate-700" },
        ].map(({ k, icon: Icon, color }) => (
          <div key={k} className={`rounded-xl border border-slate-200 p-3 ${color}`}>
            <div className="flex items-center gap-2 mb-1"><Icon className="h-4 w-4" /><span className="text-2xl font-bold">{stats[k]}</span></div>
            <p className="text-[11px] font-medium opacity-70">{BUCKET_STYLE[k].label}</p>
          </div>
        ))}
      </div>

      {isLoading && <div className="text-center py-16"><Loader2 className="h-7 w-7 animate-spin text-slate-400 mx-auto mb-2" /><p className="text-sm text-slate-400">Loading check-in data…</p></div>}
      {isFetched && !isLoading && !devices.length && <div className="text-center py-16 text-sm text-slate-400">No devices found.</div>}

      {devices.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50"><p className="text-sm font-semibold text-slate-700">Last Check-in ({devices.length})</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500">
                  <th className="text-left px-4 py-2.5 font-medium">Device</th>
                  <th className="text-left px-4 py-2.5 font-medium">Primary User</th>
                  <th className="text-left px-4 py-2.5 font-medium">Last Check-in</th>
                  <th className="text-left px-4 py-2.5 font-medium">Time Since</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {devices.map(d => {
                  const bucket = checkinBucket(d.lastSyncDateTime);
                  const style = BUCKET_STYLE[bucket];
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{d.deviceName}</td>
                      <td className="px-4 py-2.5 text-slate-500 truncate max-w-[180px]">{d.userPrincipalName || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500">{d.lastSyncDateTime ? new Date(d.lastSyncDateTime).toLocaleString() : "—"}</td>
                      <td className="px-4 py-2.5 text-slate-600 font-medium">{timeSince(d.lastSyncDateTime)?.label || "Never"}</td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${style.badge}`}>{style.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}