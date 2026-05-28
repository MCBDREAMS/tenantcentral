import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Monitor, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Download, ArrowUp, BarChart2, Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from "recharts";
import { useChartColors } from "@/hooks/useChartColors";

const VERSION_COLORS = {
  "Windows 11 24H2": "#10b981",
  "Windows 11 23H2": "#22d3ee",
  "Windows 11 22H2": "#6366f1",
  "Windows 11 21H2": "#8b5cf6",
  "Windows 10 22H2": "#f59e0b",
  "Windows 10 21H2": "#f97316",
  "Windows 10 21H1": "#ef4444",
  "Windows 10 20H2": "#dc2626",
  "Windows 10 20H1": "#991b1b",
};

function ReadinessBadge({ ready, reason }) {
  if (ready) return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Ready
    </Badge>
  );
  if (reason === "Already on Windows 11") return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">
      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Upgraded
    </Badge>
  );
  return (
    <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">
      <XCircle className="h-2.5 w-2.5 mr-0.5" /> {reason?.split(" ").slice(0,3).join(" ")}
    </Badge>
  );
}

export default function WindowsVersionReport({ selectedTenant }) {
  const [search, setSearch] = useState("");
  const chartColors = useChartColors();

  const { data, isLoading, refetch, isFetched } = useQuery({
    queryKey: ["win-version-report", selectedTenant?.tenant_id],
    enabled: false,
    queryFn: () =>
      base44.functions.invoke("windowsUpgradeEngine", {
        action: "windows_version_report",
        azure_tenant_id: selectedTenant?.tenant_id,
      }).then(r => r.data),
  });

  const filtered = useMemo(() => {
    if (!data?.devices) return [];
    const q = search.toLowerCase();
    return data.devices.filter(d =>
      !q || d.deviceName?.toLowerCase().includes(q) || d.userPrincipalName?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const pieData = (data?.versionBreakdown || []).slice(0, 8).map(v => ({
    name: v.version,
    value: v.count,
  }));

  const pieColors = pieData.map((v, i) => VERSION_COLORS[v.name] || chartColors.palette[i % chartColors.palette.length]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button onClick={() => refetch()} disabled={isLoading} className="bg-slate-900 hover:bg-slate-800 gap-2">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Scan Windows Versions
        </Button>
      </div>

      {!isFetched && !isLoading && (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl">
          <Monitor className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Click "Scan Windows Versions" to pull version data from Graph API</p>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Fetching device OS versions from Microsoft Graph…</p>
        </div>
      )}

      {isFetched && data?.stats && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Windows", value: data.stats.total, color: "bg-blue-50 text-blue-700" },
              { label: "Windows 11", value: data.stats.win11, color: "bg-emerald-50 text-emerald-700" },
              { label: "Windows 10", value: data.stats.win10, color: "bg-amber-50 text-amber-700" },
              { label: "Upgrade Ready", value: data.stats.upgradeReady, color: "bg-violet-50 text-violet-700" },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-4 ${s.color} border-current/20`}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs font-medium mt-1 opacity-70">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Win11 adoption progress */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700">Windows 11 Adoption</p>
              <span className="text-lg font-bold text-slate-800">
                {data.stats.total > 0 ? Math.round((data.stats.win11 / data.stats.total) * 100) : 0}%
              </span>
            </div>
            <Progress value={data.stats.total > 0 ? (data.stats.win11 / data.stats.total) * 100 : 0} className="h-3" />
            <p className="text-xs text-slate-400 mt-2">{data.stats.win11} of {data.stats.total} devices running Windows 11</p>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Version Distribution</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, color: chartColors.tooltipText, borderRadius: 8, fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Version Count Breakdown</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.versionBreakdown.slice(0,8)} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: chartColors.axisColor }} />
                  <YAxis type="category" dataKey="version" tick={{ fontSize: 9, fill: chartColors.axisColor }} width={110} />
                  <Tooltip contentStyle={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, color: chartColors.tooltipText, borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" radius={[0,3,3,0]} name="Devices">
                    {data.versionBreakdown.slice(0,8).map((v, i) => (
                      <Cell key={i} fill={VERSION_COLORS[v.version] || chartColors.palette[i % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Device Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-700">Device Inventory ({filtered.length})</p>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  className="pl-8 h-8 text-xs"
                  placeholder="Search devices…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Device</th>
                    <th className="text-left px-4 py-2.5 text-slate-500 font-medium">User</th>
                    <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Version</th>
                    <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Build</th>
                    <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Storage Free</th>
                    <th className="text-left px-4 py-2.5 text-slate-500 font-medium">W11 Readiness</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{d.deviceName}</td>
                      <td className="px-4 py-2.5 text-slate-500 truncate max-w-[140px]">{d.userPrincipalName || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: VERSION_COLORS[d.versionLabel] ? VERSION_COLORS[d.versionLabel] + "22" : "#f1f5f9", color: VERSION_COLORS[d.versionLabel] || "#64748b" }}>
                          {d.versionLabel || "Unknown"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 font-mono">{d.build || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {d.freeStorageGB > 0 ? (
                          <span className={d.freeStorageGB < 25 ? "text-red-600 font-semibold" : ""}>{d.freeStorageGB} GB</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <ReadinessBadge ready={d.upgradeReady} reason={d.upgradeReason} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}