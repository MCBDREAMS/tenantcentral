import React, { useMemo, useState } from "react";
import { CheckCircle2, XCircle, Clock, Loader2, MinusCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const KIND_LABEL = {
  user: "User",
  onedrive: "OneDrive",
  group: "Group",
  chat: "Chat",
  team: "Team",
  sharepoint: "Site",
};

const TABS = [
  { id: "All", match: null },
  { id: "Processing", match: "processing" },
  { id: "Succeeded", match: "success" },
  { id: "Failed", match: "failed" },
  { id: "Pending", match: "pending" },
];

function StatusCell({ status }) {
  if (status === "success") return <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" />Succeeded</span>;
  if (status === "failed") return <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="h-4 w-4" />Failed</span>;
  if (status === "skipped") return <span className="inline-flex items-center gap-1 text-muted-foreground"><MinusCircle className="h-4 w-4" />Skipped</span>;
  if (status === "processing") return <span className="inline-flex items-center gap-1 text-primary font-medium"><Loader2 className="h-4 w-4 animate-spin" />Processing</span>;
  return <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-4 w-4" />Pending</span>;
}

export default function LiveItemTable({ rows, currentIndex, truncated }) {
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");

  // The item the engine is on right now has no stored outcome yet — show it as processing.
  const withStatus = useMemo(
    () => rows.map((r) => (r.index === currentIndex && r.status === "pending" ? { ...r, status: "processing" } : r)),
    [rows, currentIndex]
  );

  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return withStatus;
    return withStatus.filter((r) =>
      [r.label, r.mailbox, r.kind, r.message].some((v) => String(v || "").toLowerCase().includes(s))
    );
  }, [withStatus, q]);

  const filtered = useMemo(() => {
    const want = TABS.find((t) => t.id === tab)?.match;
    return want ? searched.filter((r) => r.status === want) : searched;
  }, [searched, tab]);

  const countOf = (match) => (match ? withStatus.filter((r) => r.status === match).length : withStatus.length);

  return (
    <div className="bg-card border rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="font-medium">Accounts &amp; mailboxes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {withStatus.length === 0 ? "Nothing selected in this batch yet." : `${filtered.length} of ${withStatus.length} item(s) shown`}
            {truncated ? " — first 500 items only" : ""}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search account or mailbox…"
            className="h-8 pl-8 w-64 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              tab === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted/60"
            }`}
          >
            {t.id} <span className="opacity-70">({countOf(t.match)})</span>
          </button>
        ))}
      </div>

      <div className="overflow-auto max-h-[28rem] border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="text-left p-2 font-medium w-10">#</th>
              <th className="text-left p-2 font-medium">Account / object</th>
              <th className="text-left p-2 font-medium">Type</th>
              <th className="text-left p-2 font-medium">Mailbox</th>
              <th className="text-left p-2 font-medium">Status</th>
              <th className="text-left p-2 font-medium">Result</th>
              <th className="text-left p-2 font-medium whitespace-nowrap">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.index}
                className={`border-t align-top ${r.status === "processing" ? "bg-primary/5" : ""}`}
              >
                <td className="p-2 text-muted-foreground">{r.index + 1}</td>
                <td className="p-2">
                  <div className="font-medium break-all">{r.label}</div>
                  {r.source_upn && r.source_upn !== r.label && (
                    <div className="text-xs text-muted-foreground break-all">from {r.source_upn}</div>
                  )}
                </td>
                <td className="p-2 text-muted-foreground whitespace-nowrap">{KIND_LABEL[r.kind] || r.kind}</td>
                <td className="p-2">
                  {r.mailbox ? (
                    <span className="break-all">{r.mailbox}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-2 whitespace-nowrap"><StatusCell status={r.status} /></td>
                <td className="p-2 text-muted-foreground max-w-md">{r.message || <span className="opacity-60">Waiting…</span>}</td>
                <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                  {r.ts ? new Date(r.ts).toLocaleTimeString() : "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                  No items match this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}