import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Boxes, RefreshCw, Search, Download, Loader2, ExternalLink,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportToCSV } from "@/components/shared/exportUtils";
import { format } from "date-fns";

export default function EnterpriseApplications({ selectedTenant, tenants = [] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | enabled | disabled | firstparty | thirdparty

  const azureTenantId = selectedTenant?.tenant_id;

  const { data: result, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["enterprise-apps", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions
        .invoke("organizationData", { action: "enterprise_apps", azure_tenant_id: azureTenantId })
        .then((r) => r.data),
  });

  const apps = result?.servicePrincipals || [];

  const filteredApps = useMemo(() => {
    return apps.filter((a) => {
      if (filter === "enabled" && !a.accountEnabled) return false;
      if (filter === "disabled" && a.accountEnabled) return false;
      if (filter === "firstparty" && !a.isFirstParty) return false;
      if (filter === "thirdparty" && a.isFirstParty) return false;

      if (search) {
        const s = search.toLowerCase();
        if (!a.displayName?.toLowerCase().includes(s) &&
            !a.appId?.toLowerCase().includes(s) &&
            !(a.publisherName || "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [apps, filter, search]);

  const enabledCount = apps.filter((a) => a.accountEnabled).length;
  const disabledCount = apps.length - enabledCount;
  const firstPartyCount = apps.filter((a) => a.isFirstParty).length;

  const exportData = filteredApps.map((a) => ({
    name: a.displayName,
    app_id: a.appId,
    object_id: a.id,
    type: a.servicePrincipalType,
    publisher: a.publisherName || "",
    first_party: a.isFirstParty ? "Yes" : "No",
    account_enabled: a.accountEnabled ? "Yes" : "No",
    sign_in_audience: a.signInAudience || "",
    sso_mode: a.preferredSingleSignOnMode || "",
    homepage: a.homepage || "",
    tags: (a.tags || []).join("; "),
    created: a.createdDateTime ? format(new Date(a.createdDateTime), "yyyy-MM-dd") : "",
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Enterprise Applications"
        subtitle={selectedTenant ? `Service principals in ${selectedTenant.name}` : "Select a tenant to view enterprise applications"}
        icon={Boxes}
        actions={
          <div className="flex gap-2">
            {apps.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => exportToCSV(exportData, "enterprise_applications")} className="gap-2">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading || isRefetching || !azureTenantId} className="gap-2">
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading || isRefetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {!azureTenantId && (
        <div className="text-center py-16 text-slate-400">
          <Boxes className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-500">No tenant selected</p>
          <p className="text-sm mt-1">Select a tenant from the sidebar to view its enterprise applications.</p>
        </div>
      )}

      {azureTenantId && (isLoading || isRefetching) && (
        <div className="flex justify-center items-center py-20 gap-3 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="text-sm">Fetching service principals from Microsoft Graph...</span>
        </div>
      )}

      {azureTenantId && !isLoading && !isRefetching && result?.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <p className="font-semibold mb-1">Could not load enterprise applications</p>
          <p className="text-red-600 text-xs font-mono break-all">{result.error}</p>
        </div>
      )}

      {azureTenantId && !isLoading && !isRefetching && apps.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total SPs</p>
              <p className="text-2xl font-bold text-slate-800">{apps.length}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-xs text-emerald-600 uppercase tracking-wide mb-1">Enabled</p>
              <p className="text-2xl font-bold text-emerald-700">{enabledCount}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Disabled</p>
              <p className="text-2xl font-bold text-slate-600">{disabledCount}</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs text-blue-600 uppercase tracking-wide mb-1">First-Party (Microsoft)</p>
              <p className="text-2xl font-bold text-blue-700">{firstPartyCount}</p>
            </div>
          </div>

          {/* Filters + search */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, app ID, publisher..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {[
                ["all", "All"],
                ["enabled", "Enabled"],
                ["disabled", "Disabled"],
                ["firstparty", "First-Party"],
                ["thirdparty", "Third-Party"],
              ].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filter === val ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">{filteredApps.length} apps</span>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Application Name", "App ID (Client ID)", "Type", "Publisher", "Audience", "Status", "SSO", "Created"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApps.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400">No apps match your filters</td></tr>
                ) : filteredApps.map((a) => (
                  <tr key={a.id} className={`hover:bg-slate-50 transition-colors ${!a.accountEnabled ? "bg-slate-50/40" : ""}`}>
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-[220px] truncate" title={a.displayName}>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{a.displayName || "(unnamed)"}</span>
                        {a.homepage && (
                          <a href={a.homepage} target="_blank" rel="noreferrer" className="shrink-0 text-slate-400 hover:text-blue-500">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{a.appId}</code></td>
                    <td className="px-4 py-3 text-xs text-slate-600">{a.servicePrincipalType || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate" title={a.publisherName}>
                      {a.isFirstParty ? <Badge className="bg-blue-100 text-blue-700 border-blue-200">{a.publisherName || "Microsoft"}</Badge> : (a.publisherName || "—")}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{a.signInAudience?.replace(/([A-Z])/g, " $1").trim() || "—"}</td>
                    <td className="px-4 py-3">
                      {a.accountEnabled ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Enabled</Badge>
                      ) : (
                        <Badge className="bg-slate-200 text-slate-500">Disabled</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{a.preferredSingleSignOnMode || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {a.createdDateTime ? format(new Date(a.createdDateTime), "dd MMM yyyy") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {azureTenantId && !isLoading && !isRefetching && apps.length === 0 && !result?.error && (
        <div className="text-center py-16 text-slate-400">
          <Boxes className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p>No service principals found for this tenant.</p>
        </div>
      )}
    </div>
  );
}