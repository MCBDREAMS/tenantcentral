import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Server, Plus, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock, Activity, Loader2, Cloud, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import { format } from "date-fns";

function fmt(v) {
  if (!v) return "Never";
  try { return format(new Date(v), "PPpp"); } catch { return v; }
}

const statusConfig = {
  healthy: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500" },
  warning: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50 border-amber-200 text-amber-700", dot: "bg-amber-500" },
  error: { icon: XCircle, color: "text-red-500", bg: "bg-red-50 border-red-200 text-red-700", dot: "bg-red-500" },
  stopped: { icon: XCircle, color: "text-slate-400", bg: "bg-slate-100 border-slate-200 text-slate-600", dot: "bg-slate-400" },
  unknown: { icon: Clock, color: "text-slate-400", bg: "bg-slate-100 border-slate-200 text-slate-600", dot: "bg-slate-300" },
};

const syncTypeLabels = {
  entra_connect: "Microsoft Entra Connect",
  ad_connect: "AD Connect",
  password_hash_sync: "Password Hash Sync",
  pass_through_auth: "Pass-Through Auth",
  federation: "Federation (ADFS)",
};

const EMPTY = {
  server_name: "", sync_type: "entra_connect", sync_status: "unknown",
  last_sync_time: "", last_sync_duration_minutes: 0, objects_synced: 0,
  sync_errors: 0, password_sync_enabled: true, password_writeback_enabled: false,
  device_writeback_enabled: false, version: "", domain: "", forest: "",
  staging_mode: false, error_details: "", notes: ""
};

