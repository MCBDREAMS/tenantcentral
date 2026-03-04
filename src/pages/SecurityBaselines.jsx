import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";
import BaselineEditDialog from "@/components/editor/BaselineEditDialog";

export default function SecurityBaselines({ selectedTenant }) {
  const [editing, setEditing] = useState(null);

  const { data: baselines = [] } = useQuery({
    queryKey: ['baselines', selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.SecurityBaseline.filter({ tenant_id: selectedTenant.id })
      : base44.entities.SecurityBaseline.list(),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const getTenantName = (tid) => allTenants.find(t => t.id === tid)?.name || tid;

  const typeLabels = {
    security_baseline_windows: "Windows",
    security_baseline_edge: "Edge",
    security_baseline_defender: "Defender",
    security_baseline_m365: "Microsoft 365",
    security_baseline_office: "Office",
    custom: "Custom",
  };

  const columns = [
    { header: "Baseline", accessor: "baseline_name", render: (r) => <span className="font-medium text-slate-800">{r.baseline_name}</span> },
    { header: "Type", accessor: "baseline_type", render: (r) => (
      <Badge variant="outline" className="text-xs">{typeLabels[r.baseline_type] || r.baseline_type}</Badge>
    )},
    { header: "Version", accessor: "version" },
    { header: "State", accessor: "state", render: (r) => <StatusBadge status={r.state} /> },
    { header: "Settings", accessor: "settings_count" },
    { header: "Compliance", accessor: "compliant_devices", render: (r) => {
      const total = (r.compliant_devices || 0) + (r.non_compliant_devices || 0);
      const pct = total > 0 ? Math.round((r.compliant_devices / total) * 100) : 0;
      return (
        <div className="min-w-[100px]">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-emerald-600">{r.compliant_devices || 0}</span>
            <span className="text-slate-400">{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      );
    }},
    { header: "Non-Compliant", accessor: "non_compliant_devices", render: (r) => (
      <span className="text-xs text-red-500 font-medium">{r.non_compliant_devices || 0}</span>
    )},
    { header: "Assigned Groups", accessor: "assigned_groups", render: (r) => <span className="text-xs text-slate-500">{r.assigned_groups || "—"}</span> },
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
        title="Security Baselines"
        subtitle={selectedTenant ? `Baselines in ${selectedTenant.name}` : "All security baselines"}
        icon={ShieldCheck}
      />
      <DataTable
        columns={columns}
        data={baselines}
        onExport={(d) => exportToCSV(d, "security_baselines")}
        emptyMessage="No security baselines found"
      />

      {editing && (
        <BaselineEditDialog
          baseline={editing}
          tenants={allTenants}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}