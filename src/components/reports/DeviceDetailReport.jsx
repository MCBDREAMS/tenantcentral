import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Download, Search, Cpu, HardDrive, Mail, UserCircle2 } from "lucide-react";
import { exportToCSV } from "@/components/shared/exportUtils";
import { useDeviceInventoryReport } from "./useDeviceInventory";

const STYLES = {
  ok: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
  bad: "bg-red-100 text-red-700",
};

function CompBadge({ state }) {
  const cls = state === "compliant" ? STYLES.ok : state === "noncompliant" ? STYLES.bad : STYLES.warn;
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{(state || "unknown")?.replace(/_/g, " ")}</span>;
}

export default function DeviceDetailReport({ selectedTenant }) {
  const { data, isLoading, refetch, isFetched } = useDeviceInventoryReport(selectedTenant?.tenant_id);
  const [search, setSearch] = useState("");

  const devices = data?.devices || [];
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return devices.filter(d => !q ||
      d.deviceName?.toLowerCase().includes(q) ||
      d.userPrincipalName?.toLowerCase().includes(q) ||
      d.serialNumber?.toLowerCase().includes(q) ||
      d.entraDeviceId?.toLowerCase().includes(q));
  }, [devices, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">
          Full device inventory with Intune device ID, Entra device ID, primary user, contact email, hardware and disk space.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </Button>
          <Button size="sm" onClick={() => exportToCSV(filtered, "device_details")} disabled={!filtered.length} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16"><Loader2 className="h-7 w-7 animate-spin text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Loading device inventory from Microsoft Graph…</p></div>
      )}

      {isFetched && !isLoading && !devices.length && (
        <div className="text-center py-16 text-sm text-slate-400">No devices found in this tenant.</div>
      )}

      {devices.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700">Device Details ({filtered.length})</p>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input className="pl-8 h-8 text-xs" placeholder="Search name, user, serial, Entra ID…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500">
                  <th className="text-left px-4 py-2.5 font-medium">Device Name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Device ID (Intune)</th>
                  <th className="text-left px-4 py-2.5 font-medium">Entra Device ID</th>
                  <th className="text-left px-4 py-2.5 font-medium">Primary User</th>
                  <th className="text-left px-4 py-2.5 font-medium">Contact Email</th>
                  <th className="text-left px-4 py-2.5 font-medium">OS</th>
                  <th className="text-left px-4 py-2.5 font-medium">Hardware</th>
                  <th className="text-left px-4 py-2.5 font-medium">Storage</th>
                  <th className="text-left px-4 py-2.5 font-medium">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(d => {
                  const usedGB = Math.max(0, d.totalStorageGB - d.freeStorageGB);
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{d.deviceName}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-[10px] truncate max-w-[120px]" title={d.id}>{d.id?.slice(0, 8)}…</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-[10px] truncate max-w-[120px]" title={d.entraDeviceId}>{d.entraDeviceId ? d.entraDeviceId.slice(0, 8) + "…" : "—"}</td>
                      <td className="px-4 py-2.5 text-slate-600 truncate max-w-[150px]">
                        <span className="inline-flex items-center gap-1"><UserCircle2 className="h-3 w-3 text-slate-400" />{d.userPrincipalName || "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 truncate max-w-[150px]">
                        <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3 text-slate-400" />{d.userPrincipalName || "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{d.operatingSystem} <span className="text-slate-400">{d.osVersion?.slice(0, 14)}</span></td>
                      <td className="px-4 py-2.5 text-slate-500">
                        <span className="inline-flex items-center gap-1"><Cpu className="h-3 w-3 text-slate-400" />{d.model || "—"}</span>
                        <div className="text-[10px] text-slate-400">{d.manufacturer} · {d.serialNumber}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 text-slate-600"><HardDrive className="h-3 w-3 text-slate-400" />
                          {d.totalStorageGB > 0 ? `${d.freeStorageGB}/${d.totalStorageGB} GB free` : "—"}
                        </span>
                        {d.totalStorageGB > 0 && (
                          <div className="w-24 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${d.freeStorageGB < 25 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${(usedGB / d.totalStorageGB) * 100}%` }} />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5"><CompBadge state={d.complianceState} /></td>
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