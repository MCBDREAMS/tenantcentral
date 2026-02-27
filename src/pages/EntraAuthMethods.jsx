import React, { useState } from "react";
import { KeyRound, Smartphone, Lock, ShieldCheck, Mail, Hash } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import ReadOnlyBanner from "@/components/shared/ReadOnlyBanner";
import { useRbac } from "@/components/shared/useRbac";
import { logAction } from "@/components/shared/auditLogger";

const AUTH_METHODS = [
  { id: "microsoft_authenticator", name: "Microsoft Authenticator", description: "Push notifications, passwordless phone sign-in", icon: Smartphone, category: "MFA", defaultEnabled: true, recommended: true },
  { id: "fido2", name: "FIDO2 Security Keys", description: "Hardware security keys (YubiKey, etc.)", icon: KeyRound, category: "Passwordless", defaultEnabled: false, recommended: true },
  { id: "windows_hello", name: "Windows Hello for Business", description: "Biometric & PIN-based authentication", icon: Lock, category: "Passwordless", defaultEnabled: true, recommended: true },
  { id: "totp", name: "TOTP / Third-party Auth Apps", description: "Google Authenticator, Authy, etc.", icon: Hash, category: "MFA", defaultEnabled: true, recommended: false },
  { id: "sms", name: "SMS One-Time Passcode", description: "Text message verification code", icon: Smartphone, category: "MFA", defaultEnabled: false, recommended: false },
  { id: "email_otp", name: "Email OTP", description: "One-time code sent via email (external users)", icon: Mail, category: "MFA", defaultEnabled: true, recommended: false },
  { id: "temp_access_pass", name: "Temporary Access Pass", description: "Time-limited passcode for onboarding", icon: ShieldCheck, category: "Recovery", defaultEnabled: false, recommended: true },
  { id: "certificate_auth", name: "Certificate-Based Auth", description: "Smart cards and X.509 certificates", icon: KeyRound, category: "Passwordless", defaultEnabled: false, recommended: false },
];

const catColors = {
  MFA: "bg-blue-50 text-blue-700",
  Passwordless: "bg-emerald-50 text-emerald-700",
  Recovery: "bg-amber-50 text-amber-700",
};

export default function EntraAuthMethods({ selectedTenant }) {
  const { canEdit } = useRbac();
  const [states, setStates] = useState(() => Object.fromEntries(AUTH_METHODS.map(m => [m.id, m.defaultEnabled])));

  const toggle = async (id, val) => {
    if (!canEdit()) return;
    setStates(s => ({ ...s, [id]: val }));
    const method = AUTH_METHODS.find(m => m.id === id);
    await logAction({ action: val ? "ENABLE_AUTH_METHOD" : "DISABLE_AUTH_METHOD", category: "entra_policy", tenant_id: selectedTenant?.id, tenant_name: selectedTenant?.name, target_name: method?.name, severity: "warning" });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Authentication Methods"
        subtitle={selectedTenant ? `Auth methods for ${selectedTenant.name}` : "Configure authentication methods policy"}
        icon={KeyRound}
      />

      {!canEdit() && <ReadOnlyBanner />}

      <div className="grid gap-4">
        {["Passwordless", "MFA", "Recovery"].map(category => (
          <div key={category}>
            <div className="flex items-center gap-2 mb-3">
              <Badge className={`${catColors[category]} border-0 text-xs`}>{category}</Badge>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AUTH_METHODS.filter(m => m.category === category).map(method => {
                const Icon = method.icon;
                const enabled = states[method.id];
                return (
                  <div key={method.id} className={`bg-white rounded-xl border p-4 flex items-start gap-4 transition-all ${enabled ? "border-slate-200" : "border-slate-100 opacity-60"}`}>
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${enabled ? "bg-slate-900" : "bg-slate-100"}`}>
                      <Icon className={`h-5 w-5 ${enabled ? "text-white" : "text-slate-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{method.name}</p>
                        {method.recommended && <Badge className="bg-blue-50 text-blue-600 border-0 text-xs">Recommended</Badge>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{method.description}</p>
                    </div>
                    <Switch checked={enabled} onCheckedChange={v => toggle(method.id, v)} disabled={!canEdit()} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {canEdit() && (
        <div className="mt-6 flex justify-end">
          <Button className="bg-slate-900 hover:bg-slate-800" onClick={async () => {
            await logAction({ action: "SAVE_AUTH_METHODS_POLICY", category: "entra_policy", tenant_id: selectedTenant?.id, tenant_name: selectedTenant?.name, target_name: "Authentication Methods Policy", severity: "warning" });
          }}>
            Save Policy
          </Button>
        </div>
      )}
    </div>
  );
}