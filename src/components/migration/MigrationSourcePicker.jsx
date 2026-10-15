import React, { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

const WORKLOAD_META = {
  mailboxes: { label: "Exchange Mailboxes", cols: ["upn", "mail", "department", "licensed"] },
  onedrive: { label: "OneDrive Drives", cols: ["upn", "usedGb"] },
  sharepoint: { label: "SharePoint Sites", cols: ["displayName", "webUrl"] },
  teams: { label: "Teams", cols: ["displayName", "visibility", "mail"] },
  groups: { label: "Groups", cols: ["displayName", "mail", "groupTypes"] },
  users: { label: "Users", cols: ["upn", "mail", "department"] },
};

function Cell({ obj, col }) {
  if (col === "groupTypes") return <span>{(obj.groupTypes || []).join(", ") || "—"}</span>;
  return <span>{obj[col] != null ? String(obj[col]) : "—"}</span>;
}

export default function MigrationSourcePicker({ sourceTenant, workloads, selection, setSelection }) {
  const [active, setActive] = useState(workloads[0]);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Cache each workload's scan so switching tabs back and forth never re-queries Graph.
  const cacheRef = React.useRef({});

  const load = async (w) => {
    setActive(w);
    setError("");
    if (cacheRef.current[w]) { setObjects(cacheRef.current[w]); return; }
    if (selection[w] && selection[w].length) { cacheRef.current[w] = selection[w]; setObjects(selection[w]); return; }
    setLoading(true);
    setObjects([]);
    try {
      const res = await base44.functions.invoke("migrationEngine", {
        action: "list_source",
        source_azure_tenant_id: sourceTenant.tenant_id,
        workload: w,
      });
      cacheRef.current[w] = res.data.objects || [];
      setObjects(cacheRef.current[w]);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { if (workloads.length) load(workloads[0]); /* eslint-disable-next-line */ }, []);

  const selected = selection[active] || [];
  const isSelected = (id) => selected.some((o) => o.id === id);
  const toggle = (obj) => {
    const cur = selection[active] || objects;
    const next = isSelected(obj.id) ? cur.filter((o) => o.id !== obj.id) : [...cur, obj];
    setSelection({ ...selection, [active]: next });
  };
  const toggleAll = () => {
    const allSelected = objects.length > 0 && objects.every((o) => isSelected(o.id));
    setSelection({ ...selection, [active]: allSelected ? [] : [...objects] });
  };

  const meta = WORKLOAD_META[active] || WORKLOAD_META.users;
  const filtered = objects.filter((o) => !search || JSON.stringify(o).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="bg-card border rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap gap-2">
        {workloads.map((w) => (
          <Button key={w} variant={active === w ? "default" : "outline"} size="sm" onClick={() => load(w)}>
            {WORKLOAD_META[w]?.label || w}
            {selection[w]?.length ? <span className="ml-2 text-xs opacity-80">{selection[w].length}</span> : null}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={`Search ${meta.label} in ${sourceTenant.name}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground">{selected.length} selected</span>
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">{error}</div>}

      <div className="border rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="p-2 w-8"><Checkbox checked={objects.length > 0 && objects.every((o) => isSelected(o.id))} onCheckedChange={toggleAll} /></th>
              {meta.cols.map((c) => <th key={c} className="text-left p-2 font-medium capitalize">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={meta.cols.length + 1} className="p-6 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading {meta.label}...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={meta.cols.length + 1} className="p-6 text-center text-muted-foreground">No objects.</td></tr>
            )}
            {!loading && filtered.map((o) => (
              <tr key={o.id} className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => toggle(o)}>
                <td className="p-2"><Checkbox checked={isSelected(o.id)} /></td>
                {meta.cols.map((c) => <td key={c} className="p-2"><Cell obj={o} col={c} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}