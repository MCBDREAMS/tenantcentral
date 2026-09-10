import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Download, HardDrive, Cpu } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useChartColors } from "@/hooks/useChartColors";
import { exportToCSV } from "@/components/shared/exportUtils";
import { useDeviceInventoryReport } from "./useDeviceInventory";

export default function HardwareStorageReport({ selectedTenant }) {
  const chartColors = useChartColors();
  const { data, isLoading, refetch, isFetched } = useDeviceInventoryReport(selectedTenant?.tenant_id);

  const devices = data?.devices || [];

  const withStorage = useMemo(() => devices.filter(d => d.totalStorageGB > 0), [devices]);

  const kpis = useMemo(() => {
    const totalCap = withStorage.reduce((s, d) => s + d.totalStorageGB, 0);
    const totalFree = withStorage.reduce((s, d) => s + d.freeStorageGB, 0);
    const lowDisk = withStorage.filter(d => d.freeStorageGB < 25).length;
    const avgUsed = withStorage.length ? Math.round(((totalCap - totalFree) / totalCap) * 100) : 0;
    return { devices: devices.length, totalCap, totalFree, lowDisk, avgUsed };
  }, [withStorage, devices]);

  const byModel = useMemo(() => {
    const map = {};
    devices.forEach(d => { const k = `${d.manufacturer || "Unknown"} ${d.model || "Unknown"}`; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([name, count]) => ({ name: name.length > 22 ? name.slice(0, 22) + "…" : name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [devices]);

  const exportRows = useMemo(() => withStorage.map(d => ({
    deviceName: d.deviceName,
    userPrincipalName: d.userPrincipalName,
    manufacturer: d.manufacturer,
    model: d.model,
    serialNumber: d.serialNumber,
    totalStorageGB: d.totalStorageGB,
    freeStorageGB: d.freeStorageGB,
    usedStorageGB: Math.max(0, d.totalStorageGB - d.freeStorageGB),
    usedPct: d.totalStorageGB ? Math.round(((d.totalStorageGB - d.freeStorageGB) / d.totalStorageGB) * 100) : 0,
  })), [withStorage]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">Hardware models and disk space utilisation across all managed devices.</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </Button>
          <Button size="sm" onClick={() => exportToCSV(exportRows, "hardware_storage")} disabled={!withStorage.length} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Devices", value: kpis.devices, icon: Cpu, color: "bg-blue-50 text-blue-700" },
          { label: "Total Capacity", value: `${kpis.totalCap} GB`, icon: HardDrive, color: "bg-violet-50 text-violet-700" },
          { label: "Avg Used", value: `${kpis.avgUsed}%`, icon: HardDrive, color: "bg-emerald-50 text-emerald-700" },
          { label: "Low Disk (<25GB free)", value: kpis.lowDisk, icon: HardDrive, color: "bg-red-50 text-red-700" },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`rounded-xl border border-slate-200 p-4 ${s.color}`}>
              <div className="flex items-center gap-2 mb-1"><Icon className="h-4 w-4" /><span className="text-2xl font-bold">{s.value}</span></div>
              <p className="text-[11px] font-medium opacity-70">{s.label}</p>
            </div>
          );
        })}
      </div>

      {byModel.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Top Hardware Models</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byModel} layout="vertical" margin={{ left: 0, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: chartColors.axisColor }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: chartColors.axisColor }} width={150} />
              <Tooltip contentStyle={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, color: chartColors.tooltipText, borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill={chartColors.installed} radius={[0, 3, 3, 0]} name="Devices" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {isLoading && <div className="text-center py-12"><Loader2 className="h-7 w-7 animate-spin text-slate-400 mx-auto mb-2" /><p className="text-sm text-slate-400">Loading hardware data…</p></div>}
      {isFetched && !isLoading && data?.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <p className="font-semibold mb-1">Could not load devices from Microsoft Graph</p>
          <p className="text-red-600 text-xs font-mono break-all">{data.error}</p>
        </div>
      )}
      {isFetched && !isLoading && !data?.error && !withStorage.length && <div className="text-center py-12 text-sm text-slate-400">No storage data available.</div>}

      {withStorage.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50"><p className="text-sm font-semibold text-slate-700">Disk Space by Device ({withStorage.length})</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500">
                  <th className="text-left px-4 py-2.5 font-medium">Device</th>
                  <th className="text-left px-4 py-2.5 font-medium">User</th>
                  <th className="text-left px-4 py-2.5 font-medium">Total GB</th>
                  <th className="text-left px-4 py-2.5 font-medium">Used GB</th>
                  <th className="text-left px-4 py-2.5 font-medium">Free GB</th>
                  <th className="text-left px-4 py-2.5 font-medium">Used %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {withStorage.map(d => {
                  const used = Math.max(0, d.totalStorageGB - d.freeStorageGB);
                  const pct = d.totalStorageGB ? Math.round((used / d.totalStorageGB) * 100) : 0;
                  const low = d.freeStorageGB < 25;
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{d.deviceName}</td>
                      <td className="px-4 py-2.5 text-slate-500 truncate max-w-[160px]">{d.userPrincipalName || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-600">{d.totalStorageGB}</td>
                      <td className="px-4 py-2.5 text-slate-600">{used}</td>
                      <td className={`px-4 py-2.5 font-semibold ${low ? "text-red-600" : "text-slate-600"}`}>{d.freeStorageGB}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${low ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-slate-500">{pct}%</span>
                        </div>
                      </td>
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