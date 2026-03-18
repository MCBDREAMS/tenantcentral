import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  ShieldAlert, RefreshCw, Loader2, AlertTriangle, Bug,
  Monitor, TrendingUp, Thermometer, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, Cell
} from "recharts";
import PageHeader from "@/components/shared/PageHeader";
import { format, subDays, parseISO, startOfDay } from "date-fns";

const SEVERITY_COLORS = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#64748b",
  informational: "#94a3b8",
};

const HEAT_COLORS = ["#dcfce7", "#bbf7d0", "#fef9c3", "#fed7aa", "#fecaca", "#fca5a5", "#f87171", "#ef4444"];

function heatColor(daysSinceUpdate) {
  if (daysSinceUpdate === null) return "#f1f5f9";
  if (daysSinceUpdate <= 1) return HEAT_COLORS[0];
  if (daysSinceUpdate <= 3) return HEAT_COLORS[1];
  if (daysSinceUpdate <= 7) return HEAT_COLORS[2];
  if (daysSinceUpdate <= 14) return HEAT_COLORS[3];
  if (daysSinceUpdate <= 30) return HEAT_COLORS[4];
  if (daysSinceUpdate <= 60) return HEAT_COLORS[5];
  if (daysSinceUpdate <= 90) return HEAT_COLORS[6];
  return HEAT_COLORS[7];
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export default function ThreatInsights({ selectedTenant }) {
  const azureTenantId = selectedTenant?.tenant_id;

  const { data, isLoading, refetch, isFetched } = useQuery({
    queryKey: ["threat_insights", azureTenantId],
    enabled: false,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_threat_insights",
        azure_tenant_id: azureTenantId,
      }).then(r => r.data),
  });

  const threats = data?.detectedThreats || [];
  const devices = data?.devices || [];
  const alertsByDay = data?.alertsByDay || [];

  // ── Top Threats ──────────────────────────────────────────────────────────
  const topThreats = useMemo(() => {
    const counts = {};
    threats.forEach(t => {
      const name = t.displayName || t.threatName || "Unknown";
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [threats]);

  // ── Severity breakdown ───────────────────────────────────────────────────
  const severityBreakdown = useMemo(() => {
    const counts = {};
    threats.forEach(t => {
      const sev = t.severity || "unknown";
      counts[sev] = (counts[sev] || 0) + 1;
    });
    return Object.entries(counts).map(([severity, count]) => ({ severity, count }));
  }, [threats]);

  // ── Infection trend (daily detections) ──────────────────────────────────
  const trendData = useMemo(() => {
    if (alertsByDay.length) return alertsByDay;
    // fallback: derive from threat detectedDateTime
    const buckets = {};
    threats.forEach(t => {
      const date = t.detectedDateTime
        ? format(startOfDay(new Date(t.detectedDateTime)), "MMM d")
        : null;
      if (date) buckets[date] = (buckets[date] || 0) + 1;
    });
    return Object.entries(buckets)
      .map(([date, detections]) => ({ date, detections }))
      .slice(-30);
  }, [threats, alertsByDay]);

  // ── Signature heatmap data ───────────────────────────────────────────────
  const heatmapDevices = useMemo(() => {
    return devices
      .map(d => ({
        name: d.deviceName,
        user: d.userPrincipalName,
        daysSinceSignature: daysSince(d.signatureLastUpdateDateTime),
        daysSinceSync: daysSince(d.lastSyncDateTime),
        rtpEnabled: d.realTimeProtectionEnabled,
        complianceState: d.complianceState,
        sigVersion: d.antivirusSignatureVersion,
      }))
      .sort((a, b) => (b.daysSinceSignature ?? 999) - (a.daysSinceSignature ?? 999));
  }, [devices]);

  const staleSignatureCount = heatmapDevices.filter(d => (d.daysSinceSignature ?? 999) > 7).length;
  const rtpOffCount = heatmapDevices.filter(d => d.rtpEnabled === false).length;

  if (!azureTenantId) {
    return (
      <div className="p-6">
        <PageHeader title="Threat Insights" subtitle="Select a tenant to view threat data" icon={ShieldAlert} />
        <div className="text-center py-20 text-slate-400 text-sm">Please select a tenant from the sidebar.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Threat Insights"
        subtitle={`Defender findings, infection trends & AV health${selectedTenant ? ` — ${selectedTenant.name}` : ""}`}
        icon={ShieldAlert}
        actions={
          <Button onClick={() => refetch()} disabled={isLoading} className="bg-slate-900 hover:bg-slate-800 gap-2">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Load Threat Data
          </Button>
        }
      />

      {!isFetched && !isLoading && (
        <div className="text-center py-24 border border-dashed border-slate-200 rounded-xl">
          <ShieldAlert className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Click "Load Threat Data" to aggregate Defender findings across all devices</p>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Scanning all devices for threat data…</p>
          <p className="text-xs text-slate-300 mt-1">This may take 20–40 seconds for large tenants</p>
        </div>
      )}

      {isFetched && !isLoading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard icon={Bug} label="Total Detections" value={threats.length} color="red" />
            <SummaryCard icon={Monitor} label="Devices Scanned" value={devices.length} color="slate" />
            <SummaryCard icon={AlertTriangle} label="Stale AV Signatures (>7d)" value={staleSignatureCount} color="amber" />
            <SummaryCard icon={ShieldAlert} label="RTP Disabled" value={rtpOffCount} color="red" />
          </div>

          {threats.length === 0 && devices.length === 0 && (
            <div className="text-center py-12 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-emerald-700">No threats detected</p>
              <p className="text-xs text-emerald-600 mt-1">Defender reports are clean across all scanned devices.</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Threats Bar Chart */}
            {topThreats.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Bug className="h-4 w-4 text-red-500" />
                  <p className="text-sm font-semibold text-slate-700">Top Detected Threats</p>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topThreats} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={150} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Severity Breakdown */}
            {severityBreakdown.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <p className="text-sm font-semibold text-slate-700">Detections by Severity</p>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={severityBreakdown}>
                    <XAxis dataKey="severity" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {severityBreakdown.map((entry, i) => (
                        <Cell key={i} fill={SEVERITY_COLORS[entry.severity] || "#94a3b8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Infection Trend */}
          {trendData.length > 1 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <p className="text-sm font-semibold text-slate-700">Device Infection Trend (Last 30 Days)</p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="detections" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* AV Signature Heatmap */}
          {heatmapDevices.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-orange-500" />
                  <p className="text-sm font-semibold text-slate-700">Antivirus Signature Freshness Heat Map</p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  {["≤1d", "≤3d", "≤7d", "≤14d", "≤30d", "≤60d", "≤90d", ">90d"].map((label, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="h-3 w-3 rounded-sm" style={{ background: HEAT_COLORS[i] }} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {heatmapDevices.map((d, i) => {
                  const days = d.daysSinceSignature;
                  const bg = heatColor(days);
                  const isRisk = days === null || days > 7;
                  return (
                    <div
                      key={i}
                      className="rounded-lg p-2.5 border transition-all hover:shadow-sm"
                      style={{ background: bg, borderColor: isRisk ? "#fca5a5" : "#e2e8f0" }}
                      title={`${d.name}\n${d.user}\nSignature: ${d.sigVersion || "?"}\nLast updated: ${days !== null ? `${days}d ago` : "Unknown"}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Monitor className="h-3 w-3 text-slate-600 shrink-0" />
                        <p className="text-[11px] font-semibold text-slate-800 truncate">{d.name}</p>
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">{d.user?.split("@")[0]}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-[10px] font-medium" style={{ color: isRisk ? "#b91c1c" : "#15803d" }}>
                          {days !== null ? `${days}d ago` : "Unknown"}
                        </p>
                        {d.rtpEnabled === false && (
                          <Badge className="text-[9px] px-1 py-0 bg-red-100 text-red-700 border-0">RTP off</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Raw Threat List */}
          {threats.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-sm font-semibold text-slate-700">All Detected Threats ({threats.length})</p>
              </div>
              <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                {threats.map((t, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3">
                    <div
                      className="h-2 w-2 rounded-full mt-2 shrink-0"
                      style={{ background: SEVERITY_COLORS[t.severity] || "#94a3b8" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{t.displayName || t.threatName || "Unknown"}</p>
                      <p className="text-xs text-slate-500 truncate">{t.deviceName} · {t.userPrincipalName}</p>
                      {t.detectedDateTime && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {format(new Date(t.detectedDateTime), "dd MMM yyyy HH:mm")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge
                        className="text-[10px] px-1.5 py-0 border-0"
                        style={{ background: SEVERITY_COLORS[t.severity] + "22", color: SEVERITY_COLORS[t.severity] }}
                      >
                        {t.severity || "unknown"}
                      </Badge>
                      {t.state && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-0">
                          {t.state}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }) {
  const colors = {
    slate: "bg-slate-50 border-slate-200 text-slate-800",
    red: "bg-red-50 border-red-200 text-red-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };
  return (
    <div className={`border rounded-xl p-4 flex items-start gap-3 ${colors[color]}`}>
      <Icon className="h-5 w-5 mt-0.5 shrink-0 opacity-70" />
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs font-medium mt-0.5 opacity-70">{label}</p>
      </div>
    </div>
  );
}