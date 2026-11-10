import React, { useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Play, Upload } from "lucide-react";
import FindingsTable from "./FindingsTable";
import { downloadText, parseCsv, readFileText, toCsv } from "./csv";

const COLUMNS = [
  "ItemType",
  "Path",
  "Name",
  "SizeBytes",
  "Versions",
  "UniquePermissions",
  "Modified",
  "Author",
];

function parseStored(json, fallback) {
  try {
    const value = JSON.parse(json || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export default function PrescanPanel({ project, onRefresh }) {
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const storedSummary = useMemo(() => parseStored(project.prescan_summary, null), [project.prescan_summary]);
  const storedFindings = useMemo(() => parseStored(project.prescan_findings, []), [project.prescan_findings]);

  const summary = result
    ? { total_rows: result.total_rows, severity: result.severity, ready: result.ready }
    : storedSummary;
  const findings = result ? result.findings : storedFindings;

  const handleFile = async (file) => {
    if (!file) return;
    setError("");
    setResult(null);
    try {
      const text = await readFileText(file);
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setError("That file has no data rows. Export the discovery CSV again.");
        setRows([]);
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch (e) {
      setError(e.message || "Could not read the file.");
    }
  };

  const runScan = async () => {
    if (rows.length === 0) {
      setError("Upload the inventory CSV first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("migrationSuite", {
        action: "prescan",
        project_id: project.id,
        rows,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setResult(res.data);
      onRefresh?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Scan failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Pre-migration scan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Run the discovery script against {project.source_label || "the source"}, then upload its CSV here. The scan
            flags illegal characters, over-long paths, blocked file types, duplicate destinations, native cloud formats
            and items that break permission inheritance.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Choose inventory CSV
            </Button>
            <Button onClick={runScan} disabled={loading || rows.length === 0}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Run scan
            </Button>
            <Button
              variant="ghost"
              onClick={() => downloadText("inventory-template.csv", toCsv([], COLUMNS), "text/csv;charset=utf-8")}
            >
              <Download className="mr-2 h-4 w-4" />
              CSV template
            </Button>
            {fileName && (
              <Badge variant="secondary">
                {fileName} · {rows.length} rows
              </Badge>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {summary && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Items scanned</p>
                <p className="text-lg font-semibold text-foreground">{summary.total_rows ?? 0}</p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-rose-700">Blocking</p>
                <p className="text-lg font-semibold text-rose-700">{summary.severity?.critical ?? 0}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-amber-800">Warnings</p>
                <p className="text-lg font-semibold text-amber-800">{summary.severity?.warning ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Readiness</p>
                <p className={`text-sm font-semibold ${summary.ready ? "text-emerald-600" : "text-rose-600"}`}>
                  {summary.ready ? "Cleared to migrate" : "Resolve blockers first"}
                </p>
              </div>
            </div>
          )}

          {summary && !summary.ready && (
            <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Blocking findings will fail on the destination. Rename, exclude or remap them, then rerun discovery.
            </p>
          )}
        </CardContent>
      </Card>

      {findings.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Findings ({findings.length})</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadText(
                  `prescan-${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`,
                  toCsv(findings, ["severity", "code", "item", "detail", "recommendation"]),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              Export findings
            </Button>
          </div>
          <FindingsTable findings={findings} />
        </div>
      )}
    </div>
  );
}