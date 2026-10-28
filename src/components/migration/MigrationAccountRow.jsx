import React from "react";
import { ChevronDown, ChevronRight, Mail, MailX, UserPlus, Link2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MigrationMailboxOptionsEditor from "./MigrationMailboxOptionsEditor";
import { joinUpn, splitUpn } from "./mailboxOptions";

const MODES = [
  { value: "create", label: "Create new account" },
  { value: "migrate", label: "Migrate to existing account" },
  { value: "skip", label: "Skip this account" },
];

export default function MigrationAccountRow({ user, domains, onChange }) {
  const targetUpn = joinUpn(user.localPart, user.domain);
  const sourceOnTarget = domains.some((d) => d.domain.toLowerCase() === splitUpn(user.upn).domain.toLowerCase());

  const patch = (p) => onChange({ ...user, ...p });

  return (
    <>
      <tr className={`border-t align-top ${user.selected && user.mode !== "skip" ? "bg-primary/5" : ""}`}>
        <td className="p-2 w-8">
          <Checkbox
            checked={!!user.selected && user.mode !== "skip"}
            onCheckedChange={(v) =>
              patch({ selected: !!v, mode: v && user.mode === "skip" ? "create" : user.mode })
            }
          />
        </td>
        <td className="p-2 min-w-[190px]">
          <div className="text-sm font-medium">{user.displayName || user.upn}</div>
          <div className="text-xs text-muted-foreground">{user.upn}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {user.department && <Badge variant="secondary" className="text-[10px] font-normal">{user.department}</Badge>}
            {!user.mail && <Badge variant="outline" className="text-[10px] font-normal">no mailbox</Badge>}
          </div>
        </td>
        <td className="p-2">
          <Select value={user.mode} onValueChange={(v) => patch({ mode: v, selected: v === "skip" ? false : true })}>
            <SelectTrigger className="h-8 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            {user.mode === "migrate" ? <><Link2 className="h-3 w-3" />links an account already in the target</> : null}
            {user.mode === "create" ? <><UserPlus className="h-3 w-3" />brand-new identity in the target</> : null}
          </div>
        </td>
        <td className="p-2">
          <div className="flex items-center gap-1">
            <Input
              className="h-8 w-28"
              value={user.localPart}
              onChange={(e) => patch({ localPart: e.target.value })}
              placeholder="local part"
            />
            <span className="text-muted-foreground text-sm">@</span>
            {domains.length > 0 ? (
              <Select value={user.domain} onValueChange={(v) => patch({ domain: v })}>
                <SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="domain" /></SelectTrigger>
                <SelectContent>
                  {domains.map((d) => (
                    <SelectItem key={d.domain} value={d.domain}>
                      {d.domain}{d.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input className="h-8 w-[170px]" value={user.domain} onChange={(e) => patch({ domain: e.target.value })} placeholder="target domain" />
            )}
          </div>
          <div className="text-[11px] mt-1 flex items-center gap-1">
            <span className="text-muted-foreground">Target:</span>
            <span className="font-medium">{targetUpn || "—"}</span>
            {sourceOnTarget && <Badge variant="secondary" className="text-[10px] font-normal">source domain available</Badge>}
          </div>
        </td>
        <td className="p-2">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox
                checked={user.includeMailbox !== false && !!user.mail}
                disabled={!user.mail}
                onCheckedChange={(v) => patch({ includeMailbox: !!v })}
              />
              {user.mail ? <Mail className="h-3.5 w-3.5" /> : <MailX className="h-3.5 w-3.5" />}
              {user.mail ? "Mailbox" : "No mailbox"}
            </label>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => patch({ expanded: !user.expanded })}
            >
              {user.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Options
            </Button>
          </div>
        </td>
      </tr>
      {user.expanded && (
        <tr className="border-t bg-muted/20">
          <td />
          <td colSpan={4} className="p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Mailbox options for {targetUpn || user.upn}
            </p>
            <MigrationMailboxOptionsEditor
              value={user.mailbox}
              onChange={(mailbox) => patch({ mailbox })}
            />
          </td>
        </tr>
      )}
    </>
  );
}