import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, RefreshCw, BarChart2, AlertTriangle, CheckCircle2, XCircle, Monitor, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { exportToCSV } from "@/components/shared/exportUtils";

const MOCK_DEVICES = [
  { name: "DESKTOP-001", user: "john.doe@contoso.com", os: "Windows 11 23H2", last_scan: "2025-04-17", missing_updates: 0, status: "compliant" },
  { name: "LAPTOP-042", user: "jane.smith@contoso.com", os: "Windows 11 23H2", last_scan: "2025-04-15", missing_updates: 3, status: "noncompliant" },
  { name: "DESKTOP-088", user: "bob.jones@contoso.com", os: "Windows 10 22H2", last_scan: "2025-03-30", missing_updates: 7, status: "noncompliant" },
  { name: "LAPTOP-019", user: "alice.wong@contoso.com", os: "Windows 11 24H2", last_scan: "2025-04-18", missing_updates: 0, status: "compliant" },
  { name: "DESKTOP-055", user: "mark.taylor@contoso.com", os: "Windows 10 22H2", last_scan: "2025-04-10", missing_updates: 2, status: "noncompliant" },
  { name: "LAPTOP-031", user: "sarah.mill@contoso.com", os: "Windows 11 23H2", last_scan: "2025-04-17", missing_updates: 0, status: "compliant" },
];

const MOCK_MISSING = [
  { kb: "KB5034441", title: "2025-04 Cumulative Update", severity: "Critical", devices_missing: 2 },
  { kb: "KB5035536", title: "2025-03 .NET Framework Update", severity: "Important", devices_missing: 1 },
  { kb: "KB5034765", title: "2025-02 Cumulative Update", severity: "Critical", devices_missing: 3 },
];

const severityColor = {
  Critical: "bg-red-100 text-red-700",
  Important: "bg-amber-100 text-amber-700",
  Moderate: "bg-blue-100 text-blue-700",
  Low: "bg-slate-100 text-slate-500",
};

export default function UpdateCompliance({ selectedTenant }) {
  const [filter, setFilter] = useState("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["update_compliance_report", selectedTenant?.tenant_id],
    enabled: false,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_update_compliance_report",
        azure_tenant_id: selectedTenant?.tenant_id,
      }).then(r => r.data),
  });

  const devices = data?.devices || MOCK_DEVICES;
  const missingUpdates = data?.missingUpdates || MOCK_MISSING;

  const filtered = filter === "all" ? devices : devices.filter(d => d.status === filter);
  const compliant = devices.filter(d => d.status === "compliant").length;
  const nonCompliant = devices.filter(d => d.status === "noncompliant").length;
  const pct = devices.length ? Math.round((compliant / devices.length) * 100) : 0;

  const handleExport = () => {
    exportToCSV(devices.map(d => ({
      "Device": d.name,
      "User": d.user,
      "OS": d.os,
      "Last Scan": d.last_scan,
      "Missing Updates": d.missing_updates,
      "Status": d.status,
    })), "update_compliance_report");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Update Compliance Report</p>
          <p className="text-xs text-slate-400 mt-0.5">Per-device update status and missing patches</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700">{compliant}</p>
          <p className="text-xs text-emerald-600 mt-1">Compliant Devices</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{nonCompliant}</p>
          <p className="text-xs text-red-600 mt-1">Non-Compliant</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{pct}%</p>
          <p className="text-xs text-slate-500 mt-1">Compliance Rate</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-600">Overall Update Compliance</p>
          <span className="text-sm font-bold text-slate-800">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      {/* Missing Updates */}
      {missingUpdates.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-amber-50">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Missing Critical/Important Updates
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {missingUpdates.map((mu, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Badge className={`${severityColor[mu.severity]} border-0 text-xs`}>{mu.severity}</Badge>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{mu.title}</p>
                    <p className="text-xs text-slate-400 font-mono">{mu.kb}</p>
                  </div>
                </div>
                <Badge className="bg-red-50 text-red-700 border-0 text-xs">
                  {mu.devices_missing} device{mu.devices_missing !== 1 ? "s" : ""} missing
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Device Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">Devices ({filtered.length})</p>
          <div className="flex gap-1">
            {["all", "compliant", "noncompliant"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filter === f ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
              >
                {f === "all" ? "All" : f === "compliant" ? "Compliant" : "Non-Compliant"}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
          {filtered.map((d, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <div className="flex items-center gap-3 min-w-0">
                <Monitor className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{d.name}</p>
                  <p className="text-xs text-slate-400 truncate">{d.user} · {d.os}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {d.missing_updates > 0 && (
                  <Badge className="bg-amber-50 text-amber-700 border-0 text-xs">
                    {d.missing_updates} missing
                  </Badge>
                )}
                <Badge className={d.status === "compliant" ? "bg-emerald-100 text-emerald-700 border-0 text-xs" : "bg-red-100 text-red-700 border-0 text-xs"}>
                  {d.status === "compliant" ? <CheckCircle2 className="h-3 w-3 mr-1 inline" /> : <XCircle className="h-3 w-3 mr-1 inline" />}
                  {d.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}