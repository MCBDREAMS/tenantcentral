import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Shield, Users, Globe, AppWindow, Lock, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2, AlertTriangle, X,
  Plus, Check, Search, Building, UserCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { logAction } from "@/components/shared/auditLogger";

const STEPS = [
  { id: "name",       label: "Name & State",     icon: Shield },
  { id: "users",      label: "Users & Groups",   icon: Users },
  { id: "apps",       label: "Target Apps",      icon: AppWindow },
  { id: "conditions", label: "Conditions",       icon: Globe },
  { id: "controls",  label: "Grant Controls",   icon: Lock },
  { id: "review",    label: "Review & Deploy",  icon: CheckCircle2 },
];

// Well-known app IDs
const WELL_KNOWN_APPS = [
  { id: "All", displayName: "All cloud apps" },
  { id: "00000003-0000-0000-c000-000000000000", displayName: "Microsoft Graph" },
  { id: "00000002-0000-0ff1-ce00-000000000000", displayName: "Exchange Online" },
  { id: "00000003-0000-0ff1-ce00-000000000000", displayName: "SharePoint Online" },
  { id: "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe", displayName: "Microsoft Teams" },
  { id: "0000000a-0000-0000-c000-000000000000", displayName: "Microsoft Intune" },
  { id: "89bee1f7-5e6e-4d8a-9f3d-ecd601259da7", displayName: "Office 365" },
  { id: "00000007-0000-0000-c000-000000000000", displayName: "Dynamics 365" },
  { id: "797f4846-ba00-4fd7-ba43-dac1f8f63013", displayName: "Windows Azure Service Management API" },
  { id: "00b41c95-dab0-4487-9791-b9d2c32c80f2", displayName: "Azure Portal" },
];

const PLATFORM_OPTIONS = ["all", "android", "iOS", "windows", "macOS", "linux"];

const GRANT_CONTROLS = [
  { id: "mfa", label: "Require multi-factor authentication" },
  { id: "compliantDevice", label: "Require device to be marked as compliant" },
  { id: "domainJoinedDevice", label: "Require Hybrid Azure AD joined device" },
  { id: "approvedApplication", label: "Require approved client app" },
  { id: "passwordChange", label: "Require password change" },
];

