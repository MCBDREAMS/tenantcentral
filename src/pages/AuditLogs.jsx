import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Download, RefreshCw, Search, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/shared/PageHeader";
import { exportToCSV } from "@/components/shared/exportUtils";

const severityColors = {
  info: "bg-blue-50 text-blue-700 border-blue-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-red-50 text-red-700 border-red-200",
};

const categoryColors = {
  tenant: "bg-violet-50 text-violet-700",
  entra_user: "bg-blue-50 text-blue-700",
  entra_group: "bg-cyan-50 text-cyan-700",
  entra_policy: "bg-indigo-50 text-indigo-700",
  intune_device: "bg-emerald-50 text-emerald-700",
  intune_profile: "bg-teal-50 text-teal-700",
  intune_app: "bg-green-50 text-green-700",
  security_baseline: "bg-red-50 text-red-700",
  script: "bg-slate-100 text-slate-700",
  export: "bg-amber-50 text-amber-700",
  auth: "bg-pink-50 text-pink-700",
  rbac: "bg-orange-50 text-orange-700",
};

const CATEGORIES = ["all", "tenant", "entra_user", "entra_group", "entra_policy", "intune_device", "intune_profile", "intune_app", "security_baseline", "script", "export", "auth", "rbac"];

export default function AuditLogs({ selectedTenant }) {
  const [search, setSearch] = useState("");
  const [actorSearch, setActorSearch] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const PAGE_SIZE = 25;

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => base44.entities.AuditLog.list("-created_date", 500),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const activeFilterCount = [
    search, actorSearch, targetSearch, dateFrom, dateTo,
    category !== "all" ? category : "",
    severity !== "all" ? severity : "",
    status !== "all" ? status : "",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch(""); setActorSearch(""); setTargetSearch("");
    setDateFrom(""); setDateTo("");
    setCategory("all"); setSeverity("all"); setStatus("all");
    setPage(0);
  };

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (selectedTenant?.id && l.tenant_id && l.tenant_id !== selectedTenant.id) return false;
      if (category !== "all" && l.category !== category) return false;
      if (severity !== "all" && l.severity !== severity) return false;
      if (status !== "all" && l.status !== status) return false;

      // Date range filter
      if (dateFrom) {
        const logDate = new Date(l.created_date);
        if (logDate < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const logDate = new Date(l.created_date);
        const toEnd = new Date(dateTo);
        toEnd.setHours(23, 59, 59, 999);
        if (logDate > toEnd) return false;
      }

      // Action / general search
      if (search) {
        const s = search.toLowerCase();
        if (!(
          (l.action || "").toLowerCase().includes(s) ||
          (l.tenant_name || "").toLowerCase().includes(s) ||
          (l.details || "").toLowerCase().includes(s)
        )) return false;
      }

      // Actor (email) search
      if (actorSearch) {
        const s = actorSearch.toLowerCase();
        if (!(l.actor || "").toLowerCase().includes(s)) return false;
      }

      // Target name search
      if (targetSearch) {
        const s = targetSearch.toLowerCase();
        if (!(l.target_name || "").toLowerCase().includes(s)) return false;
      }

      return true;
    });
  }, [logs, search, actorSearch, targetSearch, dateFrom, dateTo, category, severity, status, selectedTenant]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const formatDate = (d) => {
    if (!d) return "-";
    return new Date(d).toLocaleString();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Audit Logs"
        subtitle="Full activity trail across all tenants and services"
        icon={ClipboardList}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportToCSV(filtered, "audit_logs")} className="gap-2">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 space-y-3">
        {/* Row 1: Main search + quick filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search by action, tenant, details..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="h-9 pl-8 text-sm"
            />
          </div>
          <Select value={severity} onValueChange={v => { setSeverity(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={v => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-32 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failure">Failure</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced(v => !v)}
            className={`gap-1.5 ${showAdvanced ? "bg-slate-100" : ""}`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <Badge className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-blue-600 text-white border-0 rounded-full">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-slate-500 h-9">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <span className="text-sm text-slate-400 ml-auto">{filtered.length} records</span>
        </div>

        {/* Row 2: Advanced filters (collapsible) */}
        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">User Email</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Filter by actor email..."
                  value={actorSearch}
                  onChange={e => { setActorSearch(e.target.value); setPage(0); }}
                  className="h-9 pl-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Target Name</Label>
              <Input
                placeholder="Filter by resource name..."
                value={targetSearch}
                onChange={e => { setTargetSearch(e.target.value); setPage(0); }}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(0); }}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(0); }}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-1">
              <Label className="text-xs text-slate-500">Category</Label>
              <Select value={category} onValueChange={v => { setCategory(v); setPage(0); }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c === "all" ? "All Categories" : c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-44">Timestamp</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Resource</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tenant</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Severity</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400 text-sm">Loading audit logs...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400 text-sm">No logs found</td></tr>
              ) : paged.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(log.created_date)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded">{log.action}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`${categoryColors[log.category] || "bg-slate-100 text-slate-600"} border-0 text-xs`}>
                      {(log.category || "").replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{log.actor || "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 font-medium">{log.target_name || "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{log.tenant_name || "-"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`${severityColors[log.severity] || severityColors.info} text-xs`}>
                      {log.severity || "info"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${log.status === "failure" ? "text-red-600" : "text-emerald-600"}`}>
                      {log.status || "success"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>{filtered.length} total</span>
            <div className="flex gap-2 items-center">
              <button onClick={() => setPage(p => p - 1)} disabled={page === 0} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">←</button>
              <span className="text-xs">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}