import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Filter, Plus, Trash2 } from "lucide-react";
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

// Store filters as IntuneProfile with profile_type="enrollment_restriction" and description as rule syntax
export default function IntuneFilters({ selectedTenant, tenants }) {
  const { canEdit } = useRbac();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ filter_name: "", platform: "windows", rule_syntax: "", description: "" });
  const queryClient = useQueryClient();

  const { data: filters = [] } = useQuery({
    queryKey: ["intune-filters", selectedTenant?.id],
    queryFn: () => {
      const q = { profile_type: "enrollment_restriction" };
      if (selectedTenant?.id) q.tenant_id = selectedTenant.id;
      return base44.entities.IntuneProfile.filter(q);
    },
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"], queryFn: () => base44.entities.Tenant.list(), initialData: tenants || [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.IntuneProfile.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["intune-filters"] }); setShowCreate(false); setForm({ filter_name: "", platform: "windows", rule_syntax: "", description: "" }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.IntuneProfile.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["intune-filters"] }),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const getTenantName = (tid) => allTenants.find(t => t.id === tid)?.name || "Unknown";

  const SAMPLE_RULES = [
    { label: "Windows 11 only", rule: '(device.osVersion -startsWith "10.0.22") and (device.deviceOwnership -eq "Corporate")' },
    { label: "Corporate iOS", rule: '(device.deviceOwnership -eq "Corporate") and (device.operatingSystem -eq "iOS")' },
    { label: "Non-compliant exclude", rule: 'device.deviceComplianceState -ne "Compliant"' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Intune Filters"
        subtitle="Assignment filters to refine policy and app targets"
        icon={Filter}
        actions={canEdit() && (
          <Button onClick={() => setShowCreate(true)} className="gap-2 bg-slate-900 hover:bg-slate-800">
            <Plus className="h-4 w-4" /> New Filter
          </Button>
        )}
      />
      {!canEdit() && <ReadOnlyBanner />}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Filter Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Platform</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rule Preview</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tenant</th>
              {canEdit() && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filters.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-slate-400 text-sm">No filters defined</td></tr>
            ) : filters.map(f => (
              <tr key={f.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium text-slate-800">{f.profile_name}</td>
                <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{f.platform}</Badge></td>
                <td className="px-4 py-3 text-xs font-mono text-slate-500 max-w-xs truncate">{f.settings_summary || "-"}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{getTenantName(f.tenant_id)}</td>
                {canEdit() && (
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" className="px-2" onClick={() => deleteMut.mutate(f.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New Filter</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Filter Name</Label>
                <Input value={form.filter_name} onChange={e => set("filter_name", e.target.value)} placeholder="Windows 11 Corporate Devices" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Platform</Label>
                <Select value={form.platform} onValueChange={v => set("platform", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["windows","macos","ios","android","linux"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
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
            <div className="space-y-1.5">
              <Label className="text-xs">Rule Syntax</Label>
              <Textarea value={form.rule_syntax} onChange={e => set("rule_syntax", e.target.value)} placeholder='(device.osVersion -startsWith "10.0.22")' className="font-mono text-xs h-24" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Quick Templates</Label>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_RULES.map(r => (
                  <button key={r.label} onClick={() => set("rule_syntax", r.rule)} className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-600">
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => createMut.mutate({
              tenant_id: form.tenant_id || selectedTenant?.id || "",
              profile_name: form.filter_name,
              profile_type: "enrollment_restriction",
              platform: form.platform,
              state: "active",
              settings_summary: form.rule_syntax,
              description: form.description,
            })} disabled={!form.filter_name}>
              Create Filter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}