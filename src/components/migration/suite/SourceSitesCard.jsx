import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Download, Globe, Loader2, RefreshCw, Search } from "lucide-react";
import SiteTable from "./SiteTable";
import { SOURCE_TYPES, isCloudSource } from "./migrationMeta";
import { downloadText, toCsv } from "./csv";

const hostName = (value) =>
  String(value || "").replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();

// Source side of the SharePoint tab. For a SharePoint Online / Microsoft 365
// source the site collections are read live from that tenant; an on-premises
// farm still uses the PnP.PowerShell inventory script.
export default function SourceSitesCard({ project, tenants = [], onRefresh }) {
  const { toast } = useToast();
  const cloud = isCloudSource(project.source_type);
  const meta = SOURCE_TYPES.find((s) => s.value === project.source_type);

  const [sourceTenantId, setSourceTenantId] = useState(project.source_tenant_id || "");
  const [sites, setSites] = useState(null);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState("");
  const [query, setQuery] = useState("");
  const [scriptLoading, setScriptLoading] = useState(false);

  const sourceTenant = useMemo(() => {
    const stored = tenants.find((t) => t.id === sourceTenantId);
    if (stored) return stored;
    const endpoint = hostName(project.source_endpoint);
    if (!endpoint) return null;
    return (
      tenants.find((t) => t.tenant_id && t.domain && endpoint.includes(hostName(t.domain))) || null
    );
  }, [tenants, sourceTenantId, project.source_endpoint]);

  const pickSourceTenant = async (id) => {
    setSourceTenantId(id);
    setSites(null);
    const tenant = tenants.find((t) => t.id === id);
    if (!tenant) return;
    await base44.entities.MigrationProject.update(project.id, {
      source_tenant_id: tenant.id,
      source_azure_tenant_id: tenant.tenant_id,
      source_tenant_name: tenant.name,
    }).catch(() => null);
    onRefresh?.();
  };

  const loadSourceSites = async () => {
    if (!sourceTenant?.tenant_id) {
      toast({ title: "Pick the source tenant first", variant: "destructive" });
      return;
    }
    setLoading(true);
    setWarning("");
    try {
      const res = await base44.functions.invoke("portalData", {
        action: "list_sites",
        azure_tenant_id: sourceTenant.tenant_id,
        top: 500,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setSites(res.data.sites || []);
      setWarning(res.data.warning || "");
    } catch (e) {
      toast({
        title: "Could not list source SharePoint sites",
        description: e.response?.data?.error || e.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateSitesScript = async () => {
    setScriptLoading(true);
    try {
      const res = await base44.functions.invoke("migrationSuite", {
        action: "script",
        project_id: project.id,
        kind: "sites",
      });
      if (res.data?.error) throw new Error(res.data.error);
      downloadText(res.data.filename, res.data.content, "text/plain;charset=utf-8");
      toast({
        title: "Sites script ready",
        description: "Run it against the source, then feed the CSV to the discovery scan.",
      });
    } catch (e) {
      toast({
        title: "Could not generate the sites script",
        description: e.response?.data?.error || e.message,
        variant: "destructive",
      });
    } finally {
      setScriptLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const list = sites || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        (s.displayName || "").toLowerCase().includes(q) ||
        (s.webUrl || "").toLowerCase().includes(q),
    );
  }, [sites, query]);

  const exportSites = () => {
    if (filtered.length === 0) return;
    const csv = toCsv(
      filtered.map((s) => ({
        Title: s.displayName || "",
        Url: s.webUrl || "",
        Description: s.description || "",
        Modified: s.lastModifiedDateTime || "",
      })),
      ["Title", "Url", "Description", "Modified"],
    );
    downloadText(
      `source-sites-${project.name.replace(/\s+/g, "-").toLowerCase()}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Globe className="h-4 w-4 text-primary" />
          Source site collections
          <Badge variant="secondary">{meta?.short || project.source_type}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {cloud ? (
          <>
            <p className="text-sm text-muted-foreground">
              Sites are read live from the source tenant with Microsoft Graph, then picked for the
              destination. Requires Sites.Read.All on the source tenant's app registration.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={sourceTenant?.id || ""} onValueChange={pickSourceTenant}>
                <SelectTrigger className="h-9 w-full sm:w-64">
                  <SelectValue placeholder="Pick the source tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} {t.domain ? `(${t.domain})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={loadSourceSites} disabled={loading || !sourceTenant?.tenant_id}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Load sites from source tenant
              </Button>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by name or URL"
                  className="h-9 pl-8"
                />
              </div>
              {filtered.length > 0 && (
                <Button variant="outline" onClick={exportSites}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              )}
              {sites && <Badge variant="secondary">{filtered.length} sites</Badge>}
            </div>

            {warning && <p className="text-sm text-amber-600">{warning}</p>}
            {!sourceTenant?.tenant_id && (
              <p className="text-xs text-muted-foreground">
                Pick the source tenant so the app knows which organisation to read the sites from.
              </p>
            )}
            {sites && filtered.length === 0 && !warning && (
              <p className="text-sm text-muted-foreground">
                No SharePoint sites returned for the source tenant.
              </p>
            )}
            {filtered.length > 0 && <SiteTable sites={filtered} />}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This script enumerates every site collection in the source farm —{" "}
              <code>Get-SPSite -Limit All</code> via PnP.PowerShell — and writes{" "}
              <code>sharepoint-sites.csv</code>, which the discovery scan reads automatically.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={generateSitesScript} disabled={scriptLoading}>
                {scriptLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download sites script
              </Button>
              <Badge variant="secondary">{project.source_endpoint || "No source set"}</Badge>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}