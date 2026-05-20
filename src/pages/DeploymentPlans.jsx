import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Plus, ChevronRight, CheckCircle2, AlertTriangle, RotateCcw, RefreshCw, Clock } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";

const RING_ORDER = ["pilot", "staging", "production"];
const RING_COLORS = {
  pilot:      "bg-blue-100 text-blue-800 border-blue-200",
  staging:    "bg-amber-100 text-amber-800 border-amber-200",
  production: "bg-emerald-100 text-emerald-800 border-emerald-200",
};
const STATUS_COLORS = {
  draft:        "bg-slate-100 text-slate-600",
  pilot:        "bg-blue-100 text-blue-800",
  staging:      "bg-amber-100 text-amber-800",
  production:   "bg-emerald-100 text-emerald-800",
  complete:     "bg-green-100 text-green-800",
  rolled_back:  "bg-red-100 text-red-800",
};

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RingProgressBar({ plan }) {
  const rings = RING_ORDER;
  const currentIdx = rings.indexOf(plan.current_ring ?? "pilot");
  const statusIdx = ["draft","pilot","staging","production","complete","rolled_back"].indexOf(plan.status);

  return (
    <div className="flex items-center gap-1 mt-2">
      {rings.map((ring, i) => {
        const done = plan.status === "complete" || (plan.status !== "draft" && i < currentIdx) || (plan.status === ring && plan[`${ring}_success_rate`] >= (plan.success_threshold || 95));
        const active = plan.current_ring === ring && plan.status === ring;
        const rate = plan[`${ring}_success_rate`];
        return (
          <React.Fragment key={ring}>
            <div className={`flex flex-col items-center`}>
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold border-2
                ${done ? "bg-emerald-500 border-emerald-500 text-white" : active ? "bg-blue-500 border-blue-500 text-white" : "bg-slate-100 border-slate-300 text-slate-400"}`}>
                {done ? "✓" : i + 1}
              </div>
              <span className="text-[9px] text-slate-500 mt-0.5 capitalize">{ring}</span>
              {rate > 0 && <span className="text-[9px] font-semibold text-emerald-600">{rate}%</span>}
            </div>
            {i < rings.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 ${done ? "bg-emerald-400" : "bg-slate-200"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function PlanCard({ plan, tenantName, onPromote, onRollback }) {
  const nextRing = RING_ORDER[RING_ORDER.indexOf(plan.current_ring) + 1];
  const canPromote = plan.status !== "complete" && plan.status !== "rolled_back" && nextRing;
  const successRate = plan[`${plan.current_ring}_success_rate`] || 0;
  const threshold = plan.success_threshold || 95;
  const belowThreshold = successRate > 0 && successRate < threshold;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-semibold text-slate-900 text-sm">{plan.name}</p>
          {tenantName && <p className="text-xs text-slate-400">{tenantName}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[plan.status] || ""}`}>{plan.status}</span>
          <span className="text-xs text-slate-400 capitalize bg-slate-100 px-2 py-0.5 rounded-full">{plan.plan_type?.replace(/_/g," ")}</span>
        </div>
      </div>

      {plan.description && <p className="text-xs text-slate-500 mb-2 line-clamp-1">{plan.description}</p>}

      <RingProgressBar plan={plan} />

      {belowThreshold && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Success rate {successRate}% is below threshold {threshold}% — review before promoting
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        {canPromote && plan.status !== "draft" && (
          <Button size="sm" className="h-7 text-xs" onClick={() => onPromote(plan)}>
            <ChevronRight className="h-3 w-3 mr-1" /> Promote to {nextRing}
          </Button>
        )}
        {plan.status === "draft" && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPromote(plan)}>
            Start Pilot
          </Button>
        )}
        {plan.status !== "draft" && plan.status !== "complete" && plan.status !== "rolled_back" && (
          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => onRollback(plan)}>
            <RotateCcw className="h-3 w-3 mr-1" /> Rollback
          </Button>
        )}
        {plan.created_by && (
          <span className="text-xs text-slate-400 ml-auto">by {plan.created_by}</span>
        )}
      </div>
    </div>
  );
}

export default function DeploymentPlans({ selectedTenant, tenants = [] }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [form, setForm] = useState({ name: "", description: "", plan_type: "script", tenant_id: selectedTenant?.id || "", payload: "", success_threshold: 95 });

  const tenantFilter = selectedTenant?.id ? { tenant_id: selectedTenant.id } : {};

  const { data: plans = [], isLoading, refetch } = useQuery({
    queryKey: ["deployment-plans", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.DeploymentPlan.filter(tenantFilter, "-created_date", 100)
      : base44.entities.DeploymentPlan.list("-created_date", 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.DeploymentPlan.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deployment-plans"] }); setShowCreate(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DeploymentPlan.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deployment-plans"] }); setRollbackTarget(null); },
  });

  const handlePromote = (plan) => {
    const now = new Date().toISOString();
    if (plan.status === "draft") {
      updateMutation.mutate({ id: plan.id, data: { status: "pilot", current_ring: "pilot", production_started_at: null } });
    } else if (plan.current_ring === "pilot") {
      updateMutation.mutate({ id: plan.id, data: { status: "staging", current_ring: "staging", pilot_promoted_at: now } });
    } else if (plan.current_ring === "staging") {
      updateMutation.mutate({ id: plan.id, data: { status: "production", current_ring: "production", staging_promoted_at: now, production_started_at: now } });
    } else if (plan.current_ring === "production") {
      updateMutation.mutate({ id: plan.id, data: { status: "complete", completed_at: now } });
    }
  };

  const handleRollback = () => {
    updateMutation.mutate({ id: rollbackTarget.id, data: { status: "rolled_back", rollback_reason: rollbackReason } });
    setRollbackReason("");
  };

  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));

  const grouped = {
    draft:        plans.filter(p => p.status === "draft"),
    active:       plans.filter(p => ["pilot","staging","production"].includes(p.status)),
    complete:     plans.filter(p => p.status === "complete"),
    rolled_back:  plans.filter(p => p.status === "rolled_back"),
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Deployment Plans"
        subtitle="Manage staged rollouts across pilot, staging, and production rings"
        icon={GitBranch}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New Plan</Button>
          </div>
        }
      />

      {isLoading && <p className="text-sm text-slate-400">Loading plans...</p>}

      {/* Active */}
      {grouped.active.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Active Deployments ({grouped.active.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grouped.active.map(p => (
              <PlanCard key={p.id} plan={p} tenantName={tenantMap[p.tenant_id]} onPromote={handlePromote} onRollback={r => { setRollbackTarget(r); setRollbackReason(""); }} />
            ))}
          </div>
        </div>
      )}

      {/* Draft */}
      {grouped.draft.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Drafts ({grouped.draft.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grouped.draft.map(p => (
              <PlanCard key={p.id} plan={p} tenantName={tenantMap[p.tenant_id]} onPromote={handlePromote} onRollback={r => { setRollbackTarget(r); setRollbackReason(""); }} />
            ))}
          </div>
        </div>
      )}

      {/* Completed / Rolled Back */}
      {(grouped.complete.length > 0 || grouped.rolled_back.length > 0) && (
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Completed / Rolled Back</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...grouped.complete, ...grouped.rolled_back].map(p => (
              <PlanCard key={p.id} plan={p} tenantName={tenantMap[p.tenant_id]} onPromote={handlePromote} onRollback={r => { setRollbackTarget(r); setRollbackReason(""); }} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && plans.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
          <GitBranch className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No deployment plans yet</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Create a plan to manage staged rollouts across tenant rings</p>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Create First Plan</Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Deployment Plan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Plan Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Windows Defender Baseline v2" />
            </div>
            <div>
              <Label className="text-xs">Type *</Label>
              <Select value={form.plan_type} onValueChange={v => setForm(f => ({ ...f, plan_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="script">Script</SelectItem>
                  <SelectItem value="compliance_policy">Compliance Policy</SelectItem>
                  <SelectItem value="configuration_profile">Configuration Profile</SelectItem>
                  <SelectItem value="app_deployment">App Deployment</SelectItem>
                  <SelectItem value="security_baseline">Security Baseline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tenant *</Label>
              <Select value={form.tenant_id} onValueChange={v => setForm(f => ({ ...f, tenant_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="min-h-[60px]" placeholder="What does this deployment do?" />
            </div>
            <div>
              <Label className="text-xs">Success Threshold (%)</Label>
              <Input type="number" min={0} max={100} value={form.success_threshold} onChange={e => setForm(f => ({ ...f, success_threshold: Number(e.target.value) }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              disabled={!form.name || !form.tenant_id || createMutation.isPending}
              onClick={() => createMutation.mutate({ ...form, status: "draft", current_ring: "pilot" })}
            >
              Create Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback Dialog */}
      <Dialog open={!!rollbackTarget} onOpenChange={() => setRollbackTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rollback Deployment</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">Rolling back: <strong>{rollbackTarget?.name}</strong></p>
          <Textarea
            placeholder="Reason for rollback (required)..."
            value={rollbackReason}
            onChange={e => setRollbackReason(e.target.value)}
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!rollbackReason.trim() || updateMutation.isPending} onClick={handleRollback}>
              Confirm Rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}