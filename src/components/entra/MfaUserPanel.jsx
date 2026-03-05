import React, { useState } from "react";
import { ShieldCheck, ShieldX, Shield, Pencil, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { logAction } from "@/components/shared/auditLogger";

const MFA_METHODS = ["Microsoft Authenticator", "TOTP App", "SMS", "Email OTP", "FIDO2 Key", "Windows Hello", "Certificate"];

const statusConfig = {
  enabled:  { icon: ShieldCheck, cls: "text-emerald-600 bg-emerald-50", label: "Enabled" },
  enforced: { icon: ShieldCheck, cls: "text-blue-600 bg-blue-50", label: "Enforced" },
  disabled: { icon: ShieldX,    cls: "text-red-500 bg-red-50",   label: "Disabled" },
};

export default function MfaUserPanel({ user, tenant, canEdit, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [mfaStatus, setMfaStatus] = useState(user.mfa_status || "disabled");
  const [methods, setMethods] = useState((user.mfa_methods || "").split(",").filter(Boolean));
  const [saving, setSaving] = useState(false);

  const cfg = statusConfig[mfaStatus] || statusConfig.disabled;
  const Icon = cfg.icon;

  const toggleMethod = (m) => {
    setMethods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const save = async () => {
    setSaving(true);
    await base44.entities.EntraUser.update(user.id, { mfa_status: mfaStatus, mfa_methods: methods.join(",") });
    await logAction({ action: "UPDATE_MFA_STATUS", category: "entra_user", tenant_id: tenant?.id, tenant_name: tenant?.name, target_name: user.display_name, severity: "warning" });
    setSaving(false);
    setEditing(false);
    onUpdated?.();
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.cls}`}>
        <Icon className="h-3.5 w-3.5" />
        {cfg.label}
      </div>
      {(user.mfa_methods || "").split(",").filter(Boolean).map(m => (
        <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
      ))}
      {canEdit && !editing && (
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setEditing(true)}>
          <Pencil className="h-3 w-3" />
        </Button>
      )}
      {editing && (
        <div className="w-full mt-2 p-3 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-slate-600 w-24">MFA Status</label>
            <Select value={mfaStatus} onValueChange={setMfaStatus}>
              <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="enforced">Enforced</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Auth Methods</label>
            <div className="flex flex-wrap gap-1.5">
              {MFA_METHODS.map(m => (
                <button key={m} onClick={() => toggleMethod(m)}
                  className={`px-2 py-1 rounded-full text-xs border transition-all ${methods.includes(m) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}><X className="h-3 w-3 mr-1" />Cancel</Button>
            <Button size="sm" className="h-7 text-xs bg-slate-900 hover:bg-slate-800" onClick={save} disabled={saving}><Check className="h-3 w-3 mr-1" />Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}