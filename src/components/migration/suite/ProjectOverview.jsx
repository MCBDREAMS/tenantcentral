import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, ClipboardList, HardDrive, Server } from "lucide-react";
import { MODES, SOURCE_TYPES, WORKLOADS, readingsLabel, sourceLabel } from "./migrationMeta";

function parseStored(json) {
  try {
    return JSON.parse(json || "null");
  } catch {
    return null;
  }
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-40 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground break-words">{value || "—"}</span>
    </div>
  );
}

export default function ProjectOverview({ project }) {
  const sourceMeta = SOURCE_TYPES.find((s) => s.value === project.source_type);
  const modeMeta = MODES.find((m) => m.value === project.mode);
  const prescan = useMemo(() => parseStored(project.prescan_summary), [project.prescan_summary]);
  const postcheck = useMemo(() => parseStored(project.postcheck_summary), [project.postcheck_summary]);
  const audit = useMemo(() => {
    const parsed = parseStored(project.audit_log);
    return Array.isArray(parsed) ? [...parsed].reverse() : [];
  }, [project.audit_log]);

  const workloads = String(project.workloads || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-primary" />
            Source and destination
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <Row label="Source system" value={sourceMeta?.label || project.source_type} />
          <Row label={sourceMeta?.endpointLabel || "Source"} value={project.source_endpoint} />
          <Row
            label="Destination tenant"
            value={
              <span className="inline-flex flex-wrap items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                {project.target_tenant_name || "Not set"}
                {project.target_domain && (
                  <Badge variant="outline" className="font-normal">
                    {project.target_domain}
                  </Badge>
                )}
              </span>
            }
          />
          <Row label="Workloads" value={readingsLabel(project)} />
          <Row
            label="Migration mode"
            value={
              <span className="inline-flex flex-wrap items-center gap-2">
                <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                {modeMeta?.label || project.mode}
                {project.mode === "insane" && project.staging_account && (
                  <Badge variant="secondary" className="font-normal">
                    staging: {project.staging_account}/{project.staging_container || "migration-staging"}
                  </Badge>
                )}
              </span>
            }
          />
          {workloads.length > 0 && (
            <div className="space-y-1 py-3">
              <div className="flex flex-wrap gap-1.5">
                {workloads.map((id) => (
                  <Badge key={id} variant="outline" className="font-normal">
                    {WORKLOADS.find((w) => w.id === id)?.label || id}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                SharePoint, OneDrive and file shares move through the PowerShell pack. Teams and Exchange workloads
                run through the tenant-to-tenant console under this section.
              </p>
            </div>
          )}
          <Row label="Notes" value={project.notes} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Scan status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pre-migration</p>
              {prescan ? (
                <p className={`text-sm font-semibold ${prescan.ready ? "text-emerald-600" : "text-rose-600"}`}>
                  {prescan.ready ? "Cleared" : "Blockers open"} · {prescan.total_rows ?? 0} items ·{" "}
                  {prescan.severity?.critical ?? 0} blocking
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Not scanned yet</p>
              )}
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Post-migration</p>
              {postcheck ? (
                <p className="text-sm font-semibold text-foreground">
                  {postcheck.matched ?? 0} verified · {postcheck.missing ?? 0} missing
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Audit not run yet</p>
              )}
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Items discovered</p>
              <p className="text-sm font-semibold text-foreground">
                {Number(project.item_count || 0).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" />
              Audit trail
            </CardTitle>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ol className="space-y-3">
                {audit.map((entry, index) => (
                  <li key={index} className="border-l-2 border-primary/30 pl-3">
                    <p className="text-sm font-medium text-foreground">{entry.action}</p>
                    <p className="text-xs text-muted-foreground">{entry.detail}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {entry.at ? new Date(entry.at).toLocaleString() : ""} · {entry.actor}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}