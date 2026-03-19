import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppWindow, Plus, Trash2, Eye, Package, CheckCircle2, XCircle, RefreshCw, Loader2, Download, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { logAction } from "@/components/shared/auditLogger";

const appTypeColors = {
  win32: "bg-blue-50 text-blue-700",
  msi: "bg-cyan-50 text-cyan-700",
  msix: "bg-indigo-50 text-indigo-700",
  store: "bg-violet-50 text-violet-700",
  web_link: "bg-pink-50 text-pink-700",
  ios_store: "bg-orange-50 text-orange-700",
  android_store: "bg-green-50 text-green-700",
  macos_pkg: "bg-amber-50 text-amber-700",
  office365: "bg-red-50 text-red-700",
};

const emptyForm = {
  app_name: "", publisher: "", version: "", app_type: "win32", category: "productivity",
  platform: "windows", assignment_type: "available", assigned_groups: "",
  install_command: "", uninstall_command: "", detection_rule: "", description: "",
  package_url: "", state: "published",
};

const GRAPH_TYPE_MAP = {
  win32LobApp: "win32",
  windowsMobileMSI: "msi",
  windowsUniversalAppX: "msix",
  windowsStoreApp: "store",
  webApp: "web_link",
  iosStoreApp: "ios_store",
  androidStoreApp: "android_store",
  macOSPkgApp: "macos_pkg",
  officeSuiteApp: "office365",
};

