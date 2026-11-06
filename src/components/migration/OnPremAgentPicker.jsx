import React, { useEffect, useState } from "react";
import { Server, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function ago(dt) {
  if (!dt) return "never";
  const mins = Math.floor((Date.now() - new Date(dt).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Picks which on-premises server (agent scan) is the migration source.
export default function OnPremAgentPicker({ scanId, onSelect }) {
  const [scans, setScans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("migrationEngine", { action: "onprem_scans" });
      setScans(res.data?.scans || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setScans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const selected = (scans || []).find((s) => s.id === scanId);

  if (loading && scans == null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground h-10">
        <Loader2 className="h-4 w-4 animate-spin" />Loading on-premises agents…
      </div>
    );
  }

  if (!scans?.length) {
    return (
      <div className="text-xs text-muted-foreground border rounded-lg p-3 space-y-1">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />No on-premises agent has reported yet
        </p>
        <p>
          Install the migration agent on a domain-joined server from
          <span className="font-medium text-foreground"> Intune → Adidy → Intune Migration</span> (agent setup),
          then come back — the scan appears here automatically.
        </p>
        {error && <p className="text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select value={scanId || ""} onValueChange={(v) => onSelect(scans.find((s) => s.id === v) || null)}>
          <SelectTrigger className="h-10 flex-1">
            <SelectValue placeholder="Select on-premises server" />
          </SelectTrigger>
          <SelectContent>
            {scans.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <div className="flex items-center gap-2">
                  <Server className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.domain} — {s.hostname}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Refresh agents">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {selected && (
        <p className="text-xs text-muted-foreground">
          {selected.user_count || 0} AD users · {selected.group_count || 0} AD groups · scanned {ago(selected.scan_time)}
          {selected.forest && selected.forest !== selected.domain ? ` · forest ${selected.forest}` : ""}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}