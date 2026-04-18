import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Globe, Monitor, Smartphone, Laptop, RefreshCw, Search } from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// Country code → approx lat/lon centroid
const COUNTRY_COORDS = {
  ZA: [-30.5595, 22.9375], US: [37.09, -95.71], GB: [55.37, -3.43], DE: [51.16, 10.45],
  AU: [-25.27, 133.77], CA: [56.13, -106.34], FR: [46.22, 2.21], NL: [52.13, 5.29],
  IN: [20.59, 78.96], SG: [1.35, 103.81], JP: [36.20, 138.25], BR: [14.23, -51.92],
  MX: [23.63, -102.55], IT: [41.87, 12.56], ES: [40.46, -3.74], PL: [51.91, 19.14],
  SE: [60.12, 18.64], NO: [60.47, 8.46], CH: [46.81, 8.22], AT: [47.51, 14.55],
  BE: [50.50, 4.46], DK: [56.26, 9.50], FI: [61.92, 25.74], PT: [39.39, -8.22],
  NZ: [-40.90, 174.88], IE: [53.41, -8.24], HK: [22.39, 114.10], MY: [4.21, 101.97],
  AE: [23.42, 53.84], KE: [-0.02, 37.90], NG: [9.08, 8.67], GH: [7.94, -1.02],
  EG: [26.82, 30.80], SA: [23.88, 45.07], IL: [31.04, 34.85], TR: [38.96, 35.24],
  RU: [61.52, 105.31], CN: [35.86, 104.19], KR: [35.90, 127.76], TH: [15.87, 100.99],
  ID: [-0.78, 113.92], PH: [12.87, 121.77], PK: [30.37, 69.34], NG: [9.08, 8.68],
};

function getCountryFromDevice(device) {
  // Try to extract country from location-related fields
  if (device.country_code) return device.country_code.toUpperCase();
  if (device.location) {
    const match = device.location.match(/\b([A-Z]{2})\b/);
    if (match) return match[1];
  }
  return null;
}

