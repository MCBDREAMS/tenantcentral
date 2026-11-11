import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Building2, Cloud, Info, Loader2, Save } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import TenantAuthCard from "./TenantAuthCard";
import SavedCredentialPicker from "@/components/migration/credentials/SavedCredentialPicker";
import { authFromCredential } from "@/components/migration/credentials/credentialMeta";
import { emptyAuth, parseAuth } from "./authMethods";

export default function CredentialsPanel({ project, onRefresh }) {
  const { toast } = useToast();
  const [source, setSource] = useState(() => parseAuth(project.source_auth));
  const [target, setTarget] = useState(() => parseAuth(project.target_auth, "credential"));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const me = await base44.auth.me().catch(() => null);
      let audit = [];
      try {
        audit = project.audit_log ? JSON.parse(project.audit_log) : [];
      } catch {
        audit = [];
      }
      audit.push({
        at: new Date().toISOString(),
        actor: me?.email || "system",
        action: "Sign-in settings updated",
        detail: `Source: ${source.method} · Destination: ${target.method}`,
      });

      await base44.entities.MigrationProject.update(project.id, {
        source_auth: JSON.stringify(source),
        target_auth: JSON.stringify(target),
        audit_log: JSON.stringify(audit.slice(-50)),
      });

      toast({
        title: "Sign-in settings saved",
        description: "The script pack and scans use these accounts.",
      });
      onRefresh?.();
    } catch (e) {
      toast({
        title: "Could not save sign-in settings",
        description: e.response?.data?.error || e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Use dedicated migration accounts. Credentials are stored on this project record in the app
          database, readable only by the project owner and app admins, and are never written into the
          generated scripts. Rotate or remove them once cutover is complete.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <SavedCredentialPicker role="source" onApply={(auth) => setSource(auth)} />
          <TenantAuthCard
            title="Source sign-in"
            subtitle={project.source_label || project.source_endpoint || "Source system"}
            icon={Cloud}
            value={source}
            onChange={setSource}
          />
        </div>
        <div className="space-y-2">
          <SavedCredentialPicker role="destination" onApply={(auth) => setTarget(auth)} />
          <TenantAuthCard
            title="Destination sign-in"
            subtitle={`${project.target_tenant_name || "Destination tenant"}${
              project.target_domain ? ` · ${project.target_domain}` : ""
            }`}
            icon={Building2}
            value={target}
            onChange={setTarget}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save sign-in settings
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setSource(emptyAuth("interactive"));
            setTarget(emptyAuth("credential"));
          }}
          disabled={saving}
        >
          Clear
        </Button>
        <span className="text-xs text-muted-foreground">
          Clearing only changes the form until you save.
        </span>
      </div>
    </div>
  );
}