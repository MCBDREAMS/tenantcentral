import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Pencil, Trash2, Shield, Eye } from "lucide-react";
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
import UserDetailPanel from "@/components/entra/UserDetailPanel";
import { logAction } from "@/components/shared/auditLogger";
import QuickSyncButton from "@/components/shared/QuickSyncButton";
import FilterBar, { useFilters, ENABLED_OPTIONS, USER_LIVE_OPTIONS } from "@/components/shared/FilterBar";

const USER_TYPE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "guest", label: "Guest" },
];

const MFA_OPTIONS = [
  { value: "enabled", label: "Enabled" },
  { value: "enforced", label: "Enforced" },
  { value: "disabled", label: "Disabled" },
];

const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

// Sign-in activity is a date-only field, so the buckets are whole-day ranges.
function liveRange(bucket) {
  if (bucket === "never") return { last_sign_in: { $in: [null, ""] } };
  if (bucket === "7d") return { last_sign_in: { $gte: isoDaysAgo(7) } };
  if (bucket === "30d") return { last_sign_in: { $gte: isoDaysAgo(30), $lt: isoDaysAgo(7) } };
  return { last_sign_in: { $lt: isoDaysAgo(30) } };
}

export default function EntraUsers({ selectedTenant, tenants = [] }) {
  const { canEdit } = useRbac();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [mfaExpanded, setMfaExpanded] = useState(null);
  const [detailUser, setDetailUser] = useState(null);
  const queryClient = useQueryClient();
  const { values: filterValues, setFilter, clear: clearFilters } = useFilters();

  const baseQuery = selectedTenant?.id ? { tenant_id: selectedTenant.id } : {};

  const filterQuery = { ...baseQuery };
  if (filterValues.enabled) filterQuery.account_enabled = filterValues.enabled === "enabled";
  if (filterValues.type) filterQuery.user_type = filterValues.type;
  if (filterValues.mfa) filterQuery.mfa_status = filterValues.mfa;
  if (filterValues.department) filterQuery.department = filterValues.department;
  if (filterValues.live) Object.assign(filterQuery, liveRange(filterValues.live));

  const { data: users = [] } = useQuery({
    queryKey: ['entra-users', selectedTenant?.id, JSON.stringify(filterQuery)],
    queryFn: () => base44.entities.EntraUser.filter(filterQuery),
  });

  const { data: totalUsers = 0 } = useQuery({
    queryKey: ['entra-users-total', selectedTenant?.id],
    queryFn: () => base44.entities.EntraUser.count(baseQuery),
  });

  const { data: departmentOptions = [] } = useQuery({
    queryKey: ['entra-user-departments', selectedTenant?.id],
    queryFn: () => base44.entities.EntraUser
      .filter(baseQuery, { distinct: 'department' })
      .then(p => (p.items || []).filter(Boolean).sort((a, b) => a.localeCompare(b)).map(d => ({ value: d, label: d }))),
  });

  const userFilters = [
    { key: "enabled", label: "State", anyLabel: "Any state", options: ENABLED_OPTIONS, width: "w-36" },
    { key: "type", label: "Account type", anyLabel: "Any account type", options: USER_TYPE_OPTIONS, width: "w-44" },
    { key: "mfa", label: "MFA", anyLabel: "Any MFA state", options: MFA_OPTIONS, width: "w-40" },
    { key: "department", label: "Department", anyLabel: "Any department", options: departmentOptions, width: "w-44" },
    { key: "live", label: "Last sign-in", anyLabel: "Any last sign-in", options: USER_LIVE_OPTIONS, width: "w-44" },
  ];

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
    { header: "Last Sign-In", accessor: "last_sign_in", render: (r) => (
      <span className="text-xs text-slate-500">{r.last_sign_in || "Never"}</span>
    )},
    { header: "", accessor: "_view", render: (r) => (
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setDetailUser(r)}>
        <Eye className="h-3.5 w-3.5" />
      </Button>
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
      <div className="mb-4">
        <FilterBar
          filters={userFilters}
          values={filterValues}
          onChange={setFilter}
          onClear={clearFilters}
          right={`${users.length} of ${totalUsers} users`}
        />
      </div>
      <DataTable
        columns={columns}
        data={users}
        onExport={(d) => exportToCSV(d, "entra_users")}
        emptyMessage="No users found"
      />
      {detailUser && (
        <UserDetailPanel
          user={detailUser}
          azureTenantId={selectedTenant?.tenant_id}
          onClose={() => setDetailUser(null)}
        />
      )}
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