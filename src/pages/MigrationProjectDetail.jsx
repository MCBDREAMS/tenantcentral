import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import ProjectOverview from "@/components/migration/suite/ProjectOverview";
import ScriptPanel from "@/components/migration/suite/ScriptPanel";
import PrescanPanel from "@/components/migration/suite/PrescanPanel";
import SharePointSitesPanel from "@/components/migration/suite/SharePointSitesPanel";
import PostAuditPanel from "@/components/migration/suite/PostAuditPanel";
import { STATUS_META, sourceLabel } from "@/components/migration/suite/migrationMeta";

export default function MigrationProjectDetail() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);

  const projectId = new URLSearchParams(window.location.search).get("id");

  const load = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    const record = await base44.entities.MigrationProject
      .get(projectId)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    setProject(record);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const changeStatus = async (status) => {
    if (!project) return;
    setSavingStatus(true);
    try {
      await base44.entities.MigrationProject.update(project.id, { status });
      setProject({ ...project, status });
      toast({ title: "Status updated", description: STATUS_META[status]?.label });
    } catch (e) {
      toast({ title: "Could not update status", description: e.message, variant: "destructive" });
    } finally {
      setSavingStatus(false);
    }
  };

  const remove = async () => {
    if (!project) return;
    if (!window.confirm(`Delete "${project.name}"? Its scan and audit reports are removed too.`)) return;
    await base44.entities.MigrationProject.delete(project.id);
    navigate("/MigrationHub");
  };

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate("/MigrationHub")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to migration
        </Button>
        <p className="mt-6 text-sm text-muted-foreground">That migration project no longer exists.</p>
      </div>
    );
  }

  const statusMeta = STATUS_META[project.status] || STATUS_META.draft;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate("/MigrationHub")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Migration
          </Button>
          <h1 className="truncate text-xl font-semibold text-foreground">{project.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{sourceLabel(project)}</span>
            <span aria-hidden="true">→</span>
            <span>{project.target_tenant_name || "No destination"}</span>
            <Badge variant="outline" style={{ color: statusMeta.dot, borderColor: `${statusMeta.dot}66` }}>
              {statusMeta.label}
            </Badge>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={project.status} onValueChange={changeStatus} disabled={savingStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_META).map(([value, meta]) => (
                <SelectItem key={value} value={value}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={remove}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sites">SharePoint sites</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
          <TabsTrigger value="prescan">Pre-migration scan</TabsTrigger>
          <TabsTrigger value="postaudit">Post-migration audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ProjectOverview project={project} />
        </TabsContent>
        <TabsContent value="sites">
          <SharePointSitesPanel project={project} />
        </TabsContent>
        <TabsContent value="scripts">
          <ScriptPanel project={project} onRefresh={load} />
        </TabsContent>
        <TabsContent value="prescan">
          <PrescanPanel project={project} onRefresh={load} />
        </TabsContent>
        <TabsContent value="postaudit">
          <PostAuditPanel project={project} onRefresh={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}