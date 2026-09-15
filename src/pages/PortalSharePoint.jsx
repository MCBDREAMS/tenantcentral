import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Globe, Search, RefreshCw, ExternalLink, FolderArchive, ShieldCheck, HardDrive, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import { exportToCSV } from "@/components/shared/exportUtils";

const gb = (n) => (n == null ? "—" : `${n} GB`);

export default function PortalSharePoint({ selectedTenant }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("sites");
  const tenantId = selectedTenant?.tenant_id;

  const { data: result, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["sharepoint_inventory", tenantId],
    enabled: !!tenantId,
    queryFn: () =>
      base44.functions
        .invoke("portalData", { action: "sharepoint_inventory", azure_tenant_id: tenantId, top: 100 })
        .then((r) => r.data),
  });

  const sp = result?.sharepoint || {};
  const sites = sp.sites || [];
  const libraries = sp.libraries || [];
  const permissions = sp.permissions || [];
  const storage = sp.storage || [];
  const warnings = sp.warnings || [];

  const filteredSites = useMemo(() =>
    sites.filter(s =>
      !search ||
      s.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      s.webUrl?.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase())
    ), [sites, search]);

  const filteredLibs = useMemo(() =>
    libraries.filter(l =>
      !search ||
      l.siteName?.toLowerCase().includes(search.toLowerCase()) ||
      l.libraryName?.toLowerCase().includes(search.toLowerCase())
    ), [libraries, search]);

  const filteredPerms = useMemo(() =>
    permissions.filter(p =>
      !search ||
      p.siteName?.toLowerCase().includes(search.toLowerCase()) ||
      p.grantedTo?.toLowerCase().includes(search.toLowerCase()) ||
      p.roles?.toLowerCase().includes(search.toLowerCase())
    ), [permissions, search]);

  if (!tenantId) return (
    <div className="p-6">
      <PageHeader title="SharePoint" subtitle="SharePoint site management" icon={Globe} />
      <div className="text-sm text-slate-500 mt-4">Select a tenant to continue.</div>
    </div>
  );

  const totalUsedGb = storage.reduce((a, s) => a + (s.usedGb || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="SharePoint"
        subtitle={`Sites, libraries, permissions & storage for ${selectedTenant?.name}`}
        icon={Globe}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => exportToCSV(
              tab === "sites" ? filteredSites.map(s => ({ name: s.displayName, url: s.webUrl, description: s.description, created: s.createdDateTime, modified: s.lastModifiedDateTime, personal: s.isPersonal ? "Yes" : "No" })) :
              tab === "libraries" ? filteredLibs :
              tab === "permissions" ? filteredPerms :
              storage,
              `sharepoint_${tab}`
            )} disabled={isLoading} className="gap-2">
              <Globe className="h-3.5 w-3.5" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading || isRefetching}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading || isRefetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Sites", value: sites.length, icon: LayoutGrid },
          { label: "Libraries", value: libraries.length, icon: FolderArchive },
          { label: "Permissions", value: permissions.length, icon: ShieldCheck },
          { label: "Total Used", value: gb(Math.round(totalUsedGb * 10) / 10), icon: HardDrive },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <k.icon className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800 leading-tight">{k.value}</p>
              <p className="text-xs text-slate-500">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="text-sm text-red-500 mb-4">{error.message}</div>}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-800">
          <strong>Some data unavailable:</strong> {warnings.length} warning(s). Permissions may require <code className="bg-amber-100 px-1 rounded">Sites.FullControl.All</code>; sites/libraries require <code className="bg-amber-100 px-1 rounded">Sites.Read.All</code> in your Azure App Registration.
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sites, libraries or permissions…" className="pl-9" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="sites" className="gap-1.5"><LayoutGrid className="h-3.5 w-3.5" /> Sites</TabsTrigger>
          <TabsTrigger value="libraries" className="gap-1.5"><FolderArchive className="h-3.5 w-3.5" /> Libraries</TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Permissions</TabsTrigger>
          <TabsTrigger value="storage" className="gap-1.5"><HardDrive className="h-3.5 w-3.5" /> Storage</TabsTrigger>
        </TabsList>

        {/* ── Sites ── */}
        <TabsContent value="sites">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Site", "Description", "Created", "Modified", "Personal", "Link"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" /></td></tr>
                    ))
                  : filteredSites.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-800">{s.displayName || "Unnamed"}</td>
                        <td className="px-4 py-3 text-slate-500 max-w-[320px]"><span className="line-clamp-1">{s.description || "—"}</span></td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{s.createdDateTime ? new Date(s.createdDateTime).toLocaleDateString() : "—"}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{s.lastModifiedDateTime ? new Date(s.lastModifiedDateTime).toLocaleDateString() : "—"}</td>
                        <td className="px-4 py-3">{s.isPersonal ? <Badge className="bg-purple-100 text-purple-700">Personal</Badge> : <span className="text-slate-400">—</span>}</td>
                        <td className="px-4 py-3">
                          {s.webUrl && (
                            <a href={s.webUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                              Open <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!isLoading && filteredSites.length === 0 && <div className="text-center py-12 text-sm text-slate-400">No sites found</div>}
          </div>
        </TabsContent>

        {/* ── Libraries ── */}
        <TabsContent value="libraries">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Site", "Library", "Type", "Used", "Quota", "Utilisation", "Modified"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" /></td></tr>
                    ))
                  : filteredLibs.map((l, i) => {
                      const hot = l.usedPct >= 90;
                      return (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-700">{l.siteName}</td>
                          <td className="px-4 py-3 text-slate-700">{l.libraryName}</td>
                          <td className="px-4 py-3"><Badge className="bg-slate-100 text-slate-600 border-0">{l.driveType || "—"}</Badge></td>
                          <td className="px-4 py-3 text-slate-600">{gb(l.usedGb)}</td>
                          <td className="px-4 py-3 text-slate-500">{l.totalGb ? gb(l.totalGb) : "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full ${hot ? "bg-red-500" : l.usedPct >= 75 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(l.usedPct, 100)}%` }} />
                              </div>
                              <span className={`text-xs ${hot ? "text-red-600 font-medium" : "text-slate-500"}`}>{l.usedPct}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{l.lastModifiedDateTime ? new Date(l.lastModifiedDateTime).toLocaleDateString() : "—"}</td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
            {!isLoading && filteredLibs.length === 0 && <div className="text-center py-12 text-sm text-slate-400">No document libraries found</div>}
          </div>
        </TabsContent>

        {/* ── Permissions ── */}
        <TabsContent value="permissions">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Site", "Roles", "Granted To"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}><td colSpan={3} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" /></td></tr>
                    ))
                  : filteredPerms.map((p, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-700">{p.siteName}</td>
                        <td className="px-4 py-3">
                          {(p.roles || "—").split(",").map((r, j) => (
                            <Badge key={j} className={`mr-1 border-0 ${r.trim() === "owner" ? "bg-emerald-100 text-emerald-700" : r.trim() === "write" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{r.trim()}</Badge>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-[420px]"><span className="line-clamp-2">{p.grantedTo || "—"}</span></td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!isLoading && filteredPerms.length === 0 && (
              <div className="text-center py-12 text-sm text-slate-400">
                No permission grants returned. This typically requires <code className="bg-slate-100 px-1 rounded text-xs">Sites.FullControl.All</code> (app) or <code className="bg-slate-100 px-1 rounded text-xs">Sites.Read.All</code> in your Azure App Registration.
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Storage ── */}
        <TabsContent value="storage">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Site", "Libraries", "Used", "Share of Total"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" /></td></tr>
                    ))
                  : storage.slice().sort((a, b) => (b.usedGb || 0) - (a.usedGb || 0)).map((s, i) => {
                      const pct = totalUsedGb ? Math.round(((s.usedGb || 0) / totalUsedGb) * 100) : 0;
                      return (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-700">{s.siteName}</td>
                          <td className="px-4 py-3 text-slate-600">{s.libraryCount}</td>
                          <td className="px-4 py-3 text-slate-700">{gb(s.usedGb)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-40 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-slate-500">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
            {!isLoading && storage.length === 0 && <div className="text-center py-12 text-sm text-slate-400">No storage data available</div>}
          </div>
        </TabsContent>
      </Tabs>

      {!isLoading && <div className="mt-2 text-xs text-slate-400">{tab === "sites" ? filteredSites.length : tab === "libraries" ? filteredLibs.length : tab === "permissions" ? filteredPerms.length : storage.length} record(s)</div>}
    </div>
  );
}