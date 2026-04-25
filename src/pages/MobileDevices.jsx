import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Smartphone, RefreshCw, Loader2, Search, Apple, CheckCircle2, XCircle, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";
import { format } from "date-fns";

function fmt(v) {
  if (!v) return "—";
  try { return format(new Date(v), "PP"); } catch { return v; }
}

const platformIcon = (p) => {
  if (p === "iOS" || p === "iPadOS") return <Apple className="h-4 w-4 text-slate-500" />;
  return <Smartphone className="h-4 w-4 text-emerald-600" />;
};

const platformColors = {
  Android: "bg-emerald-50 text-emerald-700 border-emerald-200",
  iOS: "bg-slate-100 text-slate-700 border-slate-200",
  iPadOS: "bg-blue-50 text-blue-700 border-blue-200",
};

function CompBadge({ state }) {
  const map = {
    compliant: "bg-emerald-100 text-emerald-700",
    noncompliant: "bg-red-100 text-red-700",
    inGracePeriod: "bg-amber-100 text-amber-700",
    unknown: "bg-slate-100 text-slate-500",
  };
  return <Badge className={`${map[state] || "bg-slate-100 text-slate-500"} border-0 text-xs`}>{state || "Unknown"}</Badge>;
}

export default function MobileDevices({ selectedTenant, tenants }) {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [compliance, setCompliance] = useState("all");
  const [tab, setTab] = useState("live");

  const azureTenantId = selectedTenant?.tenant_id;

  // Live from Intune Graph
  const { data: liveData, isLoading: loadingLive, refetch } = useQuery({
    queryKey: ["mobile_devices_live", azureTenantId],
    enabled: !!azureTenantId && tab === "live",
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "sync_mobile_devices",
        azure_tenant_id: azureTenantId,
      }).then(r => r.data),
  });

  const liveDevices = (liveData?.devices || []).filter(d => {
    if (platform !== "all" && d.operatingSystem !== platform) return false;
    if (compliance !== "all" && d.complianceState !== compliance) return false;
    if (search) {
      const s = search.toLowerCase();
      return (d.deviceName || "").toLowerCase().includes(s) ||
        (d.userPrincipalName || "").toLowerCase().includes(s) ||
        (d.model || "").toLowerCase().includes(s) ||
        (d.serialNumber || "").toLowerCase().includes(s);
    }
    return true;
  });

  const stats = {
    total: (liveData?.devices || []).length,
    android: (liveData?.devices || []).filter(d => d.operatingSystem === "Android").length,
    ios: (liveData?.devices || []).filter(d => d.operatingSystem === "iOS" || d.operatingSystem === "iPadOS").length,
    nonCompliant: (liveData?.devices || []).filter(d => d.complianceState === "noncompliant").length,
    jailbroken: (liveData?.devices || []).filter(d => d.jailBroken === "True" || d.jailBroken === true).length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Mobile Devices"
        subtitle={selectedTenant ? `iOS & Android devices in ${selectedTenant.name}` : "Select a tenant"}
        icon={Smartphone}
        actions={
          <div className="flex gap-2">
            {liveData?.devices?.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => exportToCSV(liveDevices, "mobile_devices")} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loadingLive || !azureTenantId} className="gap-1.5">
              {loadingLive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh from Intune
            </Button>
          </div>
        }
      />

      {!azureTenantId && (
        <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
          Select a tenant to view live mobile device data from Intune.
        </div>
      )}

      {azureTenantId && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            {[
              { label: "Total", value: stats.total, color: "text-slate-800" },
              { label: "Android", value: stats.android, color: "text-emerald-600" },
              { label: "iOS / iPadOS", value: stats.ios, color: "text-slate-600" },
              { label: "Non-Compliant", value: stats.nonCompliant, color: "text-red-600" },
              { label: "Jailbroken / Rooted", value: stats.jailbroken, color: "text-amber-600" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input placeholder="Search devices, users, models..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="Platform" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="Android">Android</SelectItem>
                <SelectItem value="iOS">iOS</SelectItem>
                <SelectItem value="iPadOS">iPadOS</SelectItem>
              </SelectContent>
            </Select>
            <Select value={compliance} onValueChange={setCompliance}>
              <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="Compliance" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Compliance</SelectItem>
                <SelectItem value="compliant">Compliant</SelectItem>
                <SelectItem value="noncompliant">Non-Compliant</SelectItem>
                <SelectItem value="inGracePeriod">Grace Period</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-slate-400 self-center">{liveDevices.length} devices</span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {["Device", "Platform", "User", "OS Version", "Model", "Compliance", "Encrypted", "Last Sync", "Enrolled"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingLive ? (
                    <tr><td colSpan={9} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400 mx-auto" /></td></tr>
                  ) : liveDevices.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12 text-slate-400 text-sm">No mobile devices found. Click Refresh to load from Intune.</td></tr>
                  ) : liveDevices.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {platformIcon(d.operatingSystem)}
                          <div>
                            <div className="font-medium text-slate-800 text-xs">{d.deviceName}</div>
                            <div className="text-xs text-slate-400">{d.serialNumber || d.imei || "-"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`${platformColors[d.operatingSystem] || "bg-slate-100 text-slate-600 border-slate-200"} text-xs`}>
                          {d.operatingSystem}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{d.userPrincipalName || "-"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{d.osVersion || "-"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{d.manufacturer ? `${d.manufacturer} ${d.model}` : d.model || "-"}</td>
                      <td className="px-4 py-3"><CompBadge state={d.complianceState} /></td>
                      <td className="px-4 py-3">
                        {d.isEncrypted
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <XCircle className="h-4 w-4 text-red-400" />}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmt(d.lastSyncDateTime)}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmt(d.enrolledDateTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {liveDevices.length === 0 && !loadingLive && (
            <div className="mt-4 text-center">
              <p className="text-xs text-slate-400">Requires <code className="bg-slate-100 px-1 rounded">DeviceManagementManagedDevices.Read.All</code> Graph permission.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}