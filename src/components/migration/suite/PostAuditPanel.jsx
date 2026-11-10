import React, { useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, Play, ShieldCheck, Upload } from "lucide-react";
import FindingsTable from "./FindingsTable";
import { downloadText, parseCsv, readFileText, toCsv } from "./csv";

function parseStored(json, fallback) {
  try {
    const value = JSON.parse(json || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export default function PostAuditPanel({ project, onRefresh }) {
  const sourceRef = useRef(null);
  const targetRef = useRef(null);
  const [sourceRows, setSourceRows] = useState([]);
  const [targetRows, setTargetRows] = useState([]);
  const [sourceName, setSourceName] = useState("");
  const [targetName, setTargetName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const storedSummary = useMemo(() => parseStored(project.postcheck_summary, null), [project.postcheck_summary]);
  const storedFindings = useMemo(() => parseStored(project.postcheck_findings, []), [project.postcheck_findings]);

  const summary = result || storedSummary;
  const findings = result ? result.findings : storedFindings;

  const load = async (file, setRows, setName) => {
    if (!file) return;
    setError("");
    setResult(null);
    try {
      const parsed = parseCsv(await readFileText(file));
      if (parsed.length === 0) {
        setError("That file has no data rows.");
        return;
      }
      setRows(parsed);
      setName(file.name);
    } catch (e) {
      setError(e.message || "Could not read the file.");
    }
  };

  const runAudit = async () => {
    if (sourceRows.length === 0 || targetRows.length === 0) {
      setError("Upload both the source and the destination inventories.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("migrationSuite", {
        action: "postaudit",
        project_id: project.id,
        source_rows: sourceRows,
        target_rows: targetRows,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setResult(res.data);
      onRefresh?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Audit failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Post-migration audit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Compare the source inventory with a fresh scan of the destination. Missing items, size mismatches,
            version loss and permission drift are listed per item with the action to take.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source inventory</p>
              <input
                ref={sourceRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => load(e.target.files?.[0], setSourceRows, setSourceName)}
              />
              <Button variant="outline" size="sm" className="mt-2" onClick={() => sourceRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Upload source CSV
              </Button>
              {sourceName && (
                <Badge variant="secondary" className="ml-2">
                  {sourceRows.length} rows
                </Badge>
              )}
            </div>

            <div className="rounded-lg border border-border px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Destination inventory
              </p>
              <input
                ref={targetRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => load(e.target.files?.[0], setTargetRows, setTargetName)}
              />
              <Button variant="outline" size="sm" className="mt-2" onClick={() => targetRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Upload destination CSV
              </Button>
              {targetName && (
                <Badge variant="secondary" className="ml-2">
                  {targetRows.length} rows
                </Badge>
              )}
            </div>
          </div>

          <Button onClick={runAudit} disabled={loading || sourceRows.length === 0 || targetRows.length === 0}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Run audit
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {summary && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-emerald-700">Verified</p>
                <p className="text-lg font-semibold text-emerald-700">{summary.matched ?? 0}</p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-rose-700">Missing</p>
                <p className="text-lg font-semibold text-rose-700">{summary.missing ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Source items</p>
                <p className="text-lg font-semibold text-foreground">{summary.source_count ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Drift findings</p>
                <p className="text-lg font-semibold text-foreground">
                  {(summary.severity?.warning ?? 0) + (summary.severity?.critical ?? 0)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {findings.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Drift report ({findings.length})</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadText(
                  `post-audit-${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`,
                  toCsv(findings, ["severity", "code", "item", "detail", "recommendation"]),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              Export report
            </Button>
          </div>
          <FindingsTable findings={findings} emptyText="No drift detected." />
        </div>
      )}
    </div>
  );
}