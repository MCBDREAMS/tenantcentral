import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";

export default function EntraUsers({ selectedTenant, tenants }) {
  const { data: users = [] } = useQuery({
    queryKey: ['entra-users', selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.EntraUser.filter({ tenant_id: selectedTenant.id })
      : base44.entities.EntraUser.list(),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const getTenantName = (tid) => allTenants.find(t => t.id === tid)?.name || tid;

  const columns = [
    { header: "Display Name", accessor: "display_name", render: (r) => <span className="font-medium text-slate-800">{r.display_name}</span> },
    { header: "UPN", accessor: "upn", render: (r) => <span className="text-xs text-slate-500">{r.upn}</span> },
    { header: "Type", accessor: "user_type", render: (r) => <StatusBadge status={r.user_type} /> },
    { header: "MFA", accessor: "mfa_status", render: (r) => <StatusBadge status={r.mfa_status} /> },
    { header: "Department", accessor: "department" },
    { header: "Licenses", accessor: "licenses", render: (r) => <span className="text-xs text-slate-500">{r.licenses}</span> },
    { header: "Tenant", accessor: "tenant_id", render: (r) => <span className="text-xs text-slate-500">{getTenantName(r.tenant_id)}</span> },
    { header: "Enabled", accessor: "account_enabled", render: (r) => (
      <span className={`text-xs font-medium ${r.account_enabled !== false ? 'text-emerald-600' : 'text-red-500'}`}>
        {r.account_enabled !== false ? 'Yes' : 'No'}
      </span>
    )},
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Entra ID Users"
        subtitle={selectedTenant ? `Users in ${selectedTenant.name}` : "All tenant users"}
        icon={Users}
      />
      <DataTable
        columns={columns}
        data={users}
        onExport={(d) => exportToCSV(d, "entra_users")}
        emptyMessage="No users found"
      />
    </div>
  );
}