import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Shield, Eye, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";
import PolicyEditDialog from "@/components/editor/PolicyEditDialog";

export default function EntraPolicies({ selectedTenant }) {
  const [editing, setEditing] = useState(null);

  const { data: policies = [] } = useQuery({
    queryKey: ['entra-policies', selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.EntraPolicy.filter({ tenant_id: selectedTenant.id })
      : base44.entities.EntraPolicy.list(),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const getTenantName = (tid) => allTenants.find(t => t.id === tid)?.name || tid;

  const typeColors = {
    conditional_access: "bg-blue-50 text-blue-700",
    authentication_method: "bg-violet-50 text-violet-700",
    password_policy: "bg-amber-50 text-amber-700",
    mfa_policy: "bg-emerald-50 text-emerald-700",
    session_policy: "bg-cyan-50 text-cyan-700",
    terms_of_use: "bg-pink-50 text-pink-700",
    named_location: "bg-orange-50 text-orange-700",
  };

  const columns = [
    { header: "Policy Name", accessor: "policy_name", render: (r) => <span className="font-medium text-slate-800">{r.policy_name}</span> },
    { header: "Type", accessor: "policy_type", render: (r) => (
      <Badge className={`${typeColors[r.policy_type] || "bg-slate-50 text-slate-700"} text-xs border-0`}>
        {r.policy_type?.replace(/_/g, ' ')}
      </Badge>
    )},
    { header: "State", accessor: "state", render: (r) => <StatusBadge status={r.state} /> },
    { header: "Target Users", accessor: "target_users", render: (r) => <span className="text-xs text-slate-500">{r.target_users || "—"}</span> },
    { header: "Target Apps", accessor: "target_apps", render: (r) => <span className="text-xs text-slate-500">{r.target_apps || "—"}</span> },
    { header: "Grant Controls", accessor: "grant_controls", render: (r) => <span className="text-xs text-slate-500">{r.grant_controls || "—"}</span> },
    { header: "Last Modified", accessor: "last_modified", render: (r) => <span className="text-xs text-slate-500">{r.last_modified || "—"}</span> },
    { header: "Tenant", accessor: "tenant_id", render: (r) => <span className="text-xs text-slate-500">{getTenantName(r.tenant_id)}</span> },
    { header: "", accessor: "actions", render: (r) => (
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(r)}>
        <Pencil className="h-3.5 w-3.5 text-slate-400" />
      </Button>
    )},
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Conditional Access & Policies"
        subtitle={selectedTenant ? `Policies in ${selectedTenant.name}` : "All tenant policies"}
        icon={Shield}
      />
      <DataTable
        columns={columns}
        data={policies}
        onExport={(d) => exportToCSV(d, "entra_policies")}
        emptyMessage="No policies found"
      />

      {editing && (
        <PolicyEditDialog
          policy={editing}
          tenants={allTenants}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}