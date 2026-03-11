import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCheck, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";
import { useRbac } from "@/components/shared/useRbac";
import ReadOnlyBanner from "@/components/shared/ReadOnlyBanner";
import GroupEditDialog from "@/components/entra/GroupEditDialog";
import { logAction } from "@/components/shared/auditLogger";
import QuickSyncButton from "@/components/shared/QuickSyncButton";

export default function EntraGroups({ selectedTenant, tenants = [] }) {
  const { canEdit } = useRbac();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGroup, setEditGroup] = useState(null);
  const queryClient = useQueryClient();

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

  const openEdit = (group) => { setEditGroup(group); setDialogOpen(true); };
  const openAdd  = () => { setEditGroup(null); setDialogOpen(true); };

  const handleDelete = async (group) => {
    if (!window.confirm(`Delete group ${group.display_name}?`)) return;
    await base44.entities.EntraGroup.delete(group.id);
    await logAction({ action: "DELETE_ENTRA_GROUP", category: "entra_group", tenant_id: group.tenant_id, target_name: group.display_name, severity: "critical" });
    queryClient.invalidateQueries({ queryKey: ['entra-groups'] });
  };

  const columns = [
    { header: "Name", accessor: "display_name", render: (r) => <span className="font-medium text-slate-800">{r.display_name}</span> },
    { header: "Type", accessor: "group_type", render: (r) => <StatusBadge status={r.group_type} /> },
    { header: "Membership", accessor: "membership_type", render: (r) => <span className="text-xs">{r.membership_type?.replace(/_/g, ' ')}</span> },
    { header: "Members", accessor: "member_count" },
    { header: "Mail", accessor: "mail", render: (r) => <span className="text-xs text-slate-500">{r.mail}</span> },
    { header: "Tenant", accessor: "tenant_id", render: (r) => <span className="text-xs text-slate-500">{getTenantName(r.tenant_id)}</span> },
    { header: "Description", accessor: "description", render: (r) => <span className="text-xs text-slate-500 truncate max-w-[200px] block">{r.description}</span> },
    canEdit() && { header: "", accessor: "_actions", render: (r) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => handleDelete(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    )},
  ].filter(Boolean);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Entra ID Groups"
        subtitle={selectedTenant ? `Groups in ${selectedTenant.name}` : "All tenant groups"}
        icon={UserCheck}
        actions={canEdit() && (
          <Button onClick={openAdd} className="gap-2 bg-slate-900 hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Add Group
          </Button>
        )}
      />
      {!canEdit() && <ReadOnlyBanner />}
      <DataTable
        columns={columns}
        data={groups}
        onExport={(d) => exportToCSV(d, "entra_groups")}
        emptyMessage="No groups found"
      />
      <GroupEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        group={editGroup}
        tenant={selectedTenant || allTenants[0]}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['entra-groups'] })}
      />
    </div>
  );
}