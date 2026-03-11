import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Pencil, Trash2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";
import { useRbac } from "@/components/shared/useRbac";
import ReadOnlyBanner from "@/components/shared/ReadOnlyBanner";
import UserEditDialog from "@/components/entra/UserEditDialog";
import MfaUserPanel from "@/components/entra/MfaUserPanel";
import { logAction } from "@/components/shared/auditLogger";
import QuickSyncButton from "@/components/shared/QuickSyncButton";

export default function EntraUsers({ selectedTenant, tenants = [] }) {
  const { canEdit } = useRbac();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [mfaExpanded, setMfaExpanded] = useState(null);
  const queryClient = useQueryClient();

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

  const openEdit = (user) => { setEditUser(user); setDialogOpen(true); };
  const openAdd  = () => { setEditUser(null); setDialogOpen(true); };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user ${user.display_name}?`)) return;
    await base44.entities.EntraUser.delete(user.id);
    await logAction({ action: "DELETE_ENTRA_USER", category: "entra_user", tenant_id: user.tenant_id, target_name: user.display_name, severity: "critical" });
    queryClient.invalidateQueries({ queryKey: ['entra-users'] });
  };

  const mfaStatusStyle = {
    enabled:  "bg-emerald-50 text-emerald-700",
    enforced: "bg-blue-50 text-blue-700",
    disabled: "bg-red-50 text-red-600",
  };

  const columns = [
    { header: "Display Name", accessor: "display_name", render: (r) => <span className="font-medium text-slate-800">{r.display_name}</span> },
    { header: "UPN", accessor: "upn", render: (r) => <span className="text-xs text-slate-500">{r.upn}</span> },
    { header: "Type", accessor: "user_type", render: (r) => <StatusBadge status={r.user_type} /> },
    { header: "MFA", accessor: "mfa_status", render: (r) => (
      <div>
        <Badge className={`${mfaStatusStyle[r.mfa_status] || "bg-slate-100 text-slate-500"} border-0 text-xs cursor-pointer`}
          onClick={() => setMfaExpanded(mfaExpanded === r.id ? null : r.id)}>
          {r.mfa_status || "unknown"} <Shield className="h-3 w-3 ml-1 inline" />
        </Badge>
        {mfaExpanded === r.id && (
          <div className="mt-2">
            <MfaUserPanel
              user={r}
              tenant={allTenants.find(t => t.id === r.tenant_id)}
              canEdit={canEdit()}
              onUpdated={() => queryClient.invalidateQueries({ queryKey: ['entra-users'] })}
            />
          </div>
        )}
      </div>
    )},
    { header: "Role", accessor: "entra_roles", render: (r) => r.entra_roles ? <Badge variant="outline" className="text-xs">{r.entra_roles}</Badge> : null },
    { header: "Department", accessor: "department" },
    { header: "Licenses", accessor: "licenses", render: (r) => <span className="text-xs text-slate-500">{r.licenses}</span> },
    { header: "Tenant", accessor: "tenant_id", render: (r) => <span className="text-xs text-slate-500">{getTenantName(r.tenant_id)}</span> },
    { header: "Enabled", accessor: "account_enabled", render: (r) => (
      <span className={`text-xs font-medium ${r.account_enabled !== false ? 'text-emerald-600' : 'text-red-500'}`}>
        {r.account_enabled !== false ? 'Yes' : 'No'}
      </span>
    )},
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
        title="Entra ID Users"
        subtitle={selectedTenant ? `Users in ${selectedTenant.name}` : "All tenant users"}
        icon={Users}
        actions={
          <div className="flex items-center gap-2">
            <QuickSyncButton
              selectedTenant={selectedTenant}
              syncAction="sync_users"
              label="Sync Users"
              onSynced={() => queryClient.invalidateQueries({ queryKey: ['entra-users'] })}
            />
            {canEdit() && (
              <Button onClick={openAdd} className="gap-2 bg-slate-900 hover:bg-slate-800">
                <Plus className="h-4 w-4" /> Add User
              </Button>
            )}
          </div>
        }
      />
      {!canEdit() && <ReadOnlyBanner />}
      <DataTable
        columns={columns}
        data={users}
        onExport={(d) => exportToCSV(d, "entra_users")}
        emptyMessage="No users found"
      />
      <UserEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={editUser}
        tenant={selectedTenant || allTenants[0]}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['entra-users'] })}
      />
    </div>
  );
}