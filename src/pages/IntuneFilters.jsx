import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Plus, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import ReadOnlyBanner from "@/components/shared/ReadOnlyBanner";
import { useRbac } from "@/components/shared/useRbac";
import { logAction } from "@/components/shared/auditLogger";
import { format } from "date-fns";

function fmt(v) {
  if (!v) return "—";
  try { return format(new Date(v), "PP"); } catch { return v; }
}

const PLATFORM_MAP = {
  windows10AndLater: "Windows",
  iOS: "iOS",
  android: "Android",
  macOS: "macOS",
  androidForWork: "Android for Work",
};

const SAMPLE_RULES = [
  { label: "Windows 11 only", rule: '(device.osVersion -startsWith "10.0.22") and (device.deviceOwnership -eq "Corporate")' },
  { label: "Corporate iOS", rule: '(device.deviceOwnership -eq "Corporate") and (device.operatingSystem -eq "iOS")' },
  { label: "Non-compliant exclude", rule: 'device.deviceComplianceState -ne "Compliant"' },
];

export default function IntuneFilters({ selectedTenant, tenants }) {
  const { canEdit } = useRbac();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({ displayName: "", platform: "windows10AndLater", rule: "", description: "" });

  const azureTenantId = selectedTenant?.tenant_id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["intune_filters_live", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "list_intune_filters",
        azure_tenant_id: azureTenantId,
      }).then(r => r.data),
  });

  const filters = data?.filters || [];
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.displayName || !form.rule || !azureTenantId) return;
    setSaving(true);
    try {
      await base44.functions.invoke("portalData", {
        action: "create_intune_filter",
        azure_tenant_id: azureTenantId,
        filter: {
          displayName: form.displayName,
          description: form.description,
          platform: form.platform,
          rule: form.rule,
        },
      });
      await logAction({
        action: "CREATE_INTUNE_FILTER",
        category: "intune_profile",
        tenant_id: selectedTenant?.id,
        tenant_name: selectedTenant?.name,
        target_name: form.displayName,
        severity: "info",
      });
      setShowCreate(false);
      setForm({ displayName: "", platform: "windows10AndLater", rule: "", description: "" });
      refetch();
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (f) => {
    if (!window.confirm(`Delete filter "${f.displayName}"?`)) return;
    setDeleting(f.id);
    try {
      await base44.functions.invoke("portalData", {
        action: "delete_intune_filter",
        azure_tenant_id: azureTenantId,
        filter_id: f.id,
      });
      await logAction({
        action: "DELETE_INTUNE_FILTER",
        category: "intune_profile",
        tenant_id: selectedTenant?.id,
        tenant_name: selectedTenant?.name,
        target_name: f.displayName,
        severity: "warning",
      });
      refetch();
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Intune Filters"
        subtitle={selectedTenant ? `Live assignment filters for ${selectedTenant.name}` : "Select a tenant"}
        icon={Filter}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading || !azureTenantId} className="gap-1.5">
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            {canEdit() && azureTenantId && (
              <Button onClick={() => setShowCreate(true)} className="gap-2 bg-slate-900 hover:bg-slate-800">
                <Plus className="h-4 w-4" /> New Filter
              </Button>
            )}
          </div>
        }
      />
      {!canEdit() && <ReadOnlyBanner />}

      {!azureTenantId && (
        <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
          Select a tenant to view live Intune assignment filters.
        </div>
      )}

      {azureTenantId && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Filter Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Platform</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rule Preview</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Modified</th>
                {canEdit() && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" /></td></tr>
              ) : filters.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400 text-sm">
                    No filters found in Intune.
                    <p className="text-xs mt-1">Requires <code className="bg-slate-100 px-1 rounded">DeviceManagementConfiguration.Read.All</code> permission.</p>
                  </td>
                </tr>
              ) : filters.map(f => (
                <tr key={f.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-800">{f.displayName}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">{PLATFORM_MAP[f.platform] || f.platform}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500 max-w-xs truncate">{f.rule || "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{fmt(f.lastModifiedDateTime)}</td>
                  {canEdit() && (
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" className="px-2" disabled={deleting === f.id} onClick={() => handleDelete(f)}>
                        {deleting === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-red-400" />}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New Assignment Filter</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Filter Name</Label>
                <Input value={form.displayName} onChange={e => set("displayName", e.target.value)} placeholder="Windows 11 Corporate Devices" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Platform</Label>
                <Select value={form.platform} onValueChange={v => set("platform", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="windows10AndLater">Windows 10/11</SelectItem>
                    <SelectItem value="iOS">iOS</SelectItem>
                    <SelectItem value="android">Android</SelectItem>
                    <SelectItem value="macOS">macOS</SelectItem>
                    <SelectItem value="androidForWork">Android for Work</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description (optional)</Label>
                <Input value={form.description} onChange={e => set("description", e.target.value)} placeholder="Description..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rule Syntax</Label>
              <Textarea value={form.rule} onChange={e => set("rule", e.target.value)} placeholder='(device.osVersion -startsWith "10.0.22")' className="font-mono text-xs h-24" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Quick Templates</Label>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_RULES.map(r => (
                  <button key={r.label} onClick={() => set("rule", r.rule)} className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-600">
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={handleCreate} disabled={!form.displayName || !form.rule || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create in Intune
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}