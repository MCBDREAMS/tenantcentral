import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppWindow, Plus, Search, Package, CheckCircle2, XCircle, Upload, Download,
  Cloud, RefreshCw, Loader2, AlertTriangle, Eye, Trash2, Star, Filter,
  Globe, Monitor, Smartphone, Apple
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/shared/PageHeader";
import { logAction } from "@/components/shared/auditLogger";

const APP_TYPE_COLORS = {
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

const GRAPH_TYPE_MAP = {
  win32LobApp: "win32", windowsMobileMSI: "msi", windowsUniversalAppX: "msix",
  windowsStoreApp: "store", webApp: "web_link", iosStoreApp: "ios_store",
  androidStoreApp: "android_store", macOSPkgApp: "macos_pkg", officeSuiteApp: "office365",
};

const emptyApp = {
  app_name: "", publisher: "", version: "", app_type: "win32", category: "productivity",
  platform: "windows", assignment_type: "available", assigned_groups: "All Devices",
  install_command: "", uninstall_command: "", detection_rule: "", description: "",
  package_url: "", state: "published",
};

function PlatformIcon({ platform }) {
  if (platform === "ios" || platform === "macos") return <Apple className="h-4 w-4 text-slate-500" />;
  if (platform === "android") return <Smartphone className="h-4 w-4 text-slate-500" />;
  return <Monitor className="h-4 w-4 text-slate-500" />;
}

export default function CompanyPortal({ selectedTenant }) {
  const [tab, setTab] = useState("catalog");
  const [search, setSearch] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showDeploy, setShowDeploy] = useState(null);
  const [viewApp, setViewApp] = useState(null);
  const [form, setForm] = useState(emptyApp);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);
  const [liveSearch, setLiveSearch] = useState("");
  const [importingId, setImportingId] = useState(null);
  const qc = useQueryClient();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const azureTenantId = selectedTenant?.tenant_id;

  // Local app catalog
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["portal-apps", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.IntuneApp.filter({ tenant_id: selectedTenant.id })
      : base44.entities.IntuneApp.list(),
  });

  // Live Intune apps
  const { data: liveData, isLoading: loadingLive, isFetched: liveFetched, refetch: refetchLive } = useQuery({
    queryKey: ["portal-live-apps", azureTenantId],
    enabled: tab === "live" && !!azureTenantId,
    queryFn: () => base44.functions.invoke("portalData", {
      action: "list_intune_apps_graph",
      azure_tenant_id: azureTenantId,
    }).then(r => r.data),
  });

  const liveApps = liveData?.apps || [];

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.IntuneApp.create(data),
    onSuccess: async (created) => {
      qc.invalidateQueries({ queryKey: ["portal-apps"] });
      await logAction({ action: "CREATE_COMPANY_PORTAL_APP", category: "intune_app", tenant_id: selectedTenant?.id, tenant_name: selectedTenant?.name, target_name: created.app_name, severity: "info" });
      setShowCreate(false);
      setForm(emptyApp);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.IntuneApp.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-apps"] }),
  });

  const deployToIntune = async (app) => {
    if (!azureTenantId) return;
    setDeploying(true);
    setDeployResult(null);
    try {
      const res = await base44.functions.invoke("portalData", {
        action: "deploy_app_to_intune",
        azure_tenant_id: azureTenantId,
        app,
      });
      setDeployResult({ app, result: res.data });
      await logAction({ action: "DEPLOY_COMPANY_PORTAL_APP", category: "intune_app", tenant_id: selectedTenant?.id, tenant_name: selectedTenant?.name, target_name: app.app_name, severity: "info" });
    } catch (e) {
      setDeployResult({ app, result: { success: false, error: e.message } });
    } finally {
      setDeploying(false);
      setShowDeploy(null);
    }
  };

  const importLiveApp = async (app) => {
    if (!selectedTenant?.id) return;
    setImportingId(app.id);
    const appType = GRAPH_TYPE_MAP[app.type] || "win32";
    await base44.entities.IntuneApp.create({
      tenant_id: selectedTenant.id,
      app_name: app.displayName,
      publisher: app.publisher || "",
      version: app.appVersion || "",
      description: app.description || "",
      app_type: appType,
      platform: appType.includes("ios") ? "ios" : appType.includes("android") ? "android" : appType.includes("macos") ? "macos" : "windows",
      assignment_type: app.isAssigned ? "required" : "available",
      state: app.publishingState === "published" ? "published" : "draft",
    });
    qc.invalidateQueries({ queryKey: ["portal-apps"] });
    setImportingId(null);
  };

  const filtered = apps.filter(a => {
    if (filterPlatform !== "all" && a.platform !== filterPlatform) return false;
    if (filterType !== "all" && a.app_type !== filterType) return false;
    if (search && !(a.app_name || "").toLowerCase().includes(search.toLowerCase()) && !(a.publisher || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Company Portal"
        subtitle={selectedTenant ? `App catalog & deployment for ${selectedTenant.name}` : "Select a tenant to manage apps"}
        icon={AppWindow}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchLive()} disabled={loadingLive || !azureTenantId} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Sync from Intune
            </Button>
            <Button onClick={() => { setForm({ ...emptyApp, tenant_id: selectedTenant?.id || "" }); setShowCreate(true); }} className="gap-2 bg-slate-900 hover:bg-slate-800">
              <Plus className="h-4 w-4" /> New App
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="catalog"><Package className="h-3.5 w-3.5 mr-1.5" />App Catalog</TabsTrigger>
          <TabsTrigger value="live"><Cloud className="h-3.5 w-3.5 mr-1.5" />Live from Intune</TabsTrigger>
        </TabsList>

        {/* ── APP CATALOG TAB ── */}
        <TabsContent value="catalog" className="mt-0">
          {/* Filters */}
          <div className="flex gap-3 mb-5 flex-wrap items-center">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <Input placeholder="Search apps..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-8 w-52 text-sm" />
            </div>
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="h-9 w-32 text-sm"><SelectValue placeholder="Platform" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                {["windows", "macos", "ios", "android"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-9 w-32 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {["win32","msi","msix","store","web_link","ios_store","android_store","macos_pkg","office365"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-slate-400 ml-auto">{filtered.length} app{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {isLoading && <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-20 border border-dashed border-slate-200 rounded-2xl text-slate-400">
              <AppWindow className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium text-slate-500">No apps in catalog</p>
              <p className="text-sm mt-1">Add apps manually or sync from Intune.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(app => (
              <div key={app.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                      <Package className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 leading-tight">{app.app_name}</p>
                      <p className="text-xs text-slate-400">{app.publisher}{app.version ? ` · v${app.version}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={`${APP_TYPE_COLORS[app.app_type] || "bg-slate-100 text-slate-600"} text-[10px] border-0`}>{app.app_type}</Badge>
                    <div className="flex items-center gap-1 text-slate-400">
                      <PlatformIcon platform={app.platform} />
                    </div>
                  </div>
                </div>

                {app.description && <p className="text-xs text-slate-500 line-clamp-2">{app.description}</p>}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-slate-400">Assignment: </span>
                    <span className="font-medium text-slate-700">{app.assignment_type?.replace(/_/g, " ")}</span>
                  </div>
                  <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-slate-400">Category: </span>
                    <span className="font-medium text-slate-700">{app.category}</span>
                  </div>
                </div>

                <div className="flex gap-2 mt-auto pt-1">
                  <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" onClick={() => setViewApp(app)}>
                    <Eye className="h-3.5 w-3.5" /> Details
                  </Button>
                  {azureTenantId && (
                    <Button size="sm" className="flex-1 text-xs gap-1 bg-blue-600 hover:bg-blue-700" onClick={() => setShowDeploy(app)} disabled={deploying}>
                      <Upload className="h-3.5 w-3.5" /> Deploy
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="px-2" onClick={() => deleteMut.mutate(app.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── LIVE FROM INTUNE TAB ── */}
        <TabsContent value="live" className="mt-0">
          {!azureTenantId ? (
            <div className="text-center py-20 text-slate-400 text-sm">Select a tenant to view live Intune apps.</div>
          ) : (
            <>
              <div className="flex gap-3 mb-5 flex-wrap items-center">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <Input placeholder="Search Intune apps..." value={liveSearch} onChange={e => setLiveSearch(e.target.value)} className="h-9 pl-8 w-52 text-sm" />
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetchLive()} disabled={loadingLive}>
                  {loadingLive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {liveFetched ? "Refresh" : "Load from Intune"}
                </Button>
                {liveFetched && <span className="text-sm text-slate-400 ml-auto">{liveApps.length} apps in Intune</span>}
              </div>

              {!liveFetched && !loadingLive && (
                <div className="text-center py-20 border border-dashed border-slate-200 rounded-2xl text-slate-400">
                  <Cloud className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium text-slate-500">Click "Load from Intune" to fetch apps</p>
                </div>
              )}

              {loadingLive && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto" /></div>}

              {liveFetched && !loadingLive && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">App</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {liveApps.filter(a => !liveSearch || a.displayName?.toLowerCase().includes(liveSearch.toLowerCase())).map(app => {
                        const mappedType = GRAPH_TYPE_MAP[app.type] || app.type;
                        const alreadyImported = apps.some(a => a.app_name === app.displayName && a.tenant_id === selectedTenant?.id);
                        return (
                          <tr key={app.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center shrink-0">
                                  <Package className="h-4 w-4 text-slate-400" />
                                </div>
                                <div>
                                  <p className="font-medium text-slate-800">{app.displayName}</p>
                                  <p className="text-xs text-slate-400">{app.publisher}{app.appVersion ? ` · v${app.appVersion}` : ""}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={`${APP_TYPE_COLORS[mappedType] || "bg-slate-100 text-slate-600"} text-xs border-0`}>{mappedType}</Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={app.publishingState === "published" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-600 border-0"}>
                                {app.publishingState || "unknown"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              {app.isAssigned ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-300" />}
                            </td>
                            <td className="px-4 py-3">
                              {alreadyImported
                                ? <Badge className="bg-blue-50 text-blue-700 border-0 text-xs">In Catalog</Badge>
                                : <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" disabled={importingId === app.id} onClick={() => importLiveApp(app)}>
                                    {importingId === app.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Import
                                  </Button>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Create App Dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Application</DialogTitle></DialogHeader>
          <Tabs defaultValue="basic">
            <TabsList className="mb-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="install">Install Config</TabsTrigger>
              <TabsTrigger value="assign">Assignment</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5"><Label className="text-xs">App Name *</Label><Input value={form.app_name} onChange={e => set("app_name", e.target.value)} placeholder="Microsoft Teams" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Publisher</Label><Input value={form.publisher} onChange={e => set("publisher", e.target.value)} placeholder="Microsoft Corporation" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Version</Label><Input value={form.version} onChange={e => set("version", e.target.value)} placeholder="1.6.00.12455" /></div>
                <div className="space-y-1.5">
                  <Label className="text-xs">App Type</Label>
                  <Select value={form.app_type} onValueChange={v => set("app_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["win32","msi","msix","store","web_link","ios_store","android_store","macos_pkg","office365"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Platform</Label>
                  <Select value={form.platform} onValueChange={v => set("platform", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["windows","macos","ios","android","all"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select value={form.category} onValueChange={v => set("category", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["productivity","security","developer","utilities","communication","custom"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5"><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="App description..." className="h-20" /></div>
              </div>
            </TabsContent>
            <TabsContent value="install" className="space-y-4">
              <div className="space-y-1.5"><Label className="text-xs">Package URL / Source</Label><Input value={form.package_url} onChange={e => set("package_url", e.target.value)} placeholder="https://cdn.example.com/app.msi" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Install Command</Label><Input value={form.install_command} onChange={e => set("install_command", e.target.value)} placeholder='msiexec /i "app.msi" /quiet' className="font-mono text-xs" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Uninstall Command</Label><Input value={form.uninstall_command} onChange={e => set("uninstall_command", e.target.value)} placeholder='msiexec /x "{GUID}" /quiet' className="font-mono text-xs" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Detection Rule</Label><Textarea value={form.detection_rule} onChange={e => set("detection_rule", e.target.value)} placeholder="File: %ProgramFiles%\App\app.exe" className="h-24 font-mono text-xs" /></div>
            </TabsContent>
            <TabsContent value="assign" className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Assignment Type</Label>
                <Select value={form.assignment_type} onValueChange={v => set("assignment_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Required (auto-install on all devices)</SelectItem>
                    <SelectItem value="available">Available (self-service from Company Portal)</SelectItem>
                    <SelectItem value="uninstall">Uninstall</SelectItem>
                    <SelectItem value="not_assigned">Not Assigned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Assigned Groups</Label><Input value={form.assigned_groups} onChange={e => set("assigned_groups", e.target.value)} placeholder="All Devices, IT Department" /></div>
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
            <Button onClick={() => createMut.mutate({ ...form, tenant_id: selectedTenant?.id })} className="bg-slate-900 hover:bg-slate-800" disabled={!form.app_name || !selectedTenant?.id || createMut.isPending}>
              {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create App
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deploy Confirm Dialog ── */}
      <Dialog open={!!showDeploy && !deployResult} onOpenChange={() => setShowDeploy(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4 text-blue-600" />Deploy to Intune</DialogTitle></DialogHeader>
          {showDeploy && (
            <div className="space-y-3 py-2">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="font-semibold text-slate-800">{showDeploy.app_name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{showDeploy.publisher} · {showDeploy.app_type} · {showDeploy.platform}</p>
              </div>
              <div className="space-y-2 text-sm">
                {[["Assignment", showDeploy.assignment_type?.replace(/_/g," ")], ["Target Groups", showDeploy.assigned_groups || "All Devices"], ["Tenant", selectedTenant?.name]].map(([k,v]) => (
                  <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-medium text-slate-800">{v}</span></div>
                ))}
              </div>
              {showDeploy.app_type === "win32" && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-xs text-amber-800 border border-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Win32 apps require uploading the <code>.intunewin</code> file separately in the Intune portal after creation.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeploy(null)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 gap-2" onClick={() => deployToIntune(showDeploy)} disabled={deploying}>
              {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Deploy to Intune
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deploy Result ── */}
      <Dialog open={!!deployResult} onOpenChange={() => setDeployResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {deployResult?.result?.success ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertTriangle className="h-5 w-5 text-red-500" />}
              {deployResult?.result?.success ? "Deployed Successfully" : "Deployment Failed"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {deployResult?.result?.success ? (
              <div className="space-y-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800">
                  <p className="font-semibold mb-1">✅ App created in Intune</p>
                  <p>App Name: <strong>{deployResult.result.displayName}</strong></p>
                  <p className="text-xs mt-1">Intune ID: <code className="bg-emerald-100 px-1 rounded">{deployResult.result.intuneAppId}</code></p>
                </div>
                <a href="https://intune.microsoft.com/#view/Microsoft_Intune_Apps/AppListBlade" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                  <Globe className="h-3.5 w-3.5" /> Open Intune Apps Portal
                </a>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
                <p className="font-semibold mb-1">Error:</p>
                <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-40">{deployResult?.result?.error}</pre>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setDeployResult(null)} className="bg-slate-900 hover:bg-slate-800">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View App Dialog ── */}
      <Dialog open={!!viewApp} onOpenChange={() => setViewApp(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewApp?.app_name}</DialogTitle></DialogHeader>
          {viewApp && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[["Publisher", viewApp.publisher], ["Version", viewApp.version], ["Type", viewApp.app_type], ["Platform", viewApp.platform], ["Category", viewApp.category], ["Assignment", viewApp.assignment_type?.replace(/_/g," ")], ["State", viewApp.state]].map(([k,v]) => (
                  <div key={k}><span className="text-xs text-slate-400">{k}: </span><span className="font-medium">{v || "—"}</span></div>
                ))}
              </div>
              {viewApp.description && <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{viewApp.description}</p>}
              {viewApp.assigned_groups && <div><p className="text-xs text-slate-400 mb-1">Assigned Groups</p><p className="text-sm">{viewApp.assigned_groups}</p></div>}
              {viewApp.install_command && <div><p className="text-xs text-slate-400 mb-1">Install Command</p><pre className="bg-slate-950 text-emerald-400 text-xs rounded-xl p-3">{viewApp.install_command}</pre></div>}
              {viewApp.detection_rule && <div><p className="text-xs text-slate-400 mb-1">Detection Rule</p><pre className="bg-slate-950 text-emerald-400 text-xs rounded-xl p-3 whitespace-pre-wrap">{viewApp.detection_rule}</pre></div>}
              {azureTenantId && (
                <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => { setViewApp(null); setShowDeploy(viewApp); }}>
                  <Upload className="h-4 w-4" /> Deploy to Intune
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}