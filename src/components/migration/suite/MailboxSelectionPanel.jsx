import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

// Granular Exchange mailbox picker for the in-app run: every mailbox discovered
// in the source tenant can be ticked one by one, with select-all / clear-all
// shortcuts, so a project can migrate a subset instead of the whole tenant.
export default function MailboxSelectionPanel({ mailboxes = [], selectedIds = [], onChange }) {
  const [search, setSearch] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mailboxes;
    return mailboxes.filter((m) =>
      [m.displayName, m.upn, m.mail, m.department, m.jobTitle].some((v) =>
        String(v || "").toLowerCase().includes(q),
      ),
    );
  }, [mailboxes, search]);

  const selectedCount = mailboxes.filter((m) => selected.has(m.id)).length;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((m) => selected.has(m.id));

  const toggle = (id, on) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onChange(mailboxes.filter((m) => next.has(m.id)).map((m) => m.id));
  };

  const toggleFiltered = (on) => {
    const next = new Set(selected);
    filtered.forEach((m) => (on ? next.add(m.id) : next.delete(m.id)));
    onChange(mailboxes.filter((m) => next.has(m.id)).map((m) => m.id));
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Mailboxes in this run</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Only the mailboxes you tick are migrated — untick an account to leave it behind in the source tenant.
          </p>
        </div>
        <Badge variant="secondary">
          {selectedCount} of {mailboxes.length} selected
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-8"
            placeholder="Search by name, UPN, mail or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => onChange(mailboxes.map((m) => m.id))}>
          Select all
        </Button>
        <Button size="sm" variant="outline" onClick={() => onChange([])}>
          Clear all
        </Button>
      </div>

      <div className="overflow-auto border border-border rounded-lg max-h-[340px]">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="p-2 w-8">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={(v) => toggleFiltered(!!v)}
                  aria-label="Select all mailboxes shown"
                />
              </th>
              <th className="text-left p-2 font-medium">Mailbox</th>
              <th className="text-left p-2 font-medium">User principal name</th>
              <th className="text-left p-2 font-medium">Mail</th>
              <th className="text-left p-2 font-medium">Department</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                  No mailboxes matched.
                </td>
              </tr>
            )}
            {filtered.map((m) => (
              <tr key={m.id} className="border-t border-border hover:bg-muted/40">
                <td className="p-2">
                  <Checkbox
                    checked={selected.has(m.id)}
                    onCheckedChange={(v) => toggle(m.id, !!v)}
                    aria-label={`Select mailbox ${m.mail || m.upn}`}
                  />
                </td>
                <td className="p-2">
                  <span className="font-medium">{m.displayName || m.upn}</span>
                  {m.accountEnabled === false && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      Disabled
                    </Badge>
                  )}
                </td>
                <td className="p-2 text-muted-foreground truncate max-w-[220px]">{m.upn}</td>
                <td className="p-2 text-muted-foreground truncate max-w-[200px]">{m.mail || "—"}</td>
                <td className="p-2 text-muted-foreground">{m.department || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}