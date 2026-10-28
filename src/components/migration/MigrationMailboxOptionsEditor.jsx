import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MAILBOX_OPTIONS } from "./mailboxOptions";

// Reusable mailbox-option grid: used inside a single account row and in the bulk
// "apply to every selected mailbox" panel.
export default function MigrationMailboxOptionsEditor({ value, onChange }) {
  const opts = value || {};
  const set = (patch) => onChange({ ...opts, ...patch });

  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {MAILBOX_OPTIONS.map((o) => (
        <label
          key={o.key}
          className="flex items-start gap-2 p-2 rounded-lg border border-border bg-card hover:bg-muted/40 cursor-pointer"
        >
          <Checkbox checked={!!opts[o.key]} onCheckedChange={(v) => set({ [o.key]: !!v })} />
          <div>
            <div className="text-sm font-medium">{o.label}</div>
            <div className="text-xs text-muted-foreground">{o.hint}</div>
          </div>
        </label>
      ))}
      <div className="sm:col-span-2">
        <label className="text-xs font-medium text-muted-foreground">Forward to (optional)</label>
        <Input
          className="mt-1 h-8"
          value={opts.forwardTo || ""}
          onChange={(e) => set({ forwardTo: e.target.value })}
          placeholder="leave empty to keep no forwarding"
        />
      </div>
    </div>
  );
}