import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MonitorSmartphone } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";

export default function IntuneDevices({ selectedTenant }) {
  const { data: devices = [] } = useQuery({
    queryKey: ['intune-devices', selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.IntuneDevice.filter({ tenant_id: selectedTenant.id })
      : base44.entities.IntuneDevice.list(),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const getTenantName = (tid) => allTenants.find(t => t.id === tid)?.name || tid;

  const columns = [
    { header: "Device", accessor: "device_name", render: (r) => <span className="font-medium text-slate-800">{r.device_name}</span> },
    { header: "OS", accessor: "os" },
    { header: "Compliance", accessor: "compliance_state", render: (r) => <StatusBadge status={r.compliance_state} /> },
    { header: "Ownership", accessor: "ownership", render: (r) => <StatusBadge status={r.ownership} /> },
    { header: "User", accessor: "primary_user", render: (r) => <span className="text-xs text-slate-500">{r.primary_user || "—"}</span> },
    { header: "Model", accessor: "model" },
    { header: "Serial", accessor: "serial_number", render: (r) => <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{r.serial_number}</code> },
    { header: "Tenant", accessor: "tenant_id", render: (r) => <span className="text-xs text-slate-500">{getTenantName(r.tenant_id)}</span> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Intune Devices"
        subtitle={selectedTenant ? `Devices in ${selectedTenant.name}` : "All managed devices"}
        icon={MonitorSmartphone}
      />
      <DataTable
        columns={columns}
        data={devices}
        onExport={(d) => exportToCSV(d, "intune_devices")}
        emptyMessage="No devices found"
      />
    </div>
  );
}