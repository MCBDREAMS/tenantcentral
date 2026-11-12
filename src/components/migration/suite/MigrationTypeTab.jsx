import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Plus } from "lucide-react";
import MigrationProjectsTable from "./MigrationProjectsTable";
import { WORKLOADS } from "./migrationMeta";
import { sourceIcon } from "./sourceIcons";

// One migration type: its own options, copy targets and project list.
export default function MigrationTypeTab({ source, projects, loading, onNew, onOpen, onDelete }) {
  const Icon = sourceIcon(source.value);
  const workloads = WORKLOADS.filter((w) => (source.supportedWorkloads || []).includes(w.id));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-primary/10 p-2">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">{source.label}</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">{source.tabHint}</p>
            </div>
          </div>
          <Button onClick={() => onNew(source.value)}>
            <Plus className="mr-2 h-4 w-4" />
            New {source.short} migration
          </Button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(source.options || []).map((option) => (
            <div key={option.label} className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                {option.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{option.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Copy targets
          </span>
          {workloads.map((workload) => (
            <Badge key={workload.id} variant="outline" className="font-normal">
              {workload.label}
            </Badge>
          ))}
        </div>
      </section>

      <MigrationProjectsTable
        projects={projects}
        loading={loading}
        onOpen={onOpen}
        onDelete={onDelete}
      />
    </div>
  );
}