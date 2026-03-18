import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from "recharts";
import { Activity, RefreshCw, Loader2, Package, CheckCircle2, XCircle, AlertTriangle, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import PageHeader from "@/components/shared/PageHeader";
import ActionProgressBar from "@/components/shared/ActionProgressBar";

const COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#6366f1", "#06b6d4"];

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

export default function AppMonitoring({ selectedTenant, tenants }) {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [actionStatus, setActionStatus] = useState(null);

  const tenantId = selectedTenant?.tenant_id;

  const { data: devices = [] } = useQuery({
    queryKey: ["intune-devices", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.IntuneDevice.filter({ tenant_id: selectedTenant.id })
      : base44.entities.IntuneDevice.list(),
  });

  const { data: apps = [] } = useQuery({
    queryKey: ["intune-apps", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.IntuneApp.filter({ tenant_id: selectedTenant.id })
      : base44.entities.IntuneApp.list(),
  });

  // Per-device app install states via Graph
  const { data: deviceApps, isLoading: loadingDeviceApps, refetch: refetchDeviceApps } = useQuery({
    queryKey: ["device-apps", selectedDevice, tenantId],
    queryFn: () => base44.functions.invoke("portalData", {
      action: "get_device_apps",
      azure_tenant_id: tenantId,
      device_id: selectedDevice,
    }).then(r => r.data),
    enabled: false,
  });

  const handleDeviceScan = async () => {
    if (!selectedDevice || !tenantId) return;
    setActionStatus({ status: "loading", message: "Fetching app install states from Microsoft Graph…" });
    try {
      await refetchDeviceApps();
      setActionStatus({ status: "success", message: "App install states loaded successfully." });
    } catch (e) {
      setActionStatus({ status: "error", message: `Scan failed: ${e.message}` });
    }
    setTimeout(() => setActionStatus(null), 4000);
  };

  const handleLiveScan = async () => {
    if (!tenantId) return;
    setActionStatus({ status: "loading", message: "Scanning all devices for app usage data…" });
    try {
      const res = await base44.functions.invoke("portalData", {
        action: "get_all_device_apps",
        azure_tenant_id: tenantId,
      });
      setLiveData(res.data);
      setActionStatus({ status: "success", message: `Scanned ${res.data?.devicesScanned || 0} devices.` });
    } catch (e) {
      setActionStatus({ status: "error", message: `Scan failed: ${e.message}` });
    }
    setTimeout(() => setActionStatus(null), 4000);
  };

  // Aggregate from DB
  const totalInstalled = apps.reduce((s, a) => s + (a.install_count || 0), 0);
  const totalFailed = apps.reduce((s, a) => s + (a.failed_count || 0), 0);
  const successRate = totalInstalled + totalFailed > 0
    ? Math.round((totalInstalled / (totalInstalled + totalFailed)) * 100) : 0;

  const chartData = apps
    .filter(a => (a.install_count || 0) + (a.failed_count || 0) > 0)
    .sort((a, b) => (b.install_count || 0) - (a.install_count || 0))
    .slice(0, 10)
    .map(a => ({
      name: a.app_name?.length > 18 ? a.app_name.slice(0, 18) + "…" : a.app_name,
      installed: a.install_count || 0,
      failed: a.failed_count || 0,
    }));

  const platformPie = Object.entries(
    apps.reduce((acc, a) => { acc[a.platform || "unknown"] = (acc[a.platform || "unknown"] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const liveApps = liveData?.apps || [];
  const liveChartData = [...liveApps]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map(a => ({
      name: a.appName?.length > 18 ? a.appName.slice(0, 18) + "…" : a.appName,
      installed: a.installed,
      failed: a.failed,
      notInstalled: a.notInstalled,
    }));

  return (
    <div className="flex flex-col h-full">
      <ActionProgressBar
        status={actionStatus?.status}
        message={actionStatus?.message}
        onDismiss={() => setActionStatus(null)}
      />

      <div className="p-6 max-w-7xl mx-auto w-full">
        <PageHeader
          title="App Monitoring"
          subtitle={selectedTenant ? `Usage stats for ${selectedTenant.name}` : "All tenants — app usage"}
          icon={Activity}
          actions={
            <Button
              size="sm"
              onClick={handleLiveScan}
              disabled={!tenantId || actionStatus?.status === "loading"}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />Live Scan
            </Button>
          }
        />

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Apps" value={apps.length} icon={Package} color="bg-slate-700" />
          <StatCard label="Total Installs" value={totalInstalled} icon={CheckCircle2} color="bg-emerald-600" />
          <StatCard label="Failed Installs" value={totalFailed} icon={XCircle} color="bg-red-500" />
          <StatCard label="Success Rate" value={`${successRate}%`} icon={Activity} color="bg-blue-600" />
        </div>

        {/* Charts from DB */}
        {chartData.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6">
            <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-4">Top Apps by Install Count</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="installed" fill="#22c55e" name="Installed" radius={[3,3,0,0]} />
                  <Bar dataKey="failed" fill="#ef4444" name="Failed" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-4">Apps by Platform</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={platformPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {platformPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Live scan results */}
        {liveApps.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-700">Live Scan Results — {liveData.devicesScanned} devices sampled</p>
              <Badge className="bg-blue-50 text-blue-700 text-xs">{liveApps.length} apps detected</Badge>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={liveChartData} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="installed" fill="#22c55e" name="Installed" radius={[3,3,0,0]} stackId="a" />
                <Bar dataKey="failed" fill="#ef4444" name="Failed" radius={[3,3,0,0]} stackId="a" />
                <Bar dataKey="notInstalled" fill="#f59e0b" name="Pending" radius={[3,3,0,0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Per-device scan */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Per-Device App Inspection</p>
          <div className="flex gap-3 mb-4">
            <Select value={selectedDevice || ""} onValueChange={setSelectedDevice}>
              <SelectTrigger className="w-72 h-9 text-sm">
                <SelectValue placeholder="Select a device…" />
              </SelectTrigger>
              <SelectContent>
                {devices.map(d => <SelectItem key={d.id} value={d.id}>{d.device_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDeviceScan}
              disabled={!selectedDevice || !tenantId || loadingDeviceApps}
              className="gap-1.5"
            >
              {loadingDeviceApps ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Monitor className="h-3.5 w-3.5" />}
              {loadingDeviceApps ? "Loading…" : "Inspect Device"}
            </Button>
          </div>

          {deviceApps?.appInstallStates?.length > 0 ? (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-slate-500 font-semibold">Application</th>
                    <th className="px-3 py-2 text-left text-slate-500 font-semibold">Version</th>
                    <th className="px-3 py-2 text-left text-slate-500 font-semibold">Status</th>
                    <th className="px-3 py-2 text-left text-slate-500 font-semibold">Error Code</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deviceApps.appInstallStates.map((s, i) => (
                    <tr key={i} className={s.installState === "failed" ? "bg-red-50/40" : ""}>
                      <td className="px-3 py-2 font-medium text-slate-700">{s.displayName || s.applicationId}</td>
                      <td className="px-3 py-2 text-slate-500">{s.version || "—"}</td>
                      <td className="px-3 py-2">
                        <Badge className={
                          s.installState === "installed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          s.installState === "failed" ? "bg-red-50 text-red-700 border-red-200" :
                          "bg-amber-50 text-amber-700 border-amber-200"
                        } variant="outline">{s.installState || "unknown"}</Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-500 font-mono">{s.errorCode || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : selectedDevice && !loadingDeviceApps && (
            <p className="text-sm text-slate-400 text-center py-8">Click "Inspect Device" to load app install states from Microsoft Graph.</p>
          )}
          {!selectedDevice && (
            <p className="text-sm text-slate-400 text-center py-8">Select a device to inspect its installed applications.</p>
          )}
        </div>
      </div>
    </div>
  );
}