import React, { useEffect, useState } from "react";
import { Loader2, RefreshCw, Users, Layers, Search, Fingerprint } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { splitUpn, joinUpn } from "./mailboxOptions";

const MODES = [
  { value: "create", label: "Create new" },
  { value: "migrate", label: "Match existing" },
  { value: "skip", label: "Skip" },
];

// Step 2 for an on-premises source: pick the AD accounts and AD groups carried into the target.
export default function OnPremAccountsStep({ scanId, domains, workloads, userConfig, setUserConfig, selection, setSelection }) {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [bulkDomain, setBulkDomain] = useState("");
  const [tab, setTab] = useState(workloads.includes("mailboxes") ? "users" : "groups");

  const defaultDomain = domains.find((d) => d.isDefault)?.domain || domains[0]?.domain || "";
  const selectedGroups = selection?.groups || [];

  const load = async () => {
    if (!scanId) return;
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("migrationEngine", { action: "onprem_users", scan_id: scanId });
      const objects = res.data?.users || [];
      setUsers(objects);
      setGroups(res.data?.groups || []);
      setUserConfig((prev) => {
        const next = { ...prev };
        objects.forEach((u) => {
          if (next[u.id]) return;
          const { localPart, domain } = splitUpn(u.upn, defaultDomain);
          next[u.id] = {
            id: u.id,
            upn: u.upn,
            mail: u.mail,
            samAccountName: u.samAccountName,
            displayName: u.displayName,
            givenName: u.givenName,
            surname: u.surname,
            department: u.department,
            jobTitle: u.jobTitle,
            immutableId: u.immutableId,
            onprem: true,
            selected: false,
            mode: "create",
            localPart,
            domain: domain || defaultDomain,
          };
        });
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
  }, [scanId]);

  // Rows seeded before the target domains loaded start without a domain.
  useEffect(() => {
    if (!defaultDomain) return;
    setUserConfig((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.values(next).forEach((u) => {
        if (!u.domain) { next[u.id] = { ...u, domain: defaultDomain }; changed = true; }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDomain]);

  const rows = users.map((u) => userConfig[u.id]).filter(Boolean);
  const filtered = rows.filter((u) =>
    !search ||
    [u.displayName, u.upn, u.samAccountName, u.department, u.jobTitle]
      .some((v) => String(v || "").toLowerCase().includes(search.toLowerCase()))
  );
  const active = rows.filter((u) => u.selected && u.mode !== "skip");

  const patch = (updated) => setUserConfig((prev) => ({ ...prev, [updated.id]: updated }));
  const allVisibleSelected = filtered.length > 0 && filtered.every((u) => u.selected && u.mode !== "skip");

  const setAllVisible = (checked) => setUserConfig((prev) => {
    const next = { ...prev };
    filtered.forEach((u) => { next[u.id] = { ...u, selected: checked, mode: checked && u.mode === "skip" ? "create" : u.mode }; });
    return next;
  });

  const applyDomain = (domain) => {
    setBulkDomain(domain);
    setUserConfig((prev) => {
      const next = { ...prev };
      filtered.forEach((u) => { next[u.id] = { ...u, domain }; });
      return next;
    });
  };

  const toggleGroup = (g) => setSelection((prev) => {
    const current = prev.groups || [];
    const exists = current.some((x) => x.id === g.id);
    return {
      ...prev,
      groups: exists ? current.filter((x) => x.id !== g.id) : [...current, { id: g.id, displayName: g.displayName }],
    };
  });

  const toggleAllGroups = (checked) => setSelection((prev) => ({
    ...prev,
    groups: checked ? groups.map((g) => ({ id: g.id, displayName: g.displayName })) : [],
  }));

  const filteredGroups = groups.filter((g) => !groupSearch || g.displayName.toLowerCase().includes(groupSearch.toLowerCase()));
  const hasUsers = workloads.includes("mailboxes");
  const hasGroups = workloads.includes("groups");

  return (
    <div className="bg-card border rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium flex items-center gap-2"><Users className="h-4 w-4 text-primary" />AD accounts &amp; groups</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Accounts come from the on-premises agent scan. Choose which ones are created in the target and which
            verified target domain each lands on.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{active.length} of {rows.length} selected</Badge>
          {selectedGroups.length > 0 && <Badge variant="secondary">{selectedGroups.length} groups</Badge>}
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Reload
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        {hasUsers && (
          <Button variant={tab === "users" ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => setTab("users")}>
            <Users className="h-4 w-4" />AD accounts
          </Button>
        )}
        {hasGroups && (
          <Button variant={tab === "groups" ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => setTab("groups")}>
            <Layers className="h-4 w-4" />AD groups
          </Button>
        )}
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">{error}</div>}

      {tab === "users" && hasUsers && (
        <>
          <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 border rounded-lg">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-8" placeholder="Search by name, UPN, SAM or department..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={() => setAllVisible(!allVisibleSelected)}>
              {allVisibleSelected ? "Clear all" : "Select all"}
            </Button>
            {domains.length > 0 && (
              <Select value={bulkDomain} onValueChange={applyDomain}>
                <SelectTrigger className="h-8 w-[210px]"><SelectValue placeholder="Target domain for all" /></SelectTrigger>
                <SelectContent>
                  {domains.map((d) => <SelectItem key={d.domain} value={d.domain}>{d.domain}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="overflow-x-auto border rounded-lg max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0 z-10">
                <tr>
                  <th className="p-2 w-8"><Checkbox checked={allVisibleSelected} onCheckedChange={(v) => setAllVisible(!!v)} /></th>
                  <th className="text-left p-2 font-medium">On-premises account</th>
                  <th className="text-left p-2 font-medium">How to bring it over</th>
                  <th className="text-left p-2 font-medium">Target account</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading accounts from the agent scan…
                  </td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No accounts matched.</td></tr>
                )}
                {!loading && filtered.map((u) => (
                  <tr key={u.id} className={`border-t align-top ${u.selected && u.mode !== "skip" ? "bg-primary/5" : ""}`}>
                    <td className="p-2 w-8">
                      <Checkbox
                        checked={!!u.selected && u.mode !== "skip"}
                        onCheckedChange={(v) => patch({ ...u, selected: !!v, mode: v && u.mode === "skip" ? "create" : u.mode })}
                      />
                    </td>
                    <td className="p-2 min-w-[210px]">
                      <div className="text-sm font-medium">{u.displayName || u.upn}</div>
                      <div className="text-xs text-muted-foreground">{u.upn}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {u.samAccountName && <Badge variant="outline" className="text-[10px] font-normal">{u.samAccountName}</Badge>}
                        {u.immutableId
                          ? <Badge variant="secondary" className="text-[10px] font-normal gap-1"><Fingerprint className="h-2.5 w-2.5" />ImmutableID</Badge>
                          : <Badge variant="outline" className="text-[10px] font-normal">no ImmutableID</Badge>}
                      </div>
                    </td>
                    <td className="p-2">
                      <Select value={u.mode} onValueChange={(v) => patch({ ...u, mode: v, selected: v !== "skip" })}>
                        <SelectTrigger className="h-8 w-[190px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {u.mode === "migrate" ? "links an account that already exists in the target" : u.mode === "create" ? "brand-new identity in the target" : ""}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <Input className="h-8 w-28" value={u.localPart} onChange={(e) => patch({ ...u, localPart: e.target.value })} placeholder="local part" />
                        <span className="text-muted-foreground text-sm">@</span>
                        {domains.length > 0 ? (
                          <Select value={u.domain} onValueChange={(v) => patch({ ...u, domain: v })}>
                            <SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="domain" /></SelectTrigger>
                            <SelectContent>
                              {domains.map((d) => <SelectItem key={d.domain} value={d.domain}>{d.domain}{d.isDefault ? " (default)" : ""}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input className="h-8 w-[170px]" value={u.domain} onChange={(e) => patch({ ...u, domain: e.target.value })} placeholder="target domain" />
                        )}
                      </div>
                      <div className="text-[11px] mt-1">
                        <span className="text-muted-foreground">Target: </span>
                        <span className="font-medium">{joinUpn(u.localPart, u.domain) || "—"}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "groups" && hasGroups && (
        <>
          <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 border rounded-lg">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-8" placeholder="Search AD groups..." value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={() => toggleAllGroups(selectedGroups.length !== groups.length)}>
              {selectedGroups.length === groups.length && groups.length > 0 ? "Clear all" : "Select all"}
            </Button>
          </div>
          <div className="border rounded-lg max-h-[420px] overflow-y-auto divide-y">
            {loading && <div className="p-6 text-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading groups…</div>}
            {!loading && filteredGroups.length === 0 && (
              <div className="p-6 text-center text-muted-foreground text-sm">No groups found in the scan.</div>
            )}
            {!loading && filteredGroups.map((g) => (
              <label key={g.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 cursor-pointer">
                <Checkbox checked={selectedGroups.some((x) => x.id === g.id)} onCheckedChange={() => toggleGroup(g)} />
                <span className="text-sm flex-1 truncate">{g.displayName}</span>
                <span className="text-xs text-muted-foreground">{g.memberCount} scanned member(s)</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Groups are created in the target as security groups. Membership for scanned users is applied by re-running
            the batch after the accounts exist.
          </p>
        </>
      )}
    </div>
  );
}