import React, { useEffect, useState } from "react";
import { Search, Loader2, RefreshCw, MessageSquare, Users, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const typeLabel = (t) => (t === "oneOnOne" ? "1:1 chat" : t === "group" ? "Group chat" : t === "meeting" ? "Meeting chat" : t || "chat");

export default function MigrationChatSelector({ sourceTenant, userMapping, chatConfig, setChatConfig }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const mappedUpns = new Set(userMapping.map((m) => (m.sourceUpn || "").toLowerCase()));

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("migrationEngine", {
        action: "list_source",
        source_azure_tenant_id: sourceTenant.tenant_id,
        workload: "chats",
      });
      const objects = res.data.objects || [];
      setChats(objects);
      setChatConfig((prev) => {
        const next = { ...prev };
        objects.forEach((c) => { if (!next[c.id]) next[c.id] = { chat: c, selected: false }; });
        return next;
      });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceTenant?.tenant_id]);

  const rows = chats.map((c) => chatConfig[c.id]).filter(Boolean);
  const filtered = rows.filter((r) =>
    !search ||
    [r.chat?.topic, ...(r.chat?.members || [])].some((v) => String(v || "").toLowerCase().includes(search.toLowerCase()))
  );
  const selectedCount = rows.filter((r) => r.selected).length;
  const allSelected = filtered.length > 0 && filtered.every((r) => r.selected);

  const toggle = (chat, checked) => setChatConfig((prev) => ({ ...prev, [chat.id]: { ...prev[chat.id], chat, selected: checked } }));
  const setAll = (checked) => setChatConfig((prev) => {
    const next = { ...prev };
    filtered.forEach((r) => { next[r.chat.id] = { ...r, selected: checked }; });
    return next;
  });

  const mappedCount = (chat) => (chat.members || []).filter((m) => mappedUpns.has(String(m || "").toLowerCase())).length;

  return (
    <div className="bg-card border rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" />Teams chats</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select individual chats or all of them. Each chat is recreated in the target with the participants that you mapped
            in the accounts step, then its messages are copied best-effort.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{selectedCount} of {rows.length} selected</Badge>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Reload
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8" placeholder="Search chats by topic or participant..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" onClick={() => setAll(!allSelected)}>{allSelected ? "Clear all" : "Select all"}</Button>
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">{error}</div>}

      <div className="overflow-x-auto border rounded-lg max-h-[520px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="p-2 w-8"><Checkbox checked={allSelected} onCheckedChange={(v) => setAll(!!v)} /></th>
              <th className="text-left p-2 font-medium">Chat</th>
              <th className="text-left p-2 font-medium">Participants</th>
              <th className="text-left p-2 font-medium">Mapped to target</th>
              <th className="text-left p-2 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Reading chats from {sourceTenant.name}...
              </td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No chats found.</td></tr>
            )}
            {!loading && filtered.map((r) => {
              const mapped = mappedCount(r.chat);
              return (
                <tr
                  key={r.chat.id}
                  className={`border-t hover:bg-muted/40 cursor-pointer ${r.selected ? "bg-primary/5" : ""}`}
                  onClick={() => toggle(r.chat, !r.selected)}
                >
                  <td className="p-2"><Checkbox checked={r.selected} /></td>
                  <td className="p-2">
                    <div className="text-sm font-medium">{r.chat.topic || "(no topic)"}</div>
                    <div className="text-xs text-muted-foreground">{typeLabel(r.chat.chatType)}</div>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground max-w-[280px]">
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{(r.chat.members || []).length}</span>
                    <div className="truncate">{(r.chat.members || []).join(", ") || "—"}</div>
                  </td>
                  <td className="p-2 text-xs">
                    {mapped >= 2 ? (
                      <span className="text-emerald-600">{mapped} participant(s)</span>
                    ) : (
                      <span className="text-amber-600 inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />{mapped} — map at least 2
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {r.chat.lastUpdatedDateTime ? new Date(r.chat.lastUpdatedDateTime).toLocaleDateString() : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}