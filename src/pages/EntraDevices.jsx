import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Monitor, RefreshCw, Loader2, UserPlus, CheckCircle2, XCircle, AlertTriangle, Info, Upload, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PageHeader from "@/components/shared/PageHeader";
import QuickSyncButton from "@/components/shared/QuickSyncButton";
import EntraDeviceDetail from "@/components/entra/EntraDeviceDetail";
import OnboardIntuneDialog from "@/components/entra/OnboardIntuneDialog";

function CompBadge({ state }) {
  const map = {
    compliant: "bg-emerald-100 text-emerald-700",
    noncompliant: "bg-red-100 text-red-700",
    unknown: "bg-slate-100 text-slate-500",
    notApplicable: "bg-slate-100 text-slate-500",
  };
  return <Badge className={`${map[state] || "bg-slate-100 text-slate-500"} border-0 text-xs`}>{state || "Unknown"}</Badge>;
}

export default function EntraDevices({ selectedTenant }) {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [onboardDevice, setOnboardDevice] = useState(null);
  const [groupDialogDevice, setGroupDialogDevice] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [addingToGroup, setAddingToGroup] = useState(false);
  const [addGroupResult, setAddGroupResult] = useState(null);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const azureTenantId = selectedTenant?.tenant_id;

  // Fetch Entra devices from Graph
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["entra_devices", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "list_entra_devices",
        azure_tenant_id: azureTenantId,
      }).then(r => r.data),
  });

  // Fetch local Intune devices for cross-matching
  const { data: intuneDevices = [] } = useQuery({
    queryKey: ["intune_devices_local", selectedTenant?.id],
    enabled: !!selectedTenant?.id,
    queryFn: () => base44.entities.IntuneDevice.filter({ tenant_id: selectedTenant.id }),
  });

  // Fetch groups for move-to-group dialog
  const { data: groupsData } = useQuery({
    queryKey: ["entra_groups_graph", azureTenantId],
    enabled: !!groupDialogDevice && !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "list_entra_groups_for_device",
        azure_tenant_id: azureTenantId,
      }).then(r => r.data),
  });

  const devices = data?.devices || [];
  const groups = groupsData?.groups || [];

  const filteredDevices = search.trim()
    ? devices.filter(d =>
        (d.displayName || "").toLowerCase().includes(search.toLowerCase()) ||
        (d.operatingSystem || "").toLowerCase().includes(search.toLowerCase()) ||
        (d.deviceId || "").toLowerCase().includes(search.toLowerCase())
      )
    : devices;

  // Check if a device is already managed in Intune
  const isInIntune = (device) => {
    const name = (device.displayName || "").toLowerCase();
    return intuneDevices.some(d => (d.device_name || "").toLowerCase() === name || (d.serial_number && d.serial_number === device.deviceId));
  };

  const handleAddToGroup = async () => {
    if (!selectedGroupId || !groupDialogDevice) return;
    setAddingToGroup(true);
    setAddGroupResult(null);
    try {
      await base44.functions.invoke("portalData", {
        action: "add_device_to_group",
        azure_tenant_id: azureTenantId,
        device_id: groupDialogDevice.id,
        group_id: selectedGroupId,
      });
      setAddGroupResult({ success: true });
    } catch (e) {
      setAddGroupResult({ success: false, error: e.message });
    } finally {
      setAddingToGroup(false);
    }
  };

  if (!azureTenantId) {
    return (
      <div className="p-6">
        <PageHeader title="Entra AD Devices" subtitle="Select a tenant to view devices" icon={Monitor} />
        <div className="text-center py-20 text-slate-400 text-sm">Please select a tenant from the sidebar.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Entra AD Devices"
        subtitle={`Devices in ${selectedTenant?.name}`}
        icon={Monitor}
        actions={
          <div className="flex gap-2">
            <QuickSyncButton
              selectedTenant={selectedTenant}
              syncAction="sync_devices"
              label="Sync Devices"
              onSynced={() => refetch()}
            />
            <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
        }
      />

      {isLoading && (
        <div className="text-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading Entra AD devices…</p>
        </div>
      )}

      {!isLoading && devices.length === 0 && (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
          No devices found. Click Refresh to load from Entra AD.
        </div>
      )}

      {!isLoading && devices.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700 shrink-0">{filteredDevices.length} / {devices.length} Devices</p>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search devices…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredDevices.map((device, i) => {
              const managed = isInIntune(device);
              return (
                <div key={device.id || i} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <Monitor className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{device.displayName}</p>
                      <p className="text-xs text-slate-400 truncate">{device.operatingSystem} · {device.deviceId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {managed
                      ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />In Intune</Badge>
                      : <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Not in Intune</Badge>
                    }
                    <Badge className={device.accountEnabled ? "bg-emerald-50 text-emerald-700 border-0 text-xs" : "bg-red-50 text-red-700 border-0 text-xs"}>
                      {device.accountEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Button size="sm" variant="ghost" className="text-xs h-7 px-2" onClick={() => setSelectedDevice(device)}>
                      Details
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs h-7 px-2" onClick={() => { setGroupDialogDevice(device); setSelectedGroupId(""); setAddGroupResult(null); }}>
                      <UserPlus className="h-3.5 w-3.5 mr-1" />Group
                    </Button>
                    {!managed && (
                      <Button size="sm" className="text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white gap-1" onClick={() => setOnboardDevice(device)}>
                        <Upload className="h-3.5 w-3.5" />Onboard to Intune
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Device Detail Panel */}
      {selectedDevice && (
        <EntraDeviceDetail
          device={selectedDevice}
          azureTenantId={azureTenantId}
          onClose={() => setSelectedDevice(null)}
        />
      )}

      {/* Move to Group Dialog */}
      <Dialog open={!!groupDialogDevice} onOpenChange={(o) => { if (!o) setGroupDialogDevice(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Device to Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">Device: <strong>{groupDialogDevice?.displayName}</strong></p>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Select Group</label>
              <select
                value={selectedGroupId}
                onChange={e => setSelectedGroupId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— Choose a group —</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.displayName}</option>
                ))}
              </select>
            </div>
            {addGroupResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${addGroupResult.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {addGroupResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {addGroupResult.success ? "Device added to group successfully." : addGroupResult.error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogDevice(null)}>Cancel</Button>
            <Button onClick={handleAddToGroup} disabled={!selectedGroupId || addingToGroup} className="bg-slate-900 hover:bg-slate-800">
              {addingToGroup ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Add to Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Onboard to Intune Dialog */}
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