import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Trash2 } from "lucide-react";
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

// We'll store named locations in EntraPolicy entity with policy_type = "named_location"
export default function EntraNamedLocations({ selectedTenant, tenants }) {
  const { canEdit } = useRbac();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", type: "ip_range", ip_ranges: "", countries: "", is_trusted: false });
  const queryClient = useQueryClient();

  const { data: locations = [] } = useQuery({
    queryKey: ["named-locations", selectedTenant?.id],
    queryFn: () => {
      const q = { policy_type: "named_location" };
      if (selectedTenant?.id) q.tenant_id = selectedTenant.id;
      return base44.entities.EntraPolicy.filter(q);
    },
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
    initialData: tenants || [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.EntraPolicy.create(data),
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: ["named-locations"] });
      await logAction({ action: "CREATE_NAMED_LOCATION", category: "entra_policy", tenant_id: created.tenant_id, tenant_name: allTenants.find(t => t.id === created.tenant_id)?.name, target_name: created.policy_name, severity: "info" });
      setShowCreate(false);
      setForm({ name: "", type: "ip_range", ip_ranges: "", countries: "", is_trusted: false });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.EntraPolicy.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["named-locations"] }),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const getTenantName = (tid) => allTenants.find(t => t.id === tid)?.name || "Unknown";

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Named Locations"
        subtitle="Define trusted IP ranges and country-based locations for Conditional Access"
        icon={MapPin}
        actions={canEdit() && (
          <Button onClick={() => setShowCreate(true)} className="gap-2 bg-slate-900 hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Add Location
          </Button>
        )}
      />

      {!canEdit() && <ReadOnlyBanner />}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Details</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tenant</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Trusted</th>
              {canEdit() && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {locations.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-slate-400 text-sm">No named locations defined</td></tr>
            ) : locations.map(loc => {
              let detail = loc.conditions || "";
              try { const c = JSON.parse(loc.conditions); detail = c.ip_ranges || c.countries || ""; } catch {}
              const locType = loc.target_apps || "ip_range";
              return (
                <tr key={loc.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-800">{loc.policy_name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">{locType}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{detail}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{getTenantName(loc.tenant_id)}</td>
                  <td className="px-4 py-3">
                    <Badge className={loc.state === "enabled" ? "bg-emerald-50 text-emerald-700 border-0 text-xs" : "bg-slate-100 text-slate-500 border-0 text-xs"}>
                      {loc.state === "enabled" ? "Trusted" : "Untrusted"}
                    </Badge>
                  </td>
                  {canEdit() && (
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" className="px-2" onClick={() => deleteMut.mutate(loc.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Named Location</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Location Name</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Corporate HQ" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={v => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ip_range">IP Range</SelectItem>
                  <SelectItem value="country">Countries / Regions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type === "ip_range" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">IP Ranges (CIDR, one per line)</Label>
                <Input value={form.ip_ranges} onChange={e => set("ip_ranges", e.target.value)} placeholder="192.168.1.0/24, 10.0.0.0/8" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Countries (comma separated codes)</Label>
                <Input value={form.countries} onChange={e => set("countries", e.target.value)} placeholder="US, GB, DE" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Tenant</Label>
              <Select value={form.tenant_id || ""} onValueChange={v => set("tenant_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {allTenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_trusted} onCheckedChange={v => set("is_trusted", v)} id="trusted" />
              <Label htmlFor="trusted" className="text-xs cursor-pointer">Mark as Trusted Location</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => createMut.mutate({
              tenant_id: form.tenant_id || selectedTenant?.id || "",
              policy_name: form.name,
              policy_type: "named_location",
              state: form.is_trusted ? "enabled" : "disabled",
              target_apps: form.type,
              conditions: JSON.stringify({ ip_ranges: form.ip_ranges, countries: form.countries }),
            })} disabled={!form.name}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}