import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, AlertTriangle, ExternalLink } from "lucide-react";

export default function ProfileEditDialog({ profile, tenants, onClose }) {
  const [name, setName] = useState(profile.profile_name);
  const [description, setDescription] = useState(profile.description || "");
  const [state, setState] = useState(profile.state);
  const [assignedGroups, setAssignedGroups] = useState(profile.assigned_groups || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const qc = useQueryClient();

  const tenant = tenants.find(t => t.id === profile.tenant_id);

  const save = async () => {
    setSaving(true); setError(null);
    if (profile.graph_profile_id && tenant?.tenant_id) {
      const res = await base44.functions.invoke("tenantWrite", {
        action: "update_intune_profile",
        azure_tenant_id: tenant.tenant_id,
        graph_profile_id: profile.graph_profile_id,
        profile_type: profile.profile_type,
        display_name: name,
        description,
      });
      if (!res.data.success) { setError(res.data.error || "Graph update failed"); setSaving(false); return; }
    }
    await base44.entities.IntuneProfile.update(profile.id, { profile_name: name, description, state, assigned_groups: assignedGroups });
    qc.invalidateQueries({ queryKey: ["intune-profiles"] });
    setSaving(false);
    onClose();
  };

  const platformIcons = { windows: "🪟", macos: "🍎", ios: "📱", android: "🤖", linux: "🐧", all: "🌐" };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Intune Profile
            {tenant?.tenant_id && (
              <a href="https://intune.microsoft.com/" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-500 hover:underline text-xs font-normal flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Open in Intune
              </a>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">Platform</p>
              <p className="font-medium text-slate-700">{platformIcons[profile.platform]} {profile.platform}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Type</p>
              <Badge variant="outline">{profile.profile_type?.replace(/_/g, ' ')}</Badge>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Profile Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">State</label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Assigned Groups</label>
            <Input value={assignedGroups} onChange={e => setAssignedGroups(e.target.value)} placeholder="Group1, Group2" />
          </div>

          {profile.settings_summary && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Settings Summary</p>
              <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-36">{profile.settings_summary}</pre>
            </div>
          )}

          {!profile.graph_profile_id && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-xs text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              No Azure Graph ID stored — changes will only update the local record. Re-sync to link Graph IDs.
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white gap-1">
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}