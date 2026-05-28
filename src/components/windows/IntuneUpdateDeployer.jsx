import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Download, RefreshCw, Loader2, CheckCircle2, XCircle, Plus, Settings,
  Shield, Clock, AlertTriangle, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const UPDATE_TYPES = [
  { value: "all", label: "All Updates", desc: "Quality + Feature + Driver updates" },
  { value: "business_ready", label: "Business Ready Only", desc: "Fully tested updates for enterprise" },
];

export default function IntuneUpdateDeployer({ selectedTenant }) {
  const [ringName, setRingName] = useState(`Update Ring - ${new Date().toLocaleDateString()}`);
  const [updateType, setUpdateType] = useState("business_ready");
  const [qualityDefer, setQualityDefer] = useState(7);
  const [featureDefer, setFeatureDefer] = useState(30);
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const { data: existingRings, isLoading: loadingRings, refetch: refetchRings } = useQuery({
    queryKey: ["update-rings", selectedTenant?.tenant_id],
    enabled: !!selectedTenant?.tenant_id,
    queryFn: () =>
      base44.functions.invoke("windowsUpgradeEngine", {
        action: "list_update_rings",
        azure_tenant_id: selectedTenant.tenant_id,
      }).then(r => r.data),
  });

  const handleDeploy = async () => {
    setDeploying(true);
    setResult(null);
    setError(null);
    try {
      const res = await base44.functions.invoke("windowsUpgradeEngine", {
        action: "deploy_windows_updates",
        azure_tenant_id: selectedTenant.tenant_id,
        ring_name: ringName,
        update_type: updateType,
        quality_defer: qualityDefer,
        feature_defer: featureDefer,
      });
      if (res.data?.success) {
        setResult(res.data);
        refetchRings();
      } else {
        throw new Error(res.data?.error || "Failed");
      }
    } catch (e) {
      setError(e.message);
    }
    setDeploying(false);
  };

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex gap-3">
        <Package className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-violet-800 mb-1">Independent Windows Update Management</p>
          <p className="text-xs text-violet-700">Create and deploy Windows Update for Business (WUfB) rings via this console — completely independently from the existing Intune portal. Policies are pushed via Microsoft Graph API and assigned to all devices in the selected tenant.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Ring */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Plus className="h-4 w-4" /> Create Update Ring
          </h3>

          <div>
            <label className="text-xs text-slate-500 font-medium mb-1 block">Ring Name</label>
            <Input value={ringName} onChange={e => setRingName(e.target.value)} className="text-sm" disabled={deploying} />
          </div>

          <div>
            <label className="text-xs text-slate-500 font-medium mb-2 block">Update Type</label>
            <div className="space-y-2">
              {UPDATE_TYPES.map(t => (
                <label key={t.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${updateType === t.value ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  <input type="radio" name="updateType" value={t.value} checked={updateType === t.value} onChange={() => setUpdateType(t.value)} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{t.label}</p>
                    <p className="text-xs text-slate-500">{t.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block flex items-center gap-1">
                <Clock className="h-3 w-3" /> Quality Defer (days)
              </label>
              <Input type="number" min={0} max={30} value={qualityDefer} onChange={e => setQualityDefer(Number(e.target.value))} className="text-sm" disabled={deploying} />
              <p className="text-[10px] text-slate-400 mt-1">Security & bug-fix updates</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block flex items-center gap-1">
                <Clock className="h-3 w-3" /> Feature Defer (days)
              </label>
              <Input type="number" min={0} max={365} value={featureDefer} onChange={e => setFeatureDefer(Number(e.target.value))} className="text-sm" disabled={deploying} />
              <p className="text-[10px] text-slate-400 mt-1">Major version updates</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 flex items-start gap-2">
            <Settings className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Install schedule: <strong>Sunday 03:00 AM</strong> — Auto install with reboot</span>
          </div>

          <Button
            onClick={handleDeploy}
            disabled={deploying || !selectedTenant?.tenant_id}
            className="w-full bg-violet-600 hover:bg-violet-700 gap-2"
          >
            {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {deploying ? "Deploying via Graph API…" : "Deploy Update Ring"}
          </Button>

          {result && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">Ring Deployed</p>
              </div>
              <p className="text-xs text-emerald-700">{result.message}</p>
              <p className="text-[10px] text-emerald-600 font-mono mt-1">Policy ID: {result.policyId}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="h-4 w-4 text-red-600" />
                <p className="text-sm font-semibold text-red-800">Deployment Failed</p>
              </div>
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Existing Rings */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Existing Update Rings</p>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetchRings()}>
              <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
            </Button>
          </div>
          {loadingRings ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (existingRings?.rings || []).length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">No update rings found in this tenant</div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-[420px] overflow-y-auto">
              {(existingRings?.rings || []).map(ring => (
                <div key={ring.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{ring.displayName}</p>
                      {ring.description && <p className="text-xs text-slate-400 mt-0.5">{ring.description}</p>}
                    </div>
                    <Badge className="bg-blue-100 text-blue-700 text-[10px] shrink-0">Active</Badge>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">ID: {ring.id?.slice(0,16)}…</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}