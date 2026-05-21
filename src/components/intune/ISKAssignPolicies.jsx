import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link2, Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const POLICY_TYPES = [
  { value: "configuration_policy", label: "Settings Catalog Policy" },
  { value: "device_configuration", label: "Device Configuration Profile" },
  { value: "compliance_policy", label: "Compliance Policy" },
  { value: "script", label: "Management Script" },
];

export default function ISKAssignPolicies({ azureTenantId }) {
  const [form, setForm] = useState({
    policyType: "configuration_policy",
    policyId: "",
    targetGroupId: "",
    assignmentType: "Included",
  });
  const [result, setResult] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState(null);

  const { data: policies, isLoading, refetch } = useQuery({
    queryKey: ["isk-policies", azureTenantId],
    queryFn: async () => {
      const res = await base44.functions.invoke("intuneStarterKit", {
        action: "list_policies",
        azure_tenant_id: azureTenantId,
      });
      return res.data;
    },
    enabled: !!azureTenantId,
  });

  const policyOptions = {
    configuration_policy: policies?.configurationPolicies || [],
    device_configuration: policies?.deviceConfigurations || [],
    compliance_policy: policies?.compliancePolicies || [],
    script: policies?.scripts || [],
  };

  const groups = policies?.groups || [];

  async function assign() {
    setAssigning(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke("intuneStarterKit", {
        action: "assign_policy",
        azure_tenant_id: azureTenantId,
        ...form,
      });
      if (res.data?.success) {
        setResult(res.data);
      } else {
        setError(res.data?.error || "Assignment failed");
      }
    } catch (e) {
      setError(e.message);
    }
    setAssigning(false);
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading policies and groups from Graph...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-blue-500" /> Assign Policy to Group
          </h3>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-500 uppercase">Policy Type</span>
            <select
              value={form.policyType}
              onChange={e => setForm(f => ({ ...f, policyType: e.target.value, policyId: "" }))}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              {POLICY_TYPES.map(pt => (
                <option key={pt.value} value={pt.value}>{pt.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-500 uppercase">Policy / Profile</span>
            <select
              value={form.policyId}
              onChange={e => setForm(f => ({ ...f, policyId: e.target.value }))}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">— Select —</option>
              {policyOptions[form.policyType].map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-500 uppercase">Target Group</span>
            <select
              value={form.targetGroupId}
              onChange={e => setForm(f => ({ ...f, targetGroupId: e.target.value }))}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">— Select Group —</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>

          {(form.policyType === "configuration_policy" || form.policyType === "device_configuration") && (
            <label className="block">
              <span className="text-xs font-medium text-slate-500 uppercase">Assignment Type</span>
              <select
                value={form.assignmentType}
                onChange={e => setForm(f => ({ ...f, assignmentType: e.target.value }))}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="Included">Included</option>
                <option value="Excluded">Excluded</option>
              </select>
            </label>
          )}
        </div>

        <Button
          onClick={assign}
          disabled={assigning || !form.policyId || !form.targetGroupId}
          className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
        >
          {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {assigning ? "Assigning..." : "Assign Policy"}
        </Button>
      </div>

      {result && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {result.skipped ? `Already assigned — ${result.reason}` : "Policy assigned successfully!"}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}