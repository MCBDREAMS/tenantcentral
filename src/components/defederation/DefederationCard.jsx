import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, Unlink, ShieldCheck, FileSearch, FlaskConical,
  RefreshCw, Rocket, AlertTriangle, ChevronDown, ChevronRight, Lock, CheckCircle2
} from "lucide-react";

const safeParse = (s, fallback) => {
  try { return JSON.parse(s); } catch { return fallback; }
};

const STATUS_LABEL = {
  not_scanned: "Not Scanned",
  detected: "Detected",
  analyzing: "Analyzing…",
  analyzed: "Analyzed",
  dry_run: "Dry Run",
  issues_pending: "Issues Pending",
  ready: "Ready to Execute",
  executing: "Executing…",
  completed: "Completed",
  failed: "Failed",
  not_federated: "Not Federated"
};

export default function DefederationCard({ tenant, job, onRefresh }) {
  const [busy, setBusy] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showDryRun, setShowDryRun] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const run = async (action, extra = {}) => {
    setBusy(action);
    try {
      await base44.functions.invoke("godaddyDefederation", {
        action, tenant_id: tenant.id, azure_tenant_id: tenant.tenant_id, ...extra
      });
      await onRefresh();
    } catch (e) {
      alert(`${action} failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const status = job?.status || "not_scanned";
  const linked = job?.is_godaddy_linked;
  const fedDomains = safeParse(job?.federated_domains, []);
  const analysis = safeParse(job?.analysis_report, null);
  const dryRun = safeParse(job?.dry_run_report, null);
  const execLog = safeParse(job?.execution_log, null);
  const failurePoints = safeParse(job?.failure_points, []);
  const blockingCount = failurePoints.filter(f => f.severity === "critical").length;

  const fedBadge = status === "not_scanned" ? "secondary"
    : linked ? "destructive"
    : status === "not_federated" ? "secondary"
    : "outline";

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${linked ? "bg-rose-50" : "bg-slate-100"}`}>
            {linked ? <Unlink className="h-4 w-4 text-rose-600" /> : <ShieldCheck className="h-4 w-4 text-slate-500" />}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 text-sm truncate">{tenant.name}</div>
            <div className="text-xs text-slate-400 truncate">{tenant.domain} · {tenant.tenant_id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={fedBadge} className="text-[10px]">
            {linked ? "GoDaddy Federated" : status === "not_federated" ? "Not Federated" : status === "not_scanned" ? "Unknown" : "Third-Party Federated"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[status] || status}</Badge>
        </div>
      </div>

      {/* Federated domains */}
      {fedDomains.length > 0 && (
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-2">
          {fedDomains.map((f, i) => (
            <div key={i} className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1">
              <span className="font-medium text-slate-700">{f.domain}</span>
              {f.isGodaddy && <span className="ml-2 text-rose-600">GoDaddy</span>}
              <span className="ml-2 text-slate-400">{f.issuerUri || "no issuer"}</span>
            </div>
          ))}
        </div>
      )}

      {/* Failure points summary */}
      {failurePoints.length > 0 && (
        <div className={`px-5 py-3 border-b border-slate-100 ${blockingCount > 0 ? "bg-rose-50" : "bg-amber-50"}`}>
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className={`h-3.5 w-3.5 ${blockingCount > 0 ? "text-rose-600" : "text-amber-600"}`} />
            <span className={blockingCount > 0 ? "text-rose-700 font-medium" : "text-amber-700 font-medium"}>
              {blockingCount > 0 ? `${blockingCount} blocking issue(s) — must resolve before execute` : `${failurePoints.length} warning(s) from dry run`}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => run("detect")} disabled={busy !== null} className="gap-1.5">
          {busy === "detect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Check Federation
        </Button>
        {linked !== false && status !== "not_federated" && (
          <>
            <Button size="sm" variant="outline" onClick={() => run("analyze")} disabled={busy !== null || !fedDomains.length} className="gap-1.5">
              {busy === "analyze" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />}
              Analyze
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("dry_run")} disabled={busy !== null || !analysis} className="gap-1.5">
              {busy === "dry_run" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
              Dry Run
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("reanalyze")} disabled={busy !== null || !analysis} className="gap-1.5">
              {busy === "reanalyze" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Re-analyze
            </Button>
            {status !== "ready" && (
              <Button size="sm" variant="outline" onClick={() => run("mark_resolved")} disabled={busy !== null} className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark Issues Resolved
              </Button>
            )}
            <Button size="sm" onClick={() => {
              if (!confirm("This will convert federated domains to managed and reset passwords. Continue?")) return;
              run("execute");
            }} disabled={busy !== null || status !== "ready"} className="gap-1.5 bg-rose-600 hover:bg-rose-700">
              {busy === "execute" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              Execute Defederation
            </Button>
          </>
        )}
      </div>

      {/* Reports */}
      {analysis && (
        <div className="border-t border-slate-100">
          <button onClick={() => setShowAnalysis(!showAnalysis)} className="w-full px-5 py-2 flex items-center gap-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
            {showAnalysis ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Analysis Report ({analysis.federated_user_count || 0} federated users, {analysis.globalAdmins || 0} global admins)
          </button>
          {showAnalysis && (
            <div className="px-5 py-3 text-xs text-slate-600 bg-slate-50 space-y-1">
              <div>.onmicrosoft.com admins: <span className="font-medium">{(analysis.onMicrosoftAdmins || []).join(", ") || "none found"}</span></div>
              <div>On-prem synced users: {analysis.syncedUsers || 0} · App registrations: {analysis.appRegistrations || 0}</div>
              {(analysis.flags || []).map((f, i) => (
                <div key={i} className={`mt-1 p-2 rounded ${f.severity === "critical" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                  <span className="font-medium">{f.area}:</span> {f.detail} — <em>{f.recommendation}</em>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {dryRun && (
        <div className="border-t border-slate-100">
          <button onClick={() => setShowDryRun(!showDryRun)} className="w-full px-5 py-2 flex items-center gap-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
            {showDryRun ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Dry Run Report — {(dryRun.failure_points || []).length} failure points · {dryRun.canProceed ? "ready" : "blocking"}
          </button>
          {showDryRun && (
            <div className="px-5 py-3 text-xs bg-slate-50 space-y-1">
              {(dryRun.failure_points || []).map((f, i) => (
                <div key={i} className={`p-2 rounded ${f.severity === "critical" ? "bg-rose-100 text-rose-700" : f.severity === "high" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>
                  <span className="font-medium">{f.severity.toUpperCase()} · {f.area}:</span> {f.detail} — <em>{f.recommendation}</em>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {execLog && (
        <div className="border-t border-slate-100">
          <button onClick={() => setShowLog(!showLog)} className="w-full px-5 py-2 flex items-center gap-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
            {showLog ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Lock className="h-3.5 w-3.5" /> Execution Log ({(execLog.log || []).length} entries)
          </button>
          {showLog && (
            <div className="px-5 py-3 text-xs bg-slate-50 max-h-64 overflow-auto">
              <div className="mb-2 text-slate-500">Domains: {JSON.stringify(execLog.verify || [])}</div>
              <div className="mb-2 text-slate-500">pwd set {execLog.pwdSet} fail {execLog.pwdFail} · domains ok {execLog.domOk} fail {execLog.domFail} · immutable cleared {execLog.immCleared} fail {execLog.immFail}</div>
              <pre className="whitespace-pre-wrap text-[10px] text-slate-600">{JSON.stringify(execLog.log || [], null, 0)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}