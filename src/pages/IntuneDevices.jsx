import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MonitorSmartphone, Search, RefreshCw, Trash2, ShieldOff, RotateCcw, ChevronDown } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import DeviceDetailPanel from "@/components/intune/DeviceDetailPanel";
import { format } from "date-fns";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

function fmt(v) {
  if (!v) return "—";
  try { return format(new Date(v), "PP"); } catch { return v; }
}

export default function IntuneDevices({ selectedTenant, tenants }) {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmDialog, setConfirmDialog] = useState(null); // { device, action }
  const [actionLoading, setActionLoading] = useState(null);

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

  const ACTION_CONFIG = {
    delete: {
      label: "Delete from Intune",
      description: "This will permanently remove the device record from Intune. The device will no longer be managed.",
      confirmLabel: "Delete Device",
      variant: "destructive",
      apiAction: "delete_intune_device",
    },
    retire: {
      label: "Retire Device",
      description: "Removes company data and unenrols the device from Intune. Personal data is preserved on personal devices.",
      confirmLabel: "Retire Device",
      variant: "destructive",
      apiAction: "retire_intune_device",
    },
    wipe: {
      label: "Wipe (Factory Reset)",
      description: "Performs a full factory reset. ALL data on the device will be erased. This cannot be undone.",
      confirmLabel: "Wipe Device",
      variant: "destructive",
      apiAction: "wipe_intune_device",
    },
    delete_autopilot: {
      label: "Remove from Autopilot",
      description: "Removes the device from Windows Autopilot. The device will need to be re-registered to use Autopilot again.",
      confirmLabel: "Remove from Autopilot",
      variant: "destructive",
      apiAction: "delete_autopilot_device",
    },
  };

  async function executeDeviceAction(device, action) {
    setActionLoading(device.id + action);
    try {
      const res = await base44.functions.invoke("portalData", {
        action: ACTION_CONFIG[action].apiAction,
        azure_tenant_id: azureTenantId,
        device_id: device.id,
      });
      if (!res.data?.success) {
        alert(`Failed: ${res.data?.error || "Unknown error"}`);
      } else {
        refetchGraph();
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
    setActionLoading(null);
    setConfirmDialog(null);
  }

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
                           <div className="flex items-center gap-1.5">
                             <Button size="sm" variant="outline"
                               onClick={() => setSelectedDevice({ ...d, graph_id: d.id, device_name: d.deviceName, os: d.operatingSystem, model: d.model })}>
                               View
                             </Button>
                             <DropdownMenu>
                               <DropdownMenuTrigger asChild>
                                 <Button size="sm" variant="outline" className="px-2">
                                   <ChevronDown className="h-3.5 w-3.5" />
                                 </Button>
                               </DropdownMenuTrigger>
                               <DropdownMenuContent align="end">
                                 <DropdownMenuItem
                                   className="text-amber-600"
                                   onClick={() => setConfirmDialog({ device: d, action: "retire" })}
                                 >
                                   <ShieldOff className="h-4 w-4 mr-2" /> Retire Device
                                 </DropdownMenuItem>
                                 <DropdownMenuItem
                                   className="text-orange-600"
                                   onClick={() => setConfirmDialog({ device: d, action: "wipe" })}
                                 >
                                   <RotateCcw className="h-4 w-4 mr-2" /> Wipe (Factory Reset)
                                 </DropdownMenuItem>
                                 <DropdownMenuSeparator />
                                 <DropdownMenuItem
                                   className="text-red-600"
                                   onClick={() => setConfirmDialog({ device: d, action: "delete" })}
                                 >
                                   <Trash2 className="h-4 w-4 mr-2" /> Delete from Intune
                                 </DropdownMenuItem>
                                 <DropdownMenuItem
                                   className="text-red-600"
                                   onClick={() => setConfirmDialog({ device: d, action: "delete_autopilot" })}
                                 >
                                   <Trash2 className="h-4 w-4 mr-2" /> Remove from Autopilot
                                 </DropdownMenuItem>
                               </DropdownMenuContent>
                             </DropdownMenu>
                           </div>
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

      {confirmDialog && (
        <AlertDialog open onOpenChange={() => setConfirmDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{ACTION_CONFIG[confirmDialog.action].label}</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-semibold text-slate-800">{confirmDialog.device.deviceName}</span>
                <br /><br />
                {ACTION_CONFIG[confirmDialog.action].description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={!!actionLoading}
                onClick={() => executeDeviceAction(confirmDialog.device, confirmDialog.action)}
              >
                {actionLoading ? "Processing..." : ACTION_CONFIG[confirmDialog.action].confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}