export default function OnPremSync({ selectedTenant, tenants }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState("live");

  const azureTenantId = selectedTenant?.tenant_id;

  // Live sync status from Graph
  const { data: liveData, isLoading: loadingLive, refetch: refetchLive } = useQuery({
    queryKey: ["onprem_sync_live", azureTenantId],
    enabled: !!azureTenantId && tab === "live",
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_onprem_sync_status",
        azure_tenant_id: azureTenantId,
      }).then(r => r.data),
  });

  // Local manually-entered records
  const { data: servers = [], isLoading: loadingLocal, refetch: refetchLocal } = useQuery({
    queryKey: ["onprem-sync-local", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.OnPremSync.filter({ tenant_id: selectedTenant.id })
      : base44.entities.OnPremSync.list("-created_date", 100),
  });

  const save = useMutation({
    mutationFn: (d) => editing
      ? base44.entities.OnPremSync.update(editing.id, d)
      : base44.entities.OnPremSync.create({ ...d, tenant_id: selectedTenant?.id || tenants?.[0]?.id }),
    onSuccess: () => { qc.invalidateQueries(["onprem-sync-local"]); setOpen(false); setEditing(null); setForm(EMPTY); }
  });

  const del = useMutation({
    mutationFn: (id) => base44.entities.OnPremSync.delete(id),
    onSuccess: () => qc.invalidateQueries(["onprem-sync-local"])
  });

  const openEdit = (s) => { setEditing(s); setForm(s); setOpen(true); };
  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="On-Prem Sync & AD Connect"
        subtitle="Monitor Microsoft Entra Connect and on-premises directory synchronization"
        icon={Server}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => tab === "live" ? refetchLive() : refetchLocal()} disabled={loadingLive || loadingLocal} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${(loadingLive || loadingLocal) ? "animate-spin" : ""}`} /> Refresh
            </Button>
            {tab === "manual" && (
              <Button size="sm" onClick={openNew} className="gap-1.5 bg-slate-900 hover:bg-slate-800">
                <Plus className="h-3.5 w-3.5" /> Add Server
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mt-0">
        <TabsList className="mb-5">
          <TabsTrigger value="live"><Cloud className="h-3.5 w-3.5 mr-1.5" />Live from Azure</TabsTrigger>
          <TabsTrigger value="manual"><Database className="h-3.5 w-3.5 mr-1.5" />Manual Records</TabsTrigger>
        </TabsList>

        {/* ── LIVE TAB ── */}
        <TabsContent value="live">
          {!azureTenantId ? (
            <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
              Select a tenant to view live sync status from Azure.
            </div>
          ) : loadingLive ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
          ) : liveData ? (
            <div className="space-y-4">
              {/* Org Sync Summary Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${liveData.syncEnabled ? "bg-emerald-50" : "bg-red-50"}`}>
                    {liveData.syncEnabled
                      ? <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                      : <XCircle className="h-6 w-6 text-red-400" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-sm font-semibold text-slate-900">Microsoft Entra Connect Sync</h3>
                      <Badge className={liveData.syncEnabled ? "bg-emerald-100 text-emerald-700 border-0" : "bg-red-100 text-red-700 border-0"}>
                        {liveData.syncEnabled ? "Enabled" : "Disabled / Cloud-only"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Last Sync</p>
                        <p className="text-sm font-semibold text-slate-800 mt-0.5">{fmt(liveData.lastSyncDateTime)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Sync Enabled</p>
                        <p className="text-sm font-semibold text-slate-800 mt-0.5">{liveData.syncEnabled ? "Yes" : "No"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Provisioning Errors</p>
                        <p className={`text-sm font-semibold mt-0.5 ${(liveData.provisioningErrors?.length || 0) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {liveData.provisioningErrors?.length || 0} error(s)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {(liveData.provisioningErrors?.length || 0) > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Provisioning Errors</p>
                    {liveData.provisioningErrors.map((err, i) => (
                      <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
                        <p className="font-semibold">{err.category || "Error"}</p>
                        <p className="mt-0.5">{err.value || JSON.stringify(err)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {(liveData.connectHealth?.length || 0) > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Entra Connect Health</p>
                    <div className="space-y-2">
                      {liveData.connectHealth.map((h, i) => (
                        <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                          <pre className="whitespace-pre-wrap text-slate-600">{JSON.stringify(h, null, 2)}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
                <strong>Note:</strong> Full Entra Connect Health data requires the <code className="bg-blue-100 px-1 rounded">ADHybridHealthService.Read.All</code> permission. 
                For detailed server-level monitoring, use the Manual Records tab.
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-slate-400 text-sm">No sync data available.</div>
          )}
        </TabsContent>

        {/* ── MANUAL RECORDS TAB ── */}
        <TabsContent value="manual">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {[
              { label: "Servers", value: servers.length, color: "text-slate-800" },
              { label: "Healthy", value: servers.filter(s => s.sync_status === "healthy").length, color: "text-emerald-600" },
              { label: "Warning", value: servers.filter(s => s.sync_status === "warning").length, color: "text-amber-600" },
              { label: "Error", value: servers.filter(s => ["error", "stopped"].includes(s.sync_status)).length, color: "text-red-600" },
              { label: "Sync Errors", value: servers.reduce((a, s) => a + (s.sync_errors || 0), 0), color: "text-red-500" },
              { label: "Objects Synced", value: servers.reduce((a, s) => a + (s.objects_synced || 0), 0).toLocaleString(), color: "text-blue-600" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {loadingLocal ? (
            <div className="text-center py-20 text-slate-400">Loading sync servers...</div>
          ) : servers.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Server className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No sync servers manually configured yet.</p>
              <Button size="sm" className="mt-4 bg-slate-900 hover:bg-slate-800" onClick={openNew}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Sync Server
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {servers.map(s => {
                const cfg = statusConfig[s.sync_status] || statusConfig.unknown;
                const StatusIcon = cfg.icon;
                return (
                  <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="relative shrink-0">
                          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                            <Server className="h-5 w-5 text-slate-600" />
                          </div>
                          <div className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white ${cfg.dot}`} />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{s.server_name}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{syncTypeLabels[s.sync_type] || s.sync_type}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className={`${cfg.bg} text-xs shrink-0`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {(s.sync_status || "unknown").replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
                      {[
                        { label: "Last Sync", value: s.last_sync_time || "Never" },
                        { label: "Objects Synced", value: (s.objects_synced || 0).toLocaleString() },
                        { label: "Sync Errors", value: s.sync_errors || 0, highlight: s.sync_errors > 0 },
                        { label: "Version", value: s.version || "-" },
                      ].map(m => (
                        <div key={m.label}>
                          <div className="text-[10px] text-slate-400 uppercase tracking-wide">{m.label}</div>
                          <div className={`text-sm font-semibold mt-0.5 ${m.highlight ? "text-red-600" : "text-slate-800"}`}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEdit(s)}>Edit</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => del.mutate(s.id)}>Remove</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Sync Server" : "Add Sync Server"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label className="text-xs">Server Name</Label>
              <Input value={form.server_name || ""} onChange={e => setForm(p => ({ ...p, server_name: e.target.value }))} className="h-8 text-sm mt-1" placeholder="e.g. DC01-AADSYNC" />
            </div>
            {[
              { label: "Sync Type", key: "sync_type", options: Object.entries(syncTypeLabels).map(([k, v]) => ({ value: k, label: v })) },
              { label: "Sync Status", key: "sync_status", options: ["healthy", "warning", "error", "stopped", "unknown"].map(o => ({ value: o, label: o })) },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs">{f.label}</Label>
                <Select value={form[f.key]} onValueChange={v => setForm(p => ({ ...p, [f.key]: v }))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{f.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
            {[
              { label: "Domain", key: "domain", placeholder: "contoso.com" },
              { label: "Forest", key: "forest", placeholder: "contoso.local" },
              { label: "Version", key: "version", placeholder: "2.3.x" },
              { label: "Last Sync", key: "last_sync_time", placeholder: "YYYY-MM-DD" },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs">{f.label}</Label>
                <Input value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className="h-8 text-sm mt-1" placeholder={f.placeholder} />
              </div>
            ))}
            {[
              { label: "Objects Synced", key: "objects_synced" },
              { label: "Sync Errors", key: "sync_errors" },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs">{f.label}</Label>
                <Input type="number" value={form[f.key] || 0} onChange={e => setForm(p => ({ ...p, [f.key]: parseInt(e.target.value) || 0 }))} className="h-8 text-sm mt-1" />
              </div>
            ))}
            {[
              { label: "Password Hash Sync", key: "password_sync_enabled" },
              { label: "Password Writeback", key: "password_writeback_enabled" },
              { label: "Device Writeback", key: "device_writeback_enabled" },
              { label: "Staging Mode", key: "staging_mode" },
            ].map(f => (
              <div key={f.key} className="flex items-center gap-2">
                <Switch checked={!!form[f.key]} onCheckedChange={v => setForm(p => ({ ...p, [f.key]: v }))} />
                <Label className="text-xs">{f.label}</Label>
              </div>
            ))}
            <div className="col-span-2">
              <Label className="text-xs">Error Details</Label>
              <Textarea value={form.error_details || ""} onChange={e => setForm(p => ({ ...p, error_details: e.target.value }))} className="text-sm mt-1 h-20" placeholder="Error messages..." />
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