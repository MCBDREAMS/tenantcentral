import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Download, Globe, Loader2, RefreshCw, Search } from "lucide-react";
import { downloadText, toCsv } from "./csv";
import { useToast } from "@/components/ui/use-toast";

export default function SharePointSitesPanel({ project }) {
  const { toast } = useToast();
  const [scriptLoading, setScriptLoading] = useState(false);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sites, setSites] = useState(null);
  const [warning, setWarning] = useState("");
  const [query, setQuery] = useState("");

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

  const loadSites = async () => {
    setSitesLoading(true);
    setWarning("");
    try {
      const res = await base44.functions.invoke("portalData", {
        action: "list_sites",
        azure_tenant_id: project.target_azure_tenant_id,
        top: 500,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setSites(res.data.sites || []);
      setWarning(res.data.warning || "");
    } catch (e) {
      toast({
        title: "Could not list SharePoint sites",
        description: e.response?.data?.error || e.message,
        variant: "destructive",
      });
    } finally {
      setSitesLoading(false);
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
        Created: s.createdDateTime || "",
        Modified: s.lastModifiedDateTime || "",
      })),
      ["Title", "Url", "Description", "Created", "Modified"],
    );
    downloadText(`sharepoint-sites-${project.name.replace(/\s+/g, "-").toLowerCase()}.csv`, csv, "text/csv;charset=utf-8");
  };

  const copyUrl = async (url) => {
    await navigator.clipboard.writeText(url);
    toast({ title: "Site URL copied", description: url });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-primary" />
            Source site collections
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This script enumerates every site collection in the source: on Microsoft 365 it reads the
            tenant admin site, and on SharePoint Server it runs <code>Get-SPSite -Limit All</code>. It
            writes <code>sharepoint-sites.csv</code>, which the discovery scan reads automatically so all
            sites are inventoried instead of a single URL.
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-primary" />
            Destination sites
            <span className="text-sm font-normal text-muted-foreground">
              {project.target_tenant_name || "destination tenant"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={loadSites} disabled={sitesLoading}>
              {sitesLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Load sites from tenant
            </Button>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name or URL"
              className="h-9 w-full sm:w-64"
            />
            {filtered.length > 0 && (
              <Button variant="outline" onClick={exportSites}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            )}
            {sites && <Badge variant="secondary">{filtered.length} sites</Badge>}
          </div>

          {warning && <p className="text-sm text-amber-600">{warning}</p>}

          {sites && filtered.length === 0 && !warning && (
            <p className="text-sm text-muted-foreground">No SharePoint sites returned for this tenant.</p>
          )}

          {filtered.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Site</th>
                    <th className="px-3 py-2 text-left font-medium">URL</th>
                    <th className="px-3 py-2 text-left font-medium">Modified</th>
                    <th className="px-3 py-2 text-right font-medium">Copy</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((site) => (
                    <tr key={site.id || site.webUrl} className="border-t border-border">
                      <td className="px-3 py-2 text-foreground">{site.displayName || "—"}</td>
                      <td className="px-3 py-2">
                        <a
                          href={site.webUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-primary hover:underline"
                        >
                          {site.webUrl}
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {site.lastModifiedDateTime
                          ? new Date(site.lastModifiedDateTime).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyUrl(site.webUrl)}
                          aria-label={`Copy ${site.webUrl}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!sites && !sitesLoading && (
            <p className="text-sm text-muted-foreground">
              Load the list to see every site collection in the destination tenant before you pick
              targets. Requires Sites.Read.All on the tenant's app registration.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}