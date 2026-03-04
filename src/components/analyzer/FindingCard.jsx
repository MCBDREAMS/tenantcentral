import React, { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, AlertCircle, Info, Wrench, Loader2, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";

const severityConfig = {
  critical: { color: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500", icon: AlertCircle, iconColor: "text-red-500" },
  high:     { color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500", icon: AlertTriangle, iconColor: "text-orange-500" },
  medium:   { color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500", icon: AlertTriangle, iconColor: "text-amber-500" },
  info:     { color: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400", icon: Info, iconColor: "text-slate-400" },
};

const statusConfig = {
  pass: { border: "border-l-emerald-500", bg: "bg-emerald-50/50", icon: CheckCircle2, iconColor: "text-emerald-500" },
  fail: { border: "border-l-red-500", bg: "bg-red-50/40", icon: AlertCircle, iconColor: "text-red-500" },
  warn: { border: "border-l-amber-500", bg: "bg-amber-50/40", icon: AlertTriangle, iconColor: "text-amber-500" },
};

export default function FindingCard({ finding, azureTenantId, onRemediated }) {
  const [expanded, setExpanded] = useState(false);
  const [remediating, setRemediating] = useState(false);
  const [remediationResult, setRemediationResult] = useState(null);

  const sc = severityConfig[finding.severity] || severityConfig.info;
  const st = statusConfig[finding.status] || statusConfig.warn;
  const StatusIcon = st.icon;

  const handleRemediate = async () => {
    if (!window.confirm(`Apply remediation: "${finding.remediation_label}"?\n\nThis will make changes to your Azure tenant. Policies will be created in Report-Only mode for safety.`)) return;
    setRemediating(true);
    try {
      const res = await base44.functions.invoke("tenantRemediate", {
        remediation_action: finding.remediation_action,
        azure_tenant_id: azureTenantId,
        finding_id: finding.id
      });
      setRemediationResult({ success: true, message: res.data?.message || "Remediation applied successfully." });
      if (onRemediated) onRemediated(finding.id);
    } catch (err) {
      setRemediationResult({ success: false, message: err.message });
    } finally {
      setRemediating(false);
    }
  };

  return (
    <div className={`border-l-4 ${st.border} rounded-r-xl border border-slate-200 ${st.bg} overflow-hidden`}>
      <button
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/60 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon className={`h-4 w-4 mt-0.5 shrink-0 ${st.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800">{finding.title}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sc.color} border`}>
              {finding.severity}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-200">
              {finding.category}
            </Badge>
          </div>
        </div>
        <div className="shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-200/60">
          <div className="pt-3">
            <p className="text-xs text-slate-600 leading-relaxed">{finding.description}</p>
          </div>
          {finding.recommendation && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-[11px] font-semibold text-blue-700 mb-1">Recommendation</p>
              <p className="text-xs text-blue-800 leading-relaxed">{finding.recommendation}</p>
            </div>
          )}
          {finding.standard && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400">Standard:</span>
              <span className="text-[10px] text-slate-600 font-medium">{finding.standard}</span>
            </div>
          )}

          {remediationResult && (
            <div className={`rounded-lg p-3 text-xs ${remediationResult.success ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
              {remediationResult.success ? <CheckCheck className="inline h-3 w-3 mr-1" /> : null}
              {remediationResult.message}
            </div>
          )}

          {finding.remediation_action && !remediationResult?.success && (
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs gap-1.5"
              onClick={handleRemediate}
              disabled={remediating}
            >
              {remediating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
              {remediating ? "Applying..." : finding.remediation_label || "Remediate"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}