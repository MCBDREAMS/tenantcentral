import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Loader2, Building2, Shield, FolderCog, ShieldCheck, Users, UserCheck, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/shared/PageHeader";
import { exportToCSV } from "@/components/shared/exportUtils";

const exportTypes = [
  { key: "entra_policies", label: "Entra Policies", icon: Shield, entity: "EntraPolicy", color: "from-blue-500 to-blue-600" },
  { key: "intune_profiles", label: "Intune Profiles", icon: FolderCog, entity: "IntuneProfile", color: "from-violet-500 to-violet-600" },
  { key: "security_baselines", label: "Security Baselines", icon: ShieldCheck, entity: "SecurityBaseline", color: "from-emerald-500 to-emerald-600" },
  { key: "entra_users", label: "Entra Users", icon: Users, entity: "EntraUser", color: "from-cyan-500 to-cyan-600" },
  { key: "entra_groups", label: "Entra Groups", icon: UserCheck, entity: "EntraGroup", color: "from-amber-500 to-amber-600" },
  { key: "intune_devices", label: "Intune Devices", icon: MonitorSmartphone, entity: "IntuneDevice", color: "from-rose-500 to-rose-600" },
];

export default function ExportCenter({ selectedTenant }) {
  const [exporting, setExporting] = useState(null);

  const { data: tenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const handleExport = async (exportType) => {
    setExporting(exportType.key);
    const entity = base44.entities[exportType.entity];
    let data;
    if (selectedTenant?.id) {
      data = await entity.filter({ tenant_id: selectedTenant.id });
    } else {
      data = await entity.list();
    }

    // Enrich with tenant name
    const enriched = data.map(row => {
      const tenant = tenants.find(t => t.id === row.tenant_id);
      return { ...row, tenant_name: tenant?.name || row.tenant_id };
    });

    exportToCSV(enriched, exportType.key);
    setExporting(null);
  };

  const handleExportAll = async () => {
    setExporting("all");
    for (const et of exportTypes) {
      const entity = base44.entities[et.entity];
      let data;
      if (selectedTenant?.id) {
        data = await entity.filter({ tenant_id: selectedTenant.id });
      } else {
        data = await entity.list();
      }
      const enriched = data.map(row => {
        const tenant = tenants.find(t => t.id === row.tenant_id);
        return { ...row, tenant_name: tenant?.name || row.tenant_id };
      });
      if (enriched.length > 0) {
        exportToCSV(enriched, et.key);
      }
    }
    setExporting(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Export Center"
        subtitle="Export policies, baselines, and configurations as CSV"
        icon={FileText}
        actions={
          <Button
            onClick={handleExportAll}
            disabled={!!exporting}
            className="gap-2 bg-slate-900 hover:bg-slate-800"
          >
            {exporting === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export All
          </Button>
        }
      />

      {selectedTenant && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-800">Exporting data for: <strong>{selectedTenant.name}</strong></span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {exportTypes.map(et => (
          <Card key={et.key} className="hover:shadow-md transition-shadow border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${et.color} flex items-center justify-center shadow-lg`}>
                  <et.icon className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold">{et.label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => handleExport(et)}
                disabled={!!exporting}
              >
                {exporting === et.key ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}