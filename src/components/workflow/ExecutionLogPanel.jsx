import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { X, CheckCircle2, XCircle, AlertTriangle, Monitor, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

function fmt(v) {
  if (!v) return "—";
  try { return format(new Date(v), "dd MMM yyyy HH:mm:ss"); } catch { return v; }
}

const STATUS_STYLE = {
  success: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  running: "bg-blue-100 text-blue-700",
};

export default function ExecutionLogPanel({ rule, onClose }) {
  const [expanded, setExpanded] = useState(null);

  const { data: executions = [], isLoading } = useQuery({
    queryKey: ["workflow_executions", rule.id],
    queryFn: () => base44.entities.WorkflowExecution.filter({ rule_id: rule.id }),
    select: (d) => [...d].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)),
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-900">
          <div>
            <h2 className="text-white font-semibold">Execution History</h2>
            <p className="text-xs text-slate-400 mt-0.5">{rule.name}</p>
          </div>
          <Button size="icon" variant="ghost" className="text-slate-400 hover:text-white" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
          {!isLoading && executions.length === 0 && (
            <div className="text-center py-16 text-slate-400 text-sm">No executions yet</div>
          )}
          {executions.map((exec) => {
            const log = exec.execution_log ? JSON.parse(exec.execution_log) : [];
            const isExpanded = expanded === exec.id;
            return (
              <div key={exec.id} className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isExpanded ? null : exec.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
                >
                  <div className="flex items-center gap-3">
                    <Badge className={`${STATUS_STYLE[exec.status] || "bg-slate-100 text-slate-500"} border-0 text-xs`}>
                      {exec.status}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{fmt(exec.created_date)}</p>
                      <p className="text-xs text-slate-400">
                        {exec.devices_matched} matched · {exec.actions_executed} actions · {exec.actions_failed} failed
                      </p>
                    </div>
                  </div>
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 p-3 space-y-2 max-h-80 overflow-y-auto">
                    {log.length === 0 && <p className="text-xs text-slate-400">No device-level log</p>}
                    {log.map((entry, i) => (
                      <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <Monitor className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-sm font-medium text-slate-800">{entry.deviceName}</span>
                        </div>
                        {entry.actions?.map((a, j) => (
                          <div key={j} className="flex items-center gap-2 ml-5 text-xs">
                            {a.status === "success"
                              ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                              : a.status === "skipped"
                              ? <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                              : <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                            <span className="text-slate-600">{a.action?.replace(/_/g, " ")}</span>
                            {a.error && <span className="text-red-500 truncate">{a.error}</span>}
                            {a.note && <span className="text-amber-600 truncate">{a.note}</span>}
                          </div>
                        ))}
                      </div>
                    ))}
                    {exec.error && (
                      <div className="flex items-center gap-2 p-2 bg-red-50 rounded text-xs text-red-700">
                        <XCircle className="h-3.5 w-3.5 shrink-0" />{exec.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}