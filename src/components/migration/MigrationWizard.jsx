import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft, Loader2, Building2, ShieldCheck, RefreshCw, Save, ChevronRight,
  Mail, HardDrive, FileStack, UsersRound, ClipboardCheck, Lock, LockOpen, Pin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import InventoryCompare from "./InventoryCompare";
import MigrationPlan from "./MigrationPlan";
import FeasibilityReport from "./FeasibilityReport";

const WORKLOADS = [
  { key: "exchange", label: "Exchange Mailboxes", icon: Mail },
  { key: "onedrive", label: "OneDrive", icon: HardDrive },
  { key: "sharepoint", label: "SharePoint Sites", icon: FileStack },
  { key: "teams", label: "Microsoft Teams", icon: UsersRound },
];

const STEPS = ["Configure", "Gap Report", "Plan", "Save"];

export default function MigrationWizard({ tenants: initialTenants, selectedTenant }) {
  const { toast } = useToast();
  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
    initialData: initialTenants || [],
  });

  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");

  // Bind the migration source to the sidebar-selected tenant so every subsequent
  // report, task and selection in this wizard applies only to that tenant.
  const lockedSource = !!selectedTenant?.id;
  useEffect(() => {
    if (selectedTenant?.id) {
      setSourceId(selectedTenant.id);
      if (targetId === selectedTenant.id) setTargetId("");
    }
  }, [selectedTenant?.id]);
  const [workloads, setWorkloads] = useState({ exchange: true, onedrive: true, sharepoint: true, teams: true });
  const [step, setStep] = useState(0);

  const [assessing, setAssessing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inv, setInv] = useState(null);
  const [plan, setPlan] = useState(null);
  const [feasibility, setFeasibility] = useState(null);

  const sourceTenant = allTenants.find(t => t.id === sourceId);
  const targetTenant = allTenants.find(t => t.id === targetId);
  const workloadList = WORKLOADS.filter(w => workloads[w.key]).map(w => w.key);

  // Feasibility is the gate: run inventory on both tenants, then build the gap report.
  const runFeasibility = async () => {
    if (!sourceTenant?.tenant_id || !targetTenant?.tenant_id) return;
    setAssessing(true);
    setInv(null);
    setFeasibility(null);
    setPlan(null);
    try {
      const invRes = await base44.functions.invoke("tenantMigration", {
        action: "inventory_both",
        source_azure_tenant_id: sourceTenant.tenant_id,
        target_azure_tenant_id: targetTenant.tenant_id,
        top: 50,
      });
      if (!invRes.data?.success) throw new Error(invRes.data?.error || "Inventory failed");
      const source = invRes.data.source;
      const target = invRes.data.target;
      setInv({ source, target });

      const feasRes = await base44.functions.invoke("tenantMigration", {
        action: "generate_feasibility",
        source_azure_tenant_id: sourceTenant.tenant_id,
        target_azure_tenant_id: targetTenant.tenant_id,
        source_name: sourceTenant.name,
        target_name: targetTenant.name,
        workloads: workloadList,
        inventory_source: source,
        inventory_target: target,
      });
      if (!feasRes.data?.success) throw new Error(feasRes.data?.error || "Feasibility assessment failed");
      setFeasibility(feasRes.data.report);
      setStep(1);
      toast({
        title: "Gap report ready",
        description: `${feasRes.data.report.statusLabel} (score ${feasRes.data.report.readinessScore}/100).`,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "Assessment failed", description: e.message });
    } finally {
      setAssessing(false);
    }
  };

  const generatePlan = async () => {
    setPlanning(true);
    try {
      const res = await base44.functions.invoke("tenantMigration", {
        action: "generate_plan",
        source_azure_tenant_id: sourceTenant.tenant_id,
        target_azure_tenant_id: targetTenant.tenant_id,
        source_name: sourceTenant.name,
        target_name: targetTenant.name,
        workloads: workloadList,
        inventory_source: inv.source,
        inventory_target: inv.target,
      });
      if (!res.data?.success) throw new Error(res.data?.error || "Plan generation failed");
      setPlan(res.data.plan);
      setStep(2);
      toast({ title: "Migration plan generated", description: "Review the phased plan below." });
    } catch (e) {
      toast({ variant: "destructive", title: "Plan failed", description: e.message });
    } finally {
      setPlanning(false);
    }
  };

  const saveJob = async () => {
    setSaving(true);
    try {
      await base44.entities.MigrationJob.create({
        name: name || `${sourceTenant.name} → ${targetTenant.name}`,
        source_azure_tenant_id: sourceTenant.tenant_id,
        source_tenant_name: sourceTenant.name,
        target_azure_tenant_id: targetTenant.tenant_id,
        target_tenant_name: targetTenant.name,
        workloads: workloadList.join(","),
        status: "planned",
        current_phase: "assess",
        plan_payload: JSON.stringify(plan),
        inventory_source: JSON.stringify(inv.source),
        inventory_target: JSON.stringify(inv.target),
      });
      setStep(3);
      toast({ title: "Migration job saved", description: "Saved as a MigrationJob record." });
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const canPlan = feasibility && feasibility.overallStatus !== "insufficient_data";

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2 shrink-0">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${i <= step ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"}`}>
              {i + 1}. {s}
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
          </div>
        ))}
      </div>

      {/* Step 0 — Configure */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <ArrowRightLeft className="h-4 w-4 text-blue-500" /> Feasibility assessment configuration
        </div>
        <p className="text-sm text-slate-500 -mt-2">
          Select the source (from) and target (to) tenants. The assessment inventories both tenants and produces a
          gap report <span className="font-medium text-slate-700">before</span> any migration plan is generated.
        </p>
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Job name</p>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={`${sourceTenant?.name || "Source"} → ${targetTenant?.name || "Target"}`}
            className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {lockedSource && (
          <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
            <Pin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
            <span>
              Source tenant is pinned to the sidebar selection (<span className="font-semibold text-slate-800">{selectedTenant.name}</span>).
              All reports and tasks in this wizard apply only to this tenant as the source.
            </span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
              Source tenant (from)
              {lockedSource && <Lock className="h-3 w-3 text-blue-500" />}
            </p>
            <Select value={sourceId} onValueChange={setSourceId} disabled={lockedSource}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Select source..." /></SelectTrigger>
              <SelectContent>
                {allTenants.map(t => <SelectItem key={t.id} value={t.id} disabled={t.id === targetId}>
                  <div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-slate-400" />{t.name}</div>
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Target tenant (to)</p>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Select target..." /></SelectTrigger>
              <SelectContent>
                {allTenants.map(t => <SelectItem key={t.id} value={t.id} disabled={t.id === sourceId}>
                  <div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-slate-400" />{t.name}</div>
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Workloads in scope</p>
          <div className="flex flex-wrap gap-2">
            {WORKLOADS.map(w => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWorkloads(s => ({ ...s, [w.key]: !s[w.key] }))}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${workloads[w.key] ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-400 hover:bg-slate-50"}`}
              >
                <w.icon className="h-4 w-4" /> {w.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={runFeasibility} disabled={!sourceTenant?.tenant_id || !targetTenant?.tenant_id || assessing || workloadList.length === 0} className="gap-2">
            {assessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            {assessing ? "Assessing tenants..." : "Run feasibility assessment"}
          </Button>
        </div>
      </div>

      {/* Step 1 — Gap report */}
      {inv && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-800">Gap report — {sourceTenant.name} → {targetTenant.name}</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <Button onClick={runFeasibility} variant="ghost" size="sm" disabled={assessing} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Re-assess
              </Button>
              <Button onClick={generatePlan} disabled={planning || !canPlan} variant="default" className="gap-2">
                {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : canPlan ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {planning ? "Generating plan..." : "Proceed to migration plan"}
              </Button>
            </div>
          </div>
          {!canPlan && feasibility && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Migration planning is locked until the gap report has enough data. Resolve the findings above and
                re-assess, or grant the required Graph permissions in both tenants.
              </span>
            </div>
          )}
          <InventoryCompare source={inv.source} target={inv.target} />
          {feasibility && (
            <div className="pt-2">
              <FeasibilityReport report={feasibility} />
            </div>
          )}
        </div>
      )}

      {/* Step 2 — Plan */}
      {plan && (
        <div className="space-y-3">
          <MigrationPlan plan={plan} />
          <div className="flex justify-end">
            <Button onClick={saveJob} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save migration job"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — Done */}
      {step === 3 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
          <ShieldCheck className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
          <p className="font-semibold text-emerald-800">Migration job saved</p>
          <p className="text-sm text-emerald-600 mt-1">The gap report and phased plan are stored as a MigrationJob record.</p>
          <Badge className="mt-3 bg-emerald-100 text-emerald-700 border-0">Status: planned</Badge>
        </div>
      )}
    </div>
  );
}