import React, { useState, useEffect } from "react";
import { ArrowRightLeft, Check, ChevronsRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useRbac } from "@/components/shared/useRbac";
import PageHeader from "@/components/shared/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import MigrationSourcePicker from "@/components/migration/MigrationSourcePicker";
import MigrationMapping from "@/components/migration/MigrationMapping";
import MigrationCopySettings from "@/components/migration/MigrationCopySettings";
import MigrationRunConsole from "@/components/migration/MigrationRunConsole";

const WORKLOADS = [
  { id: "mailboxes", label: "Exchange Mailboxes", kind: "users", note: "Identity + mailbox (body via Exchange move request)" },
  { id: "onedrive", label: "OneDrive Drives", kind: "onedrive", note: "Files copied live via Graph" },
  { id: "sharepoint", label: "SharePoint Sites", kind: "sharepoint", note: "Group-connected site + files copied live" },
  { id: "teams", label: "Teams (channels + chat)", kind: "teams", note: "Team, channels, channel messages (best-effort)" },
  { id: "groups", label: "Users & Groups", kind: "groups", note: "Identities created in target" },
];

const STEPS = ["Scope", "Select Source", "Map & Replace", "Copy Settings", "Run & Report"];

export default function ShareGateConsole() {
  const { filterTenants } = useRbac();
  const [tenants, setTenants] = useState([]);

  // Fetch the user's RBAC-scoped tenant list directly (not the sidebar-scoped prop),
  // so source AND target can both be chosen from the tenants this user may manage.
  useEffect(() => {
    base44.entities.Tenant.list().then((t) => setTenants(filterTenants(t) || [])).catch(() => setTenants([]));
  }, [filterTenants]);

  const [step, setStep] = useState(0);
  const [sourceTenantId, setSourceTenantId] = useState("");
  const [targetTenantId, setTargetTenantId] = useState("");
  const [workloads, setWorkloads] = useState(["mailboxes", "onedrive", "sharepoint", "teams", "groups"]);
  const [incremental, setIncremental] = useState(true);
  const [selection, setSelection] = useState({}); // {workload: [objects]}
  const [userMapping, setUserMapping] = useState([]);
  const [groupMapping, setGroupMapping] = useState([]);
  const [principalRules, setPrincipalRules] = useState([]);
  const [copySettings, setCopySettings] = useState({
    usageLocation: "US", assignLicense: false, targetSkuId: "",
    permissions: true, versionHistory: false, metadata: true,
    maxFilesPerRun: 30, folderDepth: 2, maxChannelsPerRun: 10, includeTeamChats: true,
  });
  const [batchId, setBatchId] = useState(null);

  const sourceTenant = tenants.find((t) => t.tenant_id === sourceTenantId);
  const targetTenant = tenants.find((t) => t.tenant_id === targetTenantId);

  const toggleWorkload = (id) => setWorkloads((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  const canNext =
    step === 0 ? !!sourceTenantId && !!targetTenantId && sourceTenantId !== targetTenantId && workloads.length > 0
    : step === 1 ? Object.values(selection).some((arr) => arr && arr.length > 0)
    : step === 2 ? userMapping.length > 0 || groupMapping.length > 0
    : true;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Tenant-to-Tenant Migration"
        subtitle="ShareGate-style live cross-tenant migration console"
        icon={ArrowRightLeft}
      />

      {/* Stepper */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                i === step ? "bg-primary text-primary-foreground border-primary"
                : i < step ? "bg-primary/10 text-primary border-primary/30 cursor-pointer"
                : "bg-card text-muted-foreground border-border"
              }`}
            >
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-xs ${i === step ? "bg-primary-foreground/20" : i < step ? "bg-primary text-white" : "bg-muted"}`}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {s}
            </button>
            {i < STEPS.length - 1 && <ChevronsRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Step 0 — Scope */}
      {step === 0 && (
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Source tenant</label>
              <Select value={sourceTenantId} onValueChange={setSourceTenantId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select source tenant" /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => <SelectItem key={t.id} value={t.tenant_id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Target tenant</label>
              <Select value={targetTenantId} onValueChange={setTargetTenantId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select target tenant" /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => <SelectItem key={t.id} value={t.tenant_id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {sourceTenantId && targetTenantId && sourceTenantId === targetTenantId && (
            <p className="text-sm text-destructive">Source and target tenants must be different.</p>
          )}
          <div>
            <label className="text-sm font-medium">Workloads to migrate</label>
            <div className="grid md:grid-cols-2 gap-2 mt-2">
              {WORKLOADS.map((w) => (
                <label key={w.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/40 cursor-pointer">
                  <Checkbox checked={workloads.includes(w.id)} onCheckedChange={() => toggleWorkload(w.id)} />
                  <div>
                    <div className="text-sm font-medium">{w.label}</div>
                    <div className="text-xs text-muted-foreground">{w.note}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={incremental} onCheckedChange={setIncremental} />
            Enable incremental sync (re-run to copy new/changed content until cutover)
          </label>
        </div>
      )}

      {/* Step 1 — Select source objects */}
      {step === 1 && sourceTenant && (
        <MigrationSourcePicker
          sourceTenant={sourceTenant}
          workloads={workloads}
          selection={selection}
          setSelection={setSelection}
        />
      )}

      {/* Step 2 — Mapping & principal replace */}
      {step === 2 && (
        <MigrationMapping
          sourceTenant={sourceTenant}
          targetTenant={targetTenant}
          selection={selection}
          workloads={workloads}
          userMapping={userMapping}
          setUserMapping={setUserMapping}
          groupMapping={groupMapping}
          setGroupMapping={setGroupMapping}
          principalRules={principalRules}
          setPrincipalRules={setPrincipalRules}
        />
      )}

      {/* Step 3 — Copy settings */}
      {step === 3 && (
        <MigrationCopySettings settings={copySettings} setSettings={setCopySettings} workloads={workloads} />
      )}

      {/* Step 4 — Run & report */}
      {step === 4 && (
        <MigrationRunConsole
          sourceTenant={sourceTenant}
          targetTenant={targetTenant}
          workloads={workloads}
          selection={selection}
          userMapping={userMapping}
          groupMapping={groupMapping}
          principalRules={principalRules}
          copySettings={copySettings}
          incremental={incremental}
          batchId={batchId}
          setBatchId={setBatchId}
        />
      )}

      {/* Footer nav */}
      <div className="flex justify-between mt-6">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Next <ChevronsRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setStep(0)}>Start a new batch</Button>
        )}
      </div>
    </div>
  );
}