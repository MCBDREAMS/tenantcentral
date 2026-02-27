import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, MonitorSmartphone, AppWindow, ShieldCheck, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import PageHeader from "@/components/shared/PageHeader";

const COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#94a3b8"];

export default function IntuneReports({ selectedTenant, tenants }) {
  const { data: devices = [] } = useQuery({
    queryKey: ["devices", selectedTenant?.id],
    queryFn: () => selectedTenant?.id ? base44.entities.IntuneDevice.filter({ tenant_id: selectedTenant.id }) : base44.entities.IntuneDevice.list(),
  });

  const { data: apps = [] } = useQuery({
    queryKey: ["intune-apps", selectedTenant?.id],
    queryFn: () => selectedTenant?.id ? base44.entities.IntuneApp.filter({ tenant_id: selectedTenant.id }) : base44.entities.IntuneApp.list(),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"], queryFn: () => base44.entities.Tenant.list(), initialData: tenants || [],
  });

  const complianceData = useMemo(() => {
    const counts = { compliant: 0, non_compliant: 0, in_grace_period: 0, not_evaluated: 0 };
    devices.forEach(d => { if (counts[d.compliance_state] !== undefined) counts[d.compliance_state]++; });
    return Object.entries(counts).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [devices]);

  const osByTenant = useMemo(() => {
    const map = {};
    devices.forEach(d => {
      const name = allTenants.find(t => t.id === d.tenant_id)?.name || "Unknown";
      if (!map[name]) map[name] = {};
      map[name][d.os] = (map[name][d.os] || 0) + 1;
    });
    return Object.entries(map).map(([name, oss]) => ({ name, ...oss }));
  }, [devices, allTenants]);

  const appInstallData = apps.slice(0, 8).map(a => ({ name: a.app_name.substring(0, 16), installed: a.install_count || 0, failed: a.failed_count || 0 }));

  const totalDevices = devices.length;
  const compliantCount = devices.filter(d => d.compliance_state === "compliant").length;
  const nonCompliantCount = devices.filter(d => d.compliance_state === "non_compliant").length;
  const complianceRate = totalDevices > 0 ? Math.round((compliantCount / totalDevices) * 100) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Intune Reports"
        subtitle={selectedTenant ? `Reports for ${selectedTenant.name}` : "Cross-tenant Intune reports"}
        icon={BarChart2}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Devices", value: totalDevices, icon: MonitorSmartphone, color: "bg-blue-50 text-blue-600" },
          { label: "Compliance Rate", value: `${complianceRate}%`, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
          { label: "Non-Compliant", value: nonCompliantCount, icon: XCircle, color: "bg-red-50 text-red-600" },
          { label: "Total Apps", value: apps.length, icon: AppWindow, color: "bg-violet-50 text-violet-600" },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-500">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compliance Pie */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Device Compliance</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={complianceData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                {complianceData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* App install/fail */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">App Deployment Status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={appInstallData} margin={{ left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="installed" fill="#22c55e" radius={[3,3,0,0]} name="Installed" />
              <Bar dataKey="failed" fill="#ef4444" radius={[3,3,0,0]} name="Failed" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Devices by tenant / OS */}
        {osByTenant.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Devices by Tenant & OS</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={osByTenant} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend iconType="circle" iconSize={8} />
                {["Windows 10", "Windows 11", "macOS", "iOS", "Android"].map((os, i) => (
                  <Bar key={os} dataKey={os} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === 0 ? [0,0,3,3] : [0,0,0,0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}