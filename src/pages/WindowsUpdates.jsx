import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  ShieldCheck, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Monitor, RotateCcw, Scan, Power
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import { format, subDays, isAfter } from "date-fns";

const AGE_OPTIONS = [
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
  { label: "180 days", value: 180 },
];

function fmt(v) {
  if (!v) return "—";
  try { return format(new Date(v), "dd MMM yyyy HH:mm"); } catch { return v; }
}

function CompBadge({ state }) {
  const map = {
    compliant: "bg-emerald-100 text-emerald-700",
    noncompliant: "bg-red-100 text-red-700",
    error: "bg-red-100 text-red-700",
    inGracePeriod: "bg-amber-100 text-amber-700",
    unknown: "bg-slate-100 text-slate-500",
  };
  return <Badge className={map[state] || "bg-slate-100 text-slate-500"}>{state || "Unknown"}</Badge>;
}

export default function WindowsUpdates({ selectedTenant }) {
  const [ageFilter, setAgeFilter] = useState(90);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [remediateStatus, setRemediateStatus] = useState({});

  const azureTenantId = selectedTenant?.tenant_id;

  const { data, isLoading, refetch, isFetched } = useQuery({
    queryKey: ["windows_updates_compliance", azureTenantId, ageFilter],
    enabled: false,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_windows_update_compliance",
        azure_tenant_id: azureTenantId,
        age_days: ageFilter,
      }).then(r => r.data),
  });

  const { data: deviceUpdates, isLoading: loadingDeviceUpdates } = useQuery({
    queryKey: ["device_update_detail", selectedDevice?.id, azureTenantId],
    enabled: !!(selectedDevice?.id && azureTenantId),
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_device_updates",
        azure_tenant_id: azureTenantId,
        device_id: selectedDevice.id,
      }).then(r => r.data),
  });

  const handleRemediate = async (deviceId, type) => {
    setRemediateStatus(s => ({ ...s, [deviceId + type]: "loading" }));
    try {
      await base44.functions.invoke("portalData", {
        action: "remediate_device",
        azure_tenant_id: azureTenantId,
        device_id: deviceId,
        remediation_type: type,
      });
      setRemediateStatus(s => ({ ...s, [deviceId + type]: "success" }));
      setTimeout(() => setRemediateStatus(s => ({ ...s, [deviceId + type]: null })), 4000);
    } catch {
      setRemediateStatus(s => ({ ...s, [deviceId + type]: "error" }));
    }
  };

  const devices = data?.devices || [];
  const summary = data?.summary || {};

  const cutoff = subDays(new Date(), ageFilter);
  const staleDevices = devices.filter(d => {
    const last = d.lastSyncDateTime;
    return !last || !isAfter(new Date(last), cutoff);
  });
  const compliantCount = devices.filter(d => d.complianceState === "compliant").length;
  const nonCompliantCount = devices.filter(d => d.complianceState === "noncompliant").length;
  const compliancePct = devices.length ? Math.round((compliantCount / devices.length) * 100) : 0;

  const protectionState = deviceUpdates?.protectionState || {};
  const allPolicies = deviceUpdates?.allCompliancePolicies || [];

  if (!azureTenantId) {
    return (
      <div className="p-6">
        <PageHeader title="Windows Updates" subtitle="Select a tenant to view update compliance" icon={ShieldCheck} />
        <div className="text-center py-20 text-slate-400 text-sm">Please select a tenant from the sidebar.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Windows Updates"
        subtitle={`Update compliance & remediation${selectedTenant ? ` — ${selectedTenant.name}` : ""}`}
        icon={ShieldCheck}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={ageFilter}
              onChange={e => setAgeFilter(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white"
            >
              {AGE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>Updates older than {o.label}</option>
              ))}
            </select>
            <Button onClick={() => refetch()} disabled={isLoading} className="bg-slate-900 hover:bg-slate-800 gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Scan Devices
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      {isFetched && !isLoading && devices.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Devices" value={devices.length} color="slate" />
          <SummaryCard label="Compliant" value={compliantCount} color="emerald" />
          <SummaryCard label="Non-Compliant" value={nonCompliantCount} color="red" />
          <SummaryCard label={`Stale (>${ageFilter}d)`} value={staleDevices.length} color="amber" />
        </div>
      )}

      {isFetched && !isLoading && devices.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Overall Update Compliance</p>
            <span className="text-lg font-bold text-slate-800">{compliancePct}%</span>
          </div>
          <Progress value={compliancePct} className="h-3" />
          <p className="text-xs text-slate-400 mt-2">
            {compliantCount} of {devices.length} Windows devices are compliant with update policies
          </p>
        </div>
      )}

      {!isFetched && !isLoading && (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl">
          <ShieldCheck className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Click "Scan Devices" to load Windows Update compliance</p>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Scanning devices for update compliance…</p>
        </div>
      )}

      {isFetched && !isLoading && devices.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Device List */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-700">Devices ({devices.length})</p>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {devices.map(d => {
                const isStale = !d.lastSyncDateTime || !isAfter(new Date(d.lastSyncDateTime), cutoff);
                const isSelected = selectedDevice?.id === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDevice(isSelected ? null : d)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${isSelected ? "bg-blue-50 border-l-2 border-blue-500" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Monitor className="h-4 w-4 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{d.deviceName}</p>
                          <p className="text-xs text-slate-400 truncate">{d.userPrincipalName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isStale && <Badge className="bg-amber-100 text-amber-700 text-[10px]">Stale</Badge>}
                        <CompBadge state={d.complianceState} />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 ml-6">Last sync: {fmt(d.lastSyncDateTime)}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Device Detail */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {!selectedDevice ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400">
                <Monitor className="h-10 w-10 mb-3 text-slate-200" />
                <p className="text-sm">Select a device to view update details</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <p className="text-sm font-semibold text-slate-700">{selectedDevice.deviceName}</p>
                  <p className="text-xs text-slate-400">{selectedDevice.osVersion}</p>
                </div>

                {loadingDeviceUpdates ? (
                  <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                ) : (
                  <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                    {/* Remediation */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Remediation</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { type: "sync", label: "Sync Policies", icon: RefreshCw },
                          { type: "restart", label: "Reboot", icon: Power },
                          { type: "defender_scan_quick", label: "Quick Scan", icon: Scan },
                          { type: "defender_scan_full", label: "Full Scan", icon: ShieldCheck },
                        ].map(action => {
                          const key = selectedDevice.id + action.type;
                          const st = remediateStatus[key];
                          return (
                            <Button
                              key={action.type}
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs h-8"
                              disabled={st === "loading"}
                              onClick={() => handleRemediate(selectedDevice.id, action.type)}
                            >
                              {st === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <action.icon className="h-3 w-3" />}
                              {action.label}
                              {st === "success" && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                              {st === "error" && <XCircle className="h-3 w-3 text-red-500" />}
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Defender / Protection */}
                    {protectionState && Object.keys(protectionState).length > 1 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Defender / Protection State</p>
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                          <DetailRow label="Real-Time Protection" value={protectionState.realTimeProtectionEnabled ? "✅ Enabled" : "❌ Disabled"} />
                          <DetailRow label="Signature Status" value={protectionState.signatureUpdateOverdue ? "⚠ Overdue" : "✅ Up to Date"} />
                          <DetailRow label="Signature Version" value={protectionState.antivirusSignatureVersion || "—"} />
                          <DetailRow label="Quick Scan Overdue" value={protectionState.quickScanOverdue ? "⚠ Yes" : "✅ No"} />
                          <DetailRow label="Full Scan Overdue" value={protectionState.fullScanOverdue ? "⚠ Yes" : "✅ No"} />
                          <DetailRow label="Last Quick Scan" value={fmt(protectionState.lastQuickScanDateTime)} />
                          <DetailRow label="Last Full Scan" value={fmt(protectionState.lastFullScanDateTime)} />
                        </div>
                      </div>
                    )}

                    {/* Compliance Policies */}
                    {allPolicies.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                          Installed / Missing Update Policies
                        </p>
                        <div className="space-y-2">
                          {allPolicies.map((p, i) => (
                            <div key={i} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                              <div className="flex items-center gap-2">
                                {p.state === "compliant"
                                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                  : p.state === "noncompliant"
                                  ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                                  : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                                <div>
                                  <p className="text-sm font-medium text-slate-800">{p.displayName}</p>
                                  <p className="text-xs text-slate-400">{p.platformType}</p>
                                </div>
                              </div>
                              <CompBadge state={p.state} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!protectionState?.antivirusSignatureVersion && !allPolicies.length && (
                      <p className="text-sm text-slate-400 text-center py-8">No update detail data found for this device.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  const colors = {
    slate: "bg-slate-50 border-slate-200 text-slate-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    red: "bg-red-50 border-red-200 text-red-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
  };
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-1 opacity-70">{label}</p>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-800 text-right">{value}</span>
    </div>
  );
}