import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export default function ScriptEditor({ form, onChange }) {
  const set = (key, val) => onChange({ ...form, [key]: val });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Script Name</Label>
          <Input value={form.script_name || ""} onChange={e => set("script_name", e.target.value)} placeholder="Auto Enroll - Contoso" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={form.script_type || "powershell"} onValueChange={v => set("script_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="powershell">PowerShell</SelectItem>
              <SelectItem value="shell">Shell</SelectItem>
              <SelectItem value="batch">Batch</SelectItem>
              <SelectItem value="python">Python</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Platform</Label>
          <Select value={form.platform || "windows"} onValueChange={v => set("platform", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["windows","macos","ios","android","linux","all"].map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={form.category || "custom"} onValueChange={v => set("category", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["enrollment","security","configuration","maintenance","monitoring","custom"].map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Run As</Label>
          <Select value={form.run_as_account || "system"} onValueChange={v => set("run_as_account", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Input value={form.description || ""} onChange={e => set("description", e.target.value)} placeholder="What does this script do?" />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch checked={!!form.run_in_64bit} onCheckedChange={v => set("run_in_64bit", v)} id="64bit" />
          <Label htmlFor="64bit" className="text-xs cursor-pointer">Run in 64-bit</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={!!form.enforce_signature_check} onCheckedChange={v => set("enforce_signature_check", v)} id="sig" />
          <Label htmlFor="sig" className="text-xs cursor-pointer">Enforce Signature Check</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={!!form.is_template} onCheckedChange={v => set("is_template", v)} id="tpl" />
          <Label htmlFor="tpl" className="text-xs cursor-pointer">Save as Template</Label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Script Content</Label>
        <Textarea
          value={form.script_content || ""}
          onChange={e => set("script_content", e.target.value)}
          placeholder="# Enter your script here..."
          className="font-mono text-xs h-52 bg-slate-950 text-emerald-400 border-slate-700 placeholder:text-slate-600"
        />
      </div>
    </div>
  );
}