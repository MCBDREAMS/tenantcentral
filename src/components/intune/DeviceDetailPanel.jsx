import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { X, RefreshCw, Monitor, Shield, Package, Terminal, CheckCircle2, XCircle, AlertCircle, Clock, Loader2, ShieldCheck, Wifi, ShieldAlert, AppWindow, Bot } from "lucide-react";
import CaRisksTab from "./CaRisksTab";
import RemoteAssistTab from "./RemoteAssistTab.jsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format } from "date-fns";

function fmt(v) {
  if (!v) return "—";
  try { return format(new Date(v), "PPp"); } catch { return v; }
}

function BoolBadge({ value, trueLabel = "Yes", falseLabel = "No" }) {
  return value
    ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{trueLabel}</Badge>
    : <Badge className="bg-slate-100 text-slate-500 border-slate-200">{falseLabel}</Badge>;
}

function ComplianceBadge({ state }) {
  const map = {
    compliant: "bg-emerald-100 text-emerald-700",
    noncompliant: "bg-red-100 text-red-700",
    error: "bg-red-100 text-red-700",
    inGracePeriod: "bg-amber-100 text-amber-700",
    unknown: "bg-slate-100 text-slate-500",
    notApplicable: "bg-slate-100 text-slate-500",
  };
  return <Badge className={map[state] || "bg-slate-100 text-slate-500"}>{state || "Unknown"}</Badge>;
}

function StateIcon({ state }) {
  if (state === "success" || state === "compliant") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (state === "error" || state === "noncompliant" || state === "fail") return <XCircle className="h-4 w-4 text-red-500" />;
  if (state === "pending") return <Clock className="h-4 w-4 text-amber-500" />;
  return <AlertCircle className="h-4 w-4 text-slate-400" />;
}

