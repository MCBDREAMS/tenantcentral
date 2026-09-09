import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import DefederationCard from "@/components/defederation/DefederationCard";
import { Unlink, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function GoDaddyDefederation({ selectedTenant, tenants }) {
  const [jobs, setJobs] = useState({});
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [scanningAll, setScanningAll] = useState(false);
  const [query, setQuery] = useState("");

  const list = tenants || [];

  const loadJobs = useCallback(async () => {
    try {
      const recs = await base44.entities.DefederationJob.list("-updated_date", 200);
      const map = {};
      for (const r of recs) map[r.tenant_id] = r;
      setJobs(map);
    } catch (e) {
      console.error("loadJobs", e);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const scanAll = async () => {
    setScanningAll(true);
    for (const t of list) {
      if (!t.tenant_id) continue;
      try {
        await base44.functions.invoke("godaddyDefederation", {
          action: "detect", tenant_id: t.id, azure_tenant_id: t.tenant_id
        });
      } catch (e) { console.error("detect", t.name, e.message); }
    }
    setScanningAll(false);
    loadJobs();
  };

  const filtered = list.filter(t =>
    !query ||
    (t.name || "").toLowerCase().includes(query.toLowerCase()) ||
    (t.domain || "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        icon={Unlink}
        title="GoDaddy Defederation"
        subtitle="Detect GoDaddy-federated tenants and run a gated workflow: check → analyze → dry-run with failure points → resolve → re-analyze → execute."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tenants by name or domain…"
            className="pl-9"
          />
        </div>
        <Button onClick={scanAll} disabled={scanningAll || list.length === 0} className="gap-2">
          {scanningAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
          {scanningAll ? "Scanning all tenants…" : "Scan All Tenants"}
        </Button>
      </div>

      {loadingJobs ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-500">
          No tenants available. Register or connect a tenant first.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((t) => (
            <DefederationCard key={t.id} tenant={t} job={jobs[t.id]} onRefresh={loadJobs} />
          ))}
        </div>
      )}
    </div>
  );
}