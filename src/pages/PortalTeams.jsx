import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MessageSquare, Search, RefreshCw, Globe, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";

export default function PortalTeams({ selectedTenant }) {
  const [search, setSearch] = useState("");
  const tenantId = selectedTenant?.tenant_id;

  const { data: teams = [], isLoading, error, refetch } = useQuery({
    queryKey: ["teams_list", tenantId],
    enabled: !!tenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "list_teams", azure_tenant_id: tenantId, top: 100 })
        .then(r => r.data.teams || []),
  });

  if (!tenantId) return (
    <div className="p-6">
      <PageHeader title="Teams" subtitle="Microsoft Teams management" icon={MessageSquare} />
      <div className="text-sm text-slate-500 mt-4">Select a tenant to continue.</div>
    </div>
  );

  const filtered = teams.filter(t =>
    !search ||
    t.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Microsoft Teams"
        subtitle={`Teams for ${selectedTenant?.name}`}
        icon={MessageSquare}
        actions={
          <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams…" className="pl-9" />
      </div>

      {error && <div className="text-sm text-red-500 mb-4">{error.message}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {isLoading
          ? Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-slate-100 rounded w-2/3 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-full" />
            </div>
          ))
          : filtered.map(t => (
            <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                    <MessageSquare className="h-4 w-4 text-violet-600" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 truncate">{t.displayName}</p>
                </div>
                {t.visibility === "public"
                  ? <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[10px] shrink-0 flex items-center gap-1"><Globe className="h-2.5 w-2.5" />Public</Badge>
                  : <Badge className="bg-slate-100 text-slate-600 border-0 text-[10px] shrink-0 flex items-center gap-1"><Lock className="h-2.5 w-2.5" />Private</Badge>}
              </div>
              {t.description && <p className="text-xs text-slate-500 leading-snug line-clamp-2">{t.description}</p>}
              {t.mail && <p className="text-xs text-slate-400 mt-2 truncate">{t.mail}</p>}
              <p className="text-[10px] text-slate-300 mt-1">{t.createdDateTime ? `Created ${new Date(t.createdDateTime).toLocaleDateString()}` : ""}</p>
            </div>
          ))}
      </div>
      {!isLoading && <div className="mt-2 text-xs text-slate-400">{filtered.length} team(s)</div>}
    </div>
  );
}