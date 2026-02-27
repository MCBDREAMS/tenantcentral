import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";

export default function EntraGroups({ selectedTenant }) {
  const { data: groups = [] } = useQuery({
    queryKey: ['entra-groups', selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.EntraGroup.filter({ tenant_id: selectedTenant.id })
      : base44.entities.EntraGroup.list(),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const getTenantName = (tid) => allTenants.find(t => t.id === tid)?.name || tid;

  const columns = [
    { header: "Name", accessor: "display_name", render: (r) => <span className="font-medium text-slate-800">{r.display_name}</span> },
    { header: "Type", accessor: "group_type", render: (r) => <StatusBadge status={r.group_type} /> },
    { header: "Membership", accessor: "membership_type", render: (r) => <span className="text-xs">{r.membership_type?.replace(/_/g, ' ')}</span> },
    { header: "Members", accessor: "member_count" },
    { header: "Tenant", accessor: "tenant_id", render: (r) => <span className="text-xs text-slate-500">{getTenantName(r.tenant_id)}</span> },
    { header: "Description", accessor: "description", render: (r) => <span className="text-xs text-slate-500 truncate max-w-[200px] block">{r.description}</span> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Entra ID Groups"
        subtitle={selectedTenant ? `Groups in ${selectedTenant.name}` : "All tenant groups"}
        icon={UserCheck}
      />
      <DataTable
        columns={columns}
        data={groups}
        onExport={(d) => exportToCSV(d, "entra_groups")}
        emptyMessage="No groups found"
      />
    </div>
  );
}