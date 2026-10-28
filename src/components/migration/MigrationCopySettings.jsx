import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/40 cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <div><div className="text-sm font-medium">{label}</div>{hint && <div className="text-xs text-muted-foreground">{hint}</div>}</div>
    </label>
  );
}

export default function MigrationCopySettings({ settings, setSettings, workloads, domains = [] }) {
  const set = (patch) => setSettings({ ...settings, ...patch });
  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-5">
        <h3 className="font-medium mb-3">Identity & Licensing</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Usage location (ISO country)</Label>
            <Input className="mt-1" value={settings.usageLocation} onChange={(e) => set({ usageLocation: e.target.value })} placeholder="US" />
            <p className="text-xs text-muted-foreground mt-1">Required to assign licenses in the target.</p>
          </div>
          <div>
            <Label>Target license SKU ID (optional)</Label>
            <Input className="mt-1" value={settings.targetSkuId} onChange={(e) => set({ targetSkuId: e.target.value })} placeholder="SKU GUID to assign to created users" />
          </div>
        </div>
        {domains.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Verified target domains: {domains.map((d) => d.domain).join(", ")}. Per-account domains were chosen in the accounts step.
          </p>
        )}
        <div className="mt-3">
          <Toggle label="Assign target license to created users" checked={settings.assignLicense} onChange={(v) => set({ assignLicense: v })} />
        </div>
      </div>

      <div className="bg-card border rounded-xl p-5">
        <h3 className="font-medium mb-3">Content Copy</h3>
        <div className="grid md:grid-cols-2 gap-2">
          <Toggle label="Copy permissions" hint="Re-apply SharePoint / drive item permissions (with principal replacement)" checked={settings.permissions} onChange={(v) => set({ permissions: v })} />
          <Toggle label="Copy version history" hint="Past file versions (best-effort)" checked={settings.versionHistory} onChange={(v) => set({ versionHistory: v })} />
          <Toggle label="Copy metadata" hint="List / item column metadata" checked={settings.metadata} onChange={(v) => set({ metadata: v })} />
          <Toggle label="Copy Teams channel messages" hint="Channel conversation history (best-effort). 1:1 chats are not migratable via Graph." checked={settings.includeTeamChats} onChange={(v) => set({ includeTeamChats: v })} />
        </div>
        <div className="grid md:grid-cols-3 gap-4 mt-4">
          <div>
            <Label>Max files per run pass</Label>
            <Input type="number" className="mt-1" value={settings.maxFilesPerRun} onChange={(e) => set({ maxFilesPerRun: parseInt(e.target.value) || 30 })} />
          </div>
          <div>
            <Label>Folder depth</Label>
            <Input type="number" className="mt-1" value={settings.folderDepth} onChange={(e) => set({ folderDepth: parseInt(e.target.value) || 2 })} />
          </div>
          <div>
            <Label>Max channels per team</Label>
            <Input type="number" className="mt-1" value={settings.maxChannelsPerRun} onChange={(e) => set({ maxChannelsPerRun: parseInt(e.target.value) || 10 })} />
          </div>
        </div>
      </div>

      {workloads.includes("chats") && (
        <div className="bg-card border rounded-xl p-5">
          <h3 className="font-medium mb-3">Teams Chats</h3>
          <div className="grid md:grid-cols-2 gap-2">
            <Toggle label="Skip chats with unmapped participants" hint="Only include chats where every participant maps to a target account" checked={settings.requireAllMembersMapped} onChange={(v) => set({ requireAllMembersMapped: v })} />
            <Toggle label="Recreate as group chats" hint="1:1 chats are recreated as group chats when the target needs more than two participants" checked={settings.chatAsGroup !== false} onChange={(v) => set({ chatAsGroup: v })} />
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <div>
              <Label>Max messages per chat per pass</Label>
              <Input type="number" className="mt-1" value={settings.maxChatMessagesPerRun} onChange={(e) => set({ maxChatMessagesPerRun: parseInt(e.target.value) || 25 })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}