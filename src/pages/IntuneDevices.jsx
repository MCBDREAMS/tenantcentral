import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MonitorSmartphone, Search, RefreshCw } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import DeviceDetailPanel from "@/components/intune/DeviceDetailPanel";
import { format } from "date-fns";

function fmt(v) {
  if (!v) return "—";
  try { return format(new Date(v), "PP"); } catch { return v; }
}

export default function IntuneDevices({ selectedTenant, tenants }) {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: devices = [] } = useQuery({
    queryKey: ['intune-devices', selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.IntuneDevice.filter({ tenant_id: selectedTenant.id })
      : base44.entities.IntuneDevice.list(),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list(),
  });

  // Live Graph devices
  const azureTenantId = selectedTenant?.tenant_id;
  const { data: graphResult, isLoading: loadingGraph, refetch: refetchGraph } = useQuery({
    queryKey: ['graph-intune-devices', azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "list_intune_devices",
        azure_tenant_id: azureTenantId,
        top: 100,
      }).then(r => r.data),
  });
  const graphDevices = graphResult?.devices || [];

  const filteredGraphDevices = graphDevices.filter(d =>
    !searchTerm ||
    d.deviceName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.userPrincipalName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.model?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTenantName = (tid) => allTenants.find(t => t.id === tid)?.name || tid;

  const localColumns = [
    { header: "Device", accessor: "device_name", render: (r) => <span className="font-medium text-slate-800">{r.device_name}</span> },
    { header: "OS", accessor: "os" },
    { header: "Compliance", accessor: "compliance_state", render: (r) => <StatusBadge status={r.compliance_state} /> },
    { header: "Ownership", accessor: "ownership", render: (r) => <StatusBadge status={r.ownership} /> },
    { header: "User", accessor: "primary_user", render: (r) => <span className="text-xs text-slate-500">{r.primary_user || "—"}</span> },
    { header: "Model", accessor: "model" },
    { header: "Serial", accessor: "serial_number", render: (r) => <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{r.serial_number}</code> },
    { header: "Tenant", accessor: "tenant_id", render: (r) => <span className="text-xs text-slate-500">{getTenantName(r.tenant_id)}</span> },
  ];

  function ComplianceBadge({ state }) {
    const map = {
      compliant: "bg-emerald-100 text-emerald-700",
      noncompliant: "bg-red-100 text-red-700",
      error: "bg-red-100 text-red-700",
      inGracePeriod: "bg-amber-100 text-amber-700",
      unknown: "bg-slate-100 text-slate-500",
    };
    return <Badge className={map[state] || "bg-slate-100 text-slate-500 text-xs"}>{state || "Unknown"}</Badge>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Intune Devices"
        subtitle={selectedTenant ? `Devices in ${selectedTenant.name}` : "All managed devices"}
        icon={MonitorSmartphone}
      />

      <Tabs defaultValue={azureTenantId ? "live" : "local"}>
        <TabsList className="mb-4">
          <TabsTrigger value="live">Live from Graph {azureTenantId ? "" : "(select tenant)"}</TabsTrigger>
          <TabsTrigger value="local">Synced Records</TabsTrigger>
        </TabsList>

        {/* LIVE TAB */}
        <TabsContent value="live">
          {!azureTenantId ? (
            <div className="text-sm text-slate-500 py-8 text-center">Select a tenant to query live Intune device data from Microsoft Graph.</div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search devices..."
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchGraph()} disabled={loadingGraph}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${loadingGraph ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <span className="text-xs text-slate-400">{filteredGraphDevices.length} devices</span>
              </div>

              {loadingGraph ? (
                <div className="text-center py-10 text-sm text-slate-400">Loading devices from Microsoft Graph...</div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {["Device Name", "OS / Version", "User", "Model", "Compliance", "Last Sync", "Actions"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredGraphDevices.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-8 text-slate-400">No devices found</td></tr>
                      ) : filteredGraphDevices.map(d => (
                        <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-800">{d.deviceName}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{d.operatingSystem}<br /><span className="text-slate-400">{d.osVersion}</span></td>
                          <td className="px-4 py-3 text-xs text-slate-500">{d.userPrincipalName || "—"}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{d.manufacturer} {d.model}</td>
                          <td className="px-4 py-3"><ComplianceBadge state={d.complianceState} /></td>
                          <td className="px-4 py-3 text-xs text-slate-400">{fmt(d.lastSyncDateTime)}</td>
                          <td className="px-4 py-3">
                            <Button size="sm" variant="outline"
                              onClick={() => setSelectedDevice({ ...d, graph_id: d.id, device_name: d.deviceName, os: d.operatingSystem, model: d.model })}>
                              View Details
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* LOCAL TAB */}
        <TabsContent value="local">
          <DataTable
            columns={localColumns}
            data={devices}
            onExport={(d) => exportToCSV(d, "intune_devices")}
            emptyMessage="No devices found"
          />
        </TabsContent>
      </Tabs>

      {selectedDevice && azureTenantId && (
        <DeviceDetailPanel
          device={selectedDevice}
          azureTenantId={azureTenantId}
          onClose={() => setSelectedDevice(null)}
        />
      )}
    </div>
  );
}