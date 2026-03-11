import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderCog, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";
import ProfileEditDialog from "@/components/editor/ProfileEditDialog";
import QuickSyncButton from "@/components/shared/QuickSyncButton";

export default function IntuneProfiles({ selectedTenant }) {
  const [editing, setEditing] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const queryClient = useQueryClient();

  const { data: profiles = [] } = useQuery({
    queryKey: ['intune-profiles', selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.IntuneProfile.filter({ tenant_id: selectedTenant.id })
      : base44.entities.IntuneProfile.list(),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const getTenantName = (tid) => allTenants.find(t => t.id === tid)?.name || tid;

  const filtered = typeFilter === "all" ? profiles : profiles.filter(p => p.profile_type === typeFilter);

  const platformIcons = { windows: "🪟", macos: "🍎", ios: "📱", android: "🤖", linux: "🐧", all: "🌐" };

  const columns = [
    { header: "Profile", accessor: "profile_name", render: (r) => <span className="font-medium text-slate-800">{r.profile_name}</span> },
    { header: "Type", accessor: "profile_type", render: (r) => (
      <Badge variant="outline" className="text-xs">{r.profile_type?.replace(/_/g, ' ')}</Badge>
    )},
    { header: "Platform", accessor: "platform", render: (r) => (
      <span className="text-sm">{platformIcons[r.platform] || ""} {r.platform}</span>
    )},
    { header: "State", accessor: "state", render: (r) => <StatusBadge status={r.state} /> },
    { header: "Description", accessor: "description", render: (r) => (
      <span className="text-xs text-slate-500 max-w-[200px] truncate block">{r.description || "—"}</span>
    )},
    { header: "Groups", accessor: "assigned_groups", render: (r) => <span className="text-xs text-slate-500">{r.assigned_groups || "—"}</span> },
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
        title="Intune Profiles"
        subtitle={selectedTenant ? `Profiles in ${selectedTenant.name}` : "All Intune configurations"}
        icon={FolderCog}
        actions={
          <QuickSyncButton
            selectedTenant={selectedTenant}
            syncAction="sync_intune_profiles"
            label="Sync Profiles"
            onSynced={() => window.location.reload()}
          />
        }
      />

      <Tabs value={typeFilter} onValueChange={setTypeFilter} className="mb-4">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="compliance_policy">Compliance</TabsTrigger>
          <TabsTrigger value="configuration_profile">Config</TabsTrigger>
          <TabsTrigger value="endpoint_security">Security</TabsTrigger>
          <TabsTrigger value="app_protection">App Protection</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        data={filtered}
        onExport={(d) => exportToCSV(d, "intune_profiles")}
        emptyMessage="No profiles found"
      />

      {editing && (
        <ProfileEditDialog
          profile={editing}
          tenants={allTenants}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}