export default function DeviceDetailPanel({ device, azureTenantId, onClose }) {
  const qc = useQueryClient();

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ["device_detail", device.graph_id || device.id],
    enabled: !!(device.graph_id || device.azureDeviceId),
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_device_detail",
        azure_tenant_id: azureTenantId,
        device_id: device.graph_id || device.azureDeviceId,
      }).then(r => r.data),
  });

  const { data: appsData, isLoading: loadingApps } = useQuery({
    queryKey: ["device_apps", device.graph_id || device.id],
    enabled: !!(device.graph_id || device.azureDeviceId),
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_device_apps",
        azure_tenant_id: azureTenantId,
        device_id: device.graph_id || device.azureDeviceId,
      }).then(r => r.data),
  });

  const { data: updatesData, isLoading: loadingUpdates } = useQuery({
    queryKey: ["device_updates", device.graph_id || device.id],
    enabled: !!(device.graph_id || device.azureDeviceId),
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_device_updates",
        azure_tenant_id: azureTenantId,
        device_id: device.graph_id || device.azureDeviceId,
      }).then(r => r.data),
  });

  const remediateMutation = useMutation({
    mutationFn: (remediation_type) =>
      base44.functions.invoke("portalData", {
        action: "remediate_device",
        azure_tenant_id: azureTenantId,
        device_id: device.graph_id || device.azureDeviceId,
        remediation_type,
      }),
  });

  const { data: installedAppsData, isLoading: loadingInstalledApps } = useQuery({
    queryKey: ["device_installed_apps", device.graph_id || device.id],
    enabled: !!(device.graph_id || device.azureDeviceId),
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_device_installed_apps",
        azure_tenant_id: azureTenantId,
        device_id: device.graph_id || device.azureDeviceId,
      }).then(r => r.data),
  });

  const { data: scriptsData, isLoading: loadingScripts } = useQuery({
    queryKey: ["device_scripts", device.graph_id || device.id],
    enabled: !!(device.graph_id || device.azureDeviceId),
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_device_scripts",
        azure_tenant_id: azureTenantId,
        device_id: device.graph_id || device.azureDeviceId,
      }).then(r => r.data),
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("portalData", {
        action: "sync_device",
        azure_tenant_id: azureTenantId,
        device_id: device.graph_id || device.azureDeviceId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["device_detail"] }),
  });

  const d = detail?.detail || {};
  const health = detail?.health || {};
  const configStatuses = detail?.configStatuses || [];
  const compliancePolicies = detail?.compliancePolicies || [];
  const appInstallStates = appsData?.appInstallStates || [];
  const installedApps = installedAppsData?.installedApps || [];
  const automateAgentFound = installedAppsData?.automateAgentFound;
  const automateAgentDetails = installedAppsData?.automateAgentDetails;
  const sophosAgentFound = installedAppsData?.sophosAgentFound;
  const sophosAgentDetails = installedAppsData?.sophosAgentDetails;
  const scriptRunStates = scriptsData?.scriptRunStates || [];
  const protectionState = updatesData?.protectionState || {};
  const updatePolicies = updatesData?.updatePolicies || [];
  const allCompliancePolicies = updatesData?.allCompliancePolicies || [];

  const hasGraphId = !!(device.graph_id || device.azureDeviceId);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-900">
          <div className="flex items-center gap-3">
            <Monitor className="h-5 w-5 text-blue-400" />
            <div>
              <h2 className="text-white font-semibold">{device.device_name}</h2>
              <p className="text-xs text-slate-400">{device.os} · {device.model}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasGraphId && (
              <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-800"
                onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync
              </Button>
            )}
            <Button size="icon" variant="ghost" className="text-slate-400 hover:text-white" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {!hasGraphId && (
          <div className="m-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            No Azure Graph ID linked to this device record. Sync from Microsoft Graph to enable live data.
          </div>
        )}

        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-5 mt-4 justify-start shrink-0 flex-wrap">
            <TabsTrigger value="overview"><Monitor className="h-3.5 w-3.5 mr-1" />Overview</TabsTrigger>
            <TabsTrigger value="compliance"><Shield className="h-3.5 w-3.5 mr-1" />Compliance</TabsTrigger>
            <TabsTrigger value="updates"><ShieldCheck className="h-3.5 w-3.5 mr-1" />Updates</TabsTrigger>
            <TabsTrigger value="apps"><Package className="h-3.5 w-3.5 mr-1" />Intune Apps</TabsTrigger>
            <TabsTrigger value="installed_apps"><AppWindow className="h-3.5 w-3.5 mr-1" />Installed Apps</TabsTrigger>
            <TabsTrigger value="scripts"><Terminal className="h-3.5 w-3.5 mr-1" />Scripts</TabsTrigger>
            <TabsTrigger value="ca_risks"><ShieldAlert className="h-3.5 w-3.5 mr-1" />CA Risks</TabsTrigger>
            <TabsTrigger value="remote"><Wifi className="h-3.5 w-3.5 mr-1" />Remote Assist</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-5">
            {/* OVERVIEW */}
            <TabsContent value="overview" className="mt-0 space-y-4">
              {loadingDetail ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : (
                <>
                  <Section title="Device Identity">
                    <Row label="Device Name" value={d.deviceName || device.device_name} />
                    <Row label="Azure AD Device ID" value={d.azureADDeviceId} mono />
                    <Row label="Intune ID" value={d.id} mono />
                    <Row label="Serial Number" value={d.serialNumber || device.serial_number} mono />
                    <Row label="Model" value={d.model || device.model} />
                    <Row label="Manufacturer" value={d.manufacturer} />
                    <Row label="User" value={d.userPrincipalName || device.primary_user} />
                    <Row label="Email" value={d.emailAddress} />
                  </Section>
                  <Section title="Operating System">
                    <Row label="OS" value={d.operatingSystem || device.os} />
                    <Row label="OS Version" value={d.osVersion} />
                    <Row label="Management Agent" value={d.managementAgent} />
                    <Row label="Enrollment Type" value={d.deviceEnrollmentType} />
                  </Section>
                  <Section title="Status">
                    <Row label="Compliance" value={<ComplianceBadge state={d.complianceState || device.compliance_state} />} />
                    <Row label="Encrypted" value={<BoolBadge value={d.isEncrypted} trueLabel="Encrypted" falseLabel="Not Encrypted" />} />
                    <Row label="Supervised" value={<BoolBadge value={d.isSupervisedDevice} />} />
                    <Row label="AAD Registered" value={<BoolBadge value={d.aadRegistered} />} />
                    <Row label="Lost Mode" value={<BoolBadge value={d.lostModeState === "enabled"} trueLabel="Enabled" falseLabel="Disabled" />} />
                    <Row label="Jailbroken" value={<BoolBadge value={d.jailBroken === "True"} trueLabel="Yes ⚠️" falseLabel="No" />} />
                  </Section>
                  <Section title="Security & Management Agents">
                    <Row label="Automate Agent" value={
                      loadingInstalledApps
                        ? <Badge className="bg-slate-100 text-slate-500 gap-1"><Loader2 className="h-3 w-3 animate-spin" />Checking...</Badge>
                        : automateAgentFound === undefined
                        ? <Badge className="bg-slate-100 text-slate-500">Not checked</Badge>
                        : automateAgentFound
                        ? <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" />Installed {automateAgentDetails?.version ? `v${automateAgentDetails.version}` : ""}</Badge>
                        : <Badge className="bg-red-100 text-red-700 gap-1"><XCircle className="h-3 w-3" />Not Detected</Badge>
                    } />
                    <Row label="Sophos Agent" value={
                      loadingInstalledApps
                        ? <Badge className="bg-slate-100 text-slate-500 gap-1"><Loader2 className="h-3 w-3 animate-spin" />Checking...</Badge>
                        : sophosAgentFound === undefined
                        ? <Badge className="bg-slate-100 text-slate-500">Not checked</Badge>
                        : sophosAgentFound
                        ? <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" />Installed {sophosAgentDetails?.version ? `v${sophosAgentDetails.version}` : ""}</Badge>
                        : <Badge className="bg-red-100 text-red-700 gap-1"><XCircle className="h-3 w-3" />Not Detected</Badge>
                    } />
                    {sophosAgentDetails && (
                      <>
                        <Row label="Sophos Product" value={sophosAgentDetails.displayName} />
                        <Row label="Sophos Version" value={sophosAgentDetails.version} />
                      </>
                    )}
                  </Section>
                  <Section title="Activity">
                    <Row label="Last Login" value={fmt(d.lastLogOnDateTime || device.lastLogOnDateTime)} />
                    <Row label="Last Sync" value={fmt(d.lastSyncDateTime)} />
                    <Row label="Enrolled" value={fmt(d.enrolledDateTime)} />
                    <Row label="Active (last 30d)" value={
                      (() => {
                        const last = d.lastLogOnDateTime || d.lastSyncDateTime;
                        if (!last) return <Badge className="bg-slate-100 text-slate-500">Unknown</Badge>;
                        const days = (Date.now() - new Date(last).getTime()) / 86400000;
                        return days <= 30
                          ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                          : <Badge className="bg-red-100 text-red-700">Inactive ({Math.round(days)}d ago)</Badge>;
                      })()
                    } />
                    <Row label="Compliance Grace Period" value={fmt(d.complianceGracePeriodExpirationDateTime)} />
                  </Section>
                  {health && Object.keys(health).length > 1 && (
                    <Section title="Health Attestation">
                      <Row label="Secure Boot" value={<BoolBadge value={health.secureBootEnabled} trueLabel="Enabled" falseLabel="Disabled" />} />
                      <Row label="BitLocker" value={<BoolBadge value={health.bitLockerStatus === "protected"} trueLabel="Protected" falseLabel="Not Protected" />} />
                      <Row label="Code Integrity" value={health.codeIntegrityCheckVersion} />
                      <Row label="TPM Version" value={health.tpmVersion} />
                    </Section>
                  )}
                </>
              )}
            </TabsContent>

            {/* COMPLIANCE */}
            <TabsContent value="compliance" className="mt-0 space-y-3">
              {loadingDetail ? <Spinner /> : compliancePolicies.length === 0 ? (
                <Empty text="No compliance policies found" />
              ) : compliancePolicies.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <StateIcon state={p.state} />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.displayName}</p>
                      <p className="text-xs text-slate-400">{p.platformType} · {p.settingCount} settings</p>
                    </div>
                  </div>
                  <ComplianceBadge state={p.state} />
                </div>
              ))}
              {configStatuses.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-2">Configuration Profiles</p>
                  {configStatuses.map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <StateIcon state={c.state} />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{c.displayName}</p>
                          <p className="text-xs text-slate-400">{c.platformType} · {c.settingCount} settings</p>
                        </div>
                      </div>
                      <ComplianceBadge state={c.state} />
                    </div>
                  ))}
                </>
              )}
            </TabsContent>

            {/* WINDOWS UPDATES */}
            <TabsContent value="updates" className="mt-0 space-y-4">
              {loadingUpdates ? <Spinner /> : (
                <>
                  {/* Remediation Actions */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Remediation Actions</p>
                    <div className="flex flex-wrap gap-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      {[
                        { type: "sync", label: "Sync Policies", color: "bg-blue-600 hover:bg-blue-700" },
                        { type: "restart", label: "Reboot Device", color: "bg-amber-600 hover:bg-amber-700" },
                        { type: "defender_scan_quick", label: "Quick Scan", color: "bg-emerald-700 hover:bg-emerald-800" },
                        { type: "defender_scan_full", label: "Full Scan", color: "bg-slate-700 hover:bg-slate-800" },
                      ].map(action => (
                        <Button
                          key={action.type}
                          size="sm"
                          className={`text-white text-xs ${action.color}`}
                          disabled={remediateMutation.isPending}
                          onClick={() => remediateMutation.mutate(action.type)}
                        >
                          {remediateMutation.isPending && remediateMutation.variables === action.type
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                          {action.label}
                        </Button>
                      ))}
                      {remediateMutation.isSuccess && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 ml-2">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Action sent
                        </span>
                      )}
                      {remediateMutation.isError && (
                        <span className="flex items-center gap-1 text-xs text-red-600 ml-2">
                          <XCircle className="h-3.5 w-3.5" /> Failed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Windows Protection State */}
                  {protectionState && Object.keys(protectionState).length > 1 && (
                    <Section title="Windows Defender / Protection State">
                      <Row label="Malware Protection Enabled" value={<BoolBadge value={protectionState.malwareProtectionEnabled} trueLabel="Enabled" falseLabel="Disabled" />} />
                      <Row label="Real-Time Protection" value={<BoolBadge value={protectionState.realTimeProtectionEnabled} trueLabel="Enabled" falseLabel="Disabled" />} />
                      <Row label="Network Inspection" value={<BoolBadge value={protectionState.networkInspectionSystemEnabled} trueLabel="Enabled" falseLabel="Disabled" />} />
                      <Row label="Signature Out of Date" value={<BoolBadge value={protectionState.signatureUpdateOverdue} trueLabel="⚠ Overdue" falseLabel="Up to Date" />} />
                      <Row label="Signature Version" value={protectionState.antivirusSignatureVersion} />
                      <Row label="Engine Version" value={protectionState.antiMalwareVersion} />
                      <Row label="Quick Scan Overdue" value={<BoolBadge value={protectionState.quickScanOverdue} trueLabel="⚠ Overdue" falseLabel="No" />} />
                      <Row label="Full Scan Overdue" value={<BoolBadge value={protectionState.fullScanOverdue} trueLabel="⚠ Overdue" falseLabel="No" />} />
                      <Row label="Last Quick Scan" value={fmt(protectionState.lastQuickScanDateTime)} />
                      <Row label="Last Full Scan" value={fmt(protectionState.lastFullScanDateTime)} />
                    </Section>
                  )}

                  {/* Update Compliance Policies */}
                  {allCompliancePolicies.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Update Compliance Policies</p>
                      <div className="space-y-2">
                        {allCompliancePolicies.map((p, i) => (
                          <div key={i} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-2">
                              <StateIcon state={p.state} />
                              <div>
                                <p className="text-sm font-medium text-slate-800">{p.displayName}</p>
                                <p className="text-xs text-slate-400">{p.platformType}</p>
                              </div>
                            </div>
                            <Badge className={
                              p.state === "compliant" ? "bg-emerald-100 text-emerald-700" :
                              p.state === "noncompliant" ? "bg-red-100 text-red-700" :
                              "bg-slate-100 text-slate-500"
                            }>{p.state || "Unknown"}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!protectionState?.malwareProtectionEnabled && !allCompliancePolicies.length && (
                    <Empty text="No Windows Update or protection data available. Ensure DeviceManagementManagedDevices.Read.All permission is granted." />
                  )}
                </>
              )}
            </TabsContent>

            {/* APPS */}
            <TabsContent value="apps" className="mt-0 space-y-2">
              {loadingApps ? <Spinner /> : appInstallStates.length === 0 ? (
                <Empty text="No app deployment data available" />
              ) : appInstallStates.map((app, i) => (
                <div key={i} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <StateIcon state={app.installState} />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{app.appName || app.displayName || "Unknown App"}</p>
                      <p className="text-xs text-slate-400">{app.lastSyncDateTime ? fmt(app.lastSyncDateTime) : ""}</p>
                    </div>
                  </div>
                  <Badge className={
                    app.installState === "installed" ? "bg-emerald-100 text-emerald-700" :
                    app.installState === "failed" ? "bg-red-100 text-red-700" :
                    "bg-slate-100 text-slate-500"
                  }>{app.installState || "Unknown"}</Badge>
                </div>
              ))}
            </TabsContent>

            {/* INSTALLED APPS */}
            <TabsContent value="installed_apps" className="mt-0 space-y-3">
              {loadingInstalledApps ? <Spinner /> : installedApps.length === 0 ? (
                <Empty text="No installed app data available. Ensure DeviceManagementManagedDevices.Read.All permission is granted." />
              ) : (
                <>
                  {(automateAgentFound !== undefined || sophosAgentFound !== undefined) && (
                    <div className="space-y-2">
                      <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium ${automateAgentFound ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                        <Bot className="h-4 w-4 shrink-0" />
                        {automateAgentFound
                          ? `Automate Agent: ${automateAgentDetails?.displayName} v${automateAgentDetails?.version || "?"}`
                          : "Automate Agent NOT detected on this device"}
                      </div>
                      <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium ${sophosAgentFound ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                        <Shield className="h-4 w-4 shrink-0" />
                        {sophosAgentFound
                          ? `Sophos: ${sophosAgentDetails?.displayName} v${sophosAgentDetails?.version || "?"}`
                          : "Sophos Agent NOT detected on this device"}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-slate-400">{installedApps.length} applications installed</p>
                  <div className="space-y-1.5">
                    {installedApps.map((app, i) => (
                      <div key={i} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{app.displayName || "Unknown"}</p>
                          <p className="text-xs text-slate-400">{app.publisher || ""}{app.version ? ` · v${app.version}` : ""}</p>
                        </div>
                        {app.version && <Badge className="bg-slate-100 text-slate-600 text-xs shrink-0">{app.version}</Badge>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>

            {/* SCRIPTS */}
            <TabsContent value="scripts" className="mt-0 space-y-2">
              {loadingScripts ? <Spinner /> : scriptRunStates.length === 0 ? (
                <Empty text="No script run state data available" />
              ) : scriptRunStates.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <StateIcon state={s.runState} />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{s.id}</p>
                      <p className="text-xs text-slate-400">Last: {fmt(s.lastStateUpdateDateTime)}</p>
                      {s.errorDescription && <p className="text-xs text-red-500 mt-0.5">{s.errorDescription}</p>}
                    </div>
                  </div>
                  <Badge className={
                    s.runState === "success" ? "bg-emerald-100 text-emerald-700" :
                    s.runState === "fail" ? "bg-red-100 text-red-700" :
                    "bg-slate-100 text-slate-500"
                  }>{s.runState || "Unknown"}</Badge>
                </div>
              ))}
            </TabsContent>
            {/* REMOTE ASSIST */}
            <TabsContent value="remote" className="mt-0">
              <RemoteAssistTab device={device} automateAgentFound={automateAgentFound} />
            </TabsContent>

            {/* CA RISKS */}
            <TabsContent value="ca_risks" className="mt-0">
              <CaRisksTab
                device={device}
                azureTenantId={azureTenantId}
                detail={detail}
                health={health}
                compliancePolicies={compliancePolicies}
                protectionState={protectionState}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{title}</p>
      <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-slate-500">{label}</span>
      {React.isValidElement(value)
        ? value
        : <span className={`text-sm text-slate-800 text-right ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</span>
      }
    </div>
  );
}

function Spinner() {
  return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
}

function Empty({ text }) {
  return <div className="text-center py-10 text-sm text-slate-400">{text}</div>;
}