import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, CheckCircle2, XCircle, AlertTriangle, Upload, RefreshCw, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import OnboardIntuneDialog from "@/components/entra/OnboardIntuneDialog";

function TrustBadge({ trustType }) {
  const map = {
    ServerAd: { label: "Hybrid Joined", cls: "bg-purple-100 text-purple-700" },
    AzureAd: { label: "Azure AD Joined", cls: "bg-blue-100 text-blue-700" },
    Workplace: { label: "Registered", cls: "bg-slate-100 text-slate-600" },
  };
  const cfg = map[trustType] || { label: trustType || "Unknown", cls: "bg-slate-100 text-slate-500" };
  return <Badge className={`border-0 text-xs ${cfg.cls}`}>{cfg.label}</Badge>;
}

export default function HybridDeviceScanner({ selectedTenant }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("eligible"); // eligible | managed | ineligible | all
  const [search, setSearch] = useState("");
  const [onboardDevice, setOnboardDevice] = useState(null);

  const azureTenantId = selectedTenant?.tenant_id;

  const runScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("hybridAnalyzer", {
        action: "scan_eligible_devices",
        azure_tenant_id: azureTenantId,
      });
      setResult(res.data);
    } catch (e) {
      setError(e.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const getFilteredDevices = () => {
    const pool = filter === "eligible" ? result?.eligible
      : filter === "managed" ? result?.alreadyManaged
      : filter === "ineligible" ? result?.ineligible
      : result?.results || [];

    if (!pool) return [];
    if (!search.trim()) return pool;
    const q = search.toLowerCase();
    return pool.filter(d => d.displayName?.toLowerCase().includes(q) || d.operatingSystem?.toLowerCase().includes(q));
  };

  const devices = getFilteredDevices();

  return (
    <div className="space-y-5">
      {/* Header controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">Intune Onboarding Device Scanner</p>
          <p className="text-xs text-slate-400">Scans all Entra AD devices and identifies which are eligible for Intune enrollment</p>
        </div>
        <Button onClick={runScan} disabled={scanning || !azureTenantId} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {scanning ? "Scanning…" : result ? "Re-scan" : "Scan Devices"}
        </Button>
      </div>

      {scanning && (
        <div className="text-center py-16 space-y-3">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto" />
          <p className="text-sm font-medium text-slate-700">Scanning Entra ID devices…</p>
          <p className="text-xs text-slate-400">Comparing Entra devices against Intune managed devices…</p>
        </div>
      )}

      {error && !scanning && (
        <div className="text-center py-12 space-y-3">
          <XCircle className="h-10 w-10 text-red-400 mx-auto" />
          <p className="text-sm text-red-600">{error}</p>
          <Button variant="outline" onClick={runScan} className="gap-2"><RefreshCw className="h-4 w-4" />Retry</Button>
        </div>
      )}

      {!result && !scanning && !error && (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl space-y-4">
          <MonitorSmartphone className="h-12 w-12 text-slate-300 mx-auto" />
          <div>
            <p className="text-sm font-semibold text-slate-600">No scan run yet</p>
            <p className="text-xs text-slate-400 mt-1">Click "Scan Devices" to find all Entra devices eligible for Intune onboarding.</p>
          </div>
        </div>
      )}

      {result && !scanning && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: "eligible", label: "Eligible for Intune", count: result.eligible?.length, icon: CheckCircle2, color: "emerald" },
              { key: "managed", label: "Already in Intune", count: result.alreadyManaged?.length, icon: CheckCircle2, color: "blue" },
              { key: "ineligible", label: "Not Eligible", count: result.ineligible?.length, icon: XCircle, color: "red" },
              { key: "all", label: "Total Devices", count: result.total, icon: MonitorSmartphone, color: "slate" },
            ].map(card => {
              const Icon = card.icon;
              const colorMap = {
                emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
                blue: "border-blue-200 bg-blue-50 text-blue-700",
                red: "border-red-200 bg-red-50 text-red-700",
                slate: "border-slate-200 bg-slate-50 text-slate-700",
              };
              return (
                <button
                  key={card.key}
                  onClick={() => setFilter(card.key)}
                  className={`p-4 border rounded-xl text-left transition-all ${colorMap[card.color]} ${filter === card.key ? "ring-2 ring-offset-1 ring-current" : "hover:opacity-80"}`}
                >
                  <p className="text-2xl font-extrabold">{card.count ?? 0}</p>
                  <p className="text-xs font-medium mt-0.5">{card.label}</p>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search devices…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Device table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {filter === "eligible" ? "Eligible Devices" : filter === "managed" ? "Already Managed" : filter === "ineligible" ? "Ineligible Devices" : "All Devices"}
                <span className="ml-2 font-normal normal-case">({devices.length})</span>
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Device Name", "OS / Version", "Join Type", "Managed", "Recent Activity", "Eligibility", "Action"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400 text-sm">No devices in this category</td></tr>
                ) : devices.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-medium text-slate-800">{d.displayName}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      {d.operatingSystem}
                      {d.osVersion && <span className="block text-slate-400">{d.osVersion}</span>}
                    </td>
                    <td className="px-3 py-3"><TrustBadge trustType={d.trustType} /></td>
                    <td className="px-3 py-3">
                      <Badge className={d.isManaged ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                        {d.isManaged ? "Yes" : "No"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={d.recentActivity ? "bg-emerald-50 text-emerald-700 border-0" : "bg-amber-50 text-amber-700 border-0"}>
                        {d.recentActivity ? "Active (90d)" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      {d.alreadyInIntune ? (
                        <Badge className="bg-blue-100 text-blue-700 border-0 text-xs gap-1">
                          <CheckCircle2 className="h-3 w-3" />In Intune
                        </Badge>
                      ) : d.eligible ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs gap-1">
                          <CheckCircle2 className="h-3 w-3" />Eligible
                        </Badge>
                      ) : (
                        <div>
                          <Badge className="bg-red-100 text-red-700 border-0 text-xs">Not Eligible</Badge>
                          {d.reasons?.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-0.5">{d.reasons.join(", ")}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {d.eligible && !d.alreadyInIntune && (
                        <Button
                          size="sm"
                          className="text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white gap-1"
                          onClick={() => setOnboardDevice({ id: d.id, displayName: d.displayName, operatingSystem: d.operatingSystem })}
                        >
                          <Upload className="h-3 w-3" />Onboard
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {onboardDevice && (
        <OnboardIntuneDialog
          device={onboardDevice}
          selectedTenant={selectedTenant}
          onClose={() => setOnboardDevice(null)}
        />
      )}
    </div>
  );
}