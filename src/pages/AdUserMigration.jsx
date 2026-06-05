import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Users, ArrowRightLeft, ChevronRight, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Download, Upload, RefreshCw, Shield, Key, Monitor, Terminal,
  Cloud, Server, Info, Copy, Eye, EyeOff, GitMerge, UserCheck, Lock, Cpu
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AgentDownloadPanel from "@/components/migration/AgentDownloadPanel";

const STEPS = [
  { id: 0, label: "Configure", icon: Server },
  { id: 1, label: "Scan AD Users", icon: Users },
  { id: 2, label: "Validate & Select", icon: CheckCircle2 },
  { id: 3, label: "Migrate", icon: Cloud },
  { id: 4, label: "Finalize", icon: Shield },
];

const PROTOCOL_BADGES = [
  { label: "AD / LDAP",        color: "bg-blue-100 text-blue-700" },
  { label: "Kerberos / NTLM",  color: "bg-violet-100 text-violet-700" },
  { label: "OAuth / SAML / OIDC", color: "bg-emerald-100 text-emerald-700" },
  { label: "ObjectGUID → ImmutableID", color: "bg-amber-100 text-amber-700" },
  { label: "Entra ID",         color: "bg-cyan-100 text-cyan-700" },
  { label: "Domain Join → Cloud", color: "bg-rose-100 text-rose-700" },
];

