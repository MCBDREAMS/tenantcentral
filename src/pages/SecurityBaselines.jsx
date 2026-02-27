import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";

export default function SecurityBaselines({ selectedTenant }) {
  const [selected, setSelected] = useState(null);

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
    { header: "Compliant", accessor: "compliant_devices", render: (r) => (
      <span className="text-xs text-emerald-600 font-medium">{r.compliant_devices || 0}</span>
    )},
    { header: "Non-Compliant", accessor: "non_compliant_devices", render: (r) => (
      <span className="text-xs text-red-500 font-medium">{r.non_compliant_devices || 0}</span>
    )},
    { header: "Tenant", accessor: "tenant_id", render: (r) => <span className="text-xs text-slate-500">{getTenantName(r.tenant_id)}</span> },
    { header: "", accessor: "actions", render: (r) => (
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelected(r)}>
        <Eye className="h-3.5 w-3.5 text-slate-400" />
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

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.baseline_name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Type</p>
                  <p className="text-sm font-medium mt-0.5">{typeLabels[selected.baseline_type]}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Version</p>
                  <p className="text-sm mt-0.5">{selected.version}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">State</p>
                  <div className="mt-0.5"><StatusBadge status={selected.state} /></div>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Settings Count</p>
                  <p className="text-sm mt-0.5">{selected.settings_count}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Compliant Devices</p>
                  <p className="text-sm font-medium text-emerald-600 mt-0.5">{selected.compliant_devices || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Non-Compliant Devices</p>
                  <p className="text-sm font-medium text-red-500 mt-0.5">{selected.non_compliant_devices || 0}</p>
                </div>
              </div>
              {selected.assigned_groups && (
                <div>
                  <p className="text-xs text-slate-500">Assigned Groups</p>
                  <p className="text-sm mt-0.5">{selected.assigned_groups}</p>
                </div>
              )}
              {selected.settings_detail && (
                <div>
                  <p className="text-xs text-slate-500">Settings Detail</p>
                  <pre className="text-xs bg-slate-50 rounded-lg p-3 mt-1 overflow-auto max-h-48">{selected.settings_detail}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}