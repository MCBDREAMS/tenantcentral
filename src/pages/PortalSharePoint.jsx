import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Globe, Search, RefreshCw, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";

export default function PortalSharePoint({ selectedTenant }) {
  const [search, setSearch] = useState("");
  const tenantId = selectedTenant?.tenant_id;

  const { data: result, isLoading, error, refetch } = useQuery({
    queryKey: ["sharepoint_sites", tenantId],
    enabled: !!tenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "list_sites", azure_tenant_id: tenantId, top: 100 })
        .then(r => r.data),
  });
  const sites = result?.sites || [];
  const warning = result?.warning;

  if (!tenantId) return (
    <div className="p-6">
      <PageHeader title="SharePoint" subtitle="SharePoint site management" icon={Globe} />
      <div className="text-sm text-slate-500 mt-4">Select a tenant to continue.</div>
    </div>
  );

  const filtered = sites.filter(s =>
    !search ||
    s.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    s.webUrl?.toLowerCase().includes(search.toLowerCase()) ||
    s.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="SharePoint"
        subtitle={`Sites for ${selectedTenant?.name}`}
        icon={Globe}
        actions={
          <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sites…" className="pl-9" />
      </div>

      {error && <div className="text-sm text-red-500 mb-4">{error.message}</div>}
      {warning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-800">
          <strong>Permission Required:</strong> Add <code className="bg-amber-100 px-1 rounded">Sites.Read.All</code> to your Azure App Registration API permissions and grant admin consent.
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Site Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Description</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Last Modified</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" /></td></tr>
              ))
              : filtered.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.displayName || s.name || "Unnamed"}</td>
                  <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                    <span className="line-clamp-1">{s.description || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">
                    {s.lastModifiedDateTime ? new Date(s.lastModifiedDateTime).toLocaleDateString() : "—"}
                  </td>
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
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-slate-400">No sites found</div>
        )}
      </div>
      {!isLoading && <div className="mt-2 text-xs text-slate-400">{filtered.length} site(s)</div>}
    </div>
  );
}