const EMPTY_POLICY = {
  displayName: "",
  state: "enabledForReportingButNotEnforced", // report-only by default (safe)
  includeUsers: [],
  excludeUsers: [],
  includeGroups: [],
  excludeGroups: [],
  includeApps: [],
  excludeApps: [],
  includePlatforms: [],
  excludePlatforms: [],
  includeLocations: [],
  excludeLocations: [],
  requireMfa: false,
  grantControls: [],
  grantLogic: "OR",
  sessionSignInFrequency: null,
  sessionFrequencyUnit: "hours",
  persistentBrowser: "notConfigured",
};

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const Icon = s.icon;
        return (
          <React.Fragment key={s.id}>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${active ? "bg-blue-600 text-white" : done ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
              {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SearchPicker({ items, selected, onToggle, keyField = "id", labelField = "displayName", placeholder = "Search...", loading }) {
  const [q, setQ] = useState("");
  const filtered = items.filter(i => (i[labelField] || "").toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input className="pl-8 h-8 text-xs" placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-0.5 border border-slate-200 rounded-lg p-1">
        {loading && <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-300" /></div>}
        {!loading && filtered.length === 0 && <div className="text-xs text-slate-400 text-center py-4">No results found</div>}
        {filtered.map(item => {
          const isSelected = selected.includes(item[keyField]);
          return (
            <button
              key={item[keyField]}
              onClick={() => onToggle(item[keyField], item[labelField])}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors
                ${isSelected ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-700"}`}
            >
              <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0
                ${isSelected ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              {item[labelField]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TagList({ ids, labels, onRemove }) {
  if (!ids.length) return <span className="text-xs text-slate-400 italic">None selected</span>;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {ids.map(id => (
        <Badge key={id} variant="outline" className="text-xs gap-1 pr-1">
          {labels[id] || id}
          {onRemove && (
            <button onClick={() => onRemove(id)} className="ml-0.5 hover:text-red-500">
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </Badge>
      ))}
    </div>
  );
}

export default function CAPolicyWizard({ open, onClose, selectedTenant, onDeployed }) {
  const [step, setStep] = useState(0);
  const [policy, setPolicy] = useState(EMPTY_POLICY);
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState(null);
  const [labels, setLabels] = useState({}); // id → displayName map for tags

  const azureTenantId = selectedTenant?.tenant_id;

  const set = (k, v) => setPolicy(p => ({ ...p, [k]: v }));

  const addLabel = (id, name) => setLabels(l => ({ ...l, [id]: name }));

  const toggleItem = (listKey, id, name) => {
    addLabel(id, name);
    set(listKey, policy[listKey].includes(id)
      ? policy[listKey].filter(x => x !== id)
      : [...policy[listKey], id]
    );
  };

  // Live data
  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ["ca_wizard_users", azureTenantId],
    enabled: !!azureTenantId && open,
    queryFn: () => base44.functions.invoke("portalData", {
      action: "list_entra_users",
      azure_tenant_id: azureTenantId,
    }).then(r => (r.data?.users || []).map(u => ({ id: u.id, displayName: `${u.displayName} (${u.userPrincipalName})` }))),
    staleTime: 5 * 60 * 1000,
  });

  const { data: groupsData, isLoading: loadingGroups } = useQuery({
    queryKey: ["ca_wizard_groups", azureTenantId],
    enabled: !!azureTenantId && open,
    queryFn: () => base44.functions.invoke("portalData", {
      action: "list_entra_groups",
      azure_tenant_id: azureTenantId,
    }).then(r => r.data?.groups || []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: locationsData, isLoading: loadingLocations } = useQuery({
    queryKey: ["ca_wizard_locations", azureTenantId],
    enabled: !!azureTenantId && open,
    queryFn: () => base44.functions.invoke("portalData", {
      action: "list_named_locations",
      azure_tenant_id: azureTenantId,
    }).then(r => r.data?.locations || []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: appsData, isLoading: loadingApps } = useQuery({
    queryKey: ["ca_wizard_apps", azureTenantId],
    enabled: !!azureTenantId && open,
    queryFn: () => base44.functions.invoke("portalData", {
      action: "list_app_registrations",
      azure_tenant_id: azureTenantId,
    }).then(r => {
      const custom = (r.data?.apps || []).map(a => ({ id: a.appId, displayName: a.displayName }));
      return [...WELL_KNOWN_APPS, ...custom];
    }).catch(() => WELL_KNOWN_APPS),
    staleTime: 5 * 60 * 1000,
  });

  const users = usersData || [];
  const groups = groupsData || [];
  const locations = locationsData || [];
  const apps = appsData || WELL_KNOWN_APPS;

  const handleDeploy = async () => {
    setDeploying(true);
    setResult(null);
    try {
      // Build Graph CA policy body
      const userIds = policy.includeUsers.includes("All")
        ? [] : policy.includeUsers;
      const groupIds = policy.includeGroups;

      const caBody = {
        displayName: policy.displayName,
        state: policy.state,
        conditions: {
          users: {
            includeUsers: policy.includeUsers.includes("All") ? ["All"] : (userIds.length > 0 ? userIds : ["None"]),
            excludeUsers: policy.excludeUsers,
            includeGroups: groupIds,
            excludeGroups: policy.excludeGroups,
          },
          applications: {
            includeApplications: policy.includeApps.length > 0 ? policy.includeApps : ["None"],
            excludeApplications: policy.excludeApps,
          },
          platforms: policy.includePlatforms.length > 0 ? {
            includePlatforms: policy.includePlatforms,
            excludePlatforms: policy.excludePlatforms,
          } : undefined,
          locations: (policy.includeLocations.length > 0 || policy.excludeLocations.length > 0) ? {
            includeLocations: policy.includeLocations.length > 0 ? policy.includeLocations : ["AllTrusted"],
            excludeLocations: policy.excludeLocations,
          } : undefined,
        },
        grantControls: policy.grantControls.length > 0 ? {
          operator: policy.grantLogic,
          builtInControls: policy.grantControls,
        } : null,
        sessionControls: (policy.sessionSignInFrequency || policy.persistentBrowser !== "notConfigured") ? {
          signInFrequency: policy.sessionSignInFrequency ? {
            value: parseInt(policy.sessionSignInFrequency),
            type: policy.sessionFrequencyUnit,
            isEnabled: true,
          } : undefined,
          persistentBrowser: policy.persistentBrowser !== "notConfigured" ? {
            mode: policy.persistentBrowser,
            isEnabled: true,
          } : undefined,
        } : null,
      };

      // Remove undefined keys
      Object.keys(caBody.conditions).forEach(k => {
        if (caBody.conditions[k] === undefined) delete caBody.conditions[k];
      });

      const res = await base44.functions.invoke("portalData", {
        action: "create_conditional_access_policy",
        azure_tenant_id: azureTenantId,
        policy: caBody,
      });

      await logAction({
        action: "CREATE_CONDITIONAL_ACCESS_POLICY",
        category: "entra_policy",
        tenant_id: selectedTenant?.id,
        tenant_name: selectedTenant?.name,
        target_name: policy.displayName,
        severity: "warning",
      });

      setResult({ ok: true, id: res.data?.policyId, displayName: policy.displayName });
      if (onDeployed) onDeployed();
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setDeploying(false);
    }
  };

  const handleClose = () => {
    setStep(0);
    setPolicy(EMPTY_POLICY);
    setResult(null);
    setLabels({});
    onClose();
  };

  const canNext = () => {
    if (step === 0) return policy.displayName.trim().length > 0;
    if (step === 1) return policy.includeUsers.length > 0 || policy.includeGroups.length > 0;
    if (step === 2) return policy.includeApps.length > 0;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Conditional Access Policy Wizard
          </DialogTitle>
        </DialogHeader>

        {result ? (
          /* ── Deployment Result ── */
          <div className="py-8 text-center space-y-4">
            {result.ok ? (
              <>
                <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
                <h3 className="text-lg font-semibold text-slate-900">Policy Deployed!</h3>
                <p className="text-sm text-slate-600">
                  <strong>{result.displayName}</strong> was successfully created in Azure AD.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 max-w-sm mx-auto">
                  <strong>Note:</strong> Policy is in <em>Report-Only</em> mode by default. Review sign-in logs before enabling enforcement.
                </div>
                <Button onClick={handleClose} className="bg-slate-900 hover:bg-slate-800">Done</Button>
              </>
            ) : (
              <>
                <AlertTriangle className="h-14 w-14 text-red-400 mx-auto" />
                <h3 className="text-lg font-semibold text-slate-900">Deployment Failed</h3>
                <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 max-w-sm mx-auto">{result.error}</p>
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={handleClose}>Close</Button>
                  <Button onClick={() => setResult(null)} className="bg-slate-900 hover:bg-slate-800">Try Again</Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <StepIndicator current={step} />

            {/* ── Step 0: Name & State ── */}
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <Label className="text-xs font-semibold">Policy Display Name <span className="text-red-500">*</span></Label>
                  <Input
                    className="mt-1"
                    placeholder="e.g. Require MFA for All Users"
                    value={policy.displayName}
                    onChange={e => set("displayName", e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Policy State</Label>
                  <Select value={policy.state} onValueChange={v => set("state", v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enabledForReportingButNotEnforced">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-blue-400 shrink-0 inline-block" />
                          Report-Only (Recommended for new policies)
                        </div>
                      </SelectItem>
                      <SelectItem value="enabled">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 inline-block" />
                          Enabled (Enforced)
                        </div>
                      </SelectItem>
                      <SelectItem value="disabled">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0 inline-block" />
                          Disabled
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {policy.state === "enabled" && (
                    <div className="mt-2 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      Enabled policies are enforced immediately. Test in report-only mode first.
                    </div>
                  )}
                </div>
                <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
                  <strong>Tenant:</strong> {selectedTenant?.name || "None selected"} ({selectedTenant?.domain || "—"})
                </div>
              </div>
            )}

            {/* ── Step 1: Users & Groups ── */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <Label className="text-xs font-semibold">Include Users</Label>
                    </div>
                    <button
                      onClick={() => toggleItem("includeUsers", "All", "All Users")}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors
                        ${policy.includeUsers.includes("All") ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 hover:bg-slate-50 text-slate-700"}`}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      All Users
                    </button>
                    {!policy.includeUsers.includes("All") && (
                      <SearchPicker
                        items={users}
                        selected={policy.includeUsers}
                        onToggle={(id, name) => toggleItem("includeUsers", id, name)}
                        placeholder="Search users..."
                        loading={loadingUsers}
                      />
                    )}
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wide">Selected</span>
                      <TagList ids={policy.includeUsers} labels={labels} onRemove={id => toggleItem("includeUsers", id, "")} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-blue-500" />
                      <Label className="text-xs font-semibold">Include Groups</Label>
                    </div>
                    <SearchPicker
                      items={groups}
                      selected={policy.includeGroups}
                      onToggle={(id, name) => toggleItem("includeGroups", id, name)}
                      placeholder="Search groups..."
                      loading={loadingGroups}
                    />
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wide">Selected</span>
                      <TagList ids={policy.includeGroups} labels={labels} onRemove={id => toggleItem("includeGroups", id, "")} />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <Label className="text-xs font-semibold text-slate-500">Exclusions (optional)</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    <div>
                      <Label className="text-xs text-slate-400">Exclude Users</Label>
                      <SearchPicker
                        items={users}
                        selected={policy.excludeUsers}
                        onToggle={(id, name) => toggleItem("excludeUsers", id, name)}
                        placeholder="Exclude users..."
                        loading={loadingUsers}
                      />
                      <TagList ids={policy.excludeUsers} labels={labels} onRemove={id => toggleItem("excludeUsers", id, "")} />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-400">Exclude Groups</Label>
                      <SearchPicker
                        items={groups}
                        selected={policy.excludeGroups}
                        onToggle={(id, name) => toggleItem("excludeGroups", id, name)}
                        placeholder="Exclude groups..."
                        loading={loadingGroups}
                      />
                      <TagList ids={policy.excludeGroups} labels={labels} onRemove={id => toggleItem("excludeGroups", id, "")} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: Target Apps ── */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <AppWindow className="h-4 w-4 text-blue-500" />
                  <Label className="text-xs font-semibold">Include Applications <span className="text-red-500">*</span></Label>
                </div>
                <button
                  onClick={() => toggleItem("includeApps", "All", "All cloud apps")}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors
                    ${policy.includeApps.includes("All") ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 hover:bg-slate-50 text-slate-700"}`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  All cloud apps (recommended)
                </button>
                {!policy.includeApps.includes("All") && (
                  <SearchPicker
                    items={apps}
                    selected={policy.includeApps}
                    onToggle={(id, name) => toggleItem("includeApps", id, name)}
                    placeholder="Search applications..."
                    loading={loadingApps}
                  />
                )}
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide">Selected</span>
                  <TagList ids={policy.includeApps} labels={labels} onRemove={id => toggleItem("includeApps", id, "")} />
                </div>

                <div className="border-t pt-4">
                  <Label className="text-xs text-slate-400">Exclude Applications (optional)</Label>
                  <SearchPicker
                    items={apps}
                    selected={policy.excludeApps}
                    onToggle={(id, name) => toggleItem("excludeApps", id, name)}
                    placeholder="Search to exclude..."
                    loading={loadingApps}
                  />
                  <TagList ids={policy.excludeApps} labels={labels} onRemove={id => toggleItem("excludeApps", id, "")} />
                </div>
              </div>
            )}

            {/* ── Step 3: Conditions ── */}
            {step === 3 && (
              <div className="space-y-6">
                {/* Platforms */}
                <div>
                  <Label className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                    Device Platforms (optional)
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORM_OPTIONS.map(p => (
                      <button
                        key={p}
                        onClick={() => {
                          const cur = policy.includePlatforms;
                          set("includePlatforms", cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p]);
                        }}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors
                          ${policy.includePlatforms.includes(p) ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 hover:bg-slate-50 text-slate-600"}`}
                      >
                        {p === "all" ? "All platforms" : p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Named Locations */}
                <div>
                  <Label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <Building className="h-3.5 w-3.5" /> Named Locations (optional)
                  </Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-slate-400 mb-1 block">Include Locations</Label>
                      <SearchPicker
                        items={locations}
                        selected={policy.includeLocations}
                        keyField="id"
                        labelField="displayName"
                        onToggle={(id, name) => toggleItem("includeLocations", id, name)}
                        placeholder="Search locations..."
                        loading={loadingLocations}
                      />
                      <TagList ids={policy.includeLocations} labels={labels} onRemove={id => toggleItem("includeLocations", id, "")} />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-400 mb-1 block">Exclude Locations</Label>
                      <SearchPicker
                        items={locations}
                        selected={policy.excludeLocations}
                        keyField="id"
                        labelField="displayName"
                        onToggle={(id, name) => toggleItem("excludeLocations", id, name)}
                        placeholder="Search locations..."
                        loading={loadingLocations}
                      />
                      <TagList ids={policy.excludeLocations} labels={labels} onRemove={id => toggleItem("excludeLocations", id, "")} />
                    </div>
                  </div>
                  {locations.length === 0 && !loadingLocations && (
                    <p className="text-xs text-slate-400 mt-1">No named locations configured. Add them in the Named Locations section first.</p>
                  )}
                </div>

                {/* Sign-in frequency */}
                <div>
                  <Label className="text-xs font-semibold mb-2 block">Sign-In Frequency (Session Control)</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      min="1"
                      className="w-24 h-8 text-sm"
                      placeholder="e.g. 8"
                      value={policy.sessionSignInFrequency || ""}
                      onChange={e => set("sessionSignInFrequency", e.target.value || null)}
                    />
                    <Select value={policy.sessionFrequencyUnit} onValueChange={v => set("sessionFrequencyUnit", v)}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-slate-400">(leave blank to skip)</span>
                  </div>
                </div>

                {/* Persistent Browser */}
                <div>
                  <Label className="text-xs font-semibold mb-2 block">Persistent Browser Session</Label>
                  <Select value={policy.persistentBrowser} onValueChange={v => set("persistentBrowser", v)}>
                    <SelectTrigger className="h-8 text-xs w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="notConfigured">Not Configured</SelectItem>
                      <SelectItem value="always">Always Persistent</SelectItem>
                      <SelectItem value="never">Never Persistent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* ── Step 4: Grant Controls ── */}
            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <Label className="text-xs font-semibold mb-3 block">Grant Access Controls (choose at least one)</Label>
                  <div className="space-y-2">
                    {GRANT_CONTROLS.map(ctrl => (
                      <button
                        key={ctrl.id}
                        onClick={() => {
                          const cur = policy.grantControls;
                          set("grantControls", cur.includes(ctrl.id) ? cur.filter(x => x !== ctrl.id) : [...cur, ctrl.id]);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm text-left transition-all
                          ${policy.grantControls.includes(ctrl.id) ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}
                      >
                        <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0
                          ${policy.grantControls.includes(ctrl.id) ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                          {policy.grantControls.includes(ctrl.id) && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <span className={policy.grantControls.includes(ctrl.id) ? "text-blue-800 font-medium" : "text-slate-700"}>{ctrl.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {policy.grantControls.length > 1 && (
                  <div>
                    <Label className="text-xs font-semibold mb-2 block">When multiple controls are selected:</Label>
                    <div className="flex gap-3">
                      {["OR", "AND"].map(op => (
                        <button
                          key={op}
                          onClick={() => set("grantLogic", op)}
                          className={`px-4 py-2 rounded-lg border text-xs font-medium transition-colors
                            ${policy.grantLogic === op ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                        >
                          {op === "OR" ? "Require one of the controls (OR)" : "Require all controls (AND)"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {policy.grantControls.length === 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
                    <strong>Block Access:</strong> If no grant controls are selected, the policy will block access by default.
                  </div>
                )}
              </div>
            )}

            {/* ── Step 5: Review ── */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
                  {[
                    {
                      label: "Policy Name",
                      value: <span className="font-semibold text-slate-900">{policy.displayName}</span>,
                    },
                    {
                      label: "State",
                      value: <Badge className={policy.state === "enabled" ? "bg-emerald-100 text-emerald-700 border-0" : policy.state === "disabled" ? "bg-slate-100 text-slate-600 border-0" : "bg-blue-100 text-blue-700 border-0"}>
                        {policy.state === "enabledForReportingButNotEnforced" ? "Report-Only" : policy.state}
                      </Badge>,
                    },
                    {
                      label: "Users",
                      value: <TagList ids={policy.includeUsers} labels={labels} />,
                    },
                    {
                      label: "Groups",
                      value: <TagList ids={policy.includeGroups} labels={labels} />,
                    },
                    {
                      label: "Applications",
                      value: <TagList ids={policy.includeApps} labels={labels} />,
                    },
                    {
                      label: "Platforms",
                      value: policy.includePlatforms.length > 0
                        ? <TagList ids={policy.includePlatforms} labels={Object.fromEntries(PLATFORM_OPTIONS.map(p => [p, p]))} />
                        : <span className="text-xs text-slate-400">Any platform</span>,
                    },
                    {
                      label: "Locations",
                      value: policy.includeLocations.length > 0
                        ? <TagList ids={policy.includeLocations} labels={labels} />
                        : <span className="text-xs text-slate-400">Any location</span>,
                    },
                    {
                      label: "Grant Controls",
                      value: policy.grantControls.length > 0
                        ? <TagList ids={policy.grantControls} labels={Object.fromEntries(GRANT_CONTROLS.map(c => [c.id, c.label.replace("Require ", "")]))} />
                        : <Badge className="bg-red-100 text-red-700 border-0 text-xs">Block Access</Badge>,
                    },
                    ...(policy.sessionSignInFrequency ? [{
                      label: "Sign-In Frequency",
                      value: <span className="text-xs text-slate-700">{policy.sessionSignInFrequency} {policy.sessionFrequencyUnit}</span>,
                    }] : []),
                  ].map(row => (
                    <div key={row.label} className="flex items-start gap-4 px-4 py-3">
                      <span className="text-xs text-slate-500 w-28 shrink-0 pt-0.5">{row.label}</span>
                      <div className="flex-1">{row.value}</div>
                    </div>
                  ))}
                </div>

                {policy.state === "enabled" && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div><strong>Warning:</strong> This policy is set to <strong>Enabled</strong> and will be enforced immediately upon deployment. Ensure you have tested this logic using Report-Only mode first to avoid accidental lockout.</div>
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-5 mt-5 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} disabled={step === 0} className="gap-1.5">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </Button>

              <span className="text-xs text-slate-400">Step {step + 1} of {STEPS.length}</span>

              {step < STEPS.length - 1 ? (
                <Button
                  size="sm"
                  onClick={() => setStep(s => s + 1)}
                  disabled={!canNext()}
                  className="gap-1.5 bg-slate-900 hover:bg-slate-800"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleDeploy}
                  disabled={deploying || !policy.displayName}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                >
                  {deploying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                  Deploy Policy to Azure
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}