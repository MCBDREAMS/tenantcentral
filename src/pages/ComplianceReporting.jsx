import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, Clock, HelpCircle,
  Zap, RotateCcw, Laptop, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import PageHeader from "@/components/shared/PageHeader";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const COLORS = { compliant: "#10b981", nonCompliant: "#ef4444", inGrace: "#f59e0b", unknown: "#94a3b8" };

export default function ComplianceReporting({ selectedTenant, tenants = [] }) {
  const [selectedTenantId, setSelectedTenantId] = useState(selectedTenant?.id || "");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [remediating, setRemediating] = useState({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const activeTenant = allTenants.find(t => t.id === selectedTenantId) || selectedTenant;

  const runReport = async () => {
    if (!activeTenant?.tenant_id) { setError("Please select a tenant."); return; }
    setLoading(true); setError(null); setReport(null); setBulkResult(null);
    const res = await base44.functions.invoke("tenantWrite", {
      action: "compliance_report",
      azure_tenant_id: activeTenant.tenant_id,
    });
    if (res.data.success) setReport(res.data);
    else setError(res.data.error || "Failed");
    setLoading(false);
  };

  const remediateDevice = async (deviceId, deviceName, remediationAction) => {
    setRemediating(prev => ({ ...prev, [deviceId]: remediationAction }));
    const res = await base44.functions.invoke("tenantWrite", {
      action: "remediate_device",
      azure_tenant_id: activeTenant.tenant_id,
      graph_device_id: deviceId,
      remediation_action: remediationAction,
    });
    setRemediating(prev => { const n = { ...prev }; delete n[deviceId]; return n; });
    if (!res.data.success) setError(res.data.error || "Remediation failed");
    else await runReport();
  };

  const bulkSync = async () => {
    if (!activeTenant?.tenant_id) return;
    setBulkLoading(true); setBulkResult(null);
    const res = await base44.functions.invoke("tenantWrite", {
      action: "bulk_sync_noncompliant",
      azure_tenant_id: activeTenant.tenant_id,
    });
    setBulkResult(res.data);
    setBulkLoading(false);
  };

  const pieData = report ? [
    { name: "Compliant", value: report.stats.compliant, color: COLORS.compliant },
    { name: "Non-Compliant", value: report.stats.nonCompliant, color: COLORS.nonCompliant },
    { name: "In Grace Period", value: report.stats.inGrace, color: COLORS.inGrace },
    { name: "Unknown", value: report.stats.unknown, color: COLORS.unknown },
  ].filter(d => d.value > 0) : [];

  const osGroups = report?.devices?.reduce((acc, d) => {
    const os = d.operatingSystem || "Unknown";
    if (!acc[os]) acc[os] = { compliant: 0, nonCompliant: 0 };
    if (d.complianceState === "compliant") acc[os].compliant++;
    else acc[os].nonCompliant++;
    return acc;
  }, {});

  const barData = osGroups ? Object.entries(osGroups).map(([os, v]) => ({ os, ...v })) : [];

  const nonCompliantDevices = report?.devices?.filter(d => d.complianceState === "noncompliant") || [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Compliance Reporting"
        subtitle="Real-time device compliance reporting with automated remediation workflows"
        icon={ShieldCheck}
        actions={
          <div className="flex gap-2 items-center">
            <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select tenant..." />
              </SelectTrigger>
              <SelectContent>
                {allTenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={runReport} disabled={loading || !selectedTenantId} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {loading ? "Loading…" : "Run Report"}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {bulkResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
          <CheckCircle2 className="inline h-4 w-4 mr-1" />
          Bulk sync complete: <strong>{bulkResult.synced}</strong> devices synced, <strong>{bulkResult.failed}</strong> failed out of {bulkResult.total} non-compliant.
        </div>
      )}

      {report && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Compliant", value: report.stats.compliant, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
              { label: "Non-Compliant", value: report.stats.nonCompliant, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
              { label: "In Grace Period", value: report.stats.inGrace, icon: Clock, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
              { label: "Unknown", value: report.stats.unknown, icon: HelpCircle, color: "text-slate-500", bg: "bg-slate-50 border-slate-200" },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-600">{s.label}</span>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{Math.round((s.value / report.stats.total) * 100) || 0}% of {report.stats.total}</p>
              </div>
            ))}
          </div>

          {/* Compliance % bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 text-sm">Overall Compliance Rate</h3>
              <span className="text-2xl font-bold text-emerald-600">
                {Math.round((report.stats.compliant / report.stats.total) * 100) || 0}%
              </span>
            </div>
            <Progress
              value={Math.round((report.stats.compliant / report.stats.total) * 100) || 0}
              className="h-3"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="font-semibold text-slate-800 text-sm mb-4">Compliance Distribution</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    {d.name} ({d.value})
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="font-semibold text-slate-800 text-sm mb-4">Compliance by OS</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="os" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="compliant" fill="#10b981" radius={[3,3,0,0]} name="Compliant" />
                  <Bar dataKey="nonCompliant" fill="#ef4444" radius={[3,3,0,0]} name="Non-Compliant" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Non-Compliant Devices + Remediation */}
          {nonCompliantDevices.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm">Non-Compliant Devices</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{nonCompliantDevices.length} device(s) require attention</p>
                </div>
                <Button
                  onClick={bulkSync}
                  disabled={bulkLoading}
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5 text-xs"
                >
                  {bulkLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  Bulk Sync All
                </Button>
              </div>
              <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                {nonCompliantDevices.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-3">
                    <Laptop className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{d.deviceName}</p>
                      <p className="text-xs text-slate-400 truncate">{d.userPrincipalName || "No user"} · {d.operatingSystem}</p>
                    </div>
                    <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs shrink-0">Non-Compliant</Badge>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={!!remediating[d.id]}
                        onClick={() => remediateDevice(d.id, d.deviceName, "sync")}
                      >
                        {remediating[d.id] === "sync" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Sync
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!report && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-14 text-center">
          <ShieldCheck className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="font-semibold text-slate-600 mb-2">No Report Generated</h3>
          <p className="text-sm text-slate-400">Select a tenant and click "Run Report" to fetch real-time compliance data.</p>
        </div>
      )}
    </div>
  );
}