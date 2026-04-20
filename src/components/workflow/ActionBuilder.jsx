import React from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

export const ACTION_TYPES = [
  { value: "sync_device", label: "Sync Device Policies", icon: "🔄", description: "Force Intune policy sync", risk: "low" },
  { value: "restart_device", label: "Restart Device", icon: "🔁", description: "Remote reboot via Intune", risk: "medium" },
  { value: "defender_quick_scan", label: "Defender Quick Scan", icon: "🔍", description: "Trigger Windows Defender quick scan", risk: "low" },
  { value: "defender_full_scan", label: "Defender Full Scan", icon: "🛡️", description: "Trigger Windows Defender full scan", risk: "low" },
  { value: "send_notification", label: "Send Company Portal Notification", icon: "📣", description: "Push notification to device user", risk: "low" },
  { value: "push_script", label: "Push PowerShell Script", icon: "💻", description: "Deploy a remediation PowerShell script", risk: "medium" },
  { value: "disable_device", label: "Disable Device in Entra", icon: "🚫", description: "Disable device object in Azure AD", risk: "high" },
  { value: "retire_device", label: "Retire Device", icon: "📦", description: "Remove corporate data, unenroll from Intune", risk: "high" },
  { value: "wipe_device", label: "Wipe Device", icon: "⚠️", description: "Full factory reset — IRREVERSIBLE", risk: "critical" },
];

const RISK_COLORS = {
  low: "text-emerald-600 bg-emerald-50 border-emerald-200",
  medium: "text-amber-700 bg-amber-50 border-amber-200",
  high: "text-red-600 bg-red-50 border-red-200",
  critical: "text-red-800 bg-red-100 border-red-300 font-bold",
};

export default function ActionBuilder({ actions, onChange }) {
  const addAction = () => {
    onChange([...actions, { type: "sync_device", params: {} }]);
  };

  const updateAction = (i, patch) => {
    onChange(actions.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  };

  const updateParams = (i, paramPatch) => {
    onChange(actions.map((a, idx) => idx === i ? { ...a, params: { ...a.params, ...paramPatch } } : a));
  };

  const removeAction = (i) => onChange(actions.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {actions.map((act, i) => {
        const meta = ACTION_TYPES.find(a => a.value === act.type) || ACTION_TYPES[0];
        return (
          <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <span className="text-xs font-mono text-slate-400 shrink-0">THEN</span>
                <select
                  value={act.type}
                  onChange={e => updateAction(i, { type: e.target.value, params: {} })}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white flex-1 min-w-[220px]"
                >
                  {ACTION_TYPES.map(a => (
                    <option key={a.value} value={a.value}>{a.icon} {a.label}</option>
                  ))}
                </select>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${RISK_COLORS[meta.risk]}`}>
                  {meta.risk} risk
                </span>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600 shrink-0" onClick={() => removeAction(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <p className="text-xs text-slate-500 ml-12">{meta.description}</p>

            {/* Extra params per action type */}
            {act.type === "send_notification" && (
              <div className="ml-12 space-y-2">
                <input
                  type="text"
                  placeholder="Notification title"
                  value={act.params?.title || ""}
                  onChange={e => updateParams(i, { title: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                />
                <input
                  type="text"
                  placeholder="Notification message"
                  value={act.params?.message || ""}
                  onChange={e => updateParams(i, { message: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
            )}

            {act.type === "push_script" && (
              <div className="ml-12 space-y-2">
                <input
                  type="text"
                  placeholder="Script name (optional)"
                  value={act.params?.script_name || ""}
                  onChange={e => updateParams(i, { script_name: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                />
                <textarea
                  placeholder="# PowerShell script content&#10;Write-Output 'Remediating device...'"
                  value={act.params?.script_content || ""}
                  onChange={e => updateParams(i, { script_content: e.target.value })}
                  rows={5}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-mono"
                />
              </div>
            )}

            {(act.type === "wipe_device" || act.type === "retire_device" || act.type === "disable_device") && (
              <div className="ml-12 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                ⚠️ <span>This action is <strong>destructive</strong> and may be irreversible. Ensure your conditions are precise before running.</span>
              </div>
            )}
          </div>
        );
      })}

      <Button variant="outline" size="sm" className="gap-1.5" onClick={addAction}>
        <Plus className="h-3.5 w-3.5" /> Add Action
      </Button>
    </div>
  );
}