import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, AlertTriangle, CheckCircle2, XCircle, Loader2, ShieldAlert } from "lucide-react";
import CopyButton from "@/components/dns/CopyButton";
import { exportToCSV } from "@/components/shared/exportUtils";

const STATUS_STYLE = {
  correct: { label: "Published", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  mismatch: { label: "Mismatch", className: "bg-amber-100 text-amber-700 border-amber-200" },
  missing: { label: "Missing", className: "bg-rose-100 text-rose-700 border-rose-200" },
  unknown: { label: "Unknown", className: "bg-slate-100 text-slate-600" },
};

const SOURCE_LABEL = {
  verification: "Verification",
  service: "Tenant service",
  standard: "Standard M365",
};

function recordLine(r) {
  return [r.type, r.host, r.value, r.detail].filter(Boolean).join("\t");
}

function StatusBadge({ record }) {
  if (record.lookup_error) return <Badge className="bg-slate-100 text-slate-600">Lookup failed</Badge>;
  if (record.status === "missing" && !record.required) return <Badge className="bg-slate-100 text-slate-600">Optional</Badge>;
  const style = STATUS_STYLE[record.status] || STATUS_STYLE.unknown;
  return <Badge className={style.className}>{style.label}</Badge>;
}

// The DNS entries a domain needs (Graph record sets plus the standard M365 mail
// records) alongside what is actually published in public DNS right now.
export default function DnsRecordsTable({ domain, records = [], summary, warnings = [], note, loading, isInitial }) {
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => {
    if (filter === "required") return records.filter((r) => r.required);
    if (filter === "issues") return records.filter((r) => r.status === "missing" || r.status === "mismatch");
    return records;
  }, [records, filter]);

  const filters = [
    { key: "all", label: "All entries", count: records.length },
    { key: "required", label: "Required", count: records.filter((r) => r.required).length },
    { key: "issues", label: "Needs attention", count: records.filter((r) => r.status === "missing" || r.status === "mismatch").length },
  ];

  const exportRows = () =>
    records.map((r) => ({
      type: r.type,
      host: r.host,
      value: r.value,
      detail: r.detail || "",
      ttl: r.ttl,
      source: SOURCE_LABEL[r.source] || r.source,
      service: r.service || "",
      required: r.required ? "yes" : "no",
      status: r.status,
      published_values: (r.published || []).join(" | "),
    }));

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div>
          <h3 className="font-semibold text-foreground">DNS entries</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {domain ? `Records for ${domain}` : "Select a DNS name"}
            {summary ? ` · ${summary.published}/${summary.total} published` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton value={records.map(recordLine).join("\n")} label="Copy all" />
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!records.length}
            onClick={() => exportToCSV(exportRows(), `dns_records_${domain || "tenant"}`)}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {note && (
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2 text-xs text-amber-900">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <p>{note}</p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="px-5 py-3 bg-muted/60 border-b border-border flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            {warnings.map((w) => (
              <p key={w} className="font-mono break-all">{w}</p>
            ))}
          </div>
        </div>
      )}

      {isInitial && (
        <div className="px-5 py-3 bg-muted/60 border-b border-border text-xs text-muted-foreground">
          This is the tenant's initial onmicrosoft.com name. Its DNS is managed by Microsoft. Copy records below
          when publishing the same service records on a custom domain.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border">
        {filters.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({f.count})
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Reading records and checking public DNS...
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">No DNS entries to show for this filter.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {["Type", "Host", "Value", "TTL", "Status", "Source", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const live = (r.published || []).join(", ");
                const differs = (r.status === "mismatch" || r.status === "missing") && live;
                return (
                  <tr key={r.id} className="hover:bg-muted/40 align-top">
                    <td className="px-4 py-3">
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200 font-mono">{r.type}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground break-all max-w-[220px]">{r.host}</td>
                    <td className="px-4 py-3 max-w-[320px]">
                      <span className="font-mono text-xs text-foreground break-all">{r.value || "—"}</span>
                      {r.detail && <span className="block text-[11px] text-muted-foreground mt-0.5">{r.detail}</span>}
                      {differs && (
                        <span className="block text-[11px] text-amber-700 mt-1">
                          Live: <span className="font-mono break-all">{live}</span>
                        </span>
                      )}
                      {!differs && r.status === "correct" && r.published.length > 1 && (
                        <span className="block text-[11px] text-muted-foreground mt-1 font-mono break-all">{live}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.ttl}</td>
                    <td className="px-4 py-3">
                      <StatusBadge record={r} />
                      {r.required ? (
                        <span className="block text-[11px] text-muted-foreground mt-1">Required</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground whitespace-nowrap">
                      {SOURCE_LABEL[r.source] || r.source}
                      {r.service ? <span className="block text-muted-foreground/80">{r.service}</span> : null}
                    </td>
                    <td className="px-2 py-3">
                      <CopyButton value={recordLine(r)} label="" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {summary && !loading && (
        <div className="flex flex-wrap items-center gap-4 px-5 py-3 border-t border-border text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {summary.published} published
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> {summary.mismatch} mismatch
          </span>
          <span className="inline-flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 text-rose-600" /> {summary.missing} missing
          </span>
          <span>{summary.required} required records</span>
        </div>
      )}
    </div>
  );
}