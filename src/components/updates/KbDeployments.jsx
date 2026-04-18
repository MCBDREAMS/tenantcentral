import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Search, Loader2, RefreshCw, Package, ExternalLink, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const severityColor = {
  Critical: "bg-red-100 text-red-700",
  Important: "bg-amber-100 text-amber-700",
  Moderate: "bg-blue-100 text-blue-700",
  Low: "bg-slate-100 text-slate-500",
};

export default function KbDeployments({ selectedTenant }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [deployed, setDeployed] = useState({});

  const { data, isLoading, refetch, isFetched } = useQuery({
    queryKey: ["kb_search", selectedTenant?.tenant_id, searchQuery],
    enabled: false,
    queryFn: () =>
      base44.functions.invoke("searchMicrosoftKbs", {
        query: searchQuery,
        azure_tenant_id: selectedTenant?.tenant_id,
      }).then(r => r.data),
  });

  const kbs = data?.updates || [];

  const handleDeploy = async (kb) => {
    setDeployed(d => ({ ...d, [kb.id]: "deploying" }));
    try {
      await base44.functions.invoke("portalData", {
        action: "deploy_kb",
        azure_tenant_id: selectedTenant?.tenant_id,
        kb_id: kb.id,
        kb_title: kb.title,
      });
      setDeployed(d => ({ ...d, [kb.id]: "deployed" }));
    } catch {
      setDeployed(d => ({ ...d, [kb.id]: "error" }));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && refetch()}
            placeholder="Search KB articles (e.g. KB5034441, Windows 11 cumulative...)"
            className="pl-9"
          />
        </div>
        <Button onClick={() => refetch()} disabled={isLoading} className="bg-slate-900 hover:bg-slate-800 gap-2">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
      </div>

      {!isFetched && !isLoading && (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl">
          <Package className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Search for Microsoft KB articles to view and deploy updates</p>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Searching Microsoft Security Update Guide…</p>
        </div>
      )}

      {isFetched && !isLoading && kbs.length === 0 && (
        <div className="text-center py-16 text-slate-400 text-sm">No KB articles found matching your query.</div>
      )}

      {kbs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">{kbs.length} KB Article{kbs.length !== 1 ? "s" : ""} Found</p>
          </div>
          <div className="divide-y divide-slate-100">
            {kbs.map((kb, i) => {
              const state = deployed[kb.id];
              return (
                <div key={i} className="flex items-start justify-between p-4 hover:bg-slate-50 gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <Package className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-semibold text-slate-800">{kb.title || kb.id}</p>
                        <Badge className={`${severityColor[kb.severity] || "bg-slate-100 text-slate-500"} border-0 text-xs`}>
                          {kb.severity || "Unknown"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 font-mono">{kb.id}</p>
                      {kb.releaseDate && <p className="text-xs text-slate-400 mt-0.5">Released: {kb.releaseDate}</p>}
                      {kb.products && <p className="text-xs text-slate-400 truncate">{kb.products}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {kb.url && (
                      <Button size="sm" variant="ghost" className="px-2" onClick={() => window.open(kb.url, "_blank")}>
                        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={state === "deployed" ? "outline" : "default"}
                      className={`gap-1.5 text-xs ${state === "deployed" ? "border-emerald-300 text-emerald-700" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                      disabled={state === "deploying" || state === "deployed"}
                      onClick={() => handleDeploy(kb)}
                    >
                      {state === "deploying" && <Loader2 className="h-3 w-3 animate-spin" />}
                      {state === "deployed" && <CheckCircle2 className="h-3 w-3" />}
                      {state === "deployed" ? "Deployed" : state === "deploying" ? "Deploying…" : "Deploy"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}