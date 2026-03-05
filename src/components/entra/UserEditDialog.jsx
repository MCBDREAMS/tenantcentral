import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { logAction } from "@/components/shared/auditLogger";

const ENTRA_ROLES = [
  "Global Administrator", "User Administrator", "Intune Administrator",
  "Exchange Administrator", "Teams Administrator", "SharePoint Administrator",
  "Security Administrator", "Compliance Administrator", "Billing Administrator",
  "Helpdesk Administrator", "Reports Reader", "Guest Inviter"
];

const MFA_STATUSES = ["enabled", "disabled", "enforced"];

const empty = {
  display_name: "", upn: "", email: "", job_title: "", department: "",
  account_enabled: true, user_type: "member", mfa_status: "enabled",
  licenses: "", entra_roles: ""
};

export default function UserEditDialog({ open, onOpenChange, user, tenant, onSaved }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const isNew = !user?.id;

  useEffect(() => {
    if (open) setForm(user ? { ...user } : { ...empty, tenant_id: tenant?.id });
  }, [open, user, tenant]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    if (isNew) {
      // Attempt to create via Graph
      if (tenant?.tenant_id) {
        await base44.functions.invoke("tenantWrite", {
          action: "create_user",
          azure_tenant_id: tenant.tenant_id,
          display_name: form.display_name,
          upn: form.upn,
          password: form.password || "TempPass123!",
          job_title: form.job_title,
          department: form.department,
          account_enabled: form.account_enabled,
        }).catch(() => {});
      }
      const created = await base44.entities.EntraUser.create({ ...form, tenant_id: tenant?.id });
      await logAction({ action: "CREATE_ENTRA_USER", category: "entra_user", tenant_id: tenant?.id, tenant_name: tenant?.name, target_name: form.display_name, severity: "warning" });
      onSaved?.(created);
    } else {
      // Attempt Graph update
      if (tenant?.tenant_id && user.graph_id) {
        await base44.functions.invoke("tenantWrite", {
          action: "update_user",
          azure_tenant_id: tenant.tenant_id,
          graph_user_id: user.graph_id,
          display_name: form.display_name,
          job_title: form.job_title,
          department: form.department,
          account_enabled: form.account_enabled,
        }).catch(() => {});
      }
      const updated = await base44.entities.EntraUser.update(user.id, form);
      await logAction({ action: "UPDATE_ENTRA_USER", category: "entra_user", tenant_id: tenant?.id, tenant_name: tenant?.name, target_name: form.display_name, severity: "info" });
      onSaved?.(updated);
    }
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add Entra User" : "Edit Entra User"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Display Name *</Label>
            <Input value={form.display_name || ""} onChange={e => set("display_name", e.target.value)} placeholder="John Smith" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">User Principal Name (UPN)</Label>
            <Input value={form.upn || ""} onChange={e => set("upn", e.target.value)} placeholder="jsmith@contoso.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input value={form.email || ""} onChange={e => set("email", e.target.value)} placeholder="jsmith@contoso.com" />
          </div>
          {isNew && (
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Temporary Password</Label>
              <Input type="password" value={form.password || ""} onChange={e => set("password", e.target.value)} placeholder="TempPass123!" />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Job Title</Label>
            <Input value={form.job_title || ""} onChange={e => set("job_title", e.target.value)} placeholder="Software Engineer" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Department</Label>
            <Input value={form.department || ""} onChange={e => set("department", e.target.value)} placeholder="Engineering" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">User Type</Label>
            <Select value={form.user_type || "member"} onValueChange={v => set("user_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="guest">Guest</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">MFA Status</Label>
            <Select value={form.mfa_status || "enabled"} onValueChange={v => set("mfa_status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MFA_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Licenses</Label>
            <Input value={form.licenses || ""} onChange={e => set("licenses", e.target.value)} placeholder="E5, EMS" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Entra Directory Roles</Label>
            <Select value={form.entra_roles || ""} onValueChange={v => set("entra_roles", v)}>
              <SelectTrigger><SelectValue placeholder="Select role…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>None</SelectItem>
                {ENTRA_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex items-center gap-3 pt-1">
            <Switch checked={form.account_enabled !== false} onCheckedChange={v => set("account_enabled", v)} />
            <Label className="text-xs">Account Enabled</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.display_name} className="bg-slate-900 hover:bg-slate-800">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isNew ? "Create User" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}