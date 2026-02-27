import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/shared/PageHeader";

const MDM_LOGOS = {
  intune: { label: "Microsoft Intune", color: "bg-blue-600", text: "IN" },
  jamf: { label: "Jamf Pro", color: "bg-red-600", text: "JF" },
  workspace_one: { label: "VMware Workspace ONE", color: "bg-emerald-600", text: "WO" },
  kandji: { label: "Kandji", color: "bg-violet-600", text: "KA" },
  mosyle: { label: "Mosyle", color: "bg-amber-600", text: "MO" },
  other: { label: "Other MDM", color: "bg-slate-500", text: "??" },
};

const statusIcon = (s) => {
  if (s === "connected") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (s === "error") return <XCircle className="h-4 w-4 text-red-500" />;
  if (s === "disconnected") return <XCircle className="h-4 w-4 text-slate-400" />;
  return <Clock className="h-4 w-4 text-amber-500" />;
};

const EMPTY = {
  solution_name: "intune", is_active: true, platform_scope: "all",
  server_url: "", api_endpoint: "", auth_method: "oauth2",
  connection_status: "pending", managed_device_count: 0, notes: ""
};

export default function MdmSolutions({ selectedTenant, tenants }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);

  const { data: solutions = [], isLoading, refetch } = useQuery({
    queryKey: ["mdm-solutions", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.MdmSolution.filter({ tenant_id: selectedTenant.id })
      : base44.entities.MdmSolution.list("-created_date", 100),
  });

  const save = useMutation({
    mutationFn: (d) => editing
      ? base44.entities.MdmSolution.update(editing.id, d)
      : base44.entities.MdmSolution.create({ ...d, tenant_id: selectedTenant?.id || tenants?.[0]?.id }),
    onSuccess: () => { qc.invalidateQueries(["mdm-solutions"]); setOpen(false); setEditing(null); setForm(EMPTY); }
  });

  const del = useMutation({
    mutationFn: (id) => base44.entities.MdmSolution.delete(id),
    onSuccess: () => qc.invalidateQueries(["mdm-solutions"])
  });

  const openEdit = (s) => { setEditing(s); setForm(s); setOpen(true); };
  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="MDM Solutions"
        subtitle="Configure and manage MDM integrations per tenant"
        icon={Layers}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button size="sm" onClick={openNew} className="gap-1.5 bg-slate-900 hover:bg-slate-800">
              <Plus className="h-3.5 w-3.5" /> Add MDM
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="text-center py-20 text-slate-400">Loading MDM solutions...</div>
      ) : solutions.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No MDM solutions configured. Add one to get started.</p>
          <Button size="sm" className="mt-4 bg-slate-900 hover:bg-slate-800" onClick={openNew}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add MDM Solution
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {solutions.map(s => {
            const meta = MDM_LOGOS[s.solution_name] || MDM_LOGOS.other;
            return (
              <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl ${meta.color} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                      {meta.text}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{meta.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{(s.platform_scope || "all").replace(/_/g, " ")} scope</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusIcon(s.connection_status)}
                    <Switch
                      checked={!!s.is_active}
                      onCheckedChange={v => save.mutate({ ...s, is_active: v })}
                      className="scale-75"
                    />
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-600 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Status</span>
                    <Badge variant="outline" className={
                      s.connection_status === "connected" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                      s.connection_status === "error" ? "border-red-200 bg-red-50 text-red-700" :
                      "border-slate-200 bg-slate-50 text-slate-600"
                    }>
                      {(s.connection_status || "pending").replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Managed Devices</span>
                    <span className="font-semibold text-slate-800">{s.managed_device_count || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Auth Method</span>
                    <span>{(s.auth_method || "oauth2").replace(/_/g, " ")}</span>
                  </div>
                  {s.last_sync && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Last Sync</span>
                      <span>{s.last_sync}</span>
                    </div>
                  )}
                  {s.server_url && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Server</span>
                      <span className="truncate max-w-[140px] text-blue-600">{s.server_url}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => openEdit(s)}>Configure</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => del.mutate(s.id)}>Remove</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Configure MDM Solution" : "Add MDM Solution"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">MDM Solution</Label>
              <Select value={form.solution_name} onValueChange={v => setForm(p => ({ ...p, solution_name: v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MDM_LOGOS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Platform Scope</Label>
              <Select value={form.platform_scope} onValueChange={v => setForm(p => ({ ...p, platform_scope: v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["all", "windows", "macos", "ios", "android", "mobile_only"].map(o => (
                    <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {[
              { label: "Server URL", key: "server_url", placeholder: "https://yourserver.com" },
              { label: "API Endpoint", key: "api_endpoint", placeholder: "https://api.yourserver.com/v1" },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs">{f.label}</Label>
                <Input value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className="h-8 text-sm mt-1" placeholder={f.placeholder} />
              </div>
            ))}
            <div>
              <Label className="text-xs">Auth Method</Label>
              <Select value={form.auth_method} onValueChange={v => setForm(p => ({ ...p, auth_method: v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["oauth2", "api_key", "certificate", "basic"].map(o => (
                    <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Connection Status</Label>
              <Select value={form.connection_status} onValueChange={v => setForm(p => ({ ...p, connection_status: v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["connected", "disconnected", "error", "pending"].map(o => (
                    <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Managed Device Count</Label>
              <Input type="number" value={form.managed_device_count || 0} onChange={e => setForm(p => ({ ...p, managed_device_count: parseInt(e.target.value) || 0 }))} className="h-8 text-sm mt-1" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={!!form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
              <Label className="text-xs">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="bg-slate-900 hover:bg-slate-800">
              {save.isPending ? "Saving..." : editing ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}