import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Search, Loader2, Compass, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "SRV", "CAA"];

// Live DNS lookup for any name or record type, so entries outside the standard
// tenant record set can be inspected too.
export default function DnsLookupTool({ domain }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("A");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lookup = async () => {
    const target = (name.trim() || domain || "").replace(/\.$/, "");
    if (!target) {
      setError("Enter a DNS name to look up.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await base44.functions.invoke("dnsManager", { action: "lookup", name: target, type });
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">DNS lookup</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Query any name and record type against live public DNS.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 p-5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder={domain ? `${domain} or mail.${domain}` : "mail.contoso.com"}
          className="h-9 text-sm font-mono"
        />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-full sm:w-[130px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={lookup} disabled={loading} className="gap-2 h-9">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Look up
        </Button>
      </div>

      {error && (
        <div className="mx-5 mb-5 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && !error && (
        <div className="mx-5 mb-5 border border-border rounded-lg overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
            <Badge className="bg-slate-100 text-slate-700 border-slate-200 font-mono">{result.type}</Badge>
            <span className="font-mono text-xs text-foreground break-all">{result.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {result.lookup_error ? result.lookup_error : `${(result.answers || []).length} answer(s)`}
            </span>
          </div>
          {(!result.answers || result.answers.length === 0) ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No {result.type} records published for this name.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {result.answers.map((a, i) => (
                <li key={`${a}-${i}`} className="px-4 py-3 font-mono text-xs text-foreground break-all">
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}