import React, { useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { AlertCircle, Loader2, Pause, Play, RefreshCw, Rocket, ScanSearch } from "lucide-react";
import MigrationLiveDashboard from "@/components/migration/MigrationLiveDashboard";
import { COPY_SETTINGS, buildSelection, engineWorkloads } from "./nativeSelection";

const host = (value) =>
  String(value || "").replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();

export default function NativeRunPanel({ project, tenants = [], onRefresh }) {
  const { toast } = useToast();
  const list = useMemo(() => engineWorkloads(project.workloads), [project.workloads]);
  const m365 = project.source_type === "m365_tenant";

  const guess = useMemo(
    () =>
      tenants.find(
        (t) => t.tenant_id && host(t.domain) && host(project.source_endpoint).includes(host(t.domain)),
      )?.id || "",
    [tenants, project.source_endpoint],
  );

  const [sourceTenantId, setSourceTenantId] = useState(
    project.source_tenant_id || guess || "",
  );
  const [objects, setObjects] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [batchId, setBatchId] = useState(project.native_batch_id || "");
  const [scanning, setScanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [pass, setPass] = useState("");
  const stop = useRef(false);

  const sourceTenant = tenants.find((t) => t.id === sourceTenantId);
  const targetTenant = tenants.find((t) => t.id === project.target_tenant_id);

  const scan = async () => {
    if (!sourceTenant?.tenant_id) {
      setError("Pick the source tenant — it needs an Azure tenant ID to be read.");
      return;
    }
    setScanning(true);
    setError("");
    try {
      const found = {};
      for (const workload of list) {
        const res = await base44.functions.invoke("migrationEngine", {
          action: "list_source",
          source_azure_tenant_id: sourceTenant.tenant_id,
          workload,
          top: 80,
        });
        found[workload] = res.data?.objects || [];
      }
      const mapRes = await base44.functions.invoke("migrationEngine", {
        action: "auto_map",
        source_azure_tenant_id: sourceTenant.tenant_id,
        target_azure_tenant_id: project.target_azure_tenant_id,
      });
      setMapping(mapRes.data);
      setObjects(found);
      await base44.entities.MigrationProject.update(project.id, {
        source_tenant_id: sourceTenant.id,
        source_azure_tenant_id: sourceTenant.tenant_id,
        source_tenant_name: sourceTenant.name,
      });
      onRefresh?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setScanning(false);
    }
  };

  const selection = useMemo(
    () => (objects ? buildSelection(objects, mapping, list) : []),
    [objects, mapping, list],
  );

  const runLoop = async (id) => {
    stop.current = false;
    setRunning(true);
    try {
      let status = "running";
      while (status === "running" && !stop.current) {
        const res = await base44.functions.invoke("migrationEngine", {
          action: "run",
          batch_id: id,
          maxItems: 6,
        });
        status = res.data?.status || "completed";
        setPass(`Pass done — ${res.data?.cursor || 0} of ${res.data?.total || 0} items`);
        if (status !== "running") break;
        await new Promise((r) => setTimeout(r, 800));
      }
      if (!stop.current) {
        await base44.entities.MigrationProject.update(project.id, { status: "completed" });
        toast({ title: "Native migration finished", description: "Open the live dashboard for per-item results." });
        onRefresh?.();
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      await base44.entities.MigrationProject.update(project.id, { status: "failed" }).catch(() => null);
    } finally {
      setRunning(false);
    }
  };

  const start = async () => {
    if (!sourceTenant?.tenant_id || !project.target_azure_tenant_id) {
      setError("Both tenants need an Azure tenant ID before the app can migrate.");
      return;
    }
    if (selection.length === 0) {
      setError("Scan the source first — there is nothing in the run yet.");
      return;
    }
    setError("");
    try {
      const me = await base44.auth.me().catch(() => null);
      const res = await base44.functions.invoke("migrationEngine", {
        action: "create_batch",
        name: `${project.name} · in-app run`,
        source_azure_tenant_id: sourceTenant.tenant_id,
        target_azure_tenant_id: project.target_azure_tenant_id,
        source_tenant_name: sourceTenant.name,
        target_tenant_name: project.target_tenant_name,
        workloads: list,
        selection,
        user_mapping: mapping?.userMapping || [],
        group_mapping: mapping?.groupMapping || [],
        principal_replace_rules: [],
        copy_settings: COPY_SETTINGS,
      });
      const id = res.data.batch_id;
      setBatchId(id);
      await base44.entities.MigrationProject.update(project.id, {
        native_batch_id: id,
        status: "running",
        audit_log: JSON.stringify([
          ...safeLog(project.audit_log),
          {
            at: new Date().toISOString(),
            actor: me?.email || "system",
            action: "Native migration started",
            detail: `${selection.length} item(s) from ${sourceTenant.name}`,
          },
        ]),
      });
      onRefresh?.();
      await runLoop(id);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  if (!m365) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            This source runs through the agent
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            The app can read and copy a Microsoft 365 source tenant directly. This project's source is{" "}
            <span className="font-medium text-foreground">{project.source_endpoint || "on-premises"}</span>, which
            sits inside your network — nothing in the cloud can reach it, so the agent script still has to run on a
            server there to send the inventory up.
          </p>
          <p>
            Everything after that inventory is handled in-app: the scan, mapping and reports all run here. If the
            content already lives in Microsoft 365, create the project with the Microsoft 365 tenant source and it
            migrates natively.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4 text-primary" />
            Run in the app
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The app signs in to both tenants with their app registrations, enumerates the source itself and copies
            the selected workloads straight into the destination — no CSV and no PowerShell to run.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source tenant</p>
              <Select value={sourceTenantId} onValueChange={setSourceTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select the source tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} {t.domain ? `(${t.domain})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destination</p>
              <p className="pt-1.5 text-sm text-foreground">
                {project.target_tenant_name || targetTenant?.name || "Not set"}
                {project.target_domain ? ` · ${project.target_domain}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {list.map((w) => (
              <Badge key={w} variant="secondary" className="capitalize">
                {w}
              </Badge>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={scan} disabled={scanning || running}>
              {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
              Scan source
            </Button>
            {!batchId && (
              <Button onClick={start} disabled={running || scanning || selection.length === 0}>
                {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Start migration
              </Button>
            )}
            {running && (
              <Button
                variant="outline"
                onClick={async () => {
                  stop.current = true;
                  if (batchId) {
                    await base44.functions.invoke("migrationEngine", { action: "pause", batch_id: batchId });
                  }
                }}
              >
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
            )}
            {batchId && !running && (
              <Button
                variant="outline"
                onClick={async () => {
                  await base44.functions.invoke("migrationEngine", { action: "reset", batch_id: batchId });
                  await runLoop(batchId);
                }}
                disabled={running}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Incremental sync
              </Button>
            )}
          </div>

          {objects && (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {Object.entries(objects).map(([workload, rows]) => (
                <span key={workload} className="rounded-md border border-border px-2 py-1">
                  {rows.length} {workload}
                </span>
              ))}
              <span className="rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-primary">
                {selection.length} items in this run
              </span>
            </div>
          )}

          {pass && <p className="text-xs text-muted-foreground">{pass}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {batchId ? (
        <MigrationLiveDashboard batchId={batchId} onSelectBatch={setBatchId} refreshKey={running} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Scan the source to build the run, then start it. Progress appears here, item by item.
        </p>
      )}
    </div>
  );
}

function safeLog(raw) {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}