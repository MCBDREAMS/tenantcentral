import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { X, User, Loader2, KeyRound, CheckCircle2, XCircle, Copy, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

function fmt(v) {
  if (!v) return "—";
  try { return format(new Date(v), "dd MMM yyyy"); } catch { return v; }
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between px-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      {React.isValidElement(value)
        ? <div className="ml-4">{value}</div>
        : <span className="text-sm text-slate-800 text-right ml-4 break-all">{value || "—"}</span>}
    </div>
  );
}

export default function UserDetailPanel({ user, azureTenantId, onClose }) {
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["entra_user_detail", user.graph_id || user.upn],
    enabled: !!(user.graph_id || user.upn) && !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_entra_user_detail",
        azure_tenant_id: azureTenantId,
        user_id: user.graph_id || user.upn,
      }).then(r => r.data),
  });

  const { data: mfaData, isLoading: loadingMfa } = useQuery({
    queryKey: ["user_mfa_detail", user.graph_id || user.upn],
    enabled: !!(user.graph_id || user.upn) && !!azureTenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_user_mfa_methods",
        azure_tenant_id: azureTenantId,
        user_upn: user.upn,
      }).then(r => r.data),
  });

  const d = data?.user || user;
  const mfaMethods = mfaData?.methods || [];

  const handleResetPassword = async () => {
    setResetting(true);
    setResetResult(null);
    try {
      const res = await base44.functions.invoke("portalData", {
        action: "reset_user_password",
        azure_tenant_id: azureTenantId,
        user_id: user.graph_id || user.upn,
      });
      setNewPassword(res.data?.temporaryPassword || "");
      setResetResult({ success: true });
    } catch (e) {
      setResetResult({ success: false, error: e.message });
    } finally {
      setResetting(false);
    }
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(newPassword);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-900">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-blue-400" />
            <div>
              <h2 className="text-white font-semibold">{user.display_name}</h2>
              <p className="text-xs text-slate-400">{user.upn}</p>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="text-slate-400 hover:text-white" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : (
            <>
              {/* Identity */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Identity</p>
                <div className="border border-slate-200 rounded-xl">
                  <Row label="Display Name" value={d.displayName || d.display_name} />
                  <Row label="UPN" value={d.userPrincipalName || d.upn} />
                  <Row label="Email" value={d.mail || d.email} />
                  <Row label="Job Title" value={d.jobTitle || d.job_title} />
                  <Row label="Department" value={d.department} />
                  <Row label="User Type" value={d.userType || d.user_type} />
                </div>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Account Status</p>
                <div className="border border-slate-200 rounded-xl">
                  <Row label="Account Enabled" value={
                    (d.accountEnabled ?? d.account_enabled) !== false
                      ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Enabled</Badge>
                      : <Badge className="bg-red-100 text-red-700 border-0 text-xs gap-1"><XCircle className="h-3 w-3" />Disabled</Badge>
                  } />
                  <Row label="Last Sign-In" value={fmt(d.signInActivity?.lastSignInDateTime || d.last_sign_in)} />
                  <Row label="Password Last Changed" value={fmt(d.lastPasswordChangeDateTime)} />
                  <Row label="Licenses" value={<span className="text-xs text-slate-600 text-right">{d.licenses || (d.assignedLicenses?.length ? `${d.assignedLicenses.length} license(s)` : "None")}</span>} />
                  <Row label="Entra Roles" value={d.entra_roles || "—"} />
                </div>
              </div>

              {/* MFA Methods */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  MFA Methods {loadingMfa && <Loader2 className="h-3 w-3 animate-spin inline ml-1" />}
                </p>
                {mfaMethods.length === 0 && !loadingMfa && (
                  <div className="border border-slate-200 rounded-xl p-3 text-xs text-slate-400 text-center">No MFA methods registered</div>
                )}
                {mfaMethods.length > 0 && (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {mfaMethods.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 px-4 py-2.5">
                        <Shield className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <span className="text-sm text-slate-800">{m["@odata.type"]?.replace("#microsoft.graph.", "") || m.id}</span>
                        {m.phoneNumber && <span className="text-xs text-slate-400">{m.phoneNumber}</span>}
                        {m.emailAddress && <span className="text-xs text-slate-400">{m.emailAddress}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reset Password */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Password Reset</p>
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs text-slate-500">Generate a temporary password and require user to change on next sign-in.</p>
                  <Button
                    onClick={handleResetPassword}
                    disabled={resetting}
                    className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    Reset Password
                  </Button>
                  {resetResult?.success && newPassword && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                      <p className="text-xs font-medium text-emerald-800">Temporary password generated:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-sm font-mono bg-white border border-emerald-300 rounded px-2 py-1 text-emerald-800">{newPassword}</code>
                        <Button size="sm" variant="outline" className="shrink-0" onClick={copyPassword}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <p className="text-xs text-emerald-700">User must change on next sign-in.</p>
                    </div>
                  )}
                  {resetResult?.success === false && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      <XCircle className="h-4 w-4 shrink-0" />{resetResult.error}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}