export default function IntuneApps({ selectedTenant, tenants }) {
  const [showCreate, setShowCreate] = useState(false);
  const [viewApp, setViewApp] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [mainTab, setMainTab] = useState("local");
  const [liveSearch, setLiveSearch] = useState("");
  const [importingId, setImportingId] = useState(null);
  const queryClient = useQueryClient();

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["intune-apps", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.IntuneApp.filter({ tenant_id: selectedTenant.id })
      : base44.entities.IntuneApp.list(),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
    initialData: tenants || [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.IntuneApp.create(data),
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: ["intune-apps"] });
      const tn = allTenants.find(t => t.id === created.tenant_id)?.name || "";
      await logAction({ action: "CREATE_INTUNE_APP", category: "intune_app", tenant_id: created.tenant_id, tenant_name: tn, target_name: created.app_name, severity: "info" });
      setShowCreate(false);
      setForm(emptyForm);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.IntuneApp.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["intune-apps"] }),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const getTenantName = (tid) => allTenants.find(t => t.id === tid)?.name || "Unknown";

  const filtered = apps.filter(a => {
    if (filterType !== "all" && a.app_type !== filterType) return false;
    if (search && !(a.app_name || "").toLowerCase().includes(search.toLowerCase()) && !(a.publisher || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Intune Apps"
        subtitle={selectedTenant ? `Apps for ${selectedTenant.name}` : "All tenant apps"}
        icon={AppWindow}
        actions={
          <Button onClick={() => { setForm({ ...emptyForm, tenant_id: selectedTenant?.id || allTenants[0]?.id || "" }); setShowCreate(true); }} className="gap-2 bg-slate-900 hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Add App
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <Input placeholder="Search apps..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 w-56 text-sm" />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="App Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {["win32","msi","msix","store","web_link","ios_store","android_store","macos_pkg","office365"].map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-slate-400 self-center ml-auto">{filtered.length} apps</span>
      </div>

      {/* App Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-3 text-center py-16 text-slate-400 text-sm">Loading apps...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-3 text-center py-16 text-slate-400">
            <AppWindow className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No apps yet. Add one to get started.</p>
          </div>
        ) : filtered.map(app => (
          <div key={app.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                  <Package className="h-5 w-5 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{app.app_name}</p>
                  <p className="text-xs text-slate-400">{app.publisher} {app.version ? `· v${app.version}` : ""}</p>
                </div>
              </div>
              <StatusBadge status={app.state} />
            </div>

            <div className="flex gap-2 flex-wrap">
              <Badge className={`${appTypeColors[app.app_type] || "bg-slate-100 text-slate-600"} text-xs border-0`}>{app.app_type}</Badge>
              <Badge variant="outline" className="text-xs">{app.platform}</Badge>
              <Badge variant="outline" className="text-xs">{app.assignment_type?.replace(/_/g, " ")}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-50 rounded-lg px-3 py-2 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <div>
                  <p className="font-semibold text-emerald-700">{app.install_count || 0}</p>
                  <p className="text-emerald-600">Installed</p>
                </div>
              </div>
              <div className="bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2">
                <XCircle className="h-3.5 w-3.5 text-red-400" />
                <div>
                  <p className="font-semibold text-red-700">{app.failed_count || 0}</p>
                  <p className="text-red-600">Failed</p>
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-400 bg-slate-50 rounded px-2 py-1">
              Tenant: <span className="font-medium text-slate-600">{getTenantName(app.tenant_id)}</span>
            </div>

            <div className="flex gap-2 mt-auto">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => setViewApp(app)}>
                <Eye className="h-3.5 w-3.5" /> View Details
              </Button>
              <Button variant="ghost" size="sm" className="px-2" onClick={() => deleteMut.mutate(app.id)}>
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Intune App / Package</DialogTitle></DialogHeader>
          <Tabs defaultValue="basic">
            <TabsList className="bg-slate-100 mb-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="install">Install Config</TabsTrigger>
              <TabsTrigger value="assign">Assignment</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">App Name</Label>
                  <Input value={form.app_name || ""} onChange={e => set("app_name", e.target.value)} placeholder="Microsoft Teams" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Publisher</Label>
                  <Input value={form.publisher || ""} onChange={e => set("publisher", e.target.value)} placeholder="Microsoft" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Version</Label>
                  <Input value={form.version || ""} onChange={e => set("version", e.target.value)} placeholder="1.6.00.12455" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">App Type</Label>
                  <Select value={form.app_type} onValueChange={v => set("app_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["win32","msi","msix","store","web_link","ios_store","android_store","macos_pkg","office365"].map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Platform</Label>
                  <Select value={form.platform} onValueChange={v => set("platform", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["windows","macos","ios","android","all"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select value={form.category} onValueChange={v => set("category", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["productivity","security","developer","utilities","communication","custom"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Textarea value={form.description || ""} onChange={e => set("description", e.target.value)} placeholder="App description..." className="h-20" />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="install" className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Package URL / Source</Label>
                <Input value={form.package_url || ""} onChange={e => set("package_url", e.target.value)} placeholder="https://cdn.example.com/teams.msi" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Install Command</Label>
                <Input value={form.install_command || ""} onChange={e => set("install_command", e.target.value)} placeholder='msiexec /i "Teams.msi" /quiet' className="font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Uninstall Command</Label>
                <Input value={form.uninstall_command || ""} onChange={e => set("uninstall_command", e.target.value)} placeholder='msiexec /x "{GUID}" /quiet' className="font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Detection Rule</Label>
                <Textarea value={form.detection_rule || ""} onChange={e => set("detection_rule", e.target.value)} placeholder="File: %ProgramFiles%\Teams\Teams.exe&#10;Registry: HKLM\Software\Teams" className="h-24 font-mono text-xs" />
              </div>
            </TabsContent>
            <TabsContent value="assign" className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Assignment Type</Label>
                <Select value={form.assignment_type} onValueChange={v => set("assignment_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Required (auto-install)</SelectItem>
                    <SelectItem value="available">Available (self-service)</SelectItem>
                    <SelectItem value="uninstall">Uninstall</SelectItem>
                    <SelectItem value="not_assigned">Not Assigned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Assigned Groups (comma separated)</Label>
                <Input value={form.assigned_groups || ""} onChange={e => set("assigned_groups", e.target.value)} placeholder="All Users, IT Department, Sales Team" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">State</Label>
                <Select value={form.state} onValueChange={v => set("state", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate(form)} className="bg-slate-900 hover:bg-slate-800" disabled={!form.app_name || !form.tenant_id}>
              Create App
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewApp} onOpenChange={() => setViewApp(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewApp?.app_name}</DialogTitle></DialogHeader>
          {viewApp && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Publisher", viewApp.publisher], ["Version", viewApp.version],
                  ["Type", viewApp.app_type], ["Platform", viewApp.platform],
                  ["Category", viewApp.category], ["Assignment", viewApp.assignment_type?.replace(/_/g," ")],
                  ["Tenant", getTenantName(viewApp.tenant_id)], ["State", viewApp.state],
                ].map(([k, v]) => (
                  <div key={k}><span className="text-xs text-slate-400">{k}:</span> <span className="font-medium">{v || "-"}</span></div>
                ))}
              </div>
              {viewApp.description && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{viewApp.description}</p>}
              {viewApp.assigned_groups && (
                <div><p className="text-xs text-slate-400 mb-1">Assigned Groups</p><p className="text-sm">{viewApp.assigned_groups}</p></div>
              )}
              {viewApp.install_command && (
                <div><p className="text-xs text-slate-400 mb-1">Install Command</p>
                <pre className="bg-slate-950 text-emerald-400 text-xs rounded-lg p-3">{viewApp.install_command}</pre></div>
              )}
              {viewApp.detection_rule && (
                <div><p className="text-xs text-slate-400 mb-1">Detection Rule</p>
                <pre className="bg-slate-950 text-emerald-400 text-xs rounded-lg p-3 whitespace-pre-wrap">{viewApp.detection_rule}</pre></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

}