import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import { Cpu, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle, Monitor, Shield, Clock, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import PageHeader from "@/components/shared/PageHeader";
import ActionProgressBar from "@/components/shared/ActionProgressBar";
import QuickSyncButton from "@/components/shared/QuickSyncButton";

const COLORS = { compliant: "#22c55e", non_compliant: "#ef4444", in_grace_period: "#f59e0b", not_evaluated: "#94a3b8" };
const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function MetricCard({ label, value, sub, icon: Icon, colorClass }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${colorClass}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function SystemPerformance({ selectedTenant }) {
  const [actionStatus, setActionStatus] = useState(null);
  const queryClient = useQueryClient();

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ["intune-devices-perf", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.IntuneDevice.filter({ tenant_id: selectedTenant.id })
      : base44.entities.IntuneDevice.list(),
  });

  // Compliance breakdown for pie chart
  const complianceData = useMemo(() => {
    const counts = {};
    devices.forEach(d => {
      const s = d.compliance_state || "not_evaluated";
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name: name.replace(/_/g, " "), rawName: name, value }));
  }, [devices]);

  // OS distribution
  const osData = useMemo(() => {
    const counts = {};
    devices.forEach(d => { counts[d.os || "Unknown"] = (counts[d.os || "Unknown"] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [devices]);

  // Timeline: group devices by last_check_in date (group by week)
  const timelineData = useMemo(() => {
    const byDay = {};
    devices.forEach(d => {
      const day = d.last_check_in ? d.last_check_in.slice(0, 10) : "Unknown";
      if (day === "Unknown") return;
      if (!byDay[day]) byDay[day] = { date: day, compliant: 0, non_compliant: 0, total: 0 };
      byDay[day].total++;
      if (d.compliance_state === "compliant") byDay[day].compliant++;
      else if (d.compliance_state === "non_compliant") byDay[day].non_compliant++;
    });
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  }, [devices]);

  // Metrics
  const totalDevices = devices.length;
  const compliantCount = devices.filter(d => d.compliance_state === "compliant").length;
  const nonCompliantCount = devices.filter(d => d.compliance_state === "non_compliant").length;
  const encryptedCount = devices.filter(d => d.ownership === "corporate").length;
  const complianceRate = totalDevices > 0 ? Math.round((compliantCount / totalDevices) * 100) : 0;

  // Recent check-ins sorted
  const recentActivity = [...devices]
    .filter(d => d.last_check_in)
    .sort((a, b) => b.last_check_in.localeCompare(a.last_check_in))
    .slice(0, 15);

  // Stale devices (no check-in in 7+ days)
  const staleDevices = devices.filter(d => {
    if (!d.last_check_in) return true;
    const diff = (new Date() - new Date(d.last_check_in)) / (1000 * 60 * 60 * 24);
    return diff > 7;
  });

  const handleRefresh = async () => {
    setActionStatus({ status: "loading", message: "Refreshing device performance data…" });
    try {
      await queryClient.invalidateQueries({ queryKey: ["intune-devices-perf"] });
      setActionStatus({ status: "success", message: "Device data refreshed." });
    } catch (e) {
      setActionStatus({ status: "error", message: e.message });
    }
    setTimeout(() => setActionStatus(null), 3000);
  };

  return (
    <div className="flex flex-col h-full">
      <ActionProgressBar status={actionStatus?.status} message={actionStatus?.message} onDismiss={() => setActionStatus(null)} />

      <div className="p-6 max-w-7xl mx-auto w-full">
        <PageHeader
          title="System Performance"
          subtitle={selectedTenant ? `Health & compliance timeline for ${selectedTenant.name}` : "All tenants"}
          icon={Cpu}
          actions={
            <div className="flex gap-2">
              <QuickSyncButton
                selectedTenant={selectedTenant}
                syncAction="sync_devices"
                label="Sync Devices"
                onSynced={() => queryClient.invalidateQueries({ queryKey: ["intune-devices-perf"] })}
              />
              <Button size="sm" variant="outline" onClick={handleRefresh} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />Refresh
              </Button>
            </div>
          }
        />

        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <MetricCard label="Total Devices" value={totalDevices} sub="managed by Intune" icon={Monitor} colorClass="bg-slate-700" />
          <MetricCard label="Compliance Rate" value={`${complianceRate}%`} sub={`${compliantCount} compliant`} icon={CheckCircle2} colorClass="bg-emerald-600" />
          <MetricCard label="Non-Compliant" value={nonCompliantCount} sub="need attention" icon={XCircle} colorClass="bg-red-500" />
          <MetricCard label="Stale Devices" value={staleDevices.length} sub="no check-in > 7 days" icon={Clock} colorClass="bg-amber-500" />
        </div>

        {/* Compliance progress bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Overall Compliance</p>
            <span className="text-sm font-bold text-slate-900">{complianceRate}%</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            {complianceData.map((item, i) => (
              item.value > 0 && (
                <div
                  key={item.rawName}
                  style={{ width: `${(item.value / totalDevices) * 100}%`, backgroundColor: COLORS[item.rawName] || PIE_COLORS[i] }}
                  className="h-full"
                  title={`${item.name}: ${item.value}`}
                />
              )
            ))}
          </div>
          <div className="flex gap-4 mt-2 flex-wrap">
            {complianceData.map((item, i) => (
              <div key={item.rawName} className="flex items-center gap-1.5 text-xs text-slate-500">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[item.rawName] || PIE_COLORS[i] }} />
                {item.name}: <span className="font-medium text-slate-700">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
          {/* Timeline chart */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700 mb-1">Compliance Timeline (last check-in activity)</p>
            <p className="text-xs text-slate-400 mb-4">Devices grouped by last check-in date</p>
            {timelineData.length > 1 ? (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={timelineData} margin={{ left: -10 }}>
                  <defs>
                    <linearGradient id="compliantGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="nonCompliantGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="compliant" stroke="#22c55e" fill="url(#compliantGrad)" name="Compliant" strokeWidth={2} />
                  <Area type="monotone" dataKey="non_compliant" stroke="#ef4444" fill="url(#nonCompliantGrad)" name="Non-Compliant" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[210px] flex items-center justify-center text-slate-400 text-sm">
                Sync device data with check-in dates to see the timeline.
              </div>
            )}
          </div>

          {/* OS Pie */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700 mb-1">OS Distribution</p>
            <p className="text-xs text-slate-400 mb-3">Managed device platforms</p>
            {osData.length > 0 ? (
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={osData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                    {osData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[210px] flex items-center justify-center text-slate-400 text-sm">No device data</div>
            )}
          </div>
        </div>

        {/* Recent Activity Timeline */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Device Activity Timeline</p>
            <span className="text-xs text-slate-400">{recentActivity.length} recently active</span>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12">No device check-in data. Sync devices first.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentActivity.map(d => {
                const daysSince = d.last_check_in
                  ? Math.floor((new Date() - new Date(d.last_check_in)) / (1000 * 60 * 60 * 24))
                  : null;
                return (
                  <div key={d.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50">
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                      d.compliance_state === "compliant" ? "bg-emerald-500" :
                      d.compliance_state === "non_compliant" ? "bg-red-500" :
                      d.compliance_state === "in_grace_period" ? "bg-amber-500" : "bg-slate-300"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-800 truncate">{d.device_name}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0">{d.os}</Badge>
                      </div>
                      <p className="text-xs text-slate-400 truncate">{d.primary_user || "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-slate-600">
                        {daysSince === 0 ? "Today" : daysSince === 1 ? "1 day ago" : daysSince != null ? `${daysSince}d ago` : "—"}
                      </p>
                      <p className="text-[10px] text-slate-400">{d.last_check_in || "no check-in"}</p>
                    </div>
                    <div className={`text-xs font-medium shrink-0 px-2 py-0.5 rounded-full ${
                      d.compliance_state === "compliant" ? "bg-emerald-50 text-emerald-700" :
                      d.compliance_state === "non_compliant" ? "bg-red-50 text-red-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {(d.compliance_state || "unknown").replace(/_/g, " ")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}