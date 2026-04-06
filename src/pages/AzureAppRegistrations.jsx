import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AppWindow, RefreshCw, Search, Download, AlertTriangle, CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportToCSV } from "@/components/shared/exportUtils";
import { format, differenceInDays, isPast, isWithinInterval, addDays } from "date-fns";

function getDaysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  return differenceInDays(new Date(dateStr), new Date());
}

function SecretStatusBadge({ endDateTime }) {
  if (!endDateTime) return <Badge className="bg-slate-100 text-slate-500">No Secret</Badge>;

  const days = getDaysUntilExpiry(endDateTime);

  if (days < 0) return (
    <Badge className="bg-red-100 text-red-700 gap-1 border-red-200">
      <XCircle className="h-3 w-3" /> Expired {Math.abs(days)}d ago
    </Badge>
  );
  if (days <= 30) return (
    <Badge className="bg-red-100 text-red-700 gap-1 border-red-200">
      <AlertTriangle className="h-3 w-3" /> Expires in {days}d
    </Badge>
  );
  if (days <= 90) return (
    <Badge className="bg-amber-100 text-amber-700 gap-1 border-amber-200">
      <Clock className="h-3 w-3" /> Expires in {days}d
    </Badge>
  );
  return (
    <Badge className="bg-emerald-100 text-emerald-700 gap-1 border-emerald-200">
      <CheckCircle2 className="h-3 w-3" /> {days}d remaining
    </Badge>
  );
}

export default function AzureAppRegistrations({ selectedTenant, tenants = [] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | expired | expiring_soon | ok

  const azureTenantId = selectedTenant?.tenant_id;

  const { data: result, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["azure-app-registrations", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("azureAppRegistrations", {
        action: "list_app_registrations",
        azure_tenant_id: azureTenantId,
      }).then(r => r.data),
  });

  const apps = result?.apps || [];

  const filteredApps = useMemo(() => {
    return apps.filter(app => {
      // Determine worst secret status
      const days = app.nearestExpiry ? getDaysUntilExpiry(app.nearestExpiry) : null;

      if (filter === "expired" && (days === null || days >= 0)) return false;
      if (filter === "expiring_soon" && (days === null || days < 0 || days > 90)) return false;
      if (filter === "ok" && (days === null || days <= 90)) return false;

      if (search) {
        const s = search.toLowerCase();
        if (!app.displayName?.toLowerCase().includes(s) &&
            !app.appId?.toLowerCase().includes(s) &&
            !app.publisherDomain?.toLowerCase().includes(s)) return false;
      }

      return true;
    });
  }, [apps, filter, search]);

  const expiredCount = apps.filter(a => a.nearestExpiry && getDaysUntilExpiry(a.nearestExpiry) < 0).length;
  const expiringSoonCount = apps.filter(a => {
    const d = a.nearestExpiry ? getDaysUntilExpiry(a.nearestExpiry) : null;
    return d !== null && d >= 0 && d <= 90;
  }).length;
  const healthyCount = apps.filter(a => {
    const d = a.nearestExpiry ? getDaysUntilExpiry(a.nearestExpiry) : null;
    return d !== null && d > 90;
  }).length;

  const exportData = filteredApps.map(a => ({
    name: a.displayName,
    app_id: a.appId,
    publisher_domain: a.publisherDomain || "",
    created: a.createdDateTime ? format(new Date(a.createdDateTime), "yyyy-MM-dd") : "",
    nearest_expiry: a.nearestExpiry ? format(new Date(a.nearestExpiry), "yyyy-MM-dd") : "No Secret",
    days_until_expiry: a.nearestExpiry ? getDaysUntilExpiry(a.nearestExpiry) : "N/A",
    secret_count: a.secretCount || 0,
    cert_count: a.certCount || 0,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Azure App Registrations"
        subtitle={selectedTenant ? `Applications in ${selectedTenant.name}` : "Select a tenant to view app registrations"}
        icon={AppWindow}
        actions={
          <div className="flex gap-2">
            {apps.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => exportToCSV(exportData, "azure_app_registrations")} className="gap-2">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading || isRefetching || !azureTenantId}
              className="gap-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${(isLoading || isRefetching) ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {!azureTenantId && (
        <div className="text-center py-16 text-slate-400">
          <AppWindow className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-500">No tenant selected</p>
          <p className="text-sm mt-1">Select a tenant from the sidebar to view its app registrations.</p>
        </div>
      )}

      {azureTenantId && (isLoading || isRefetching) && (
        <div className="flex justify-center items-center py-20 gap-3 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="text-sm">Fetching app registrations from Microsoft Graph...</span>
        </div>
      )}

      {azureTenantId && !isLoading && !isRefetching && result?.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Error:</strong> {result.error}
        </div>
      )}

      {azureTenantId && !isLoading && !isRefetching && apps.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Apps</p>
              <p className="text-2xl font-bold text-slate-800">{apps.length}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs text-red-600 uppercase tracking-wide mb-1">Expired Secrets</p>
              <p className="text-2xl font-bold text-red-700">{expiredCount}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs text-amber-600 uppercase tracking-wide mb-1">Expiring ≤ 90d</p>
              <p className="text-2xl font-bold text-amber-700">{expiringSoonCount}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-xs text-emerald-600 uppercase tracking-wide mb-1">Healthy</p>
              <p className="text-2xl font-bold text-emerald-700">{healthyCount}</p>
            </div>
          </div>

          {/* Filters + Search */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search apps..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-1">
              {[
                ["all", "All"],
                ["expired", `Expired (${expiredCount})`],
                ["expiring_soon", `Expiring Soon (${expiringSoonCount})`],
                ["ok", `Healthy (${healthyCount})`],
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
                  {["Application Name", "App ID (Client ID)", "Publisher Domain", "Secrets", "Certificates", "Nearest Expiry", "Expiry Status", "Created"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApps.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400">No apps match your filters</td></tr>
                ) : filteredApps.map(app => (
                  <tr key={app.id} className={`hover:bg-slate-50 transition-colors ${
                    app.nearestExpiry && getDaysUntilExpiry(app.nearestExpiry) < 0 ? "bg-red-50/40" :
                    app.nearestExpiry && getDaysUntilExpiry(app.nearestExpiry) <= 30 ? "bg-amber-50/30" : ""
                  }`}>
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate" title={app.displayName}>
                      {app.displayName}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{app.appId}</code>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{app.publisherDomain || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className="bg-slate-100 text-slate-600">{app.secretCount || 0}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge className="bg-slate-100 text-slate-600">{app.certCount || 0}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">
                      {app.nearestExpiry
                        ? format(new Date(app.nearestExpiry), "dd MMM yyyy")
                        : <span className="text-slate-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <SecretStatusBadge endDateTime={app.nearestExpiry} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {app.createdDateTime ? format(new Date(app.createdDateTime), "dd MMM yyyy") : "—"}
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
          <AppWindow className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p>No app registrations found for this tenant.</p>
        </div>
      )}
    </div>
  );
}