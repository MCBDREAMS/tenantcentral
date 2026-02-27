import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Building2, Users, Shield, Laptop, ShieldCheck, MonitorSmartphone, FolderCog } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function Dashboard({ selectedTenant, tenants }) {
  const tenantFilter = selectedTenant?.id ? { tenant_id: selectedTenant.id } : {};

  const { data: allTenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const { data: policies = [] } = useQuery({
    queryKey: ['entra-policies', selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.EntraPolicy.filter(tenantFilter)
      : base44.entities.EntraPolicy.list(),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['intune-profiles', selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.IntuneProfile.filter(tenantFilter)
      : base44.entities.IntuneProfile.list(),
  });

  const { data: baselines = [] } = useQuery({
    queryKey: ['baselines', selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.SecurityBaseline.filter(tenantFilter)
      : base44.entities.SecurityBaseline.list(),
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.IntuneDevice.filter(tenantFilter)
      : base44.entities.IntuneDevice.list(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['entra-users', selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.EntraUser.filter(tenantFilter)
      : base44.entities.EntraUser.list(),
  });

  const compliantDevices = devices.filter(d => d.compliance_state === 'compliant').length;
  const enabledPolicies = policies.filter(p => p.state === 'enabled').length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        subtitle={selectedTenant ? `Overview for ${selectedTenant.name}` : "Cross-tenant overview"}
        icon={LayoutDashboard}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Tenants" value={allTenants.length} icon={Building2} color="blue" />
        <StatCard label="Entra Users" value={users.length} icon={Users} color="violet" />
        <StatCard label="Conditional Access" value={policies.length} icon={Shield} color="emerald" subtitle={`${enabledPolicies} enabled`} />
        <StatCard label="Devices" value={devices.length} icon={MonitorSmartphone} color="cyan" subtitle={`${compliantDevices} compliant`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenants Overview */}
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
            {allTenants.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No tenants added yet</div>
            )}
          </div>
        </div>

        {/* Recent Policies */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Recent Policies</h3>
            <Link to={createPageUrl("EntraPolicies")} className="text-xs text-blue-600 hover:underline">View all</Link>
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
            {policies.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No policies found</div>
            )}
          </div>
        </div>

        {/* Intune Profiles */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Intune Profiles</h3>
            <Link to={createPageUrl("IntuneProfiles")} className="text-xs text-blue-600 hover:underline">View all</Link>
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
            {profiles.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No profiles found</div>
            )}
          </div>
        </div>

        {/* Security Baselines */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Security Baselines</h3>
            <Link to={createPageUrl("SecurityBaselines")} className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {baselines.slice(0, 5).map(b => (
              <div key={b.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{b.baseline_name}</p>
                  <p className="text-xs text-slate-400">v{b.version} · {b.settings_count} settings</p>
                </div>
                <StatusBadge status={b.state} />
              </div>
            ))}
            {baselines.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No baselines found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}