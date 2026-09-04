import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  LayoutDashboard, Building2, ShieldCheck, AlertTriangle,
  Activity, MonitorSmartphone, Terminal, Loader2, Search, Terminal as TerminalIcon,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import TenantHealthCard from "@/components/dashboard/TenantHealthCard";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/shared/StatusBadge";

const HOURS = 3600000;

function computeHealth(tenant, devices, telemetry, posture, scriptDeployments) {
  const tenantDevices = devices.filter(d => d.tenant_id === tenant.id);
  const totalDevices = tenantDevices.length;
  const compliantDevices = tenantDevices.filter(d => d.compliance_state === "compliant").length;
  const nonCompliantDevices = tenantDevices.filter(d => d.compliance_state === "non_compliant").length;
  const compliancePct = totalDevices > 0 ? Math.round((compliantDevices / totalDevices) * 100) : 0;

  const latestTelemetry = telemetry.find(t => t.tenant_id === tenant.id);
  const lastSync = latestTelemetry?.snapshot_time || null;
  const syncAgeH = lastSync ? (Date.now() - new Date(lastSync).getTime()) / HOURS : null;
  const syncStale = syncAgeH !== null && syncAgeH > 2;
  const syncCritical = syncAgeH !== null && syncAgeH > 6;
  const staleDevices = latestTelemetry?.stale_devices || 0;

  const postureScore = posture.find(p => p.tenant_id === tenant.id)?.score ?? null;

  const tenantScripts = scriptDeployments.filter(s => s.tenant_id === tenant.id);
  const pendingScripts = tenantScripts.filter(s => s.status === "pending").length;
  const runningScripts = tenantScripts.filter(s => s.status === "running").length;

  let level = "healthy";
  if (tenant.status !== "connected" || syncCritical || (totalDevices > 0 && compliancePct < 70) || (postureScore !== null && postureScore < 40)) {
    level = "critical";
  } else if (syncStale || (totalDevices > 0 && compliancePct < 90) || (postureScore !== null && postureScore < 70) || staleDevices > 0 || pendingScripts > 5) {
    level = "warning";
  } else if (totalDevices === 0 && !lastSync) {
    level = "unknown";
  }

  return {
    totalDevices, compliantDevices, nonCompliantDevices, compliancePct,
    lastSync, syncStale, staleDevices, postureScore,
    pendingScripts, runningScripts, level,
  };
}

