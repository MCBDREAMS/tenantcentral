import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Rocket, Plus, Trash2, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import ReadOnlyBanner from "@/components/shared/ReadOnlyBanner";
import { useRbac } from "@/components/shared/useRbac";
import { logAction } from "@/components/shared/auditLogger";

// Store Autopilot profiles as IntuneProfile with profile_type = "autopilot_profile"
export default function IntuneAutopilot({ selectedTenant, tenants }) {
  const { canEdit } = useRbac();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ profile_name: "", deployment_mode: "self_deploying", join_type: "azure_ad", user_account_type: "standard", oobe_language: "OS default", skip_keyboard: true, hide_privacy: true, hide_eula: true });
  const queryClient = useQueryClient();

  const { data: profiles = [] } = useQuery({
    queryKey: ["autopilot", selectedTenant?.id],
    queryFn: () => {
      const q = { profile_type: "autopilot_profile" };
      if (selectedTenant?.id) q.tenant_id = selectedTenant.id;
      return base44.entities.IntuneProfile.filter(q);
    },
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"], queryFn: () => base44.entities.Tenant.list(), initialData: tenants || [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.IntuneProfile.create(data),
    onSuccess: async (c) => {
      queryClient.invalidateQueries({ queryKey: ["autopilot"] });
      await logAction({ action: "CREATE_AUTOPILOT_PROFILE", category: "intune_profile", tenant_id: c.tenant_id, tenant_name: allTenants.find(t => t.id === c.tenant_id)?.name, target_name: c.profile_name, severity: "info" });
      setShowCreate(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.IntuneProfile.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["autopilot"] }),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const getTenantName = (tid) => allTenants.find(t => t.id === tid)?.name || "Unknown";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Autopilot Profiles"
        subtitle="Windows Autopilot deployment profiles"
        icon={Rocket}
        actions={canEdit() && (
          <Button onClick={() => setShowCreate(true)} className="gap-2 bg-slate-900 hover:bg-slate-800">
            <Plus className="h-4 w-4" /> New Profile
          </Button>
        )}
      />
      {!canEdit() && <ReadOnlyBanner />}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {profiles.map(p => {
          let settings = {};
          try { settings = JSON.parse(p.settings_summary || "{}"); } catch {}
          return (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3 hover:shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                    <Rocket className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{p.profile_name}</p>
                    <p className="text-xs text-slate-400">{getTenantName(p.tenant_id)}</p>
                  </div>
                </div>
                <StatusBadge status={p.state} />
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {[
                  ["Mode", settings.deployment_mode || "-"],
                  ["Join Type", settings.join_type || "-"],
                  ["User Type", settings.user_account_type || "-"],
                  ["Groups", p.assigned_groups || "None"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-slate-50 rounded px-2 py-1">
                    <span className="text-slate-400">{k}: </span>
                    <span className="font-medium text-slate-700">{v}</span>
                  </div>
                ))}
              </div>
              {canEdit() && (
                <Button variant="ghost" size="sm" className="self-end px-2 mt-auto" onClick={() => deleteMut.mutate(p.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </Button>
              )}
            </div>
          );
        })}
        {profiles.length === 0 && (
          <div className="col-span-3 text-center py-16 text-slate-400">
            <Rocket className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No Autopilot profiles yet.</p>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Autopilot Profile</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Profile Name</Label>
              <Input value={form.profile_name} onChange={e => set("profile_name", e.target.value)} placeholder="Corporate Standard Deployment" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Deployment Mode</Label>
                <Select value={form.deployment_mode} onValueChange={v => set("deployment_mode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user_driven">User-Driven</SelectItem>
                    <SelectItem value="self_deploying">Self-Deploying</SelectItem>
                    <SelectItem value="pre_provisioned">Pre-Provisioned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Join Type</Label>
                <Select value={form.join_type} onValueChange={v => set("join_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="azure_ad">Azure AD Joined</SelectItem>
                    <SelectItem value="hybrid">Hybrid AD Joined</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">User Account Type</Label>
                <Select value={form.user_account_type} onValueChange={v => set("user_account_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard User</SelectItem>
                    <SelectItem value="administrator">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tenant</Label>
                <Select value={form.tenant_id || ""} onValueChange={v => set("tenant_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                  <SelectContent>
                    {allTenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              {[["hide_eula", "Hide EULA"], ["hide_privacy", "Hide Privacy Settings"], ["skip_keyboard", "Skip Keyboard Selection"]].map(([k, label]) => (
                <div key={k} className="flex items-center gap-2">
                  <Switch checked={!!form[k]} onCheckedChange={v => set(k, v)} id={k} />
                  <Label htmlFor={k} className="text-xs cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Assigned Groups</Label>
              <Input value={form.assigned_groups || ""} onChange={e => set("assigned_groups", e.target.value)} placeholder="All Devices, New Hires" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => createMut.mutate({
              tenant_id: form.tenant_id || selectedTenant?.id || "",
              profile_name: form.profile_name,
              profile_type: "autopilot_profile",
              platform: "windows",
              state: "active",
              assigned_groups: form.assigned_groups || "",
              settings_summary: JSON.stringify({ deployment_mode: form.deployment_mode, join_type: form.join_type, user_account_type: form.user_account_type }),
            })} disabled={!form.profile_name}>
              Create Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}