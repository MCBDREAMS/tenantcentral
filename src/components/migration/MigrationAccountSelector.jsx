import React, { useEffect, useState } from "react";
import { Search, Loader2, RefreshCw, Users, Settings2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MigrationAccountRow from "./MigrationAccountRow";
import MigrationMailboxOptionsEditor from "./MigrationMailboxOptionsEditor";
import { DEFAULT_MAILBOX, splitUpn } from "./mailboxOptions";

const MODES = [
  { value: "create", label: "Create new" },
  { value: "migrate", label: "Migrate to existing" },
  { value: "skip", label: "Skip" },
];

export default function MigrationAccountSelector({ sourceTenant, domains, userConfig, setUserConfig }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [bulkMode, setBulkMode] = useState("create");
  const [bulkDomain, setBulkDomain] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMailbox, setBulkMailbox] = useState({ ...DEFAULT_MAILBOX });

  const defaultDomain = domains.find((d) => d.isDefault)?.domain || domains[0]?.domain || "";

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("migrationEngine", {
        action: "list_source",
        source_azure_tenant_id: sourceTenant.tenant_id,
        workload: "users",
      });
      const objects = res.data.objects || [];
      setUsers(objects);
      setUserConfig((prev) => {
        const next = { ...prev };
        objects.forEach((u) => {
          if (!next[u.id]) {
            const { localPart, domain } = splitUpn(u.upn, defaultDomain);
            next[u.id] = {
              ...u,
              selected: false,
              mode: "create",
              localPart,
              domain: domain || defaultDomain,
              includeMailbox: !!u.mail,
              mailbox: { ...DEFAULT_MAILBOX },
              expanded: false,
            };
          }
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
  }, [sourceTenant?.tenant_id]);

  // Rows created before the target domains finished loading start without a domain.
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
    [u.displayName, u.upn, u.mail, u.department, u.jobTitle]
      .some((v) => String(v || "").toLowerCase().includes(search.toLowerCase()))
  );
  const activeRows = rows.filter((u) => u.selected && u.mode !== "skip");

  const patchUser = (updated) => setUserConfig((prev) => ({ ...prev, [updated.id]: updated }));

  const setAllVisible = (checked) => setUserConfig((prev) => {
    const next = { ...prev };
    filtered.forEach((u) => {
      next[u.id] = { ...u, selected: checked, mode: checked && u.mode === "skip" ? "create" : u.mode };
    });
    return next;
  });

  const applyModeToVisible = () => setUserConfig((prev) => {
    const next = { ...prev };
    filtered.forEach((u) => {
      next[u.id] = { ...u, mode: bulkMode, selected: bulkMode !== "skip" };
    });
    return next;
  });

  const applyDomainToVisible = (domain) => {
    setBulkDomain(domain);
    setUserConfig((prev) => {
      const next = { ...prev };
      filtered.forEach((u) => { next[u.id] = { ...u, domain }; });
      return next;
    });
  };

  const applyMailboxToActive = () => setUserConfig((prev) => {
    const next = { ...prev };
    activeRows.forEach((u) => { next[u.id] = { ...u, includeMailbox: !!u.mail, mailbox: { ...bulkMailbox } }; });
    return next;
  });

  const allVisibleSelected = filtered.length > 0 && filtered.every((u) => u.selected && u.mode !== "skip");

  return (
    <div className="bg-card border rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Accounts &amp; mailboxes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pick accounts one by one or select all, choose whether each account is migrated into an existing target account
            or created brand new, and which target domain it is linked to.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{activeRows.length} of {rows.length} selected</Badge>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Reload
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 border rounded-lg">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8" placeholder="Search by name, UPN, mail or department..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" onClick={() => setAllVisible(!allVisibleSelected)}>
          {allVisibleSelected ? "Clear all" : "Select all"}
        </Button>
        <div className="flex items-center gap-1">
          <Select value={bulkMode} onValueChange={setBulkMode}>
            <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="secondary" onClick={applyModeToVisible}>Apply to all</Button>
        </div>
        {domains.length > 0 && (
          <Select value={bulkDomain} onValueChange={applyDomainToVisible}>
            <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="Link all to domain" /></SelectTrigger>
            <SelectContent>
              {domains.map((d) => <SelectItem key={d.domain} value={d.domain}>{d.domain}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setBulkOpen((v) => !v)}>
          <Settings2 className="h-3.5 w-3.5" />Mailbox options for selected
        </Button>
      </div>

      {bulkOpen && (
        <div className="border rounded-lg p-3 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Apply to the {activeRows.length} selected account(s)</p>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setBulkOpen(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
          <MigrationMailboxOptionsEditor value={bulkMailbox} onChange={setBulkMailbox} />
          <div className="flex justify-end">
            <Button size="sm" onClick={applyMailboxToActive} disabled={activeRows.length === 0}>Apply to selected mailboxes</Button>
          </div>
        </div>
      )}

      {error && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">{error}</div>}

      <div className="overflow-x-auto border rounded-lg max-h-[520px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="p-2 w-8"><Checkbox checked={allVisibleSelected} onCheckedChange={(v) => setAllVisible(!!v)} /></th>
              <th className="text-left p-2 font-medium">Source account</th>
              <th className="text-left p-2 font-medium">How to bring it over</th>
              <th className="text-left p-2 font-medium">Target domain</th>
              <th className="text-left p-2 font-medium">Mailbox</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading accounts from {sourceTenant.name}...
              </td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No accounts matched.</td></tr>
            )}
            {!loading && filtered.map((u) => (
              <MigrationAccountRow key={u.id} user={u} domains={domains} onChange={patchUser} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}