function StepBar({ current }) {
  return (
    <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={s.id}>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              active ? "bg-blue-600 text-white shadow" :
              done   ? "bg-emerald-100 text-emerald-700" :
                       "bg-slate-100 text-slate-400"
            }`}>
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              {s.label}
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function UserRow({ u, selected, onToggle, showDetails }) {
  return (
    <label className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0">
      <input type="checkbox" checked={selected} onChange={onToggle}
        className="h-4 w-4 rounded border-slate-300 text-blue-600 shrink-0" />
      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
        {(u.displayName || "?")[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-slate-800">{u.displayName}</p>
          {u.hasSyncErrors && <Badge className="bg-red-100 text-red-700 text-[10px] border-0">Sync Error</Badge>}
          {!u.accountEnabled && <Badge className="bg-slate-100 text-slate-500 text-[10px] border-0">Disabled</Badge>}
        </div>
        <p className="text-xs text-slate-400 truncate">{u.upn}</p>
        {showDetails && (
          <div className="flex gap-3 mt-1 flex-wrap">
            {u.samAccountName && <span className="text-[10px] text-slate-400">SAM: {u.samAccountName}</span>}
            {u.domainName && <span className="text-[10px] text-slate-400">Domain: {u.domainName}</span>}
            {u.department && <span className="text-[10px] text-slate-400">{u.department}</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
        {u.immutableId
          ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px] border-0 flex items-center gap-0.5"><Key className="h-2.5 w-2.5" /> ImmutableID</Badge>
          : <Badge className="bg-amber-100 text-amber-700 text-[10px] border-0">No ImmutableID</Badge>
        }
        {u.licenses > 0 && <Badge className="bg-blue-100 text-blue-700 text-[10px] border-0">{u.licenses} lic.</Badge>}
      </div>
    </label>
  );
}

export default function AdUserMigration({ tenants: propTenants }) {
  const [step, setStep] = useState(0);
  const [scanSource, setScanSource] = useState("graph"); // "graph" | "agent"
  const [sourceTenantId, setSourceTenantId] = useState("");
  const [targetTenantRecord, setTargetTenantRecord] = useState(null);
  const [scanData, setScanData] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [validationResults, setValidationResults] = useState(null);
  const [migrationResults, setMigrationResults] = useState(null);
  const [generatedScript, setGeneratedScript] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [disableDirSync, setDisableDirSync] = useState(false);
  const [convertDevices, setConvertDevices] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("users");

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
    initialData: propTenants || [],
  });

  // ── Agent scan loaded callback ────────────────────────────────────────────
  const handleAgentScanLoaded = (agentUsers, agentScan) => {
    // Convert raw AD agent users to the same shape as Graph scan
    const mapped = (agentUsers || []).map(u => ({
      id: u.objectGuid || u.samAccountName,
      displayName: u.displayName || u.samAccountName,
      upn: u.upn || `${u.samAccountName}@${agentScan.domain}`,
      mail: u.mail,
      accountEnabled: u.enabled !== false,
      immutableId: u.immutableId,
      distinguishedName: u.distinguishedName,
      domainName: agentScan.domain,
      samAccountName: u.samAccountName,
      sid: u.sid,
      jobTitle: u.title,
      department: u.department,
      mobilePhone: u.mobilePhone,
      licenses: 0,
      hasSyncErrors: false,
      identityType: "AD_NATIVE",  // directly from AD, no Entra Connect needed
      // extra AD-native fields
      objectGuid: u.objectGuid,
      ou: u.ou,
      groups: u.groups,
      passwordNeverExpires: u.passwordNeverExpires,
      lastLogon: u.lastLogon,
    }));

    setScanData({
      adSyncedUsers: mapped,
      cloudOnlyCount: 0,
      guestCount: 0,
      totalUsers: mapped.length,
      syncStatus: { onPremisesSyncEnabled: false, source: "AD_AGENT" },
      domains: [{ id: agentScan.domain, isDefault: true, isVerified: true }],
      stats: {
        total: mapped.length,
        adSynced: mapped.length,
        cloudOnly: 0,
        guests: 0,
        withSyncErrors: 0,
        withImmutableId: mapped.filter(u => !!u.immutableId).length,
      },
      agentScan,
    });
    setSelectedUsers(mapped.map(u => u.id));
    setStep(1);
  };

  // ── Step 1: Scan AD users ─────────────────────────────────────────────────
  const handleScan = async () => {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke("adMigration", {
        action: "scan_ad_users",
        azure_tenant_id: sourceTenantId,
        source_tenant_id: sourceTenantId,
      });
      if (res.data?.success) {
        setScanData(res.data);
        setSelectedUsers(res.data.adSyncedUsers.map(u => u.id));
        setStep(1);
      } else throw new Error(res.data?.error || "Scan failed");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ── Step 2: Validate selected users ──────────────────────────────────────
  const handleValidate = async () => {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke("adMigration", {
        action: "validate_migration_readiness",
        azure_tenant_id: sourceTenantId,
        source_tenant_id: sourceTenantId,
        user_ids: selectedUsers.slice(0, 50),
      });
      if (res.data?.success) {
        setValidationResults(res.data.validationResults);
        setStep(2);
      } else throw new Error(res.data?.error);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ── Step 3: Run migration ────────────────────────────────────────────────
  const handleMigrate = async () => {
    setLoading(true); setError(null);
    try {
      const usersToMigrate = (scanData?.adSyncedUsers || []).filter(u => selectedUsers.includes(u.id));

      const res = await base44.functions.invoke("adMigration", {
        action: "migrate_users_to_cloud",
        azure_tenant_id: sourceTenantId,
        source_tenant_id: sourceTenantId,
        target_tenant_id: targetTenantRecord?.tenant_id,
        users: usersToMigrate,
      });

      if (res.data?.success) {
        setMigrationResults(res.data);
        setStep(3);
      } else throw new Error(res.data?.error);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ── Step 4: Generate PS script + optional DirSync disable ────────────────
  const handleFinalize = async () => {
    setLoading(true); setError(null);
    try {
      const usersToMigrate = (scanData?.adSyncedUsers || []).filter(u => selectedUsers.includes(u.id));
      const res = await base44.functions.invoke("adMigration", {
        action: "generate_migration_script",
        azure_tenant_id: sourceTenantId,
        source_tenant_id: sourceTenantId,
        target_tenant_id: targetTenantRecord?.tenant_id,
        users: usersToMigrate,
        options: { disableDirSync, convertDevices },
      });
      if (res.data?.success) {
        setGeneratedScript(res.data.script);
        setStep(4);
      } else throw new Error(res.data?.error);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleDisableDirSync = async () => {
    if (!window.confirm("WARNING: Disabling DirSync is IRREVERSIBLE without Microsoft Support intervention. Are you absolutely sure?")) return;
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke("adMigration", {
        action: "disable_dirsync",
        azure_tenant_id: sourceTenantId,
        source_tenant_id: sourceTenantId,
      });
      if (res.data?.success) {
        alert(res.data.message);
      } else throw new Error(res.data?.error);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const toggleUser = (id) => setSelectedUsers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const readyCount = (validationResults || []).filter(r => r.ready).length;
  const warnCount = (validationResults || []).filter(r => !r.ready).length;

  const reset = () => {
    setStep(0); setScanData(null); setSelectedUsers([]); setValidationResults(null);
    setMigrationResults(null); setGeneratedScript(null); setError(null);
    setSourceTenantId(""); setTargetTenantRecord(null);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="AD → Entra ID User Migration"
        subtitle="Migrate Active Directory users to cloud-managed Entra ID identities with full identity continuity"
        icon={GitMerge}
      />

      {/* Protocol badges */}
      <div className="flex flex-wrap gap-2 mb-6">
        {PROTOCOL_BADGES.map(b => (
          <span key={b.label} className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${b.color}`}>{b.label}</span>
        ))}
      </div>

      <StepBar current={step} />

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-red-700">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* ── STEP 0: Configure ── */}
      {step === 0 && (
        <div className="space-y-5">
          {/* Target tenant — always required */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-slate-800">Target Tenant (Entra ID destination)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5 block">
                  Target — Entra ID Tenant
                </label>
                <select
                  value={targetTenantRecord?.id || ""}
                  onChange={e => setTargetTenantRecord(allTenants.find(t => t.id === e.target.value) || null)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">— Select target tenant —</option>
                  {allTenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.domain})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">Migration Options</label>
                <div className="flex flex-col gap-2">
                  {[
                    { key: "disableDirSync", val: disableDirSync, set: setDisableDirSync, label: "Disable DirSync after migration", danger: true },
                    { key: "convertDevices", val: convertDevices, set: setConvertDevices, label: "Include device conversion", danger: false },
                  ].map(o => (
                    <label key={o.key} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${o.val ? (o.danger ? "border-red-300 bg-red-50 text-red-800" : "border-blue-300 bg-blue-50 text-blue-800") : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                      <input type="checkbox" checked={o.val} onChange={e => o.set(e.target.checked)} />
                      {o.label}
                      {o.danger && <span className="text-[10px] text-red-500 font-bold ml-auto">⚠ IRREVERSIBLE</span>}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Source selector tabs */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex border-b border-slate-200">
              {[
                { key: "graph", label: "Graph API Scan", icon: Cloud, desc: "Reads Entra Connect-synced attributes — requires existing Entra Connect" },
                { key: "agent", label: "On-Prem Agent", icon: Cpu, desc: "Downloads agent to DC — scans raw AD directly, no Entra Connect needed" },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.key}
                    onClick={() => setScanSource(s.key)}
                    className={`flex-1 flex items-center gap-2 px-5 py-4 text-sm font-medium transition-all border-b-2 ${
                      scanSource === s.key
                        ? "border-blue-600 text-blue-700 bg-blue-50/50"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="text-left">
                      <p>{s.label}</p>
                      <p className="text-[10px] font-normal opacity-70">{s.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-5">
              {scanSource === "graph" && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 flex gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    Reads users with <code className="bg-blue-100 px-1 rounded">onPremisesSyncEnabled=true</code> from Entra ID.
                    Requires Entra Connect to already be syncing. Only users synced to Entra ID are visible.
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5 block">
                      Source — Azure Tenant ID (currently running AD Connect)
                    </label>
                    <input
                      value={sourceTenantId}
                      onChange={e => setSourceTenantId(e.target.value.trim())}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <Button
                    onClick={handleScan}
                    disabled={!sourceTenantId || !targetTenantRecord || loading}
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Connect & Scan via Graph API
                  </Button>
                </div>
              )}

              {scanSource === "agent" && (
                <AgentDownloadPanel onScanLoaded={handleAgentScanLoaded} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 1: Scan results & user selection ── */}
      {step === 1 && scanData && (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "AD-Synced Users", value: scanData.stats.adSynced, color: "bg-blue-50 text-blue-700" },
              { label: "Cloud Only", value: scanData.stats.cloudOnly, color: "bg-emerald-50 text-emerald-700" },
              { label: "With ImmutableID", value: scanData.stats.withImmutableId, color: "bg-violet-50 text-violet-700" },
              { label: "Sync Errors", value: scanData.stats.withSyncErrors, color: scanData.stats.withSyncErrors > 0 ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600" },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-4 ${s.color} border-current/20`}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs font-medium mt-1 opacity-70">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Scan source banner */}
          {scanData.agentScan ? (
            <div className="flex items-center gap-3 p-3 rounded-xl border bg-violet-50 border-violet-200 text-violet-800 text-sm">
              <Cpu className="h-4 w-4 shrink-0" />
              <span>Source: <strong>On-Prem AD Agent</strong> on <strong>{scanData.agentScan.hostname}</strong></span>
              <Badge className="bg-violet-200 text-violet-800 border-0 ml-1">{scanData.agentScan.domain}</Badge>
              <span className="text-xs opacity-70 ml-auto">Raw AD scan — ObjectGUID ImmutableIDs computed locally</span>
            </div>
          ) : scanData.syncStatus && (
            <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${scanData.syncStatus.onPremisesSyncEnabled ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
              <Server className="h-4 w-4 shrink-0" />
              <span>DirSync: <strong>{scanData.syncStatus.onPremisesSyncEnabled ? "Enabled" : "Disabled"}</strong></span>
              {scanData.syncStatus.onPremisesLastSyncDateTime && (
                <span className="text-xs opacity-70">Last sync: {new Date(scanData.syncStatus.onPremisesLastSyncDateTime).toLocaleString()}</span>
              )}
            </div>
          )}

          {/* User list */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-700">AD-Synced Users ({scanData.adSyncedUsers.length})</p>
                <Badge className="bg-blue-100 text-blue-700 border-0">{selectedUsers.length} selected</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowDetails(!showDetails)}>
                  {showDetails ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                  {showDetails ? "Less" : "Details"}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setSelectedUsers(scanData.adSyncedUsers.map(u => u.id))}>All</Button>
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setSelectedUsers([])}>None</Button>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {scanData.adSyncedUsers.map(u => (
                <UserRow key={u.id} u={u} selected={selectedUsers.includes(u.id)} onToggle={() => toggleUser(u.id)} showDetails={showDetails} />
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={handleValidate} disabled={loading || selectedUsers.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Validate {selectedUsers.length} Users
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Validation results ── */}
      {step === 2 && validationResults && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-emerald-700">{readyCount}</p>
              <p className="text-xs text-emerald-600 mt-1 font-medium">Ready to Migrate</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-amber-700">{warnCount}</p>
              <p className="text-xs text-amber-600 mt-1 font-medium">Has Warnings</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-blue-700">{validationResults.length}</p>
              <p className="text-xs text-blue-600 mt-1 font-medium">Total Validated</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-700">Validation Details</p>
            </div>
            <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
              {validationResults.map((r, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {r.ready
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        }
                        <p className="text-sm font-medium text-slate-800">{r.displayName}</p>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 ml-6">{r.upn}</p>
                    </div>
                    <div className="flex gap-1.5 flex-wrap justify-end shrink-0">
                      {r.checks && Object.entries(r.checks).map(([k, v]) => (
                        <Badge key={k} className={`text-[9px] border-0 ${v ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {k.replace(/([A-Z])/g, ' $1').replace(/^has /i, '').trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {r.warnings && r.warnings.length > 0 && (
                    <div className="mt-1.5 ml-6 space-y-0.5">
                      {r.warnings.map((w, wi) => (
                        <p key={wi} className="text-[10px] text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="h-2.5 w-2.5 shrink-0" /> {w}
                        </p>
                      ))}
                    </div>
                  )}
                  {r.immutableId && (
                    <p className="text-[10px] text-slate-400 ml-6 mt-1 font-mono">ImmutableID: {r.immutableId.slice(0, 24)}…</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={handleMigrate} disabled={loading || readyCount === 0} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Migrate {readyCount} Users to Entra ID
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Migration results ── */}
      {step === 3 && migrationResults && (
        <div className="space-y-5">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-800">Users Migrated Successfully</p>
              <p className="text-sm text-emerald-700">{migrationResults.succeeded} succeeded · {migrationResults.failed} failed · {migrationResults.total} total</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-700">Migration Results</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2 text-left text-slate-500 font-semibold uppercase">Source UPN</th>
                  <th className="px-4 py-2 text-left text-slate-500 font-semibold uppercase">Target UPN</th>
                  <th className="px-4 py-2 text-left text-slate-500 font-semibold uppercase">ImmutableID</th>
                  <th className="px-4 py-2 text-left text-slate-500 font-semibold uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(migrationResults.results || []).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-600 font-mono truncate max-w-[160px]">{r.sourceUpn || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-mono truncate max-w-[160px]">{r.targetUpn || "—"}</td>
                    <td className="px-4 py-2.5">
                      {r.immutableId
                        ? <span className="text-emerald-600 flex items-center gap-1"><Key className="h-2.5 w-2.5" /> Set</span>
                        : <span className="text-slate-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      {r.status === "success"
                        ? <Badge className="bg-emerald-100 text-emerald-700 border-0">{r.created ? "Created" : "Updated"}</Badge>
                        : <Badge className="bg-red-100 text-red-700 border-0" title={r.error}>Error</Badge>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={handleFinalize} disabled={loading} className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Terminal className="h-4 w-4" />}
              Generate PowerShell Package & Finalize
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 4: PS Script + DirSync controls ── */}
      {step === 4 && (
        <div className="space-y-5">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <p className="font-semibold text-emerald-800">Migration Complete — PowerShell package ready</p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-slate-100">
              <TabsTrigger value="script" className="gap-1.5"><Terminal className="h-3.5 w-3.5" /> PowerShell Script</TabsTrigger>
              <TabsTrigger value="dirsync" className="gap-1.5"><Lock className="h-3.5 w-3.5" /> DirSync Cutover</TabsTrigger>
              <TabsTrigger value="summary" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="script" className="mt-4">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <p className="text-sm font-semibold text-slate-700">AD_Migration.ps1</p>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => {
                    navigator.clipboard.writeText(generatedScript || "");
                    setScriptCopied(true);
                    setTimeout(() => setScriptCopied(false), 2000);
                  }}>
                    <Copy className="h-3 w-3" /> {scriptCopied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <pre className="p-4 text-xs text-emerald-400 bg-slate-950 font-mono overflow-x-auto max-h-[500px] overflow-y-auto whitespace-pre-wrap">
                  {generatedScript}
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="dirsync" className="mt-4">
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-800">Disable DirSync — Final Cloud Cutover</p>
                      <p className="text-sm text-red-700 mt-1">This runs the equivalent of <code className="bg-red-100 px-1 rounded font-mono text-xs">Set-MsolDirSyncEnabled -EnableDirSync $false</code> via Microsoft Graph API. Users become permanently cloud-managed.</p>
                    </div>
                  </div>
                  <div className="bg-red-100 rounded-lg p-3 text-xs text-red-800 space-y-1 mb-4">
                    <p className="font-semibold">Before disabling DirSync:</p>
                    <p>✓ All users have been migrated and validated in target tenant</p>
                    <p>✓ ImmutableIDs are set on all cloud accounts (identity continuity)</p>
                    <p>✓ Licenses assigned in target Entra ID tenant</p>
                    <p>✓ MFA is configured for all cloud accounts</p>
                    <p>✓ Conditional Access policies updated to cloud identity</p>
                  </div>
                  <Button onClick={handleDisableDirSync} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    Disable DirSync (Irreversible)
                  </Button>
                </div>

                <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs text-emerald-400">
                  <p className="text-slate-500 mb-2"># PowerShell equivalent commands:</p>
                  <p>Connect-MsolService</p>
                  <p>Get-MsolCompanyInformation | Select-Object DirectorySynchronizationEnabled</p>
                  <p className="text-amber-400">Set-MsolDirSyncEnabled -EnableDirSync $false -Force</p>
                  <p className="text-slate-500 mt-2"># Verify conversion:</p>
                  <p>Get-AzureADUser | Where {`{$_.DirSyncEnabled -eq $true}`} | Measure-Object</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="summary" className="mt-4">
              <div className="space-y-3">
                {[
                  { icon: Key, label: "Identity Continuity", desc: "ImmutableID (ObjectGUID → Base64) preserved on all migrated accounts — Kerberos/NTLM sessions will transparently transition", color: "text-violet-600", bg: "bg-violet-50" },
                  { icon: UserCheck, label: "User Profiles Synced", desc: "Display name, department, phone, location, employeeId, usageLocation copied to cloud accounts", color: "text-blue-600", bg: "bg-blue-50" },
                  { icon: Shield, label: "Auth Protocols", desc: "OAuth2/OIDC (Entra ID) replaces Kerberos/NTLM for cloud resources. On-prem SAML/AD remains for hybrid apps until DirSync disabled", color: "text-emerald-600", bg: "bg-emerald-50" },
                  { icon: Monitor, label: "Device Relationships", desc: "Hybrid-joined devices retain device records in Entra ID. Full cloud join (dsregcmd /join) is optional for full cloud management", color: "text-cyan-600", bg: "bg-cyan-50" },
                  { icon: Cloud, label: "Cloud Identity", desc: "After DirSync is disabled, users are cloud-managed only. No on-prem writeback. Azure SSPR and MFA are the primary auth methods", color: "text-indigo-600", bg: "bg-indigo-50" },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className={`flex items-start gap-3 p-4 rounded-xl ${item.bg} border border-current/10`}>
                      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${item.color}`} />
                      <div>
                        <p className={`text-sm font-semibold ${item.color}`}>{item.label}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>

          <Button variant="outline" onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Start New Migration
          </Button>
        </div>
      )}
    </div>
  );
}