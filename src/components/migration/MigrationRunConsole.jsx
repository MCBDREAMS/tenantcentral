import React, { useState } from "react";
import { Play, Pause, RefreshCw, Loader2, FileDown, CheckCircle2, XCircle, AlertCircle, Rocket, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function buildSelection(workloads, selection, userMapping, groupMapping, userConfig = {}, chatConfig = {}, settings = {}) {
  const items = [];
  const userByUpn = Object.fromEntries(userMapping.map((m) => [m.sourceUpn, m]));
  const groupById = Object.fromEntries(groupMapping.map((m) => [m.sourceId, m]));

  if (workloads.includes("mailboxes")) {
    // Accounts picked in the accounts step carry their own mode (migrate into an existing
    // target account vs create a brand-new one), target domain and mailbox options.
    const accounts = Object.values(userConfig).filter((u) => u.selected && u.mode !== "skip");
    accounts.forEach((u) => {
      const m = userByUpn[u.upn] || {};
      const targetUpn = m.targetUpn || (u.localPart && u.domain ? `${u.localPart}@${u.domain}` : u.upn);
      items.push({
        kind: "user",
        source: { id: u.id, upn: u.upn, mail: u.mail, displayName: u.displayName, jobTitle: u.jobTitle, department: u.department },
        target: { upn: targetUpn, mode: u.mode, action: u.mode === "migrate" ? "map" : "create" },
        mailbox: u.includeMailbox && u.mail ? u.mailbox : null,
      });
    });
    // Legacy batches built before the accounts step keep working from the mailbox tab.
    if (accounts.length === 0) {
      (selection.mailboxes || []).forEach((u) => {
        const m = userByUpn[u.upn] || { action: "create", targetUpn: u.upn };
        if (m.action === "skip") return;
        items.push({ kind: "user", source: u, target: { upn: m.targetUpn, action: m.action } });
      });
    }
  }
  if (workloads.includes("chats")) {
    // Each chat is recreated in the target with the participants mapped to their target UPNs.
    const mapUpn = (upn) => userByUpn[upn]?.targetUpn || null;
    Object.values(chatConfig).filter((c) => c.selected).forEach((c) => {
      const chat = c.chat || {};
      const members = (chat.members || []).map(mapUpn).filter(Boolean);
      if (settings?.requireAllMembersMapped && members.length < (chat.members || []).length) return;
      items.push({
        kind: "chat",
        source: { id: chat.id, chatType: chat.chatType, topic: chat.topic, members: chat.members || [] },
        target: { topic: chat.topic, members },
      });
    });
  }
  if (workloads.includes("groups")) {
    (selection.groups || []).forEach((g) => {
      const m = groupById[g.id] || { action: "create", targetName: g.displayName };
      if (m.action === "skip") return;
      items.push({ kind: "group", source: g, target: { displayName: m.targetName, action: m.action } });
    });
  }
  if (workloads.includes("onedrive")) {
    (selection.onedrive || []).forEach((d) => {
      const m = userByUpn[d.upn];
      if (!m || m.action === "skip") return;
      items.push({ kind: "onedrive", source: d, target: { userId: "", upn: m.targetUpn } });
    });
  }
  if (workloads.includes("sharepoint")) {
    (selection.sharepoint || []).forEach((s) => {
      items.push({ kind: "sharepoint", source: { siteId: s.id, displayName: s.displayName, webUrl: s.webUrl }, target: { displayName: s.displayName, description: s.description || "" } });
    });
  }
  if (workloads.includes("teams")) {
    (selection.teams || []).forEach((t) => {
      items.push({ kind: "team", source: { teamId: t.id, displayName: t.displayName, description: t.description || "" }, target: { displayName: t.displayName, description: t.description || "" } });
    });
  }
  return items;
}

// Resolve target userId for onedrive items from the user mapping's target UPN at run time:
// we leave userId blank; the backend looks up by UPN is not available, so we resolve on client
// by querying target tenant users once. To keep it simple and bounded, we ask the backend
// run to accept target.upn and resolve /users by upn. (Backend runOneDrive uses userId though.)
// To avoid another round-trip, we resolve target user ids here via auto_map results if present.

export default function MigrationRunConsole({
  sourceTenant, targetTenant, workloads, selection, userConfig, chatConfig, userMapping, groupMapping,
  principalRules, copySettings, incremental, batchId, setBatchId,
}) {
  const [name, setName] = useState(`Migration ${sourceTenant?.name} → ${targetTenant?.name}`);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [items, setItems] = useState({});
  const [total, setTotal] = useState(0);
  const [log, setLog] = useState([]);
  const [status, setStatus] = useState("planned");
  const [maxItems, setMaxItems] = useState(6);
  const [error, setError] = useState("");
  const [dryResults, setDryResults] = useState(null);
  const [dryRunning, setDryRunning] = useState(false);

  // Resolve target user ids for OneDrive items by matching target UPN to user mapping (targetId if mapped).
  const resolveTargetUserIds = (selItems) => selItems.map((it) => {
    if (it.kind !== "onedrive") return it;
    const m = userMapping.find((u) => u.sourceUpn === it.source.upn);
    return { ...it, target: { ...it.target, userId: m?.targetId || "", upn: m?.targetUpn || it.source.upn } };
  });

  const createBatch = async () => {
    setError("");
    let sel = buildSelection(workloads, selection, userMapping, groupMapping, userConfig, chatConfig, copySettings);
    sel = resolveTargetUserIds(sel);
    if (sel.length === 0) { setError("No items to migrate. Go back and select source objects and mappings."); return null; }
    try {
      const res = await base44.functions.invoke("migrationEngine", {
        action: "create_batch",
        name, source_azure_tenant_id: sourceTenant.tenant_id, target_azure_tenant_id: targetTenant.tenant_id,
        source_tenant_name: sourceTenant.name, target_tenant_name: targetTenant.name,
        workloads, selection: sel, user_mapping: userMapping, group_mapping: groupMapping,
        principal_replace_rules: principalRules, copy_settings: copySettings, incremental,
      });
      const id = res.data.batch_id;
      setBatchId(id); setTotal(sel.length);
      return id;
    } catch (e) {
      setError(e.response?.data?.error || e.message); return null;
    }
  };

  // Validate every selected item against both tenants WITHOUT writing anything to the target.
  // Creates the (inert) batch record first if needed — that is a Base44 record only, no Graph writes.
  const dryRun = async () => {
    setError(""); setDryResults(null); setDryRunning(true);
    try {
      const id = batchId || (await createBatch());
      if (!id) return;
      const res = await base44.functions.invoke("migrationEngine", { action: "dry_run", batch_id: id });
      setDryResults(res.data);
      const s = res.data.summary || {};
      setLog((l) => [...l, `Dry run — ${s.ready || 0} ready, ${s.warning || 0} warning, ${s.blocked || 0} blocked.`].slice(-20));
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setDryRunning(false); }
  };

  const runLoop = async (id) => {
    setRunning(true); setStatus("running");
    try {
      let cur = { status: "running" };
      while (cur.status === "running") {
        const res = await base44.functions.invoke("migrationEngine", { action: "run", batch_id: id, maxItems });
        cur = res.data;
        setProgress(res.data.progress);
        setItems(res.data.items || {});
        setTotal(res.data.total);
        setStatus(res.data.status);
        setLog((l) => [...l, `Pass done — cursor ${res.data.cursor}/${res.data.total}, status ${res.data.status}`].slice(-20));
        if (res.data.status === "completed" || res.data.status === "failed") break;
        await new Promise((r) => setTimeout(r, 800));
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message); setStatus("failed");
    } finally { setRunning(false); }
  };

  const start = async () => {
    const id = batchId || (await createBatch());
    if (!id) return;
    await runLoop(id);
  };

  const incrementalSync = async () => {
    if (!batchId) return;
    setError("");
    try {
      await base44.functions.invoke("migrationEngine", { action: "reset", batch_id: batchId });
      setLog((l) => [...l, "Incremental sync started — skipping already-created objects, re-copying new content."].slice(-20));
      await runLoop(batchId);
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const pause = async () => {
    if (!batchId) return;
    await base44.functions.invoke("migrationEngine", { action: "pause", batch_id: batchId });
    setStatus("paused");
  };

  const exportReport = () => {
    const rows = [["item", "status", "message"], ...Object.entries(items).map(([k, v]) => [k, v.status, v.message || ""])];
    const csv = rows.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "migration_report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const done = progress?.done || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-5 space-y-3">
        <div>
          <Label>Batch name</Label>
          <Input className="mt-1 max-w-md" value={name} onChange={(e) => setName(e.target.value)} disabled={!!batchId} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={dryRun} disabled={running || dryRunning}>
            {dryRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
            Dry run (validate only)
          </Button>
          <Button onClick={start} disabled={running || dryRunning}>
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Rocket className="h-4 w-4 mr-2" />}
            {batchId ? "Resume / Run" : "Create & Run batch"}
          </Button>
          <Button variant="outline" onClick={incrementalSync} disabled={running || !batchId}>
            <RefreshCw className="h-4 w-4 mr-2" />Incremental sync
          </Button>
          <Button variant="outline" onClick={pause} disabled={!running}><Pause className="h-4 w-4 mr-2" />Pause</Button>
          <Button variant="outline" onClick={exportReport} disabled={total === 0}><FileDown className="h-4 w-4 mr-2" />Export report</Button>
          <div className="flex items-center gap-2 ml-auto">
            <Label className="text-xs">Items per pass</Label>
            <Input type="number" className="w-20 h-8" value={maxItems} onChange={(e) => setMaxItems(parseInt(e.target.value) || 6)} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {(progress || running) && (
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progress — {status}</span>
            <span className="text-sm text-muted-foreground">{done}/{total} ({pct}%)</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-4 mt-3 text-sm">
            <span className="text-emerald-600">✓ {progress?.succeeded || 0}</span>
            <span className="text-destructive">✕ {progress?.failed || 0}</span>
            <span className="text-muted-foreground">skip {progress?.skipped || 0}</span>
          </div>
        </div>
      )}

      {dryResults && (
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-medium">Dry run report — nothing was written to the target</h3>
            <div className="flex gap-3 text-sm">
              <span className="text-emerald-600">{dryResults.summary?.ready || 0} ready</span>
              <span className="text-amber-600">{dryResults.summary?.warning || 0} warning</span>
              <span className="text-destructive">{dryResults.summary?.blocked || 0} blocked</span>
            </div>
          </div>
          {dryResults.summary?.blocked > 0 && (
            <p className="text-sm text-destructive mb-3">Resolve the blocked items before running — those items will fail as-is.</p>
          )}
          <div className="overflow-auto max-h-96 border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr><th className="text-left p-2">#</th><th className="text-left p-2">Type</th><th className="text-left p-2">Item</th><th className="text-left p-2">Result</th><th className="text-left p-2">Detail</th></tr>
              </thead>
              <tbody>
                {(dryResults.results || []).map((r) => (
                  <tr key={r.index} className="border-t">
                    <td className="p-2">{r.index + 1}</td>
                    <td className="p-2 capitalize">{r.kind}</td>
                    <td className="p-2">{r.label}</td>
                    <td className="p-2">
                      {r.status === "ready" ? <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" /> :
                       r.status === "warning" ? <AlertCircle className="h-4 w-4 text-amber-500 inline" /> :
                       <XCircle className="h-4 w-4 text-destructive inline" />}
                      <span className="ml-1">{r.status}</span>
                    </td>
                    <td className="p-2 text-muted-foreground">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {Object.keys(items).length > 0 && (
        <div className="bg-card border rounded-xl p-5">
          <h3 className="font-medium mb-3">Item-level report</h3>
          <div className="overflow-auto max-h-96 border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr><th className="text-left p-2">#</th><th className="text-left p-2">Status</th><th className="text-left p-2">Detail</th><th className="text-left p-2">Time</th></tr>
              </thead>
              <tbody>
                {Object.entries(items).map(([k, v]) => (
                  <tr key={k} className="border-t">
                    <td className="p-2">{k}</td>
                    <td className="p-2">
                      {v.status === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" /> :
                       v.status === "failed" ? <XCircle className="h-4 w-4 text-destructive inline" /> :
                       <AlertCircle className="h-4 w-4 text-muted-foreground inline" />}
                      <span className="ml-1">{v.status}</span>
                    </td>
                    <td className="p-2 text-muted-foreground">{v.message}</td>
                    <td className="p-2 text-xs text-muted-foreground">{v.ts ? new Date(v.ts).toLocaleTimeString() : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="bg-card border rounded-xl p-4 text-xs text-muted-foreground space-y-1">
          {log.map((l, i) => <div key={i}>• {l}</div>)}
        </div>
      )}
    </div>
  );
}