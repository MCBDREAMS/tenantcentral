import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Save, Plus, Trash2, Bell, RefreshCw, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import PageHeader from "@/components/shared/PageHeader";

const SYNC_INTERVALS = [
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "4 hours", value: 240 },
  { label: "12 hours", value: 720 },
  { label: "24 hours", value: 1440 },
];

const AZURE_FIELDS = ["department", "jobTitle", "city", "country", "companyName", "officeLocation", "employeeId", "extensionAttribute1", "extensionAttribute2", "extensionAttribute3"];
const BASE44_ENTITIES = ["EntraUser", "EntraGroup", "IntuneDevice"];

const defaultSettings = {
  sync_interval_minutes: 60,
  notify_on_noncompliance: true,
  notify_on_policy_change: false,
  notify_on_new_device: false,
  notification_email: "",
  notification_threshold_pct: 80,
  field_mappings: "[]",
  notes: "",
};

export default function TenantSettings({ selectedTenant, tenants = [] }) {
  const [form, setForm] = useState(defaultSettings);
  const [mappings, setMappings] = useState([]);
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();

  const activeTenant = selectedTenant;

  const { data: settingsList = [] } = useQuery({
    queryKey: ["tenant-settings"],
    queryFn: () => base44.entities.TenantSettings.list(),
  });

  const existingSettings = activeTenant
    ? settingsList.find(s => s.tenant_id === activeTenant.id)
    : null;

  useEffect(() => {
    if (existingSettings) {
      setForm({ ...defaultSettings, ...existingSettings });
      try {
        setMappings(JSON.parse(existingSettings.field_mappings || "[]"));
      } catch {
        setMappings([]);
      }
    } else {
      setForm(defaultSettings);
      setMappings([]);
    }
  }, [existingSettings?.id, activeTenant?.id]);

  const saveMut = useMutation({
    mutationFn: (data) => {
      if (existingSettings) {
        return base44.entities.TenantSettings.update(existingSettings.id, data);
      } else {
        return base44.entities.TenantSettings.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const handleSave = () => {
    if (!activeTenant) return;
    saveMut.mutate({
      ...form,
      tenant_id: activeTenant.id,
      tenant_name: activeTenant.name,
      field_mappings: JSON.stringify(mappings),
    });
  };

  const addMapping = () => setMappings(prev => [...prev, { azure_field: "", base44_entity: "EntraUser", base44_field: "" }]);
  const removeMapping = (i) => setMappings(prev => prev.filter((_, idx) => idx !== i));
  const updateMapping = (i, key, val) => setMappings(prev => prev.map((m, idx) => idx === i ? { ...m, [key]: val } : m));

  if (!activeTenant) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <PageHeader title="Tenant Settings" subtitle="Configure per-tenant preferences" icon={Settings} />
        <div className="mt-8 text-center text-slate-500 py-16 border border-dashed rounded-xl">
          Please select a tenant from the sidebar to configure its settings.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader
        title="Tenant Settings"
        subtitle={`Configuring: ${activeTenant.name}`}
        icon={Settings}
        actions={
          <Button
            onClick={handleSave}
            disabled={saveMut.isPending}
            className={`gap-2 ${saved ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-900 hover:bg-slate-800"}`}
          >
            <Save className="h-4 w-4" />
            {saved ? "Saved!" : saveMut.isPending ? "Saving…" : "Save Settings"}
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Sync Settings */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-base">Sync Interval</CardTitle>
            </div>
            <CardDescription>How frequently data is pulled from Microsoft Graph for this tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs">
              <Label className="text-xs mb-1.5 block">Default Sync Interval</Label>
              <Select
                value={String(form.sync_interval_minutes)}
                onValueChange={v => setForm(f => ({ ...f, sync_interval_minutes: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYNC_INTERVALS.map(i => (
                    <SelectItem key={i.value} value={String(i.value)}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">Notification Preferences</CardTitle>
            </div>
            <CardDescription>Choose when to receive alerts for this tenant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[
                { key: "notify_on_noncompliance", label: "Non-compliant device detected", desc: "Alert when a device falls below the compliance threshold" },
                { key: "notify_on_policy_change", label: "Policy changed", desc: "Alert when a Conditional Access policy is modified" },
                { key: "notify_on_new_device", label: "New device enrolled", desc: "Alert when a new device is registered in Intune" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{label}</p>
                    <p className="text-xs text-slate-400">{desc}</p>
                  </div>
                  <Switch
                    checked={!!form[key]}
                    onCheckedChange={v => setForm(f => ({ ...f, [key]: v }))}
                  />
                </div>
              ))}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Notification Email</Label>
                <Input
                  type="email"
                  placeholder="admin@contoso.com"
                  value={form.notification_email}
                  onChange={e => setForm(f => ({ ...f, notification_email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Compliance Alert Threshold (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.notification_threshold_pct}
                  onChange={e => setForm(f => ({ ...f, notification_threshold_pct: Number(e.target.value) }))}
                />
                <p className="text-[10px] text-slate-400">Alert when compliance drops below this %</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Field Mappings */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitMerge className="h-4 w-4 text-violet-500" />
                <CardTitle className="text-base">Custom Field Mappings</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={addMapping} className="gap-1.5 h-8 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Mapping
              </Button>
            </div>
            <CardDescription>Map Azure AD attributes to Base44 entity fields for custom sync logic.</CardDescription>
          </CardHeader>
          <CardContent>
            {mappings.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm border border-dashed rounded-lg">
                No field mappings configured. Click "Add Mapping" to create one.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 pb-1">
                  <span>Azure AD Field</span>
                  <span>Base44 Entity</span>
                  <span>Base44 Field</span>
                  <span></span>
                </div>
                {mappings.map((m, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                    <Select value={m.azure_field} onValueChange={v => updateMapping(i, "azure_field", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Azure field" /></SelectTrigger>
                      <SelectContent>
                        {AZURE_FIELDS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={m.base44_entity} onValueChange={v => updateMapping(i, "base44_entity", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BASE44_ENTITIES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. department"
                      value={m.base44_field}
                      onChange={e => updateMapping(i, "base44_field", e.target.value)}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeMapping(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Any additional notes for this tenant's configuration…"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}