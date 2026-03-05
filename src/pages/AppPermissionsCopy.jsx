import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { GitMerge, Search, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader";

export default function AppPermissionsCopy({ tenants = [] }) {
  const [sourceTenantId, setSourceTenantId] = useState("");
  const [targetTenantId, setTargetTenantId] = useState("");
  const [apps, setApps] = useState([]);
  const [selectedApps, setSelectedApps] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [report, setReport] = useState(null);

  const sourceTenant = tenants.find(t => t.id === sourceTenantId);
  const targetTenant = tenants.find(t => t.id === targetTenantId);

  const readPermissions = async () => {
    if (!sourceTenant) return;
    setLoading(true);
    setApps([]);
    setSelectedApps(new Set());
    setReport(null);
    const res = await base44.functions.invoke("tenantWrite", {
      action: "read_app_permissions",
      azure_tenant_id: sourceTenant.tenant_id,
    });
    const data = res.data;
    if (data.success) {
      setApps(data.apps || []);
      setSelectedApps(new Set((data.apps || []).map((_, i) => i)));
    }
    setLoading(false);
  };

  const copyPermissions = async () => {
    if (!targetTenant || selectedApps.size === 0) return;
    setCopying(true);
    setReport(null);
    const selectedList = apps.filter((_, i) => selectedApps.has(i));
    const res = await base44.functions.invoke("tenantWrite", {
      action: "copy_app_permissions",
      source_tenant_id: sourceTenant.tenant_id,
      target_tenant_id: targetTenant.tenant_id,
      apps: selectedList,
    });
    setReport(res.data.report || []);
    setCopying(false);
  };

  const toggleSelect = (i) => {
    setSelectedApps(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const toggleExpand = (i) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Copy App Permissions"
        subtitle="Read enterprise app permissions from a source tenant and apply them to a new tenant"
        icon={GitMerge}
      />

      {/* Step 1: Select Tenants */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Step 1 — Select Tenants</CardTitle>
          <CardDescription>Choose the source tenant to read from and the target tenant to copy permissions into.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Source Tenant (copy FROM)</label>
              <Select value={sourceTenantId} onValueChange={setSourceTenantId}>
                <SelectTrigger><SelectValue placeholder="Select source tenant…" /></SelectTrigger>
                <SelectContent>
                  {tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Target Tenant (copy TO)</label>
              <Select value={targetTenantId} onValueChange={v => { setTargetTenantId(v); setReport(null); }}>
                <SelectTrigger><SelectValue placeholder="Select target tenant…" /></SelectTrigger>
                <SelectContent>
                  {tenants.filter(t => t.id !== sourceTenantId).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="mt-4 gap-2 bg-slate-900 hover:bg-slate-800"
            disabled={!sourceTenantId || loading}
            onClick={readPermissions}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? "Reading permissions…" : "Read Permissions from Source"}
          </Button>
        </CardContent>
      </Card>

      {/* Step 2: Review Apps */}
      {apps.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Step 2 — Review & Select Apps</CardTitle>
                <CardDescription>{apps.length} enterprise apps found with permissions. Select which to copy.</CardDescription>
              </div>
              <div className="flex gap-2 text-xs">
                <button className="text-blue-600 hover:underline" onClick={() => setSelectedApps(new Set(apps.map((_, i) => i)))}>Select all</button>
                <span className="text-slate-300">|</span>
                <button className="text-slate-500 hover:underline" onClick={() => setSelectedApps(new Set())}>Clear</button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {apps.map((item, i) => (
              <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 cursor-pointer" onClick={() => toggleExpand(i)}>
                  <input
                    type="checkbox"
                    checked={selectedApps.has(i)}
                    onChange={() => toggleSelect(i)}
                    onClick={e => e.stopPropagation()}
                    className="rounded"
                  />
                  <span className="font-medium text-sm text-slate-800 flex-1">{item.sp.displayName}</span>
                  <Badge variant="outline" className="text-[10px]">{item.appRoles.length} app roles</Badge>
                  <Badge variant="outline" className="text-[10px]">{item.grants.length} delegated grants</Badge>
                  {expanded.has(i) ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                </div>
                {expanded.has(i) && (
                  <div className="px-4 py-3 bg-white text-xs space-y-2">
                    {item.appRoles.length > 0 && (
                      <div>
                        <p className="font-semibold text-slate-500 mb-1">Application Permissions ({item.appRoles.length})</p>
                        <div className="flex flex-wrap gap-1">
                          {item.appRoles.map((r, ri) => <Badge key={ri} className="bg-blue-50 text-blue-700 border-blue-200 font-mono text-[10px]">{r.appRoleId}</Badge>)}
                        </div>
                      </div>
                    )}
                    {item.grants.length > 0 && (
                      <div>
                        <p className="font-semibold text-slate-500 mb-1">Delegated Grants ({item.grants.length})</p>
                        <div className="flex flex-wrap gap-1">
                          {item.grants.map((g, gi) => (g.scope || "").split(" ").filter(Boolean).map((s, si) => (
                            <Badge key={`${gi}-${si}`} className="bg-violet-50 text-violet-700 border-violet-200 font-mono text-[10px]">{s}</Badge>
                          )))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Copy */}
      {apps.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Step 3 — Copy to Target Tenant</CardTitle>
            <CardDescription>
              {targetTenant
                ? `Will copy ${selectedApps.size} app(s) to "${targetTenant.name}"`
                : "Select a target tenant above first."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="gap-2 bg-blue-600 hover:bg-blue-700"
              disabled={!targetTenantId || selectedApps.size === 0 || copying}
              onClick={copyPermissions}
            >
              {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              {copying ? "Copying permissions…" : `Copy ${selectedApps.size} App(s) to Target`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Report */}
      {report && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Copy Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {report.map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-slate-100 last:border-0">
                {r.status === "ok"
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <span className="font-medium text-slate-700 flex-1">{r.displayName}</span>
                {r.status === "error" && <span className="text-xs text-red-500 truncate max-w-xs">{r.error}</span>}
                {r.status === "ok" && <span className="text-xs text-emerald-600">Applied</span>}
              </div>
            ))}
            <p className="text-xs text-slate-400 pt-2">
              {report.filter(r => r.status === "ok").length} succeeded · {report.filter(r => r.status === "error").length} failed
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}