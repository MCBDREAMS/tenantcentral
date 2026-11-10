import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Download, FileTerminal, Loader2, RefreshCw } from "lucide-react";
import { downloadText } from "./csv";
import { useToast } from "@/components/ui/use-toast";

const KINDS = [
  {
    id: "discovery",
    label: "Discovery scan",
    detail: "Inventories the source and emits the CSV the pre-migration scan reads.",
  },
  {
    id: "migration",
    label: "Copy run",
    detail: "Resumes per item, retries throttled calls and keeps version history.",
  },
  {
    id: "staging",
    label: "Insane mode",
    detail: "Azure storage staging with azcopy: source to blob, blob to destination.",
  },
];

export default function ScriptPanel({ project, onRefresh }) {
  const { toast } = useToast();
  const [kind, setKind] = useState("discovery");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("migrationSuite", {
        action: "script",
        project_id: project.id,
        kind,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setResult(res.data);
      onRefresh?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Could not generate the script.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!result?.content) return;
    await navigator.clipboard.writeText(result.content);
    toast({ title: "Script copied", description: result.filename });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileTerminal className="h-4 w-4 text-primary" />
            PowerShell & CSV automation pack
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {KINDS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setKind(item.id);
                  setResult(null);
                }}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  kind === item.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span className="block text-sm font-medium text-foreground">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.detail}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={generate} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Generate script
            </Button>
            {result && (
              <>
                <Button variant="outline" onClick={copy}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  onClick={() => downloadText(result.filename, result.content, "text/plain;charset=utf-8")}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download .ps1
                </Button>
              </>
            )}
            <Badge variant="secondary">
              {project.mode === "insane" ? "Insane mode staging" : "Direct copy"}
            </Badge>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {result && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Inventory columns: {result.csv_columns.join(", ")}
              </p>
              <pre className="max-h-[440px] overflow-auto rounded-lg bg-slate-900 p-4 text-[11.5px] leading-relaxed text-slate-100">
                <code>{result.content}</code>
              </pre>
            </div>
          )}

          {!result && (
            <p className="text-sm text-muted-foreground">
              Scripts are plain ASCII PowerShell. Run them from a host with PnP.PowerShell (and azcopy for
              Insane mode), then bring the CSV inventories back here for the scans.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}