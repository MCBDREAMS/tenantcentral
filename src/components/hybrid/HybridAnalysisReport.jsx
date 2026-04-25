import React from "react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function CheckRow({ label, check, detail }) {
  const icon = check?.ok === true
    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
    : check?.ok === false
    ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
    : <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;

  const bg = check?.ok === true ? "bg-emerald-50 border-emerald-200"
    : check?.ok === false ? "bg-red-50 border-red-200"
    : "bg-amber-50 border-amber-200";

  return (
    <div className={`flex items-start gap-3 p-3 border rounded-lg ${bg}`}>
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {detail && <p className="text-xs text-slate-500 mt-0.5">{detail}</p>}
        {check?.error && <p className="text-xs text-red-600 mt-0.5">{check.error}</p>}
      </div>
      <Badge className={`shrink-0 text-[10px] border-0 ${
        check?.ok === true ? "bg-emerald-100 text-emerald-700"
        : check?.ok === false ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-700"
      }`}>
        {check?.ok === true ? "Pass" : check?.ok === false ? "Fail" : "Warn"}
      </Badge>
    </div>
  );
}

export default function HybridAnalysisReport({ result, error, analyzing, onRun }) {
  if (analyzing) {
    return (
      <div className="text-center py-20 space-y-3">
        <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto" />
        <p className="text-sm font-medium text-slate-700">Analysing hybrid readiness…</p>
        <p className="text-xs text-slate-400">Querying Microsoft Graph for domains, sync status, devices, and policies…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 space-y-4">
        <XCircle className="h-12 w-12 text-red-400 mx-auto" />
        <p className="text-sm text-red-600 font-medium">{error}</p>
        <Button onClick={onRun} variant="outline" className="gap-2"><RefreshCw className="h-4 w-4" />Retry</Button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
          <Info className="h-8 w-8 text-slate-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">No analysis run yet</p>
          <p className="text-xs text-slate-400 mt-1">Click "Run Analysis" to check your tenant's Hybrid Azure AD Join and Intune readiness.</p>
        </div>
        <Button onClick={onRun} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <RefreshCw className="h-4 w-4" />Run Analysis
        </Button>
      </div>
    );
  }

  const { checks, score, passCount, total } = result;
  const scoreColor = score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-500" : "text-red-500";
  const scoreBg = score >= 80 ? "bg-emerald-50 border-emerald-200" : score >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";

  return (
    <div className="space-y-6">
      {/* Score banner */}
      <div className={`flex items-center justify-between p-5 rounded-2xl border ${scoreBg}`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Hybrid Readiness Score</p>
          <p className={`text-5xl font-extrabold mt-1 ${scoreColor}`}>{score}<span className="text-2xl text-slate-400">%</span></p>
          <p className="text-sm text-slate-500 mt-1">{passCount} of {total} critical checks passed</p>
        </div>
        <div className="text-right space-y-1">
          <p className="text-xs text-slate-400">Hybrid devices found</p>
          <p className="text-2xl font-bold text-slate-700">{checks.hybrid_devices?.count ?? "—"}</p>
          <p className="text-xs text-slate-400">{checks.hybrid_devices?.managed ?? 0} already managed in Intune</p>
        </div>
      </div>

      {/* Check grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CheckRow
          label="Verified Domain"
          check={checks.domains}
          detail={checks.domains?.data?.map(d => d.id).join(", ")}
        />
        <CheckRow
          label="Entra Connect / On-Prem Sync"
          check={checks.onprem_sync}
          detail={checks.onprem_sync?.syncEnabled
            ? `Last sync: ${checks.onprem_sync.lastSync ? new Date(checks.onprem_sync.lastSync).toLocaleString() : "Unknown"}`
            : "Azure AD Connect sync not detected"}
        />
        <CheckRow
          label="Hybrid Azure AD Joined Devices"
          check={checks.hybrid_devices}
          detail={checks.hybrid_devices?.count > 0
            ? `${checks.hybrid_devices.count} devices · ${checks.hybrid_devices.managed} Intune-managed`
            : "No Hybrid joined devices detected"}
        />
        <CheckRow
          label="Intune Subscription Active"
          check={checks.intune_authority}
          detail={`State: ${checks.intune_authority?.subscriptionState || "Unknown"} · Authority: ${checks.intune_authority?.mdmAuthority || "Unknown"}`}
        />
        <CheckRow
          label="MDM Auto-Enrollment"
          check={checks.mdm_auto_enroll}
          detail="Checks if MDM auto-enrollment policies are configured in Azure"
        />
        <CheckRow
          label="Conditional Access (Hybrid/Compliant)"
          check={checks.conditional_access}
          detail={checks.conditional_access?.hybridPolicies?.map(p => p.displayName).join(", ") || "No Hybrid/Compliant device CA policies found"}
        />
        <CheckRow
          label="Service Connection Point (SCP)"
          check={checks.scp}
          detail={checks.scp?.note}
        />
        <CheckRow
          label="Device Writeback (Entra Connect)"
          check={checks.device_writeback}
          detail={checks.device_writeback?.ok ? "Device writeback enabled" : "Device writeback not enabled or not detectable via API"}
        />
      </div>

      {/* Hybrid devices sample */}
      {checks.hybrid_devices?.sample?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sample Hybrid Devices</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Device", "OS", "Managed", "Compliant", "Last Sign-In"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {checks.hybrid_devices.sample.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800">{d.displayName}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{d.operatingSystem}</td>
                    <td className="px-3 py-2">
                      <Badge className={d.isManaged ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                        {d.isManaged ? "Yes" : "No"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={d.isCompliant ? "bg-emerald-100 text-emerald-700 border-0" : "bg-red-100 text-red-700 border-0"}>
                        {d.isCompliant ? "Compliant" : "Non-compliant"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {d.approximateLastSignInDateTime ? new Date(d.approximateLastSignInDateTime).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}