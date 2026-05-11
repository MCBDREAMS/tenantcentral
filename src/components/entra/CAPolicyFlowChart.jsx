import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Shield, Laptop, Globe, MapPin, AlertTriangle, CheckCircle2,
  XCircle, ChevronRight, Loader2, Info, Lock, Eye, ArrowRight, X, UserCheck, Layers
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ── Helpers ──────────────────────────────────────────────────────────────────

const stateColors = {
  enabled: "bg-emerald-100 text-emerald-800 border-emerald-300",
  disabled: "bg-slate-100 text-slate-600 border-slate-300",
  report_only: "bg-blue-100 text-blue-800 border-blue-300",
  enabledForReportingButNotEnforced: "bg-blue-100 text-blue-800 border-blue-300",
};

const grantIcon = (control) => {
  const map = {
    mfa: "🔐",
    compliantDevice: "✅",
    domainJoinedDevice: "🖥️",
    approvedApplication: "📱",
    compliantApplication: "📋",
    passwordChange: "🔑",
    block: "🚫",
  };
  return map[control] || "🔒";
};

function Pill({ children, color = "slate", icon }) {
  const colors = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${colors[color]}`}>
      {icon && <span>{icon}</span>}
      {children}
    </span>
  );
}

function FlowNode({ label, icon: Icon, iconColor = "text-slate-600", bgColor = "bg-slate-50 border-slate-200", children, onClick, active }) {
  return (
    <div
      className={`rounded-xl border-2 p-3 min-w-[160px] max-w-[220px] transition-all duration-150
        ${bgColor}
        ${onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.02]" : ""}
        ${active ? "ring-2 ring-blue-400 shadow-lg" : ""}
      `}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span className="text-xs font-semibold text-slate-700 leading-tight">{label}</span>
      </div>
      {children && <div className="space-y-1">{children}</div>}
    </div>
  );
}

function Arrow({ label }) {
  return (
    <div className="flex flex-col items-center mx-1">
      <div className="h-4 w-px bg-slate-300" />
      <ArrowRight className="h-4 w-4 text-slate-400 -rotate-90 my-0.5" />
      {label && <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wide whitespace-nowrap">{label}</span>}
    </div>
  );
}

// ── Impact Side Panel ────────────────────────────────────────────────────────

function ImpactPanel({ impact, open, onClose }) {
  if (!impact) return null;
  const {
    totalUserCount, includedUsers, excludedUsers,
    includedGroups, excludedGroups, groupDetails,
    targetApps, excludedApps,
    platforms, excludedPlatforms,
    locations, excludedLocations,
    signInRisk, userRisk, deviceFilter,
    grantControls, sessionControls,
  } = impact;

  const isAllUsers = includedUsers.some(u => u.id === "All");
  const totalIncludedEstimate = isAllUsers
    ? totalUserCount
    : groupDetails.reduce((s, g) => s + (g.memberCount || 0), 0) + includedUsers.filter(u => u.id !== "All").length;

  const Section = ({ title, items = [], color = "blue", emptyText = "None" }) => (
    <div className="mb-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{title}</p>
      {items.length === 0
        ? <p className="text-xs text-slate-400 italic">{emptyText}</p>
        : <div className="flex flex-wrap gap-1">
            {items.map((item, i) => (
              <Pill key={i} color={color}>{typeof item === "string" ? item : item.displayName || item.id}</Pill>
            ))}
          </div>
      }
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600" />
            Policy Impact Analysis
          </DialogTitle>
        </DialogHeader>

        {/* Scope summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{isAllUsers ? totalUserCount || "All" : totalIncludedEstimate || "—"}</p>
            <p className="text-xs text-blue-600 mt-0.5">Affected Users</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{targetApps.length || "All"}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Target Apps</p>
          </div>
          <div className="bg-violet-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-violet-700">{platforms.length || "All"}</p>
            <p className="text-xs text-violet-600 mt-0.5">Platforms</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-blue-500" /> Users & Groups
            </h4>
            <Section title="Included Users" items={includedUsers} color="blue" />
            <Section title="Included Groups" items={groupDetails.map(g => `${g.displayName} (${g.memberCount} members)`)} color="violet" />
            <Section title="Excluded Users" items={excludedUsers} color="rose" emptyText="No exclusions" />
            <Section title="Excluded Groups" items={excludedGroups} color="orange" emptyText="No exclusions" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-emerald-500" /> Apps & Conditions
            </h4>
            <Section title="Target Apps" items={targetApps} color="emerald" />
            <Section title="Excluded Apps" items={excludedApps} color="rose" emptyText="No exclusions" />
            <Section title="Platforms" items={platforms} color="blue" emptyText="All platforms" />
            <Section title="Excluded Platforms" items={excludedPlatforms} color="rose" emptyText="None" />
            <Section title="Locations" items={locations} color="amber" emptyText="All locations" />
            <Section title="Sign-In Risk" items={signInRisk} color="rose" emptyText="Not configured" />
            <Section title="User Risk" items={userRisk} color="orange" emptyText="Not configured" />
            {deviceFilter && (
              <div className="mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Device Filter</p>
                <code className="text-[10px] bg-slate-100 rounded px-1.5 py-1 block text-slate-600 break-all">{deviceFilter.rule}</code>
              </div>
            )}
          </div>
        </div>

        {/* Grant Controls */}
        <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-slate-600" /> Grant Controls
          </h4>
          {grantControls ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {(grantControls.builtInControls || []).map((c, i) => (
                  <Pill key={i} color="violet" icon={grantIcon(c)}>{c.replace(/([A-Z])/g, ' $1').trim()}</Pill>
                ))}
                {(grantControls.customAuthenticationFactors || []).map((c, i) => <Pill key={i} color="amber">{c}</Pill>)}
                {(grantControls.termsOfUse || []).map((c, i) => <Pill key={i} color="blue">Terms of Use</Pill>)}
              </div>
              {grantControls.operator && (
                <p className="text-xs text-slate-500">Operator: <span className="font-semibold text-slate-700">{grantControls.operator}</span></p>
              )}
            </div>
          ) : <p className="text-xs text-slate-400 italic">No grant controls (Block access)</p>}
        </div>

        {/* Session Controls */}
        {sessionControls && Object.keys(sessionControls).some(k => sessionControls[k]) && (
          <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
            <h4 className="text-sm font-semibold text-blue-800 mb-1.5 flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Session Controls
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {sessionControls.applicationEnforcedRestrictions?.isEnabled && <Pill color="blue">App Enforced Restrictions</Pill>}
              {sessionControls.cloudAppSecurity?.isEnabled && <Pill color="blue">Cloud App Security</Pill>}
              {sessionControls.signInFrequency?.isEnabled && (
                <Pill color="blue">Sign-in Frequency: {sessionControls.signInFrequency.value} {sessionControls.signInFrequency.type}</Pill>
              )}
              {sessionControls.persistentBrowser?.isEnabled && <Pill color="blue">Persistent Browser: {sessionControls.persistentBrowser.mode}</Pill>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Flow Visualization ───────────────────────────────────────────────────

function PolicyFlowRow({ policy, azureTenantId, isSelected, onSelect }) {
  const [impactOpen, setImpactOpen] = useState(false);

  const { data: impactData, isFetching } = useQuery({
    queryKey: ["ca-impact", policy.id || policy.graph_id],
    queryFn: async () => {
      const res = await base44.functions.invoke("portalData", {
        action: "get_ca_policy_impact",
        azure_tenant_id: azureTenantId,
        policy_id: policy.id || policy.graph_id,
      });
      return res.data?.impact || null;
    },
    enabled: !!azureTenantId && !!(policy.id || policy.graph_id) && isSelected,
    staleTime: 5 * 60 * 1000,
  });

  const conditions = policy.conditions_parsed || {};
  const users = conditions.users || {};
  const apps = conditions.applications || {};
  const platforms = conditions.platforms?.includePlatforms || [];
  const locations = conditions.locations?.includeLocations || [];
  const signInRisk = conditions.signInRiskLevels || [];
  const userRisk = conditions.userRiskLevels || [];

  // Parse from stored string
  let condObj = {};
  try { condObj = policy.conditions ? JSON.parse(policy.conditions) : {}; } catch {}
  const includeUsers = condObj?.users?.includeUsers || [];
  const includeGroups = condObj?.users?.includeGroups || [];
  const includeApps = condObj?.applications?.includeApplications || [];

  const stateClass = stateColors[policy.state] || stateColors.enabled;
  const isBlock = (policy.grant_controls || "").toLowerCase().includes("block");

  return (
    <div className="mb-3">
      {/* Policy Row */}
      <div
        className={`group rounded-2xl border-2 p-4 cursor-pointer transition-all duration-200
          ${isSelected ? "border-blue-400 bg-blue-50/60 shadow-md" : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm"}
        `}
        onClick={onSelect}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className={`h-4 w-4 shrink-0 ${isBlock ? "text-red-500" : "text-blue-600"}`} />
            <span className="font-semibold text-slate-900 text-sm truncate">{policy.policy_name}</span>
          </div>
          <Badge variant="outline" className={`text-[10px] border shrink-0 ml-2 ${stateClass}`}>
            {policy.state?.replace(/_/g, " ")}
          </Badge>
        </div>

        {/* Flow diagram */}
        <div className="flex items-start gap-2 overflow-x-auto pb-1">
          {/* IF Block */}
          <FlowNode
            label="IF"
            icon={Users}
            iconColor="text-blue-600"
            bgColor={`bg-blue-50 border-blue-200 ${isSelected ? "border-blue-300" : ""}`}
          >
            <div className="space-y-1">
              {includeUsers.includes("All")
                ? <Pill color="blue" icon="👥">All Users</Pill>
                : includeUsers.length > 0
                  ? <Pill color="blue" icon="👤">{includeUsers.length} User{includeUsers.length > 1 ? "s" : ""}</Pill>
                  : null}
              {includeGroups.length > 0 && (
                <Pill color="violet" icon="🏷️">{includeGroups.length} Group{includeGroups.length > 1 ? "s" : ""}</Pill>
              )}
              {(includeUsers.length === 0 && includeGroups.length === 0 && policy.target_users) && (
                <Pill color="blue" icon="👥">{policy.target_users.slice(0, 25)}{policy.target_users.length > 25 ? "…" : ""}</Pill>
              )}
            </div>
          </FlowNode>

          <Arrow label="access" />

          {/* APPS Block */}
          <FlowNode
            label="APPS"
            icon={Layers}
            iconColor="text-emerald-600"
            bgColor="bg-emerald-50 border-emerald-200"
          >
            {includeApps.length > 0
              ? includeApps.includes("All")
                ? <Pill color="emerald" icon="🌐">All Cloud Apps</Pill>
                : <Pill color="emerald" icon="📦">{includeApps.length} App{includeApps.length > 1 ? "s" : ""}</Pill>
              : policy.target_apps
                ? <Pill color="emerald" icon="📦">{policy.target_apps.slice(0, 20)}</Pill>
                : <Pill color="slate">Any App</Pill>
            }
          </FlowNode>

          <Arrow label="from" />

          {/* CONDITIONS Block */}
          <FlowNode
            label="CONDITIONS"
            icon={AlertTriangle}
            iconColor="text-amber-600"
            bgColor="bg-amber-50 border-amber-200"
          >
            {platforms.length > 0 && <Pill color="amber" icon="💻">{platforms.join(", ")}</Pill>}
            {locations.length > 0 && <Pill color="orange" icon="📍">{locations.length} Locations</Pill>}
            {signInRisk.length > 0 && <Pill color="rose" icon="⚠️">Risk: {signInRisk.join(", ")}</Pill>}
            {platforms.length === 0 && locations.length === 0 && signInRisk.length === 0 && (
              <Pill color="slate">Any Condition</Pill>
            )}
          </FlowNode>

          <Arrow label="then" />

          {/* GRANT Block */}
          <FlowNode
            label="GRANT"
            icon={isBlock ? XCircle : CheckCircle2}
            iconColor={isBlock ? "text-red-600" : "text-emerald-600"}
            bgColor={isBlock ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}
          >
            {policy.grant_controls
              ? policy.grant_controls.split(",").map((g, i) => (
                  <Pill key={i} color={isBlock ? "rose" : "emerald"} icon={grantIcon(g.trim())}>
                    {g.trim().replace(/([A-Z])/g, ' $1').trim()}
                  </Pill>
                ))
              : <Pill color="slate">Allow</Pill>
            }
          </FlowNode>

          {/* Impact button */}
          <div className="flex items-center ml-1 shrink-0">
            <button
              className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 transition-all text-slate-400 hover:text-blue-600 min-w-[70px]"
              onClick={(e) => { e.stopPropagation(); setImpactOpen(true); onSelect(); }}
              title="See who is affected"
            >
              {isFetching
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <UserCheck className="h-4 w-4" />
              }
              <span className="text-[9px] font-semibold uppercase tracking-wide">Impact</span>
            </button>
          </div>
        </div>

        {/* Quick info bar */}
        {isSelected && impactData && (
          <div className="mt-3 pt-3 border-t border-blue-200 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3 text-blue-500" />
              <strong>{impactData.includedUsers?.some(u => u.id === "All") ? (impactData.totalUserCount || "All") : (impactData.groupDetails?.reduce((s, g) => s + g.memberCount, 0) || "—")}</strong> users in scope
            </span>
            {impactData.excludedUsers?.length > 0 && (
              <span className="flex items-center gap-1 text-rose-600">
                <XCircle className="h-3 w-3" />
                {impactData.excludedUsers.length} excluded
              </span>
            )}
            {impactData.targetApps?.length > 0 && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3 text-emerald-500" />
                {impactData.targetApps.map(a => a.displayName).join(", ")}
              </span>
            )}
          </div>
        )}
      </div>

      {impactOpen && impactData && (
        <ImpactPanel impact={impactData} open={impactOpen} onClose={() => setImpactOpen(false)} />
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export default function CAPolicyFlowChart({ policies = [], azureTenantId }) {
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");

  const filtered = policies.filter(p => {
    if (filter === "all") return true;
    if (filter === "enabled") return p.state === "enabled";
    if (filter === "disabled") return p.state === "disabled";
    if (filter === "report_only") return p.state === "report_only" || p.state === "enabledForReportingButNotEnforced";
    return true;
  });

  if (!policies.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
      <Shield className="h-12 w-12 mb-3 text-slate-200" />
      <p className="font-medium text-slate-500">No policies to visualize</p>
      <p className="text-sm mt-1">Sync policies to see the flow chart.</p>
    </div>
  );

  return (
    <div>
      {/* Legend + filter */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Info className="h-3.5 w-3.5" />
          Click a policy to expand. Click <strong>Impact</strong> to see affected users &amp; devices.
          {!azureTenantId && <span className="text-amber-600 ml-1">(Select a tenant for live impact data)</span>}
        </div>
        <div className="ml-auto flex gap-1.5">
          {["all", "enabled", "disabled", "report_only"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                ${filter === f ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              {f.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Flow rows */}
      <div className="space-y-1">
        {filtered.map((policy) => (
          <PolicyFlowRow
            key={policy.id}
            policy={policy}
            azureTenantId={azureTenantId}
            isSelected={selectedId === policy.id}
            onSelect={() => setSelectedId(selectedId === policy.id ? null : policy.id)}
          />
        ))}
      </div>
    </div>
  );
}