import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Rocket, Plus, Trash2, RefreshCw, Loader2, Monitor, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/shared/PageHeader";
import ReadOnlyBanner from "@/components/shared/ReadOnlyBanner";
import { useRbac } from "@/components/shared/useRbac";
import { logAction } from "@/components/shared/auditLogger";
import { format } from "date-fns";

function fmt(v) {
  if (!v) return "—";
  try { return format(new Date(v), "PP"); } catch { return v; }
}

export default function IntuneAutopilot({ selectedTenant, tenants }) {
  const { canEdit } = useRbac();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({
    displayName: "",
    deploymentMode: "selfDeploying",
    joinType: "azureADJoined",
    userAccountType: "standard",
    language: "os-default",
    hideEULA: true,
    hidePrivacy: true,
    skipKeyboard: true,
  });

  const azureTenantId = selectedTenant?.tenant_id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["autopilot_profiles_live", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "list_autopilot_profiles",
        azure_tenant_id: azureTenantId,
      }).then(r => r.data),
  });

  const profiles = data?.profiles || [];
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.displayName || !azureTenantId) return;
    setSaving(true);
    try {
      const profileBody = {
        "@odata.type": "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile",
        displayName: form.displayName,
        description: "",
        language: form.language === "os-default" ? "os-default" : form.language,
        deviceType: "windowsPc",
        enableWhiteGlove: form.deploymentMode === "selfDeploying",
        extractHardwareHash: false,
        outOfBoxExperienceSettings: {
          hidePrivacySettings: form.hidePrivacy,
          hideEULA: form.hideEULA,
          userType: form.userAccountType,
          deviceUsageType: form.deploymentMode,
          skipKeyboardSelectionPage: form.skipKeyboard,
          hideEscapeLink: true,
        },
      };
      await base44.functions.invoke("portalData", {
        action: "create_autopilot_profile",
        azure_tenant_id: azureTenantId,
        profile: profileBody,
      });
      await logAction({
        action: "CREATE_AUTOPILOT_PROFILE",
        category: "intune_profile",
        tenant_id: selectedTenant?.id,
        tenant_name: selectedTenant?.name,
        target_name: form.displayName,
        severity: "info",
      });
      setShowCreate(false);
      setForm({ displayName: "", deploymentMode: "selfDeploying", joinType: "azureADJoined", userAccountType: "standard", language: "os-default", hideEULA: true, hidePrivacy: true, skipKeyboard: true });
      refetch();
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (profile) => {
    if (!window.confirm(`Delete Autopilot profile "${profile.displayName}"?`)) return;
    setDeleting(profile.id);
    try {
      await base44.functions.invoke("portalData", {
        action: "delete_autopilot_profile",
        azure_tenant_id: azureTenantId,
        profile_id: profile.id,
      });
      await logAction({
        action: "DELETE_AUTOPILOT_PROFILE",
        category: "intune_profile",
        tenant_id: selectedTenant?.id,
        tenant_name: selectedTenant?.name,
        target_name: profile.displayName,
        severity: "warning",
      });
      refetch();
    } catch (e) {
      alert("Failed to delete: " + e.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Autopilot Profiles"
        subtitle={selectedTenant ? `Live Autopilot profiles for ${selectedTenant.name}` : "Select a tenant"}
        icon={Rocket}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading || !azureTenantId} className="gap-1.5">
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            {canEdit() && azureTenantId && (
              <Button onClick={() => setShowCreate(true)} className="gap-2 bg-slate-900 hover:bg-slate-800">
                <Plus className="h-4 w-4" /> New Profile
              </Button>
            )}
          </div>
        }
      />
      {!canEdit() && <ReadOnlyBanner />}

      {!azureTenantId && (
        <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
          Select a tenant to view live Autopilot profiles.
        </div>
      )}

      {azureTenantId && isLoading && (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
      )}

      {azureTenantId && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {profiles.map(p => {
            const oobe = p.outOfBoxExperienceSettings || {};
            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3 hover:shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                      <Rocket className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{p.displayName}</p>
                      <p className="text-xs text-slate-400">{p.description || "No description"}</p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-700 border-0 text-xs">Live</Badge>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {[
                    ["Mode", oobe.deviceUsageType || p.deviceType || "—"],
                    ["User Type", oobe.userType || "—"],
                    ["Last Modified", fmt(p.lastModifiedDateTime)],
                    ["Assigned Devices", p.assignedDeviceCount ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-slate-50 rounded px-2 py-1">
                      <span className="text-slate-400">{k}: </span>
                      <span className="font-medium text-slate-700">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {oobe.hideEULA && <Badge variant="outline" className="text-[10px]">Hide EULA</Badge>}
                  {oobe.hidePrivacySettings && <Badge variant="outline" className="text-[10px]">Hide Privacy</Badge>}
                  {oobe.skipKeyboardSelectionPage && <Badge variant="outline" className="text-[10px]">Skip Keyboard</Badge>}
                </div>
                {canEdit() && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-end px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                    disabled={deleting === p.id}
                    onClick={() => handleDelete(p)}
                  >
                    {deleting === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            );
          })}
          {profiles.length === 0 && (
            <div className="col-span-3 text-center py-16 text-slate-400">
              <Rocket className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No Autopilot profiles found in Intune.</p>
              <p className="text-xs mt-1">Requires <code className="bg-slate-100 px-1 rounded">DeviceManagementServiceConfig.Read.All</code> permission.</p>
            </div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Autopilot Profile</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Profile Name</Label>
              <Input value={form.displayName} onChange={e => set("displayName", e.target.value)} placeholder="Corporate Standard Deployment" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Deployment Mode</Label>
                <Select value={form.deploymentMode} onValueChange={v => set("deploymentMode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="userDriven">User-Driven</SelectItem>
                    <SelectItem value="selfDeploying">Self-Deploying</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">User Account Type</Label>
                <Select value={form.userAccountType} onValueChange={v => set("userAccountType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard User</SelectItem>
                    <SelectItem value="administrator">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              {[
                ["hideEULA", "Hide EULA"],
                ["hidePrivacy", "Hide Privacy Settings"],
                ["skipKeyboard", "Skip Keyboard Selection"],
              ].map(([k, label]) => (
                <div key={k} className="flex items-center gap-2">
                  <Switch checked={!!form[k]} onCheckedChange={v => set(k, v)} id={k} />
                  <Label htmlFor={k} className="text-xs cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={handleCreate} disabled={!form.displayName || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create in Intune
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}