export default function TenantHealthOverview() {
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");

  const { data: tenants = [], isLoading: tLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
    refetchInterval: 120000,
  });
  const { data: devices = [], isLoading: dLoading } = useQuery({
    queryKey: ["intune-devices-all"],
    queryFn: () => base44.entities.IntuneDevice.list("-created_date", 500),
    refetchInterval: 120000,
  });
  const { data: telemetry = [], isLoading: tmLoading } = useQuery({
    queryKey: ["telemetry-snapshots-all"],
    queryFn: () => base44.entities.TelemetrySnapshot.list("-snapshot_time", 200),
    refetchInterval: 120000,
  });
  const { data: posture = [], isLoading: pLoading } = useQuery({
    queryKey: ["security-posture-all"],
    queryFn: () => base44.entities.SecurityPostureSnapshot.list("-snapshot_date", 200),
    refetchInterval: 300000,
  });
  const { data: scriptDeployments = [], isLoading: sLoading } = useQuery({
    queryKey: ["script-deployments-all"],
    queryFn: () => base44.entities.ScriptDeployment.list("-deployed_date", 500),
    refetchInterval: 60000,
  });

  const loading = tLoading || dLoading || tmLoading || pLoading || sLoading;

  const connectedTenants = useMemo(() => tenants.filter(t => t.status === "connected"), [tenants]);

  const healthMap = useMemo(() => {
    const map = {};
    for (const t of connectedTenants) {
      map[t.id] = computeHealth(t, devices, telemetry, posture, scriptDeployments);
    }
    return map;
  }, [connectedTenants, devices, telemetry, posture, scriptDeployments]);

  // Aggregate pending/running script deployments with tenant + device info for the table
  const pendingDeployments = useMemo(() => {
    return scriptDeployments
      .filter(s => s.status === "pending" || s.status === "running")
      .map(s => {
        const tenant = tenants.find(t => t.id === s.tenant_id);
        return { ...s, tenant_name: tenant?.name || "Unknown", tenant_domain: tenant?.domain };
      })
      .sort((a, b) => new Date(b.deployed_date || 0) - new Date(a.deployed_date || 0));
  }, [scriptDeployments, tenants]);

  const totals = useMemo(() => {
    const levels = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
    let totalDevices = 0, totalPending = 0, totalRunning = 0, totalNonCompliant = 0, totalStale = 0;
    for (const t of connectedTenants) {
      const h = healthMap[t.id];
      if (!h) continue;
      levels[h.level]++;
      totalDevices += h.totalDevices;
      totalPending += h.pendingScripts;
      totalRunning += h.runningScripts;
      totalNonCompliant += h.nonCompliantDevices;
      totalStale += h.staleDevices;
    }
    return { levels, totalDevices, totalPending, totalRunning, totalNonCompliant, totalStale };
  }, [connectedTenants, healthMap]);

  const filteredTenants = useMemo(() => {
    return connectedTenants.filter(t => {
      const h = healthMap[t.id];
      if (levelFilter !== "all" && h?.level !== levelFilter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !t.domain.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [connectedTenants, healthMap, levelFilter, query]);

  const levelBadge = (key, count, cls) => (
    <button
      key={key}
      onClick={() => setLevelFilter(levelFilter === key ? "all" : key)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
        levelFilter === key ? cls + " ring-1 ring-offset-1" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span className="font-bold text-sm">{count}</span>
      <span className="capitalize">{key}</span>
    </button>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Tenant Health Overview"
        subtitle="Cross-tenant health status & pending script deployments in one view"
        icon={LayoutDashboard}
        actions={loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
      />

      {/* Summary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><Building2 className="h-4 w-4" /> Connected tenants</div>
          <p className="text-2xl font-bold text-slate-800">{connectedTenants.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><MonitorSmartphone className="h-4 w-4" /> Devices</div>
          <p className="text-2xl font-bold text-slate-800">{totals.totalDevices}</p>
          <p className="text-[11px] text-red-500">{totals.totalNonCompliant} non-compliant</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><AlertTriangle className="h-4 w-4" /> Stale devices</div>
          <p className="text-2xl font-bold text-slate-800">{totals.totalStale}</p>
          <p className="text-[11px] text-slate-400">no check-in {">"} 8h</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><Activity className="h-4 w-4 text-amber-500" /> Pending scripts</div>
          <p className="text-2xl font-bold text-slate-800">{totals.totalPending}</p>
          <p className="text-[11px] text-blue-500">{totals.totalRunning} running</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Healthy tenants</div>
          <p className="text-2xl font-bold text-emerald-600">{totals.levels.healthy}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tenants..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {levelBadge("healthy", totals.levels.healthy, "bg-emerald-50 border-emerald-200 text-emerald-700")}
          {levelBadge("warning", totals.levels.warning, "bg-amber-50 border-amber-200 text-amber-700")}
          {levelBadge("critical", totals.levels.critical, "bg-red-50 border-red-200 text-red-700")}
          {levelBadge("unknown", totals.levels.unknown, "bg-slate-50 border-slate-200 text-slate-600")}
        </div>
      </div>

      {/* Tenant cards grid */}
      {loading && connectedTenants.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filteredTenants.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          {connectedTenants.length === 0 ? "No connected tenants yet." : "No tenants match the current filter."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {filteredTenants.map(t => (
            <TenantHealthCard key={t.id} tenant={t} health={healthMap[t.id]} />
          ))}
        </div>
      )}

      {/* Pending script deployments table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            <TerminalIcon className="h-4 w-4 text-blue-600" /> Pending & Running Script Deployments
          </h3>
          <Link to={createPageUrl("DeviceScripts")} className="text-xs text-blue-600 hover:underline">Manage scripts →</Link>
        </div>
        {pendingDeployments.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">No pending or running script deployments across tenants.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Tenant</th>
                  <th className="text-left px-5 py-2.5 font-medium">Device</th>
                  <th className="text-left px-5 py-2.5 font-medium">Deployed</th>
                  <th className="text-left px-5 py-2.5 font-medium">Status</th>
                  <th className="text-left px-5 py-2.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingDeployments.slice(0, 25).map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-slate-800">{s.tenant_name}</p>
                      <p className="text-xs text-slate-400">{s.tenant_domain}</p>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600">{s.device_name || s.device_id}</td>
                    <td className="px-5 py-2.5 text-slate-500 text-xs">{s.deployed_date || "—"}</td>
                    <td className="px-5 py-2.5"><StatusBadge status={s.status} /></td>
                    <td className="px-5 py-2.5 text-xs text-slate-500 max-w-xs truncate">{s.result_message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}