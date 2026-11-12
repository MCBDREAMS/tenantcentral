import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRightLeft, Zap, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MigrationProjectsTable from "@/components/migration/suite/MigrationProjectsTable";
import MigrationTypeTab from "@/components/migration/suite/MigrationTypeTab";
import NewProjectDialog from "@/components/migration/suite/NewProjectDialog";
import CredentialManager from "@/components/migration/credentials/CredentialManager";
import { MODES, SOURCE_TYPES } from "@/components/migration/suite/migrationMeta";
import { sourceIcon } from "@/components/migration/suite/sourceIcons";

export default function MigrationHub({ tenants = [] }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSourceType, setDialogSourceType] = useState(null);
  const [tab, setTab] = useState("all");

  const load = async () => {
    try {
      const page = await base44.entities.MigrationProject.list({ sort: "-created_date", limit: 200 });
      setProjects(page.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const running = projects.filter((p) => p.status === "running").length;
    const completed = projects.filter((p) => p.status === "completed").length;
    const items = projects.reduce((sum, p) => sum + Number(p.item_count || 0), 0);
    const sources = new Set(projects.map((p) => p.source_type)).size;
    return { running, completed, items, sources };
  }, [projects]);

  const byType = useMemo(() => {
    const map = {};
    SOURCE_TYPES.forEach((source) => {
      map[source.value] = projects.filter((p) => p.source_type === source.value);
    });
    return map;
  }, [projects]);

  const openNew = (sourceType = null) => {
    setDialogSourceType(sourceType);
    setDialogOpen(true);
  };

  const handleDelete = async (ids) => {
    if (!window.confirm(`Delete ${ids.length} migration project${ids.length === 1 ? "" : "s"}? Reports attached to them go too.`)) {
      return;
    }
    await Promise.all(ids.map((id) => base44.entities.MigrationProject.delete(id)));
    load();
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Migration"
        subtitle="Move content, users and structures from on-premises and cloud sources into Microsoft 365."
        icon={ArrowRightLeft}
        actions={
          <Button onClick={() => openNew(null)}>
            <Plus className="mr-2 h-4 w-4" />
            New migration project
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="h-auto w-max min-w-full flex-wrap justify-start gap-1 p-1">
            <TabsTrigger value="all" className="h-8 gap-1.5">
              All
              <span className="rounded bg-muted px-1.5 text-[11px] font-semibold">{projects.length}</span>
            </TabsTrigger>
            {SOURCE_TYPES.map((source) => {
              const Icon = sourceIcon(source.value);
              const count = byType[source.value]?.length || 0;
              return (
                <TabsTrigger key={source.value} value={source.value} className="h-8 gap-1.5">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {source.short}
                  <span className="rounded bg-muted px-1.5 text-[11px] font-semibold">{count}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="all" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Active projects", value: stats.running },
              { label: "Completed", value: stats.completed },
              { label: "Items in scope", value: stats.items.toLocaleString() },
              { label: "Sources in use", value: stats.sources },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Migration types</h2>
              <span className="text-xs text-muted-foreground">Each type has its own tab and its own options</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SOURCE_TYPES.map((source) => {
                const Icon = sourceIcon(source.value);
                return (
                  <button
                    key={source.value}
                    type="button"
                    onClick={() => setTab(source.value)}
                    className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-left transition-colors hover:border-primary/40"
                  >
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    <p className="mt-1.5 text-sm font-medium text-foreground">{source.label}</p>
                    <p className="text-xs text-muted-foreground">{source.hint}</p>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {MODES.map((mode) => (
                <div key={mode.value} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2">
                  <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{mode.label}</p>
                    <p className="text-xs text-muted-foreground">{mode.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <MigrationProjectsTable
            projects={projects}
            loading={loading}
            onOpen={(project) => navigate(`/MigrationProject?id=${project.id}`)}
            onDelete={handleDelete}
          />

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Saved sign-in credentials</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Reusable source and destination accounts, shared across every migration type.
            </p>
            <div className="mt-3">
              <CredentialManager />
            </div>
          </section>
        </TabsContent>

        {SOURCE_TYPES.map((source) => (
          <TabsContent key={source.value} value={source.value}>
            <MigrationTypeTab
              source={source}
              projects={byType[source.value] || []}
              loading={loading}
              onNew={openNew}
              onOpen={(project) => navigate(`/MigrationProject?id=${project.id}`)}
              onDelete={handleDelete}
            />
          </TabsContent>
        ))}
      </Tabs>

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tenants={tenants}
        initialSourceType={dialogSourceType}
        onCreated={(project) => navigate(`/MigrationProject?id=${project.id}`)}
      />
    </div>
  );
}