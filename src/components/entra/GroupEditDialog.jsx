import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { logAction } from "@/components/shared/auditLogger";

const empty = {
  display_name: "", group_type: "security", membership_type: "assigned",
  description: "", mail: "", member_count: 0
};

export default function GroupEditDialog({ open, onOpenChange, group, tenant, onSaved }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const isNew = !group?.id;

  useEffect(() => {
    if (open) setForm(group ? { ...group } : { ...empty, tenant_id: tenant?.id });
  }, [open, group, tenant]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    if (isNew) {
      if (tenant?.tenant_id) {
        await base44.functions.invoke("tenantWrite", {
          action: "create_group",
          azure_tenant_id: tenant.tenant_id,
          display_name: form.display_name,
          description: form.description,
          group_type: form.group_type,
          mail_enabled: form.group_type === "microsoft_365",
          security_enabled: form.group_type !== "distribution",
        }).catch(() => {});
      }
      const created = await base44.entities.EntraGroup.create({ ...form, tenant_id: tenant?.id });
      await logAction({ action: "CREATE_ENTRA_GROUP", category: "entra_group", tenant_id: tenant?.id, tenant_name: tenant?.name, target_name: form.display_name, severity: "warning" });
      onSaved?.(created);
    } else {
      if (tenant?.tenant_id && group.graph_id) {
        await base44.functions.invoke("tenantWrite", {
          action: "update_group",
          azure_tenant_id: tenant.tenant_id,
          graph_group_id: group.graph_id,
          display_name: form.display_name,
          description: form.description,
        }).catch(() => {});
      }
      const updated = await base44.entities.EntraGroup.update(group.id, form);
      await logAction({ action: "UPDATE_ENTRA_GROUP", category: "entra_group", tenant_id: tenant?.id, tenant_name: tenant?.name, target_name: form.display_name, severity: "info" });
      onSaved?.(updated);
    }
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? "Create Entra Group" : "Edit Entra Group"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Group Name *</Label>
            <Input value={form.display_name || ""} onChange={e => set("display_name", e.target.value)} placeholder="IT-Admins" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Group Type</Label>
            <Select value={form.group_type || "security"} onValueChange={v => set("group_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="microsoft_365">Microsoft 365</SelectItem>
                <SelectItem value="distribution">Distribution</SelectItem>
                <SelectItem value="mail_enabled_security">Mail-Enabled Security</SelectItem>
                <SelectItem value="dynamic">Dynamic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Membership Type</Label>
            <Select value={form.membership_type || "assigned"} onValueChange={v => set("membership_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="dynamic_user">Dynamic User</SelectItem>
                <SelectItem value="dynamic_device">Dynamic Device</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mail Address (optional)</Label>
            <Input value={form.mail || ""} onChange={e => set("mail", e.target.value)} placeholder="it-admins@contoso.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={form.description || ""} onChange={e => set("description", e.target.value)} placeholder="Group description…" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.display_name} className="bg-slate-900 hover:bg-slate-800">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isNew ? "Create Group" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}