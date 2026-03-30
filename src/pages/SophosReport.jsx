import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Shield, CheckCircle2, XCircle, RefreshCw, Download, Search, Loader2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportToCSV } from "@/components/shared/exportUtils";

const SOPHOS_KEYWORDS = ["sophos", "sophos endpoint", "sophos agent", "sophos anti-virus", "sophos intercept"];

export default function SophosReport({ selectedTenant }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | detected | missing

  const azureTenantId = selectedTenant?.tenant_id;

  // Step 1: get all devices
  const { data: devicesResult, isLoading: loadingDevices, refetch } = useQuery({
    queryKey: ["sophos-devices", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "list_intune_devices",
        azure_tenant_id: azureTenantId,
        top: 200,
      }).then(r => r.data),
  });
  const devices = devicesResult?.devices || [];

  // Step 2: for each device fetch installed apps (batched, max 50 at a time to avoid overloading)
  const [scanResults, setScanResults] = useState(null);
  const [scanning, setScanning] = useState(false);

  const runScan = async () => {
    setScanning(true);
    setScanResults(null);
    const results = [];
    const batch = devices.slice(0, 100); // cap at 100 devices
    await Promise.all(
      batch.map(async (device) => {
        try {
          const res = await base44.functions.invoke("portalData", {
            action: "get_device_installed_apps",
            azure_tenant_id: azureTenantId,
            device_id: device.id,
          });
          const data = res.data || {};
          results.push({
            deviceId: device.id,
            deviceName: device.deviceName,
            user: device.userPrincipalName || "—",
            os: device.operatingSystem,
            osVersion: device.osVersion,
            model: `${device.manufacturer || ""} ${device.model || ""}`.trim(),
            complianceState: device.complianceState,
            sophosFound: data.sophosAgentFound || false,
            sophosName: data.sophosAgentDetails?.displayName || "",
            sophosVersion: data.sophosAgentDetails?.version || "",
          });
        } catch {
          results.push({
            deviceId: device.id,
            deviceName: device.deviceName,
            user: device.userPrincipalName || "—",
            os: device.operatingSystem,
            osVersion: device.osVersion,
            model: `${device.manufacturer || ""} ${device.model || ""}`.trim(),
            complianceState: device.complianceState,
            sophosFound: false,
            sophosName: "",
            sophosVersion: "",
            scanError: true,
          });
        }
      })
    );
    setScanResults(results);
    setScanning(false);
  };

  const filtered = (scanResults || []).filter(r => {
    if (filter === "detected" && !r.sophosFound) return false;
    if (filter === "missing" && r.sophosFound) return false;
    if (search && !r.deviceName?.toLowerCase().includes(search.toLowerCase()) && !r.user?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const detectedCount = (scanResults || []).filter(r => r.sophosFound).length;
  const missingCount = (scanResults || []).filter(r => !r.sophosFound).length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Sophos Agent Report"
        subtitle={selectedTenant ? `Scanning devices in ${selectedTenant.name}` : "Select a tenant to begin"}
        icon={Shield}
        actions={
          <div className="flex gap-2">
            {scanResults && (
              <Button variant="outline" size="sm" onClick={() => exportToCSV(filtered, "sophos_report")} className="gap-2">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            )}
            <Button
              size="sm"
              onClick={runScan}
              disabled={!azureTenantId || loadingDevices || scanning}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {scanning ? "Scanning..." : scanResults ? "Re-scan" : "Run Scan"}
            </Button>
          </div>
        }
      />

      {!azureTenantId && (
        <div className="text-center py-16 text-slate-400 text-sm">Select a tenant from the sidebar to run the Sophos scan.</div>
      )}

      {azureTenantId && !scanning && !scanResults && (
        <div className="text-center py-16">
          <Shield className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium mb-1">Ready to scan {devices.length} device{devices.length !== 1 ? "s" : ""}</p>
          <p className="text-sm text-slate-400 mb-6">Checks each device's installed apps for Sophos Endpoint Agent</p>
          <Button onClick={runScan} disabled={loadingDevices} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            {loadingDevices ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            {loadingDevices ? "Loading devices..." : "Start Scan"}
          </Button>
        </div>
      )}

      {scanning && (
        <div className="text-center py-16">
          <Loader2 className="h-10 w-10 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Scanning {devices.length} devices for Sophos Agent...</p>
          <p className="text-sm text-slate-400 mt-1">This may take a moment</p>
        </div>
      )}

      {scanResults && !scanning && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Scanned</p>
              <p className="text-2xl font-bold text-slate-800">{scanResults.length}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-xs text-emerald-600 uppercase tracking-wide mb-1">Sophos Detected</p>
              <p className="text-2xl font-bold text-emerald-700">{detectedCount}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs text-red-600 uppercase tracking-wide mb-1">Missing Sophos</p>
              <p className="text-2xl font-bold text-red-700">{missingCount}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search devices or users..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-1">
              {[["all", "All"], ["detected", "Detected"], ["missing", "Missing"]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === val ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">{filtered.length} devices</span>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Device", "User", "OS / Version", "Model", "Sophos Status", "Product Name", "Version"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">No results</td></tr>
                ) : filtered.map(r => (
                  <tr key={r.deviceId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.deviceName}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{r.user}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{r.os}<br /><span className="text-slate-400">{r.osVersion}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{r.model}</td>
                    <td className="px-4 py-3">
                      {r.scanError ? (
                        <Badge className="bg-amber-100 text-amber-700">Scan Error</Badge>
                      ) : r.sophosFound ? (
                        <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" />Detected</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 gap-1"><XCircle className="h-3 w-3" />Not Found</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{r.sophosName || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{r.sophosVersion || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}