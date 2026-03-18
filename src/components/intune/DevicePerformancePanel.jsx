import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Loader2, Shield, HardDrive, Cpu, Clock, CheckCircle2,
  XCircle, AlertTriangle, Package, TrendingUp, RefreshCw
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { format } from "date-fns";

function fmt(v) {
  if (!v) return "—";
  try { return format(new Date(v), "PP p"); } catch { return v; }
}

function fmtShort(v) {
  if (!v) return "?";
  try { return format(new Date(v), "MMM d"); } catch { return v; }
}

function bytes(b) {
  if (!b) return "—";
  if (b >= 1e9) return (b / 1e9).toFixed(1) + " GB";
  return (b / 1e6).toFixed(0) + " MB";
}

function MetricCard({ icon: Icon, label, value, color = "slate" }) {
  const colors = {
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    red: "bg-red-50 border-red-200 text-red-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  };
  return (
    <div className={`border rounded-xl p-3 flex items-center gap-3 ${colors[color]}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div>
        <p className="text-xs opacity-70">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

const PIE_COLORS = ["#10b981", "#ef4444", "#f59e0b", "#94a3b8"];

export default function DevicePerformancePanel({ device, azureTenantId }) {
  const deviceId = device.id || device.graph_id;

  const { data: perfData, isLoading: loadingPerf, refetch } = useQuery({
    queryKey: ["device-performance", deviceId],
    enabled: !!deviceId && !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_device_performance",
        azure_tenant_id: azureTenantId,
        device_id: deviceId,
      }).then(r => r.data),
  });

  const { data: appsData, isLoading: loadingApps } = useQuery({
    queryKey: ["device-apps", deviceId],
    enabled: !!deviceId && !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_device_apps",
        azure_tenant_id: azureTenantId,
        device_id: deviceId,
      }).then(r => r.data),
  });

  const dev = perfData?.device || device;
  const complianceStates = perfData?.complianceStates || [];
  const configStates = perfData?.configStates || [];
  const appStates = appsData?.appInstallStates || [];

  // Build compliance timeline data from states sorted by date
  const timelineData = [...complianceStates, ...configStates]
    .filter(s => s.lastReportedDateTime)
    .sort((a, b) => new Date(a.lastReportedDateTime) - new Date(b.lastReportedDateTime))
    .map(s => ({
      name: s.displayName?.length > 20 ? s.displayName.slice(0, 18) + "…" : (s.displayName || "Policy"),
      date: fmtShort(s.lastReportedDateTime),
      compliant: s.state === "compliant" || s.state === "notApplicable" ? 1 : 0,
      error: s.state === "notCompliant" || s.state === "error" ? 1 : 0,
      state: s.state,
      fullDate: fmt(s.lastReportedDateTime),
    }));

  // App install stats
  const appInstallSummary = [
    { name: "Installed", value: appStates.filter(a => a.installState === "installed").length },
    { name: "Failed", value: appStates.filter(a => a.installState === "failed").length },
    { name: "Pending", value: appStates.filter(a => ["pendingInstall", "notInstalled"].includes(a.installState)).length },
    { name: "Not Applicable", value: appStates.filter(a => a.installState === "notApplicable").length },
  ].filter(x => x.value > 0);

  const healthAttest = dev?.deviceHealthAttestationState || {};
  const totalStorage = dev?.totalStorageSpaceInBytes;
  const freeStorage = dev?.freeStorageSpaceInBytes;
  const usedStorage = totalStorage && freeStorage ? totalStorage - freeStorage : null;
  const storagePercent = totalStorage && usedStorage ? Math.round((usedStorage / totalStorage) * 100) : null;

  if (loadingPerf && loadingApps) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading device data…
      </div>
    );
  }

  return (
    <Tabs defaultValue="performance">
      <div className="flex items-center justify-between mb-4">
        <TabsList>
          <TabsTrigger value="performance">System Performance</TabsTrigger>
          <TabsTrigger value="apps">App Inventory ({appStates.length})</TabsTrigger>
        </TabsList>
        <button onClick={() => refetch()} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* ── PERFORMANCE TAB ── */}
      <TabsContent value="performance" className="space-y-5">
        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard icon={HardDrive} label="Storage Used"
            value={storagePercent ? `${storagePercent}% (${bytes(usedStorage)} / ${bytes(totalStorage)})` : "—"}
            color={storagePercent > 85 ? "red" : storagePercent > 65 ? "amber" : "green"} />
          <MetricCard icon={Cpu} label="Architecture"
            value={dev?.processorArchitecture || "—"} color="blue" />
          <MetricCard icon={Shield} label="Encryption"
            value={dev?.isEncrypted ? "BitLocker On" : "Not Encrypted"}
            color={dev?.isEncrypted ? "green" : "red"} />
          <MetricCard icon={Clock} label="Last Check-in"
            value={dev?.lastSyncDateTime ? fmtShort(dev.lastSyncDateTime) : "—"} color="slate" />
        </div>

        {/* Health Attestation */}
        {(healthAttest.secureBootEnabled !== undefined || healthAttest.bitLockerEnabled !== undefined) && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-500" /> Security Health Attestation
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                ["Secure Boot", healthAttest.secureBootEnabled],
                ["Code Integrity", healthAttest.codeIntegrityEnabled],
                ["BitLocker", healthAttest.bitLockerEnabled],
                ["Early Launch Anti-malware", healthAttest.earlyLaunchAntiMalwareDriverEnabled],
                ["Virtualization", healthAttest.virtualizationBasedSecurityEnabled],
                ["TPM", healthAttest.tpmVersion ? `v${healthAttest.tpmVersion}` : undefined],
              ].filter(([, v]) => v !== undefined).map(([label, val]) => (
                <div key={label} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2">
                  {val === true ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    : val === false ? <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    : <Shield className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                  <div>
                    <p className="text-slate-500">{label}</p>
                    <p className="font-medium text-slate-700">{val === true ? "Enabled" : val === false ? "Disabled" : val}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compliance / Policy Timeline */}
        {timelineData.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-800 mb-1">Compliance Policy Timeline</p>
            <p className="text-xs text-slate-400 mb-4">{timelineData.length} policies evaluated</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={timelineData} margin={{ top: 0, right: 0, left: -20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis hide />
                <Tooltip
                  content={({ active, payload }) => active && payload?.length ? (
                    <div className="bg-white border border-slate-200 rounded-lg p-2 text-xs shadow">
                      <p className="font-semibold">{payload[0]?.payload?.name}</p>
                      <p className="text-slate-500">{payload[0]?.payload?.fullDate}</p>
                      <p className={payload[0]?.payload?.state === "compliant" ? "text-emerald-600" : "text-red-500"}>
                        State: {payload[0]?.payload?.state}
                      </p>
                    </div>
                  ) : null}
                />
                <Bar dataKey="compliant" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="error" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {/* Timeline list */}
            <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
              {timelineData.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {item.compliant ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                  )}
                  <span className="flex-1 text-slate-700 truncate">{item.name}</span>
                  <span className="text-slate-400 shrink-0">{item.fullDate}</span>
                  <Badge className={`text-[9px] shrink-0 ${item.state === "compliant" ? "bg-emerald-100 text-emerald-700" : item.state === "notApplicable" ? "bg-slate-100 text-slate-500" : "bg-red-100 text-red-700"}`}>
                    {item.state}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {timelineData.length === 0 && !loadingPerf && (
          <div className="text-center py-8 text-sm text-slate-400">No compliance timeline data available for this device.</div>
        )}
      </TabsContent>

      {/* ── APPS TAB ── */}
      <TabsContent value="apps">
        {loadingApps ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading app inventory…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary chart */}
            {appInstallSummary.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-800 mb-3">Installation Status Overview</p>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={160} height={120}>
                    <PieChart>
                      <Pie data={appInstallSummary} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={30}>
                        {appInstallSummary.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5">
                    {appInstallSummary.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-slate-600">{item.name}</span>
                        <span className="font-semibold text-slate-800">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* App list */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["App Name", "Version", "Install State", "Last Updated"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appStates.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No managed apps found for this device
                    </td></tr>
                  ) : appStates.map((app, i) => {
                    const stateColors = {
                      installed: "bg-emerald-100 text-emerald-700",
                      failed: "bg-red-100 text-red-700",
                      pendingInstall: "bg-amber-100 text-amber-700",
                      notInstalled: "bg-slate-100 text-slate-500",
                      notApplicable: "bg-slate-100 text-slate-400",
                    };
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800">{app.appName || app.displayName || "Unknown App"}</td>
                        <td className="px-3 py-2 text-slate-500 font-mono">{app.appVersion || "—"}</td>
                        <td className="px-3 py-2">
                          <Badge className={`text-[10px] ${stateColors[app.installState] || "bg-slate-100 text-slate-500"}`}>
                            {app.installState || "unknown"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-slate-400">{app.lastModifiedDateTime ? fmtShort(app.lastModifiedDateTime) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}