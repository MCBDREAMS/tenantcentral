import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { X, RefreshCw, Monitor, Shield, Package, Terminal, CheckCircle2, XCircle, AlertCircle, Clock, Loader2 } from "lucide-react";
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
  const scriptRunStates = scriptsData?.scriptRunStates || [];

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
          <TabsList className="mx-5 mt-4 justify-start shrink-0">
            <TabsTrigger value="overview"><Monitor className="h-3.5 w-3.5 mr-1" />Overview</TabsTrigger>
            <TabsTrigger value="compliance"><Shield className="h-3.5 w-3.5 mr-1" />Compliance</TabsTrigger>
            <TabsTrigger value="apps"><Package className="h-3.5 w-3.5 mr-1" />Apps</TabsTrigger>
            <TabsTrigger value="scripts"><Terminal className="h-3.5 w-3.5 mr-1" />Scripts</TabsTrigger>
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
                  <Section title="Sync">
                    <Row label="Enrolled" value={fmt(d.enrolledDateTime)} />
                    <Row label="Last Sync" value={fmt(d.lastSyncDateTime)} />
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