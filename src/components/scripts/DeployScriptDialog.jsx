import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, MonitorSmartphone } from "lucide-react";

export default function DeployScriptDialog({ script, tenants, open, onClose }) {
  const [selectedDevices, setSelectedDevices] = useState([]);
  const queryClient = useQueryClient();

  const { data: devices = [] } = useQuery({
    queryKey: ["devices-for-deploy", script?.tenant_id],
    queryFn: () => base44.entities.IntuneDevice.filter({ tenant_id: script.tenant_id }),
    enabled: !!script?.tenant_id && open,
  });

  const deployMut = useMutation({
    mutationFn: async (deviceIds) => {
      const records = deviceIds.map(did => {
        const device = devices.find(d => d.id === did);
        return {
          script_id: script.id,
          tenant_id: script.tenant_id,
          device_id: did,
          device_name: device?.device_name || did,
          status: "pending",
          deployed_date: new Date().toISOString().split("T")[0],
        };
      });
      return base44.entities.ScriptDeployment.bulkCreate(records);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
      setSelectedDevices([]);
      onClose();
    },
  });

  const toggle = (id) => setSelectedDevices(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const toggleAll = () =>
    setSelectedDevices(selectedDevices.length === devices.length ? [] : devices.map(d => d.id));

  const tenantName = tenants?.find(t => t.id === script?.tenant_id)?.name || "Unknown";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deploy Script</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="bg-slate-50 rounded-lg px-3 py-2">
            <p className="text-sm font-medium text-slate-800">{script?.script_name}</p>
            <p className="text-xs text-slate-500 mt-0.5">Tenant: {tenantName}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Select Devices ({devices.length})</p>
              <button onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
                {selectedDevices.length === devices.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1">
              {devices.map(d => (
                <label key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer border border-slate-100">
                  <Checkbox
                    checked={selectedDevices.includes(d.id)}
                    onCheckedChange={() => toggle(d.id)}
                  />
                  <MonitorSmartphone className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{d.device_name}</p>
                    <p className="text-xs text-slate-400">{d.os} · {d.primary_user || "No user"}</p>
                  </div>
                  <Badge variant="outline" className={`text-xs shrink-0 ${d.compliance_state === 'compliant' ? 'text-emerald-600 border-emerald-200' : 'text-red-500 border-red-200'}`}>
                    {d.compliance_state}
                  </Badge>
                </label>
              ))}
              {devices.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">No devices found for this tenant</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => deployMut.mutate(selectedDevices)}
            disabled={selectedDevices.length === 0 || deployMut.isPending}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {deployMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Deploy to {selectedDevices.length} Device{selectedDevices.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}