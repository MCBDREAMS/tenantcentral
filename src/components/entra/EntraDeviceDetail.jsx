import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { X, Monitor, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

function fmt(v) {
  if (!v) return "—";
  try { return format(new Date(v), "dd MMM yyyy HH:mm"); } catch { return v; }
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      {React.isValidElement(value)
        ? value
        : <span className="text-sm text-slate-800 text-right">{value || "—"}</span>}
    </div>
  );
}

export default function EntraDeviceDetail({ device, azureTenantId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ["entra_device_detail", device.id],
    enabled: !!device.id && !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_entra_device_detail",
        azure_tenant_id: azureTenantId,
        device_id: device.id,
      }).then(r => r.data),
  });

  const d = data?.device || device;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-900">
          <div className="flex items-center gap-3">
            <Monitor className="h-5 w-5 text-blue-400" />
            <div>
              <h2 className="text-white font-semibold">{device.displayName}</h2>
              <p className="text-xs text-slate-400">{device.operatingSystem}</p>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="text-slate-400 hover:text-white" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Device Identity</p>
                <div className="border border-slate-200 rounded-xl">
                  <Row label="Display Name" value={d.displayName} />
                  <Row label="Device ID" value={<span className="font-mono text-xs">{d.deviceId || d.id}</span>} />
                  <Row label="Object ID" value={<span className="font-mono text-xs">{d.id}</span>} />
                  <Row label="Operating System" value={d.operatingSystem} />
                  <Row label="OS Version" value={d.operatingSystemVersion} />
                  <Row label="Model" value={d.model} />
                  <Row label="Manufacturer" value={d.manufacturer} />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Status</p>
                <div className="border border-slate-200 rounded-xl">
                  <Row label="Account Enabled" value={
                    d.accountEnabled
                      ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Enabled</Badge>
                      : <Badge className="bg-red-100 text-red-700 border-0 text-xs gap-1"><XCircle className="h-3 w-3" />Disabled</Badge>
                  } />
                  <Row label="Trust Type" value={d.trustType} />
                  <Row label="MDM Enrolled" value={d.isManaged
                    ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Yes</Badge>
                    : <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">No</Badge>
                  } />
                  <Row label="Compliant" value={d.isCompliant
                    ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Yes</Badge>
                    : <Badge className="bg-red-100 text-red-700 border-0 text-xs">No</Badge>
                  } />
                  <Row label="Profile Type" value={d.profileType} />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Activity</p>
                <div className="border border-slate-200 rounded-xl">
                  <Row label="Registered" value={fmt(d.registrationDateTime)} />
                  <Row label="Last Sign-In" value={fmt(d.approximateLastSignInDateTime)} />
                </div>
              </div>

              {d.physicalIds?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Physical IDs</p>
                  <div className="border border-slate-200 rounded-xl p-3 space-y-1">
                    {d.physicalIds.map((pid, i) => (
                      <p key={i} className="text-xs font-mono text-slate-600">{pid}</p>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}