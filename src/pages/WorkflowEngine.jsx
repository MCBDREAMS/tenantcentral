import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Plus, Play, Trash2, Pencil, History, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Power, PowerOff, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import RuleEditor from "@/components/workflow/RuleEditor";
import ExecutionLogPanel from "@/components/workflow/ExecutionLogPanel";
import { ACTION_TYPES } from "@/components/workflow/ActionBuilder";
import { format } from "date-fns";

function fmt(v) {
  if (!v) return "Never";
  try { return format(new Date(v), "dd MMM yyyy HH:mm"); } catch { return v; }
}

const STATUS_STYLE = {
  success: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  never: "bg-slate-100 text-slate-500",
};

export default function WorkflowEngine({ selectedTenant, tenants = [] }) {
  const [editorRule, setEditorRule] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [historyRule, setHistoryRule] = useState(null);
  const [runningRules, setRunningRules] = useState({});
  const [runResults, setRunResults] = useState({});
  const qc = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["workflow_rules", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.WorkflowRule.filter({ tenant_id: selectedTenant.id })
      : base44.entities.WorkflowRule.list(),
    select: (d) => [...d].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const scopedTenants = selectedTenant ? [selectedTenant] : allTenants;

  const getTenantName = (id) => allTenants.find(t => t.id === id)?.name || id;

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.WorkflowRule.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflow_rules"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WorkflowRule.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflow_rules"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.WorkflowRule.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflow_rules"] }),
  });

  const handleSave = async (formData) => {
    if (editorRule?.id) {
      await updateMutation.mutateAsync({ id: editorRule.id, data: formData });
    } else {
      await createMutation.mutateAsync(formData);
    }
    setShowEditor(false);
    setEditorRule(null);
  };

  const handleRun = async (rule) => {
    setRunningRules(r => ({ ...r, [rule.id]: true }));
    setRunResults(r => ({ ...r, [rule.id]: null }));
    try {
      const res = await base44.functions.invoke("workflowEngine", {
        action: "execute_rule",
        rule_id: rule.id,
      });
      setRunResults(r => ({ ...r, [rule.id]: res.data }));
      qc.invalidateQueries({ queryKey: ["workflow_rules"] });
    } catch (e) {
      setRunResults(r => ({ ...r, [rule.id]: { error: e.message } }));
    } finally {
      setRunningRules(r => ({ ...r, [rule.id]: false }));
    }
  };

  const handleToggle = async (rule) => {
    await updateMutation.mutateAsync({ id: rule.id, data: { is_active: !rule.is_active } });
  };

  const handleDelete = async (rule) => {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;
    await deleteMutation.mutateAsync(rule.id);
  };

  // Parse conditions/actions for display
  const parseConditions = (rule) => {
    try { return JSON.parse(rule.conditions || "[]"); } catch { return []; }
  };
  const parseActions = (rule) => {
    try { return JSON.parse(rule.actions || "[]"); } catch { return []; }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <PageHeader
        title="Workflow Engine"
        subtitle="Define conditional rules to automate device remediation across Intune & Entra"
        icon={Zap}
        actions={
          <Button onClick={() => { setEditorRule(null); setShowEditor(true); }} className="bg-slate-900 hover:bg-slate-800 gap-2">
            <Plus className="h-4 w-4" /> New Rule
          </Button>
        }
      />

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{rules.length}</p>
          <p className="text-xs text-slate-500 mt-1">Total Rules</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700">{rules.filter(r => r.is_active).length}</p>
          <p className="text-xs text-emerald-600 mt-1">Active Rules</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-700">{rules.reduce((s, r) => s + (r.run_count || 0), 0)}</p>
          <p className="text-xs text-slate-500 mt-1">Total Executions</p>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto" />
        </div>
      )}

      {!isLoading && rules.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl">
          <Zap className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No workflow rules yet</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">Create rules to automate device remediation</p>
          <Button onClick={() => { setEditorRule(null); setShowEditor(true); }} className="bg-slate-900 hover:bg-slate-800 gap-2">
            <Plus className="h-4 w-4" /> Create First Rule
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {rules.map((rule) => {
          const conditions = parseConditions(rule);
          const actions = parseActions(rule);
          const running = runningRules[rule.id];
          const result = runResults[rule.id];

          return (
            <div key={rule.id} className={`bg-white border rounded-2xl overflow-hidden transition-all ${rule.is_active ? "border-slate-200" : "border-slate-100 opacity-60"}`}>
              {/* Header */}
              <div className="flex items-start justify-between p-5 pb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${rule.is_active ? "bg-blue-50" : "bg-slate-100"}`}>
                    <Zap className={`h-4 w-4 ${rule.is_active ? "text-blue-600" : "text-slate-400"}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-900">{rule.name}</h3>
                      <Badge className={`${rule.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"} border-0 text-[10px]`}>
                        {rule.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {rule.last_run_status && rule.last_run_status !== "never" && (
                        <Badge className={`${STATUS_STYLE[rule.last_run_status]} border-0 text-[10px]`}>
                          Last: {rule.last_run_status}
                        </Badge>
                      )}
                    </div>
                    {rule.description && <p className="text-xs text-slate-500 mt-0.5">{rule.description}</p>}
                    <p className="text-xs text-slate-400 mt-1">
                      Tenant: <span className="font-medium text-slate-600">{getTenantName(rule.tenant_id)}</span>
                      {" · "}
                      <Clock className="h-3 w-3 inline" /> {fmt(rule.last_run)}
                      {rule.run_count > 0 && ` · ${rule.run_count} run${rule.run_count !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-3">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Execution history" onClick={() => setHistoryRule(rule)}>
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title={rule.is_active ? "Deactivate" : "Activate"} onClick={() => handleToggle(rule)}>
                    {rule.is_active ? <PowerOff className="h-3.5 w-3.5 text-amber-500" /> : <Power className="h-3.5 w-3.5 text-emerald-500" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditorRule(rule); setShowEditor(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(rule)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Conditions + Actions summary */}
              <div className="px-5 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Conditions ({rule.condition_logic === "any" ? "ANY" : "ALL"})</p>
                  <div className="space-y-1">
                    {conditions.slice(0, 3).map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span className="font-mono text-slate-400">{i === 0 ? "IF" : rule.condition_logic === "any" ? "OR" : "AND"}</span>
                        <span className="font-medium">{c.field}</span>
                        <span className="text-slate-400">{c.operator?.replace(/_/g, " ")}</span>
                        <span className="text-blue-600">{c.value || ""}</span>
                      </div>
                    ))}
                    {conditions.length > 3 && <p className="text-xs text-slate-400">+{conditions.length - 3} more</p>}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Actions</p>
                  <div className="space-y-1">
                    {actions.slice(0, 4).map((a, i) => {
                      const meta = ACTION_TYPES.find(x => x.value === a.type);
                      return (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="font-mono text-slate-400">THEN</span>
                          <span>{meta?.icon}</span>
                          <span>{meta?.label || a.type}</span>
                        </div>
                      );
                    })}
                    {actions.length > 4 && <p className="text-xs text-slate-400">+{actions.length - 4} more</p>}
                  </div>
                </div>
              </div>

              {/* Run result feedback */}
              {result && (
                <div className={`mx-5 mb-3 p-3 rounded-xl text-xs flex items-start gap-2 ${result.error ? "bg-red-50 border border-red-200 text-red-700" : result.status === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
                  {result.error
                    ? <><XCircle className="h-4 w-4 shrink-0" />{result.error}</>
                    : <><CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>Evaluated <strong>{result.devices_evaluated}</strong> devices · <strong>{result.devices_matched}</strong> matched · <strong>{result.actions_executed}</strong> actions executed{result.actions_failed > 0 ? `, ${result.actions_failed} failed` : ""}</span>
                    </>
                  }
                </div>
              )}

              {/* Footer run button */}
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                {rule.last_run_summary && (
                  <p className="text-xs text-slate-400 truncate max-w-xs">{rule.last_run_summary}</p>
                )}
                {!rule.last_run_summary && <span />}
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shrink-0"
                  disabled={running || !rule.is_active}
                  onClick={() => handleRun(rule)}
                >
                  {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {running ? "Running…" : "Run Now"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rule Editor Modal */}
      {showEditor && (
        <RuleEditor
          rule={editorRule}
          tenants={scopedTenants}
          onSave={handleSave}
          onClose={() => { setShowEditor(false); setEditorRule(null); }}
        />
      )}

      {/* Execution History Panel */}
      {historyRule && (
        <ExecutionLogPanel rule={historyRule} onClose={() => setHistoryRule(null)} />
      )}
    </div>
  );
}