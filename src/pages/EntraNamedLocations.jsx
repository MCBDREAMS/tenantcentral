import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Trash2, RefreshCw, Loader2, Globe, Building } from "lucide-react";
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

export default function EntraNamedLocations({ selectedTenant }) {
  const { canEdit } = useRbac();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", type: "ip_range", ip_ranges: "", countries: "", is_trusted: false });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const azureTenantId = selectedTenant?.tenant_id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["named_locations_live", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "list_named_locations",
        azure_tenant_id: azureTenantId,
      }).then(r => r.data),
  });

  const locations = data?.locations || [];
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.name || !azureTenantId) return;
    setSaving(true);
    let locationBody;
    if (form.type === "ip_range") {
      const ranges = form.ip_ranges.split(",").map(r => r.trim()).filter(Boolean).map(cidrAddress => ({
        "@odata.type": "#microsoft.graph.iPv4CidrRange",
        cidrAddress,
      }));
      locationBody = {
        "@odata.type": "#microsoft.graph.ipNamedLocation",
        displayName: form.name,
        isTrusted: form.is_trusted,
        ipRanges: ranges,
      };
    } else {
      const countriesAndRegions = form.countries.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
      locationBody = {
        "@odata.type": "#microsoft.graph.countryNamedLocation",
        displayName: form.name,
        countriesAndRegions,
        includeUnknownCountriesAndRegions: false,
      };
    }

    try {
      await base44.functions.invoke("portalData", {
        action: "create_named_location",
        azure_tenant_id: azureTenantId,
        location: locationBody,
      });
      await logAction({
        action: "CREATE_NAMED_LOCATION",
        category: "entra_policy",
        tenant_id: selectedTenant?.id,
        tenant_name: selectedTenant?.name,
        target_name: form.name,
        severity: "info",
      });
      setShowCreate(false);
      setForm({ name: "", type: "ip_range", ip_ranges: "", countries: "", is_trusted: false });
      refetch();
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (loc) => {
    if (!window.confirm(`Delete named location "${loc.displayName}"?`)) return;
    setDeleting(loc.id);
    try {
      await base44.functions.invoke("portalData", {
        action: "delete_named_location",
        azure_tenant_id: azureTenantId,
        location_id: loc.id,
      });
      await logAction({
        action: "DELETE_NAMED_LOCATION",
        category: "entra_policy",
        tenant_id: selectedTenant?.id,
        tenant_name: selectedTenant?.name,
        target_name: loc.displayName,
        severity: "warning",
      });
      refetch();
    } catch (e) {
      alert("Failed to delete: " + e.message);
    } finally {
      setDeleting(null);
    }
  };

  const getLocType = (loc) => {
    const t = loc["@odata.type"] || "";
    if (t.includes("ipNamedLocation")) return "ip_range";
    if (t.includes("countryNamedLocation")) return "country";
    return "unknown";
  };

  const getDetail = (loc) => {
    const t = getLocType(loc);
    if (t === "ip_range") return (loc.ipRanges || []).map(r => r.cidrAddress).join(", ") || "—";
    if (t === "country") return (loc.countriesAndRegions || []).join(", ") || "—";
    return "—";
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Named Locations"
        subtitle={selectedTenant ? `Live named locations for ${selectedTenant.name}` : "Select a tenant"}
        icon={MapPin}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading || !azureTenantId} className="gap-1.5">
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            {canEdit() && azureTenantId && (
              <Button onClick={() => setShowCreate(true)} className="gap-2 bg-slate-900 hover:bg-slate-800">
                <Plus className="h-4 w-4" /> Add Location
              </Button>
            )}
          </div>
        }
      />

      {!canEdit() && <ReadOnlyBanner />}

      {!azureTenantId && (
        <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
          Select a tenant to view and manage named locations.
        </div>
      )}

      {azureTenantId && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Details</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Trusted</th>
                {canEdit() && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" /></td></tr>
              ) : locations.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400 text-sm">No named locations found in Azure. Click "Add Location" to create one.</td></tr>
              ) : locations.map(loc => {
                const locType = getLocType(loc);
                const isTrusted = loc.isTrusted;
                return (
                  <tr key={loc.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-800">{loc.displayName}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs gap-1">
                        {locType === "ip_range" ? <Building className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                        {locType === "ip_range" ? "IP Range" : "Countries"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{getDetail(loc)}</td>
                    <td className="px-4 py-3">
                      <Badge className={isTrusted ? "bg-emerald-50 text-emerald-700 border-0 text-xs" : "bg-slate-100 text-slate-500 border-0 text-xs"}>
                        {isTrusted ? "Trusted" : "Untrusted"}
                      </Badge>
                    </td>
                    {canEdit() && (
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-2"
                          disabled={deleting === loc.id}
                          onClick={() => handleDelete(loc)}
                        >
                          {deleting === loc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-red-400" />}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
                  <SelectItem value="ip_range">IP Range (CIDR)</SelectItem>
                  <SelectItem value="country">Countries / Regions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type === "ip_range" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">IP Ranges (CIDR, comma-separated)</Label>
                <Input value={form.ip_ranges} onChange={e => set("ip_ranges", e.target.value)} placeholder="192.168.1.0/24, 10.0.0.0/8" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Country Codes (comma-separated, e.g. ZA, US, GB)</Label>
                <Input value={form.countries} onChange={e => set("countries", e.target.value)} placeholder="ZA, US, GB" />
              </div>
            )}
            {form.type === "ip_range" && (
              <div className="flex items-center gap-2">
                <Switch checked={form.is_trusted} onCheckedChange={v => set("is_trusted", v)} id="trusted" />
                <Label htmlFor="trusted" className="text-xs cursor-pointer">Mark as Trusted Location</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={handleCreate} disabled={!form.name || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create in Azure
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}