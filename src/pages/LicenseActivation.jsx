import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { KeyRound, CheckCircle2, XCircle, Loader2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LicenseActivation({ onActivated }) {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const activate = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    const res = await base44.functions.invoke("licenseManager", {
      action: "validate",
      license_key: key.trim(),
    });
    const data = res.data;
    setLoading(false);

    if (!data.valid) {
      setError(data.reason || "Invalid license key");
      return;
    }

    // Store the key in localStorage
    localStorage.setItem("tc_license_key", key.trim());
    localStorage.setItem("tc_license_expiry", data.expiryDate);
    localStorage.setItem("tc_license_client", data.clientName || "");

    setSuccess(data);
    setTimeout(() => {
      if (onActivated) onActivated();
      else window.location.reload();
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-2xl mb-4">
            <Layers className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Tenant Central</h1>
          <p className="text-slate-400 text-sm mt-1">Azure Multi-Tenant Management</p>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-9 w-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <KeyRound className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold">License Activation</h2>
              <p className="text-xs text-slate-400">Enter your license key to continue</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 block">License Key</label>
              <textarea
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="TC-XXXX-XXXX-XXXX-XXXX-..."
                rows={3}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-mono"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-400">
                <XCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 bg-emerald-900/30 border border-emerald-800 rounded-xl px-4 py-3 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                License activated for <strong className="ml-1">{success.clientName}</strong> — valid for {success.daysRemaining} days
              </div>
            )}

            <Button
              onClick={activate}
              disabled={loading || !key.trim() || !!success}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 h-11"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {loading ? "Validating..." : "Activate License"}
            </Button>
          </div>

          <p className="text-xs text-slate-600 text-center mt-6">
            Contact your administrator if you don't have a license key.
          </p>
        </div>
      </div>
    </div>
  );
}