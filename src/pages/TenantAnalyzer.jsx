import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, Play, RefreshCw, Filter, AlertCircle, CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/shared/PageHeader";
import ScoreGauge from "@/components/analyzer/ScoreGauge";
import SummaryBar from "@/components/analyzer/SummaryBar";
import FindingCard from "@/components/analyzer/FindingCard";

const CATEGORIES = ["All", "Identity", "Privileged Access", "Devices", "Applications", "Overall"];
const STATUSES = ["All", "fail", "warn", "pass"];

export default function TenantAnalyzer({ selectedTenant, tenants = [] }) {
  const [findings, setFindings] = useState([]);
  const [score, setScore] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTenantId, setSelectedTenantId] = useState(selectedTenant?.id || "");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [remediatedIds, setRemediatedIds] = useState(new Set());

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const activeTenant = allTenants.find(t => t.id === selectedTenantId) || selectedTenant;

  const runAnalysis = async () => {
    if (!activeTenant?.tenant_id) {
      setError("Please select a tenant with a valid Azure Tenant ID.");
      return;
    }
    setLoading(true);
    setError(null);
    setFindings([]);
    setScore(null);
    setSummary(null);
    setRemediatedIds(new Set());

    try {
      const res = await base44.functions.invoke("tenantAnalyzer", {
        action: "analyze",
        azure_tenant_id: activeTenant.tenant_id
      });
      const data = res.data;
      if (!data.success) throw new Error(data.error || "Analysis failed");
      setFindings(data.findings || []);
      setScore(data.score ?? null);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredFindings = findings.filter(f => {
    const catMatch = filterCategory === "All" || f.category === filterCategory;
    const stMatch = filterStatus === "All" || f.status === filterStatus;
    return catMatch && stMatch;
  });

  const failCount = findings.filter(f => f.status === "fail").length;
  const warnCount = findings.filter(f => f.status === "warn").length;
  const remediableFindings = filteredFindings.filter(f => f.remediation_action && !remediatedIds.has(f.id));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Tenant Security Analyser"
        subtitle="Analyse Microsoft 365 & Entra ID against Microsoft Best Practices and CIS Benchmarks"
        icon={ShieldCheck}
      />

      {/* Tenant selector + run */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Select Tenant to Analyse</label>
            <Select
              value={selectedTenantId}
              onValueChange={setSelectedTenantId}
            >
              <SelectTrigger className="w-full max-w-sm">
                <SelectValue placeholder="Choose a tenant..." />
              </SelectTrigger>
              <SelectContent>
                {allTenants.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.domain ? `(${t.domain})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeTenant?.tenant_id && (
              <p className="text-[11px] text-slate-400 mt-1">Azure Tenant ID: {activeTenant.tenant_id}</p>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <Button
              onClick={runAnalysis}
              disabled={loading || !selectedTenantId}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {loading ? "Analysing…" : "Run Analysis"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Results */}
      {score !== null && (
        <>
          {/* Score + Summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex flex-col items-center gap-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Hardening Score</p>
                <ScoreGauge score={score} />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {activeTenant?.name} — Security Posture Report
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Compared against Microsoft Best Practices & CIS Microsoft 365 Foundations Benchmark v2.0
                  </p>
                </div>
                <SummaryBar summary={summary} />
                {(failCount > 0 || warnCount > 0) && (
                  <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <AlertTriangle className="inline h-3 w-3 text-amber-500 mr-1" />
                    <strong>{failCount} failed</strong> and <strong>{warnCount} warnings</strong> found.
                    Expand each finding below for remediation options.
                  </div>
                )}
                {failCount === 0 && warnCount === 0 && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                    <CheckCircle2 className="inline h-3 w-3 text-emerald-500 mr-1" />
                    All checks passed — excellent security posture!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <Filter className="h-4 w-4 text-slate-400" />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c === "All" ? "All Categories" : c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => (
                  <SelectItem key={s} value={s}>
                    {s === "All" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-slate-400 ml-auto">
              {filteredFindings.length} of {findings.length} findings
            </span>
          </div>

          {/* Findings grouped by status */}
          {["fail", "warn", "pass"].map(status => {
            const group = filteredFindings.filter(f => f.status === status);
            if (group.length === 0) return null;
            const labels = { fail: "Failed Checks", warn: "Warnings", pass: "Passed Checks" };
            const colors = { fail: "text-red-600", warn: "text-amber-600", pass: "text-emerald-600" };
            return (
              <div key={status} className="space-y-2">
                <h4 className={`text-xs font-bold uppercase tracking-wider ${colors[status]} flex items-center gap-2`}>
                  {labels[status]}
                  <span className="rounded-full bg-slate-200 text-slate-600 px-2 py-0.5 text-[10px] font-semibold">{group.length}</span>
                </h4>
                <div className="space-y-2">
                  {group.map(f => (
                    <FindingCard
                      key={f.id}
                      finding={f}
                      azureTenantId={activeTenant?.tenant_id}
                      onRemediated={(id) => setRemediatedIds(prev => new Set([...prev, id]))}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Empty state */}
      {findings.length === 0 && !loading && score === null && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <ShieldCheck className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="font-semibold text-slate-600 mb-2">No Analysis Run Yet</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Select a tenant and click "Run Analysis" to check your Microsoft 365 security posture against industry standards and Microsoft best practices.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-400">
            {["MFA Coverage", "Legacy Auth Block", "Admin Role Hygiene", "Sign-in Risk Policies", "App Credential Expiry", "Guest User Review", "Secure Score", "Named Locations"].map(c => (
              <span key={c} className="bg-slate-100 rounded-full px-3 py-1">{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}