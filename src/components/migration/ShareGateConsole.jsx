import React, { useState, useEffect, useMemo } from "react";
import { ArrowRightLeft, Check, ChevronsRight, Server } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useRbac } from "@/components/shared/useRbac";
import PageHeader from "@/components/shared/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import MigrationSourcePicker from "@/components/migration/MigrationSourcePicker";
import MigrationAccountsStep from "@/components/migration/MigrationAccountsStep";
import MigrationMapping from "@/components/migration/MigrationMapping";
import MigrationCopySettings from "@/components/migration/MigrationCopySettings";
import MigrationRunConsole from "@/components/migration/MigrationRunConsole";
import OnPremAgentPicker from "@/components/migration/OnPremAgentPicker";
import OnPremSourceStep from "@/components/migration/OnPremSourceStep";
import OnPremAccountsStep from "@/components/migration/OnPremAccountsStep";

const WORKLOADS = [
  { id: "mailboxes", label: "Exchange Mailboxes", kind: "users", note: "Identity + mailbox (body via Exchange move request)" },
  { id: "chats", label: "Teams Chats", kind: "chats", note: "1:1 and group chats, chosen per conversation" },
  { id: "onedrive", label: "OneDrive Drives", kind: "onedrive", note: "Files copied live via Graph" },
  { id: "sharepoint", label: "SharePoint Sites", kind: "sharepoint", note: "Group-connected site + files copied live" },
  { id: "teams", label: "Teams (channels)", kind: "teams", note: "Team, channels, channel messages (best-effort)" },
  { id: "groups", label: "Users & Groups", kind: "groups", note: "Identities created in target" },
];

// An on-premises source only carries directory objects: the agent scans AD, not mail or files.
const ONPREM_WORKLOADS = [
  { id: "mailboxes", label: "AD accounts (identities)", kind: "users", note: "Created in the target with ObjectGUID as ImmutableID" },
  { id: "groups", label: "AD groups", kind: "groups", note: "Security groups from the memberships in the agent scan" },
];

const M365_WORKLOADS = ["mailboxes", "chats", "onedrive", "sharepoint", "teams", "groups"];

const STEPS = ["Scope", "Select Source", "Accounts & Domains", "Map & Replace", "Copy Settings", "Run & Report"];

