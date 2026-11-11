import React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Copy } from "lucide-react";

// Shared read-only site collection table used for both the source tenant and the
// destination tenant listings.
export default function SiteTable({ sites = [] }) {
  const { toast } = useToast();

  const copyUrl = async (url) => {
    await navigator.clipboard.writeText(url);
    toast({ title: "Site URL copied", description: url });
  };

  return (
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
          {sites.map((site) => (
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
  );
}