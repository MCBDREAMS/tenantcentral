import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Building2, Users, Shield, MonitorSmartphone,
  ShieldCheck, AlertTriangle, CheckCircle2, TrendingUp, Laptop
} from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import GraphSyncPanel from "@/components/sync/GraphSyncPanel";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Progress } from "@/components/ui/progress";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Badge } from "@/components/ui/badge";

export default function Dashboard({ selectedTenant, tenants }) {
  const tenantFilter = selectedTenant?.id ? { tenant_id: selectedTenant.id } : {};

  const { data: allTenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: () => base44.entities.Tenant.list() });
  const { data: policies = [] } = useQuery({
    queryKey: ['entra-policies', selectedTenant?.id],
    queryFn: () => selectedTenant?.id ? base44.entities.EntraPolicy.filter(tenantFilter) : base44.entities.EntraPolicy.list(),
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ['intune-profiles', selectedTenant?.id],
    queryFn: () => selectedTenant?.id ? base44.entities.IntuneProfile.filter(tenantFilter) : base44.entities.IntuneProfile.list(),
  });
  const { data: baselines = [] } = useQuery({
    queryKey: ['baselines', selectedTenant?.id],
    queryFn: () => selectedTenant?.id ? base44.entities.SecurityBaseline.filter(tenantFilter) : base44.entities.SecurityBaseline.list(),
  });
  const { data: devices = [] } = useQuery({
    queryKey: ['devices', selectedTenant?.id],
    queryFn: () => selectedTenant?.id ? base44.entities.IntuneDevice.filter(tenantFilter) : base44.entities.IntuneDevice.list(),
  });
  const { data: users = [] } = useQuery({
    queryKey: ['entra-users', selectedTenant?.id],
    queryFn: () => selectedTenant?.id ? base44.entities.EntraUser.filter(tenantFilter) : base44.entities.EntraUser.list(),
  });

  const compliantDevices = devices.filter(d => d.compliance_state === 'compliant').length;
  const nonCompliantDevices = devices.filter(d => d.compliance_state === 'non_compliant').length;
  const enabledPolicies = policies.filter(p => p.state === 'enabled').length;
  const reportOnlyPolicies = policies.filter(p => p.state === 'report_only').length;
  const disabledPolicies = policies.filter(p => p.state === 'disabled').length;
  const compliancePct = devices.length > 0 ? Math.round((compliantDevices / devices.length) * 100) : 0;
  const connectedTenants = allTenants.filter(t => t.status === 'connected').length;

  const devicePieData = devices.length > 0 ? [
    { name: "Compliant", value: compliantDevices, color: "#10b981" },
    { name: "Non-Compliant", value: nonCompliantDevices, color: "#ef4444" },
    { name: "Other", value: devices.length - compliantDevices - nonCompliantDevices, color: "#94a3b8" },
  ].filter(d => d.value > 0) : [];

  const policyPieData = policies.length > 0 ? [
    { name: "Enabled", value: enabledPolicies, color: "#10b981" },
    { name: "Report Only", value: reportOnlyPolicies, color: "#3b82f6" },
    { name: "Disabled", value: disabledPolicies, color: "#94a3b8" },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        subtitle={selectedTenant ? `Overview for ${selectedTenant.name}` : "Cross-tenant overview"}
        icon={LayoutDashboard}
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Tenants" value={`${connectedTenants}/${allTenants.length}`} icon={Building2} color="blue" subtitle="connected" />
        <StatCard label="Entra Users" value={users.length} icon={Users} color="violet" subtitle={`${users.filter(u => u.mfa_status === 'enabled' || u.mfa_status === 'enforced').length} MFA enabled`} />
        <StatCard label="CA Policies" value={policies.length} icon={Shield} color="emerald" subtitle={`${enabledPolicies} enabled`} />
        <StatCard label="Devices" value={devices.length} icon={MonitorSmartphone} color="cyan" subtitle={`${compliancePct}% compliant`} />
      </div>

      {/* Compliance Insight Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Device Compliance Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800 text-sm">Device Compliance</h3>
            <Link to={createPageUrl("ComplianceReporting")} className="text-xs text-blue-600 hover:underline">Full Report →</Link>
          </div>
          {devices.length > 0 ? (
            <>
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold text-emerald-600">{compliancePct}%</div>
                <div className="flex-1">
                  <Progress value={compliancePct} className="h-2 mb-2" />
                  <div className="flex justify-between text-xs text-slate-500">
                    <span className="text-emerald-600">{compliantDevices} compliant</span>
                    <span className="text-red-500">{nonCompliantDevices} non-compliant</span>
                  </div>
                </div>
              </div>
              {nonCompliantDevices > 0 && (
                <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-2.5 flex gap-2 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span><strong>{nonCompliantDevices}</strong> device(s) need attention. <Link to={createPageUrl("ComplianceReporting")} className="underline">Remediate →</Link></span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">No device data — run a sync</p>
          )}
        </div>

        {/* Policy Chart */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-slate-800 text-sm">CA Policy States</h3>
            <Link to={createPageUrl("EntraPolicies")} className="text-xs text-blue-600 hover:underline">Manage →</Link>
          </div>
          {policyPieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={90} height={90}>
                <PieChart>
                  <Pie data={policyPieData} cx="50%" cy="50%" innerRadius={25} outerRadius={40} dataKey="value" paddingAngle={2}>
                    {policyPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {policyPieData.map(d => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-slate-600">{d.name}</span>
                    <span className="font-semibold text-slate-800 ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 mt-2">No policy data</p>
          )}
        </div>

        {/* Device OS Breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800 text-sm">Device OS Breakdown</h3>
            <Link to={createPageUrl("IntuneDevices")} className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>
          {devices.length > 0 ? (() => {
            const osCounts = devices.reduce((acc, d) => { acc[d.os] = (acc[d.os] || 0) + 1; return acc; }, {});
            return Object.entries(osCounts).slice(0, 4).map(([os, count]) => (
              <div key={os} className="flex items-center gap-2 mb-2">
                <span className="text-xs text-slate-600 w-24 truncate">{os}</span>
                <div className="flex-1">
                  <Progress value={(count / devices.length) * 100} className="h-1.5" />
                </div>
                <span className="text-xs font-semibold text-slate-700 w-6 text-right">{count}</span>
              </div>
            ));
          })() : <p className="text-sm text-slate-400">No device data</p>}
        </div>
      </div>

      <div className="mb-6">
        <GraphSyncPanel selectedTenant={selectedTenant} tenants={tenants} />
      </div>

      {/* Security Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Baselines compliance summary */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Security Baselines</h3>
            <Link to={createPageUrl("SecurityBaselines")} className="text-xs text-blue-600 hover:underline">Manage →</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {baselines.slice(0, 5).map(b => {
              const total = (b.compliant_devices || 0) + (b.non_compliant_devices || 0);
              const pct = total > 0 ? Math.round((b.compliant_devices / total) * 100) : 0;
              return (
                <div key={b.id} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium text-slate-800 truncate max-w-[200px]">{b.baseline_name}</p>
                    <StatusBadge status={b.state} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={pct} className="h-1.5 flex-1" />
                    <span className="text-xs text-emerald-600 font-semibold w-8 text-right">{pct}%</span>
                  </div>
                </div>
              );
            })}
            {baselines.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-400">No baselines found</div>}
          </div>
        </div>

        {/* Intune Profiles */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Intune Profiles</h3>
            <Link to={createPageUrl("IntuneProfiles")} className="text-xs text-blue-600 hover:underline">Manage →</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {profiles.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{p.profile_name}</p>
                  <p className="text-xs text-slate-400">{p.platform} · {p.profile_type?.replace(/_/g, ' ')}</p>
                </div>
                <StatusBadge status={p.state} />
              </div>
            ))}
            {profiles.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-400">No profiles found</div>}
          </div>
        </div>
      </div>

      {/* Tenants + Recent Policies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Tenants</h3>
            <Link to={createPageUrl("Tenants")} className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {allTenants.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.domain}</p>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
            {allTenants.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-400">No tenants added yet</div>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Recent CA Policies</h3>
            <Link to={createPageUrl("EntraPolicies")} className="text-xs text-blue-600 hover:underline">Manage →</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {policies.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{p.policy_name}</p>
                  <p className="text-xs text-slate-400">{p.policy_type?.replace(/_/g, ' ')}</p>
                </div>
                <StatusBadge status={p.state} />
              </div>
            ))}
            {policies.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-400">No policies found</div>}
          </div>
        </div>
      </div>
    </div>
  );
}