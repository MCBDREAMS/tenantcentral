import React, { useEffect, useState } from "react";
import { Activity, Loader2, RefreshCw, FileDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import LiveItemTable from "@/components/migration/LiveItemTable";

const STATUS_STYLE = {
  running: "bg-primary/10 text-primary border-primary/30",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  planned: "bg-muted text-muted-foreground border-border",
};

const KIND_LABEL = {
  user: "account",
  onedrive: "OneDrive",
  group: "group",
  chat: "chat",
  team: "team",
  sharepoint: "site",
};

function Kpi({ label, value, tone = "" }) {
  return (
    <div className="border rounded-lg px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

export default function MigrationLiveDashboard({ batchId, onSelectBatch, refreshKey }) {
  const [id, setId] = useState(batchId || null);
  const [data, setData] = useState(null);
  const [batches, setBatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [error, setError] = useState("");

  useEffect(() => { setId(batchId || null); }, [batchId]);

  // Batches to reopen when nothing is selected (e.g. after a page reload).
  useEffect(() => {
    if (id) return;
    let cancelled = false;
    base44.functions.invoke("migrationEngine", { action: "list_batches" })
      .then((res) => { if (!cancelled) setBatches(res.data?.batches || []); })
      .catch((e) => { if (!cancelled) setError(e.response?.data?.error || e.message); });
    return () => { cancelled = true; };
  }, [id, nonce]);

  // Poll while the batch is still working; stop once it finishes so an idle tab costs nothing.
  useEffect(() => {
    if (!id) { setData(null); return; }
    let cancelled = false;
    let timer;
    setLoading(true);
    const load = async () => {
      try {
        const res = await base44.functions.invoke("migrationEngine", { action: "batch_status", batch_id: id });
        if (cancelled) return;
        setError("");
        setData(res.data);
        setLoading(false);
        // Keep polling while a pass is being driven from this page, even before the engine has
        // marked the batch as running, and while the batch is running or paused.
        if (!refreshKey && !["running", "paused"].includes(res.data?.batch?.status)) return;
      } catch (e) {
        if (cancelled) return;
        setError(e.response?.data?.error || e.message);
        setLoading(false);
      }
      timer = setTimeout(load, 2500);
    };
    load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id, refreshKey, nonce]);

  useEffect(() => {
    if (!data?.current) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [data?.current]);

  const exportCsv = () => {
    const rows = [["#", "item", "type", "mailbox", "status", "result", "updated"]];
    (data?.rows || []).forEach((r) => rows.push([r.index + 1, r.label, r.kind, r.mailbox || "", r.status, r.message || "", r.ts || ""]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "migration-live-progress.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!id) {
    return (
      <div className="bg-card border rounded-xl p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div>
            <h3 className="font-medium flex items-center gap-2"><Activity className="h-4 w-4 text-primary" />Live progress dashboard</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Open a batch to watch which accounts and mailboxes are processing.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
          </Button>
        </div>
        {error && <p className="text-sm text-destructive mb-2">{error}</p>}
        {batches == null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading batches…</div>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No migration batch exists yet — create and start one below.</p>
        ) : (
          <div className="divide-y border rounded-lg overflow-hidden">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => { setId(b.id); onSelectBatch?.(b.id); }}
                className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{b.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {b.source_tenant_name} → {b.target_tenant_name}
                    {b.last_run_at ? ` · last pass ${new Date(b.last_run_at).toLocaleString()}` : ""}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {b.progress?.succeeded || 0}/{b.progress?.total || b.progress?.done || 0}
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize whitespace-nowrap ${STATUS_STYLE[b.status] || STATUS_STYLE.planned}`}>
                  {b.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const batch = data?.batch;
  const counts = data?.counts || {};
  const total = counts.total || 0;
  const succeeded = counts.succeeded || 0;
  const failed = counts.failed || 0;
  const skipped = counts.skipped || 0;
  const finished = succeeded + failed + skipped;
  const pct = total ? Math.round((finished / total) * 100) : 0;
  const elapsed = data?.current?.since
    ? Math.max(0, Math.round((tick - new Date(data.current.since).getTime()) / 1000))
    : 0;
  const currentKind = data?.current?.row?.kind;

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span className="truncate">{batch?.name || "Live migration progress"}</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {batch?.source_tenant_name} → {batch?.target_tenant_name}
              {batch?.last_run_at ? ` · last pass ${new Date(batch.last_run_at).toLocaleTimeString()}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {batch?.status === "running" && (
              <span className="text-xs text-emerald-600 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />Live
              </span>
            )}
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[batch?.status] || STATUS_STYLE.planned}`}>
              {batch?.status || "loading"}
            </span>
            <Button size="sm" variant="outline" onClick={() => setNonce((n) => n + 1)}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={(data?.rows || []).length === 0}>
              <FileDown className="h-3.5 w-3.5 mr-1.5" />CSV
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Kpi label="Total in batch" value={total} />
          <Kpi label="Processing now" value={data?.current ? 1 : 0} tone="text-primary" />
          <Kpi label="Succeeded" value={succeeded} tone="text-emerald-600" />
          <Kpi label="Failed" value={failed} tone="text-destructive" />
          <Kpi label="Pending" value={Math.max(0, total - finished)} />
        </div>

        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{finished} of {total} processed</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {data?.current ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{data.current.label}</div>
              <div className="text-xs text-muted-foreground truncate">
                Migrating {data.current.row?.mailbox ? `mailbox ${data.current.row.mailbox}` : KIND_LABEL[currentKind] || "object"}
                {" · "}{elapsed}s
              </div>
            </div>
          </div>
        ) : batch?.status === "running" ? (
          <div className="rounded-lg border bg-muted/40 px-3 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Starting the next item…
          </div>
        ) : null}
      </div>

      <LiveItemTable rows={data?.rows || []} currentIndex={data?.current?.index ?? null} truncated={data?.truncated} />
    </div>
  );
}