function DeviceTypeIcon({ os }) {
  if (!os) return <Monitor className="h-3.5 w-3.5" />;
  const o = os.toLowerCase();
  if (o.includes("ios") || o.includes("android") || o.includes("ipad")) return <Smartphone className="h-3.5 w-3.5" />;
  if (o.includes("mac")) return <Laptop className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

const COMPLIANCE_COLOR = {
  compliant: "#10b981",
  non_compliant: "#ef4444",
  noncompliant: "#ef4444",
  in_grace_period: "#f59e0b",
  inGracePeriod: "#f59e0b",
  not_evaluated: "#94a3b8",
  unknown: "#94a3b8",
};

export default function NetworkMap({ selectedTenant, tenants }) {
  const [search, setSearch] = useState("");

  // Fetch local IntuneDevice records
  const { data: devices = [], refetch, isLoading } = useQuery({
    queryKey: ["network-map-devices", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.IntuneDevice.filter({ tenant_id: selectedTenant.id })
      : base44.entities.IntuneDevice.list(),
  });

  // Fetch MobileDevices too
  const { data: mobileDevices = [] } = useQuery({
    queryKey: ["network-map-mobile", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.MobileDevice.filter({ tenant_id: selectedTenant.id })
      : base44.entities.MobileDevice.list(),
  });

  // Also fetch live Graph data if tenant has azure_tenant_id
  const azureTenantId = selectedTenant?.tenant_id;
  const { data: graphResult, isLoading: loadingGraph } = useQuery({
    queryKey: ["network-map-graph", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () => base44.functions.invoke("portalData", {
      action: "list_intune_devices",
      azure_tenant_id: azureTenantId,
      top: 200,
    }).then(r => r.data),
  });
  const graphDevices = graphResult?.devices || [];

  // Normalise all devices into a unified shape
  const allDevices = useMemo(() => {
    const local = [...devices, ...mobileDevices].map(d => ({
      id: d.id,
      name: d.device_name,
      os: d.os || d.platform,
      user: d.primary_user,
      compliance: d.compliance_state,
      country: getCountryFromDevice(d),
      source: "local",
      model: d.model,
    }));

    const graph = graphDevices.map(d => ({
      id: d.id,
      name: d.deviceName,
      os: d.operatingSystem,
      user: d.userPrincipalName,
      compliance: d.complianceState,
      country: null, // Graph doesn't return country directly
      source: "graph",
      model: `${d.manufacturer || ""} ${d.model || ""}`.trim(),
    }));

    // Merge preferring local (which may have country info)
    const merged = [...local];
    graph.forEach(g => {
      if (!merged.find(l => l.name?.toLowerCase() === g.name?.toLowerCase())) {
        merged.push(g);
      }
    });
    return merged;
  }, [devices, mobileDevices, graphDevices]);

  const filtered = useMemo(() => {
    if (!search) return allDevices;
    const s = search.toLowerCase();
    return allDevices.filter(d =>
      d.name?.toLowerCase().includes(s) ||
      d.user?.toLowerCase().includes(s) ||
      d.os?.toLowerCase().includes(s) ||
      d.country?.toLowerCase().includes(s)
    );
  }, [allDevices, search]);

  // Group by country for map markers
  const countryGroups = useMemo(() => {
    const groups = {};
    filtered.forEach(d => {
      const cc = d.country || "UNKNOWN";
      if (!groups[cc]) groups[cc] = [];
      groups[cc].push(d);
    });
    return groups;
  }, [filtered]);

  const complianceStats = useMemo(() => {
    const total = filtered.length;
    const compliant = filtered.filter(d => d.compliance === "compliant").length;
    const nonCompliant = filtered.filter(d => ["non_compliant", "noncompliant"].includes(d.compliance)).length;
    const unknown = total - compliant - nonCompliant;
    return { total, compliant, nonCompliant, unknown };
  }, [filtered]);

  const knownCountries = Object.entries(countryGroups).filter(([cc]) => COUNTRY_COORDS[cc]);
  const unknownDevices = countryGroups["UNKNOWN"] || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Network Map"
        subtitle={selectedTenant ? `Device locations for ${selectedTenant.name}` : "All tenant device locations"}
        icon={Globe}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading || loadingGraph} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${(isLoading || loadingGraph) ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Devices", value: complianceStats.total, color: "text-slate-800" },
          { label: "Compliant", value: complianceStats.compliant, color: "text-emerald-600" },
          { label: "Non-Compliant", value: complianceStats.nonCompliant, color: "text-red-500" },
          { label: "Countries", value: knownCountries.length, color: "text-blue-600" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="map">
        <TabsList className="mb-4">
          <TabsTrigger value="map" className="gap-2"><Globe className="h-3.5 w-3.5" />World Map</TabsTrigger>
          <TabsTrigger value="country" className="gap-2"><MapPin className="h-3.5 w-3.5" />By Country</TabsTrigger>
          <TabsTrigger value="devices" className="gap-2"><Monitor className="h-3.5 w-3.5" />All Devices</TabsTrigger>
        </TabsList>

        {/* MAP TAB */}
        <TabsContent value="map">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden" style={{ height: 520 }}>
            <MapContainer center={[20, 10]} zoom={2} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
              />
              {knownCountries.map(([cc, devs]) => {
                const coords = COUNTRY_COORDS[cc];
                const compliantCount = devs.filter(d => d.compliance === "compliant").length;
                const ratio = devs.length > 0 ? compliantCount / devs.length : 0;
                const color = ratio > 0.8 ? "#10b981" : ratio > 0.5 ? "#f59e0b" : "#ef4444";
                return (
                  <CircleMarker
                    key={cc}
                    center={coords}
                    radius={Math.min(8 + devs.length * 2, 30)}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.7, weight: 2 }}
                  >
                    <Tooltip>{cc} — {devs.length} device{devs.length !== 1 ? "s" : ""}</Tooltip>
                    <Popup>
                      <div className="text-sm min-w-[160px]">
                        <p className="font-semibold mb-1">{cc} — {devs.length} devices</p>
                        <p className="text-xs text-green-600">✓ Compliant: {compliantCount}</p>
                        <p className="text-xs text-red-500">✗ Non-compliant: {devs.length - compliantCount}</p>
                        <div className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
                          {devs.map(d => <p key={d.id} className="text-xs text-gray-600">• {d.name}</p>)}
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
          {unknownDevices.length > 0 && (
            <p className="text-xs text-slate-400 mt-2">
              {unknownDevices.length} device(s) have no country data and are not shown on the map. Assign a country_code field to display them.
            </p>
          )}
        </TabsContent>

        {/* BY COUNTRY TAB */}
        <TabsContent value="country">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(countryGroups)
              .sort((a, b) => b[1].length - a[1].length)
              .map(([cc, devs]) => {
                const compliant = devs.filter(d => d.compliance === "compliant").length;
                const coords = COUNTRY_COORDS[cc];
                return (
                  <div key={cc} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-500" />
                        <span className="font-semibold text-slate-800">{cc === "UNKNOWN" ? "Unknown Location" : cc}</span>
                        {coords && <span className="text-xs text-slate-400">{coords[0].toFixed(1)}°, {coords[1].toFixed(1)}°</span>}
                      </div>
                      <Badge className="bg-blue-50 text-blue-700 border-0">{devs.length}</Badge>
                    </div>
                    <div className="flex gap-4 text-xs mb-3">
                      <span className="text-emerald-600">✓ {compliant} compliant</span>
                      <span className="text-red-500">✗ {devs.length - compliant} non-compliant</span>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {devs.slice(0, 6).map(d => (
                        <div key={d.id} className="flex items-center gap-2 text-xs text-slate-600">
                          <DeviceTypeIcon os={d.os} />
                          <span className="truncate">{d.name}</span>
                          <div className="ml-auto h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COMPLIANCE_COLOR[d.compliance] || "#94a3b8" }} />
                        </div>
                      ))}
                      {devs.length > 6 && <p className="text-xs text-slate-400">+{devs.length - 6} more...</p>}
                    </div>
                  </div>
                );
              })}
            {Object.keys(countryGroups).length === 0 && (
              <div className="col-span-3 text-center py-12 text-slate-400 text-sm">No device location data available</div>
            )}
          </div>
        </TabsContent>

        {/* ALL DEVICES TAB */}
        <TabsContent value="devices">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-slate-100">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search devices..." className="pl-8 h-8 text-sm" />
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Device", "OS", "User", "Country / Location", "Compliance", "Model"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400">No devices found</td></tr>
                ) : filtered.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-800 flex items-center gap-2">
                      <DeviceTypeIcon os={d.os} />
                      {d.name}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{d.os || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{d.user || "—"}</td>
                    <td className="px-4 py-3">
                      {d.country ? (
                        <span className="flex items-center gap-1 text-xs text-slate-600">
                          <MapPin className="h-3 w-3 text-blue-400" />{d.country}
                          {COUNTRY_COORDS[d.country] && <span className="text-slate-400">({COUNTRY_COORDS[d.country][0].toFixed(1)}°, {COUNTRY_COORDS[d.country][1].toFixed(1)}°)</span>}
                        </span>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: (COMPLIANCE_COLOR[d.compliance] || "#94a3b8") + "22", color: COMPLIANCE_COLOR[d.compliance] || "#94a3b8" }}>
                        {d.compliance || "unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{d.model || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}