import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Download, Loader2, RefreshCw, Search } from "lucide-react";
import SiteTable from "./SiteTable";
import { downloadText, toCsv } from "./csv";

export default function DestinationSitesCard({ project }) {
  const { toast } = useToast();
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sites, setSites] = useState(null);
  const [warning, setWarning] = useState("");
  const [query, setQuery] = useState("");

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
    downloadText(
      `sharepoint-sites-${project.name.replace(/\s+/g, "-").toLowerCase()}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  };

  return (
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
          <p className="text-sm text-muted-foreground">
            No SharePoint sites returned for this tenant.
          </p>
        )}

        {filtered.length > 0 && <SiteTable sites={filtered} />}

        {!sites && !sitesLoading && (
          <p className="text-sm text-muted-foreground">
            Load the list to see every site collection in the destination tenant before you pick
            targets. Requires Sites.Read.All on the tenant's app registration.
          </p>
        )}
      </CardContent>
    </Card>
  );
}