import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Smartphone, Plus, Search, RefreshCw, Apple, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";

const platformIcon = (p) => {
  if (p === "ios" || p === "ipados") return <Apple className="h-4 w-4 text-slate-500" />;
  return <Smartphone className="h-4 w-4 text-emerald-600" />;
};

const platformColors = {
  android: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ios: "bg-slate-100 text-slate-700 border-slate-200",
  ipados: "bg-blue-50 text-blue-700 border-blue-200",
};

const enrollmentColors = {
  corporate_owned: "bg-blue-50 text-blue-700",
  byod: "bg-violet-50 text-violet-700",
  dedicated: "bg-amber-50 text-amber-700",
  kiosk: "bg-pink-50 text-pink-700",
};

const EMPTY = {
  device_name: "", platform: "android", os_version: "", model: "", manufacturer: "",
  serial_number: "", imei: "", primary_user: "", enrollment_type: "byod",
  mdm_solution: "intune", compliance_state: "compliant", supervised: false,
  encrypted: true, jailbroken: false, app_protection_policy: "", notes: ""
};

export default function MobileDevices({ selectedTenant, tenants }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [compliance, setCompliance] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);

  const { data: devices = [], isLoading, refetch } = useQuery({
    queryKey: ["mobile-devices", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.MobileDevice.filter({ tenant_id: selectedTenant.id }, "-created_date", 200)
      : base44.entities.MobileDevice.list("-created_date", 200),
  });

  const save = useMutation({
    mutationFn: (d) => editing
      ? base44.entities.MobileDevice.update(editing.id, d)
      : base44.entities.MobileDevice.create({ ...d, tenant_id: selectedTenant?.id || tenants?.[0]?.id }),
    onSuccess: () => { qc.invalidateQueries(["mobile-devices"]); setOpen(false); setEditing(null); setForm(EMPTY); }
  });

  const del = useMutation({
    mutationFn: (id) => base44.entities.MobileDevice.delete(id),
    onSuccess: () => qc.invalidateQueries(["mobile-devices"])
  });

  const filtered = devices.filter(d => {
    if (platform !== "all" && d.platform !== platform) return false;
    if (compliance !== "all" && d.compliance_state !== compliance) return false;
    if (search) {
      const s = search.toLowerCase();
      return (d.device_name || "").toLowerCase().includes(s) ||
        (d.primary_user || "").toLowerCase().includes(s) ||
        (d.model || "").toLowerCase().includes(s) ||
        (d.serial_number || "").toLowerCase().includes(s);
    }
    return true;
  });

  const openEdit = (d) => { setEditing(d); setForm(d); setOpen(true); };
  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };

  const stats = {
    total: devices.length,
    android: devices.filter(d => d.platform === "android").length,
    ios: devices.filter(d => d.platform === "ios" || d.platform === "ipados").length,
    nonCompliant: devices.filter(d => d.compliance_state === "non_compliant").length,
    jailbroken: devices.filter(d => d.jailbroken).length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Mobile Devices"
        subtitle="Android & iOS device management across tenants"
        icon={Smartphone}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button size="sm" onClick={openNew} className="gap-1.5 bg-slate-900 hover:bg-slate-800">
              <Plus className="h-3.5 w-3.5" /> Add Device
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { label: "Total", value: stats.total, color: "text-slate-800" },
          { label: "Android", value: stats.android, color: "text-emerald-600" },
          { label: "iOS / iPadOS", value: stats.ios, color: "text-slate-600" },
          { label: "Non-Compliant", value: stats.nonCompliant, color: "text-red-600" },
          { label: "Jailbroken / Rooted", value: stats.jailbroken, color: "text-amber-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Search devices, users, models..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="android">Android</SelectItem>
            <SelectItem value="ios">iOS</SelectItem>
            <SelectItem value="ipados">iPadOS</SelectItem>
          </SelectContent>
        </Select>
        <Select value={compliance} onValueChange={setCompliance}>
          <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="Compliance" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Compliance</SelectItem>
            <SelectItem value="compliant">Compliant</SelectItem>
            <SelectItem value="non_compliant">Non-Compliant</SelectItem>
            <SelectItem value="in_grace_period">Grace Period</SelectItem>
            <SelectItem value="not_evaluated">Not Evaluated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Device</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Platform</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Enrollment</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">MDM</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Compliance</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Flags</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Check-In</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-400 text-sm">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-400 text-sm">No mobile devices found</td></tr>
              ) : filtered.map(d => (
                <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {platformIcon(d.platform)}
                      <div>
                        <div className="font-medium text-slate-800 text-xs">{d.device_name}</div>
                        <div className="text-xs text-slate-400">{d.model || d.manufacturer || "-"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`${platformColors[d.platform]} text-xs`}>
                      {d.platform?.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{d.primary_user || "-"}</td>
                  <td className="px-4 py-3">
                    <Badge className={`${enrollmentColors[d.enrollment_type] || "bg-slate-100 text-slate-600"} border-0 text-xs`}>
                      {(d.enrollment_type || "").replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 font-medium">{(d.mdm_solution || "").replace(/_/g, " ")}</td>
                  <td className="px-4 py-3"><StatusBadge status={d.compliance_state} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {d.jailbroken && <Badge variant="outline" className="text-[10px] border-red-200 text-red-600 bg-red-50">Jailbroken</Badge>}
                      {!d.encrypted && <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600 bg-amber-50">Unencrypted</Badge>}
                      {d.supervised && <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-600 bg-blue-50">Supervised</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{d.last_check_in || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(d)}>Edit</Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500 hover:text-red-700" onClick={() => del.mutate(d.id)}>Del</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Mobile Device" : "Add Mobile Device"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {[
              { label: "Device Name", key: "device_name", required: true },
              { label: "Model", key: "model" },
              { label: "Manufacturer", key: "manufacturer" },
              { label: "OS Version", key: "os_version" },
              { label: "Serial Number", key: "serial_number" },
              { label: "IMEI", key: "imei" },
              { label: "Primary User", key: "primary_user" },
              { label: "App Protection Policy", key: "app_protection_policy" },
            ].map(f => (
              <div key={f.key} className={f.key === "device_name" ? "col-span-2" : ""}>
                <Label className="text-xs">{f.label}</Label>
                <Input value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className="h-8 text-sm mt-1" />
              </div>
            ))}
            {[
              { label: "Platform", key: "platform", options: ["android", "ios", "ipados"] },
              { label: "Enrollment", key: "enrollment_type", options: ["corporate_owned", "byod", "dedicated", "kiosk"] },
              { label: "MDM Solution", key: "mdm_solution", options: ["intune", "jamf", "workspace_one", "kandji", "mosyle", "other"] },
              { label: "Compliance", key: "compliance_state", options: ["compliant", "non_compliant", "in_grace_period", "not_evaluated"] },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs">{f.label}</Label>
                <Select value={form[f.key]} onValueChange={v => setForm(p => ({ ...p, [f.key]: v }))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{f.options.map(o => <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
            {[
              { label: "Supervised", key: "supervised" },
              { label: "Encrypted", key: "encrypted" },
              { label: "Jailbroken / Rooted", key: "jailbroken" },
            ].map(f => (
              <div key={f.key} className="flex items-center gap-2 col-span-1">
                <Switch checked={!!form[f.key]} onCheckedChange={v => setForm(p => ({ ...p, [f.key]: v }))} />
                <Label className="text-xs">{f.label}</Label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="bg-slate-900 hover:bg-slate-800">
              {save.isPending ? "Saving..." : editing ? "Update" : "Add Device"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}