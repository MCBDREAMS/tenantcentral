import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Play, Eye, Save, X, CheckCircle2, AlertTriangle, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ConditionBuilder from "./ConditionBuilder";
import ActionBuilder from "./ActionBuilder";

export default function RuleEditor({ rule, tenants, onSave, onClose }) {
  const isNew = !rule?.id;
  const [form, setForm] = useState({
    name: rule?.name || "",
    description: rule?.description || "",
    tenant_id: rule?.tenant_id || tenants[0]?.id || "",
    is_active: rule?.is_active !== false,
    condition_logic: rule?.condition_logic || "all",
    conditions: rule?.conditions ? JSON.parse(rule.conditions) : [{ field: "complianceState", operator: "equals", value: "noncompliant" }],
    actions: rule?.actions ? JSON.parse(rule.actions) : [{ type: "sync_device", params: {} }],
    notify_email: rule?.notify_email || "",
  });
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);

  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  const handlePreview = async () => {
    if (!form.tenant_id || form.conditions.length === 0) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await base44.functions.invoke("workflowEngine", {
        action: "preview_rule",
        tenant_id: form.tenant_id,
        conditions: form.conditions,
        condition_logic: form.condition_logic,
      });
      setPreview(res.data);
    } catch (e) {
      setPreview({ error: e.message });
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.tenant_id) return;
    setSaving(true);
    const payload = {
      ...form,
      conditions: JSON.stringify(form.conditions),
      actions: JSON.stringify(form.actions),
    };
    delete payload.conditions_obj;
    delete payload.actions_obj;
    await onSave(payload);
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Create Workflow Rule" : `Edit: ${rule.name}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Rule Name *</label>
              <input
                value={form.name}
                onChange={e => set({ name: e.target.value })}
                placeholder="e.g. Remediate Non-Compliant Devices"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Tenant *</label>
              <select
                value={form.tenant_id}
                onChange={e => set({ tenant_id: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Description</label>
            <input
              value={form.description}
              onChange={e => set({ description: e.target.value })}
              placeholder="Describe what this rule does"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Conditions */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Conditions</p>
            <ConditionBuilder
              conditions={form.conditions}
              onChange={c => set({ conditions: c })}
              logic={form.condition_logic}
              onLogicChange={l => set({ condition_logic: l })}
            />
          </div>

          {/* Preview button */}
          <div>
            <Button variant="outline" size="sm" className="gap-2" onClick={handlePreview} disabled={previewing || !form.tenant_id}>
              {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Preview Matching Devices
            </Button>
            {preview && !preview.error && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-medium text-blue-800">
                  <strong>{preview.matched}</strong> of {preview.total} devices would match these conditions:
                </p>
                {preview.devices?.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {preview.devices.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-blue-700">
                        <Monitor className="h-3 w-3 shrink-0" />
                        <span>{d.deviceName}</span>
                        <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px]">{d.complianceState}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {preview?.error && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {preview.error}
              </div>
            )}
          </div>

          {/* Actions */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Actions</p>
            <ActionBuilder
              actions={form.actions}
              onChange={a => set({ actions: a })}
            />
          </div>

          {/* Notification email */}
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              📧 Critical Action Email Alert
            </p>
            <p className="text-xs text-amber-700">
              An email will be sent to this address whenever a <strong>Wipe</strong>, <strong>Retire</strong>, or <strong>Disable</strong> action executes. Defaults to the logged-in user's email if left blank.
            </p>
            <input
              type="email"
              value={form.notify_email}
              onChange={e => set({ notify_email: e.target.value })}
              placeholder="admin@company.com"
              className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => set({ is_active: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-slate-700">Rule is active</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name || !form.tenant_id} className="bg-slate-900 hover:bg-slate-800 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isNew ? "Create Rule" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}