export default function ShareGateConsole() {
  const { rbac, filterTenants } = useRbac();
  const [allTenants, setAllTenants] = useState([]);

  // Fetch the tenant list exactly ONCE. RBAC scoping is derived below with useMemo, so a
  // re-render can never re-trigger the fetch (that previously caused a re-render loop).
  useEffect(() => {
    let cancelled = false;
    base44.entities.Tenant.list()
      .then((t) => { if (!cancelled) setAllTenants(t || []); })
      .catch(() => { if (!cancelled) setAllTenants([]); });
    return () => { cancelled = true; };
  }, []);

  // RBAC-scoped tenant list (source AND target are chosen from tenants this user may manage).
  const tenants = useMemo(() => filterTenants(allTenants) || [], [allTenants, rbac]);

  const [step, setStep] = useState(0);
  const [sourceMode, setSourceMode] = useState("m365"); // "m365" | "onprem"
  const [onpremScan, setOnpremScan] = useState(null); // AdAgentScan summary chosen as the source
  const [sourceTenantId, setSourceTenantId] = useState("");
  const [targetTenantId, setTargetTenantId] = useState("");
  const [workloads, setWorkloads] = useState(M365_WORKLOADS);
  const [incremental, setIncremental] = useState(true);
  const [selection, setSelection] = useState({}); // content objects: {workload: [objects]}
  const [userConfig, setUserConfig] = useState({}); // per-account selection, mode, domain, mailbox options
  const [chatConfig, setChatConfig] = useState({}); // per-chat selection
  const [domains, setDomains] = useState([]); // verified domains of the TARGET tenant
  const [groupMapping, setGroupMapping] = useState([]);
  const [principalRules, setPrincipalRules] = useState([]);
  const [copySettings, setCopySettings] = useState({
    usageLocation: "US", assignLicense: false, targetSkuId: "",
    permissions: true, versionHistory: false, metadata: true,
    maxFilesPerRun: 30, folderDepth: 2, maxChannelsPerRun: 10, includeTeamChats: true,
    maxChatMessagesPerRun: 25, requireAllMembersMapped: false,
  });
  const [batchId, setBatchId] = useState(null);

  const sourceTenant = tenants.find((t) => t.tenant_id === sourceTenantId);
  const targetTenant = tenants.find((t) => t.tenant_id === targetTenantId);

  // Target verified domains power the per-account domain picker.
  useEffect(() => {
    if (!targetTenantId) { setDomains([]); return; }
    let cancelled = false;
    base44.functions.invoke("migrationEngine", { action: "list_domains", target_azure_tenant_id: targetTenantId })
      .then((res) => { if (!cancelled) setDomains(res.data?.domains || []); })
      .catch(() => { if (!cancelled) setDomains([]); });
    return () => { cancelled = true; };
  }, [targetTenantId]);

  const toggleWorkload = (id) => setWorkloads((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  // Switching source type invalidates everything chosen for the previous source — the account
  // rows and object selections belong to one source, so they are dropped rather than mixed.
  const switchSource = (mode) => {
    if (mode === sourceMode) return;
    setSourceMode(mode);
    setWorkloads(mode === "onprem" ? ONPREM_WORKLOADS.map((w) => w.id) : M365_WORKLOADS);
    setSelection({});
    setUserConfig({});
    setChatConfig({});
    setGroupMapping([]);
    setBatchId(null);
  };

  const onpremLabel = onpremScan
    ? `${onpremScan.domain}${onpremScan.hostname ? ` (${onpremScan.hostname})` : ""}`
    : "";

  // The accounts step is the single source of truth for users: mapping rows (and therefore
  // the migration payload) are derived from it, so mode and domain always match what was picked.
  const userMapping = useMemo(() => Object.values(userConfig)
    .filter((u) => u.selected && u.mode !== "skip")
    .map((u) => ({
      sourceId: u.id,
      sourceUpn: u.upn,
      sourceMail: u.mail,
      sourceName: u.displayName,
      action: u.mode === "migrate" ? "map" : "create",
      targetUpn: u.localPart && u.domain ? `${u.localPart}@${u.domain}` : u.upn,
      targetDomain: u.domain,
      mailbox: u.includeMailbox && u.mail ? u.mailbox : null,
    })), [userConfig]);

  // Edits made on the mapping step (action / target UPN) are written back to the account rows.
  const setUserMapping = (next) => setUserConfig((prev) => {
    const byUpn = new Map(Object.values(prev).map((u) => [u.upn, u]));
    const copy = { ...prev };
    (next || []).forEach((m) => {
      const u = byUpn.get(m.sourceUpn);
      if (!u) return;
      const [localPart, domain] = String(m.targetUpn || "").split("@");
      copy[u.id] = {
        ...u,
        mode: m.action === "map" ? "migrate" : m.action === "skip" ? "skip" : "create",
        selected: m.action === "skip" ? false : true,
        localPart: localPart || u.localPart,
        domain: domain || u.domain,
      };
    });
    return copy;
  });

  const pickerWorkloads = workloads.filter((w) => w !== "mailboxes" && w !== "chats");
  const accountsSelected = Object.values(userConfig).some((u) => u.selected && u.mode !== "skip");
  const chatsSelected = Object.values(chatConfig).some((c) => c.selected);

  const canNext =
    step === 0 ? (sourceMode === "onprem"
        ? !!onpremScan?.id && !!targetTenantId && workloads.length > 0
        : !!sourceTenantId && !!targetTenantId && sourceTenantId !== targetTenantId && workloads.length > 0)
    : step === 1 ? (sourceMode === "onprem"
        ? !!onpremScan?.id
        : pickerWorkloads.length === 0 || Object.values(selection).some((arr) => arr && arr.length > 0))
    : step === 2 ? accountsSelected || chatsSelected ||
        Object.values(selection).some((arr) => arr && arr.length > 0) ||
        (!workloads.includes("mailboxes") && !workloads.includes("chats") && !workloads.includes("groups"))
    : step === 3 ? userMapping.length > 0 || groupMapping.length > 0 || chatsSelected
    : true;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Tenant-to-Tenant Migration"
        subtitle="Live migration console — tenant-to-tenant or on-premises AD to Microsoft 365"
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
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Migration source</span>
            <div className="inline-flex rounded-lg border overflow-hidden">
              <button
                type="button"
                onClick={() => switchSource("m365")}
                className={`px-3 py-1.5 text-sm ${sourceMode === "m365" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                Microsoft 365 tenant
              </button>
              <button
                type="button"
                onClick={() => switchSource("onprem")}
                className={`px-3 py-1.5 text-sm border-l flex items-center gap-1.5 ${sourceMode === "onprem" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                <Server className="h-3.5 w-3.5" />On-premises server
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              {sourceMode === "m365" ? (
                <>
                  <label className="text-sm font-medium">Source tenant</label>
                  <Select value={sourceTenantId} onValueChange={setSourceTenantId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select source tenant" /></SelectTrigger>
                    <SelectContent>
                      {tenants.map((t) => <SelectItem key={t.id} value={t.tenant_id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  <label className="text-sm font-medium">On-premises server (AD agent)</label>
                  <div className="mt-1"><OnPremAgentPicker scanId={onpremScan?.id || ""} onSelect={setOnpremScan} /></div>
                </>
              )}
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
          {sourceMode === "m365" && sourceTenantId && targetTenantId && sourceTenantId === targetTenantId && (
            <p className="text-sm text-destructive">Source and target tenants must be different.</p>
          )}
          <div>
            <label className="text-sm font-medium">Workloads to migrate</label>
            <div className="grid md:grid-cols-2 gap-2 mt-2">
              {(sourceMode === "onprem" ? ONPREM_WORKLOADS : WORKLOADS).map((w) => (
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

      {/* Step 1 — Select source content objects */}
      {step === 1 && sourceMode === "onprem" && <OnPremSourceStep scan={onpremScan} />}
      {step === 1 && sourceMode === "m365" && sourceTenant && (
        pickerWorkloads.length === 0 ? (
          <div className="bg-card border rounded-xl p-5 text-sm text-muted-foreground">
            No file, site or team content is in scope — continue to accounts &amp; domains.
          </div>
        ) : (
          <MigrationSourcePicker
            sourceTenant={sourceTenant}
            workloads={pickerWorkloads}
            selection={selection}
            setSelection={setSelection}
          />
        )
      )}

      {/* Step 2 — Per-account selection, migrate vs create, target domain, mailboxes & chats */}
      {step === 2 && sourceMode === "onprem" && onpremScan && (
        <OnPremAccountsStep
          scanId={onpremScan.id}
          domains={domains}
          workloads={workloads}
          userConfig={userConfig}
          setUserConfig={setUserConfig}
          selection={selection}
          setSelection={setSelection}
        />
      )}
      {step === 2 && sourceMode === "m365" && sourceTenant && (
        <MigrationAccountsStep
          sourceTenant={sourceTenant}
          domains={domains}
          workloads={workloads}
          userConfig={userConfig}
          setUserConfig={setUserConfig}
          userMapping={userMapping}
          chatConfig={chatConfig}
          setChatConfig={setChatConfig}
        />
      )}

      {/* Step 3 — Mapping & principal replace */}
      {step === 3 && (
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

      {/* Step 4 — Copy settings */}
      {step === 4 && (
        <MigrationCopySettings
          settings={copySettings}
          setSettings={setCopySettings}
          workloads={workloads}
          domains={domains}
        />
      )}

      {/* Step 5 — Run & report */}
      {step === 5 && (
        <MigrationRunConsole
          sourceTenant={sourceTenant}
          targetTenant={targetTenant}
          sourceKind={sourceMode}
          sourceScanId={onpremScan?.id || ""}
          sourceLabel={onpremLabel}
          workloads={workloads}
          selection={selection}
          userConfig={userConfig}
          chatConfig={chatConfig}
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