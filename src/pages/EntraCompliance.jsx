import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Monitor, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import PageHeader from "@/components/shared/PageHeader";

function CompBadge({ state }) {
  const map = {
    compliant: "bg-emerald-100 text-emerald-700",
    noncompliant: "bg-red-100 text-red-700",
    inGracePeriod: "bg-amber-100 text-amber-700",
    unknown: "bg-slate-100 text-slate-500",
    notApplicable: "bg-slate-100 text-slate-500",
  };
  return <Badge className={`${map[state] || "bg-slate-100 text-slate-500"} border-0 text-xs`}>{state || "Unknown"}</Badge>;
}

export default function EntraCompliance({ selectedTenant }) {
  const [filter, setFilter] = useState("all");
  const azureTenantId = selectedTenant?.tenant_id;

  const { data: localDevices = [], isLoading: loadingLocal } = useQuery({
    queryKey: ["intune_devices_entra_compliance", selectedTenant?.id],
    enabled: !!selectedTenant?.id,
    queryFn: () => base44.entities.IntuneDevice.filter({ tenant_id: selectedTenant.id }),
  });

  const { data: graphData, isLoading: loadingGraph, refetch } = useQuery({
    queryKey: ["entra_compliance_report", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_windows_update_compliance",
        azure_tenant_id: azureTenantId,
        age_days: 90,
      }).then(r => r.data),
  });

  const isLoading = loadingLocal || loadingGraph;

  // Merge: prefer graph data, fall back to local
  const devices = graphData?.devices?.length
    ? graphData.devices.map(d => ({
        name: d.deviceName,
        user: d.userPrincipalName || "—",
        os: d.operatingSystem || "Windows",
        lastSync: d.lastSyncDateTime,
        complianceState: d.complianceState,
      }))
    : localDevices.map(d => ({
        name: d.device_name,
        user: d.primary_user || "—",
        os: d.os || "Unknown",
        lastSync: d.last_check_in,
        complianceState: d.compliance_state,
      }));

  const total = devices.length;
  const compliant = devices.filter(d => d.complianceState === "compliant").length;
  const nonCompliant = devices.filter(d => ["noncompliant", "error"].includes(d.complianceState)).length;
  const inGrace = devices.filter(d => d.complianceState === "inGracePeriod").length;
  const pct = total ? Math.round((compliant / total) * 100) : 0;

  const filtered = filter === "all" ? devices : devices.filter(d => d.complianceState === filter);

  if (!azureTenantId) {
    return (
      <div className="p-6">
        <PageHeader title="Entra Compliance" subtitle="Select a tenant" icon={ShieldCheck} />
        <div className="text-center py-20 text-slate-400 text-sm">Please select a tenant from the sidebar.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="Entra ID Compliance"
        subtitle={`Device compliance overview — ${selectedTenant?.name}`}
        icon={ShieldCheck}
        actions={
          <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        }
      />

      {isLoading && (
        <div className="text-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{total}</p>
              <p className="text-xs text-slate-500 mt-1">Total Devices</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700">{compliant}</p>
              <p className="text-xs text-emerald-600 mt-1">Compliant</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{nonCompliant}</p>
              <p className="text-xs text-red-600 mt-1">Non-Compliant</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-700">{inGrace}</p>
              <p className="text-xs text-amber-600 mt-1">In Grace Period</p>
            </div>
          </div>

          {/* Compliance Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700">Overall Compliance Rate</p>
              <span className="text-lg font-bold text-slate-800">{pct}%</span>
            </div>
            <Progress value={pct} className="h-3" />
            <p className="text-xs text-slate-400 mt-2">{compliant} of {total} devices are compliant</p>
          </div>

          {/* Device Table */}
          {total > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-sm font-semibold text-slate-700">Devices ({filtered.length})</p>
                <div className="flex gap-1">
                  {["all", "compliant", "noncompliant", "inGracePeriod"].map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filter === f ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                    >
                      {f === "all" ? "All" : f === "compliant" ? "Compliant" : f === "noncompliant" ? "Non-Compliant" : "Grace"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {filtered.map((d, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center gap-3 min-w-0">
                      <Monitor className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{d.name}</p>
                        <p className="text-xs text-slate-400 truncate">{d.user} · {d.os}</p>
                      </div>
                    </div>
                    <CompBadge state={d.complianceState} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {total === 0 && (
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
              No device compliance data found. Sync devices from Intune first.
            </div>
          )}
        </>
      )}
    </div>
  );
}