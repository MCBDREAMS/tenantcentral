import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, Trash2, AlertTriangle, ExternalLink } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";

export default function PolicyEditDialog({ policy, tenants, onClose }) {
  const [state, setState] = useState(policy.state);
  const [name, setName] = useState(policy.policy_name);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);
  const qc = useQueryClient();

  const tenant = tenants.find(t => t.id === policy.tenant_id);

  const save = async () => {
    if (!tenant?.tenant_id) { setError("Tenant Azure ID not found."); return; }
    setSaving(true); setError(null);
    // Update in Graph (requires graph_policy_id stored in policy — use policy_name as fallback label)
    if (policy.graph_policy_id) {
      const res = await base44.functions.invoke("tenantWrite", {
        action: "update_ca_policy",
        azure_tenant_id: tenant.tenant_id,
        graph_policy_id: policy.graph_policy_id,
        state,
        display_name: name,
      });
      if (!res.data.success) { setError(res.data.error || "Graph update failed"); setSaving(false); return; }
    }
    // Always update local record
    await base44.entities.EntraPolicy.update(policy.id, { policy_name: name, state });
    qc.invalidateQueries({ queryKey: ["entra-policies"] });
    setSaving(false);
    onClose();
  };

  const del = async () => {
    if (!tenant?.tenant_id) { setError("Tenant Azure ID not found."); return; }
    setDeleting(true); setError(null);
    if (policy.graph_policy_id) {
      const res = await base44.functions.invoke("tenantWrite", {
        action: "delete_ca_policy",
        azure_tenant_id: tenant.tenant_id,
        graph_policy_id: policy.graph_policy_id,
      });
      if (!res.data.success) { setError(res.data.error || "Delete failed"); setDeleting(false); return; }
    }
    await base44.entities.EntraPolicy.delete(policy.id);
    qc.invalidateQueries({ queryKey: ["entra-policies"] });
    setDeleting(false);
    onClose();
  };

  const azureLink = tenant?.tenant_id
    ? `https://portal.azure.com/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/Policies`
    : null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Policy
            {azureLink && (
              <a href={azureLink} target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-500 hover:underline text-xs font-normal flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Open in Azure
              </a>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Policy Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">State</label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="report_only">Report Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500 mb-1">Type</p>
              <Badge variant="outline">{policy.policy_type?.replace(/_/g, ' ')}</Badge>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Tenant</p>
              <p className="font-medium text-slate-700">{tenant?.name || policy.tenant_id}</p>
            </div>
            {policy.target_users && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500 mb-1">Target Users</p>
                <p className="text-slate-700">{policy.target_users}</p>
              </div>
            )}
            {policy.target_apps && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500 mb-1">Target Apps</p>
                <p className="text-slate-700">{policy.target_apps}</p>
              </div>
            )}
            {policy.grant_controls && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500 mb-1">Grant Controls</p>
                <p className="text-slate-700">{policy.grant_controls}</p>
              </div>
            )}
            {policy.conditions && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500 mb-1">Conditions (JSON)</p>
                <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-36">{policy.conditions}</pre>
              </div>
            )}
          </div>

          {!policy.graph_policy_id && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-xs text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              No Azure Graph ID stored — changes will only update the local record. Re-sync to link Graph IDs.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{error}</div>
          )}
        </div>

        <DialogFooter className="flex justify-between gap-2">
          {!confirmDelete ? (
            <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 gap-1" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          ) : (
            <Button variant="destructive" size="sm" disabled={deleting} onClick={del} className="gap-1">
              <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Deleting…" : "Confirm Delete"}
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white gap-1">
              <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}