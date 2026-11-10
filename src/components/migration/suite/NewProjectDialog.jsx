import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MODES, SOURCE_TYPES, WORKLOADS } from "./migrationMeta";

const emptyForm = {
  name: "",
  source_type: "sharepoint_onprem",
  source_endpoint: "",
  target_tenant_id: "",
  workloads: ["sharepoint", "onedrive"],
  mode: "standard",
  staging_account: "",
  notes: "",
};

export default function NewProjectDialog({ open, onOpenChange, tenants = [], onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setError("");
    }
  }, [open]);

  const sourceMeta = SOURCE_TYPES.find((s) => s.value === form.source_type) || SOURCE_TYPES[0];

  const toggleWorkload = (id) => {
    setForm((prev) => ({
      ...prev,
      workloads: prev.workloads.includes(id)
        ? prev.workloads.filter((w) => w !== id)
        : [...prev.workloads, id],
    }));
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setError("Give the project a name.");
      return;
    }
    const tenant = tenants.find((t) => t.id === form.target_tenant_id);
    if (!tenant) {
      setError("Pick the destination tenant.");
      return;
    }
    if (form.workloads.length === 0) {
      setError("Select at least one workload.");
      return;
    }
    if (form.mode === "insane" && !form.staging_account.trim()) {
      setError("Insane mode needs an Azure storage account for the staging hop.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const me = await base44.auth.me().catch(() => null);
      const created = await base44.entities.MigrationProject.create({
        name: form.name.trim(),
        source_type: form.source_type,
        source_endpoint: form.source_endpoint.trim(),
        source_label: `${sourceMeta.short} · ${form.source_endpoint.trim() || "endpoint not set"}`,
        source_notes: "",
        target_tenant_id: tenant.id,
        target_tenant_name: tenant.name,
        target_azure_tenant_id: tenant.tenant_id,
        target_domain: tenant.domain,
        workloads: form.workloads.join(","),
        mode: form.mode,
        staging_account: form.mode === "insane" ? form.staging_account.trim() : "",
        staging_container: "migration-staging",
        status: "draft",
        item_count: 0,
        notes: form.notes.trim(),
        audit_log: JSON.stringify([
          {
            at: new Date().toISOString(),
            actor: me?.email || "system",
            action: "Project created",
            detail: `${sourceMeta.label} into ${tenant.name}`,
          },
        ]),
      });
      onOpenChange(false);
      onCreated?.(created);
    } catch (e) {
      setError(e.message || "Could not create the project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New migration project</DialogTitle>
          <DialogDescription>
            One project per source-to-tenant move. The scan, script pack and audit reports all hang off it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="mp-name">Project name</Label>
            <Input
              id="mp-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Finance file share to Contoso M365"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Source system</Label>
              <Select
                value={form.source_type}
                onValueChange={(value) => setForm({ ...form, source_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((source) => (
                    <SelectItem key={source.value} value={source.value}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{sourceMeta.hint}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mp-endpoint">{sourceMeta.endpointLabel}</Label>
              <Input
                id="mp-endpoint"
                value={form.source_endpoint}
                onChange={(e) => setForm({ ...form, source_endpoint: e.target.value })}
                placeholder={sourceMeta.placeholder}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Destination tenant</Label>
            <Select
              value={form.target_tenant_id}
              onValueChange={(value) => setForm({ ...form, target_tenant_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a tenant" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name} {tenant.domain ? `(${tenant.domain})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tenants.length === 0 && (
              <p className="text-xs text-muted-foreground">Add a tenant first so the migration has a destination.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Workloads</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {WORKLOADS.map((workload) => {
                const active = form.workloads.includes(workload.id);
                return (
                  <button
                    key={workload.id}
                    type="button"
                    onClick={() => toggleWorkload(workload.id)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <span className="block text-sm font-medium">{workload.label}</span>
                    <span className="block text-xs">{workload.detail}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Migration mode</Label>
            <div className="grid gap-2">
              {MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setForm({ ...form, mode: mode.value })}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    form.mode === mode.value
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <span className="block text-sm font-medium text-foreground">{mode.label}</span>
                  <span className="block text-xs text-muted-foreground">{mode.detail}</span>
                </button>
              ))}
            </div>
          </div>

          {form.mode === "insane" && (
            <div className="space-y-2">
              <Label htmlFor="mp-staging">Azure storage account (staging)</Label>
              <Input
                id="mp-staging"
                value={form.staging_account}
                onChange={(e) => setForm({ ...form, staging_account: e.target.value })}
                placeholder="stgmigration"
              />
              <p className="text-xs text-muted-foreground">
                Container "migration-staging" is used for the intermediate hop. The generated script needs a SAS
                token with write access.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="mp-notes">Notes</Label>
            <Textarea
              id="mp-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Cutover window, business owner, exclusions..."
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Creating..." : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}