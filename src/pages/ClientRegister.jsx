import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, CheckCircle2, Loader2, ArrowRight, UserCheck, UserPlus, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STEPS = ["Company Info", "Tenant Details", "Your Account"];

export default function ClientRegister() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { user_type: 'tenant_admin' | 'standard_user', ... }
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    company_name: "",
    tenant_id: "",
    tenant_domain: "",
    admin_username: "",
    admin_email: "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const canNextStep0 = form.company_name.trim().length > 0;
  const canNextStep1 = form.tenant_id.trim().length > 0 && form.tenant_domain.trim().length > 0;
  const canSubmit = form.admin_email.trim().length > 0 && form.admin_username.trim().length > 0;

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("registerClientTenant", form);
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const isTenantAdmin = result.user_type === "tenant_admin";
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
          <div className={`h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-5 ${isTenantAdmin ? "bg-blue-100" : "bg-emerald-100"}`}>
            {isTenantAdmin
              ? <Shield className="h-8 w-8 text-blue-600" />
              : <UserCheck className="h-8 w-8 text-emerald-600" />
            }
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {isTenantAdmin ? "Tenant Registered!" : "Account Created!"}
          </h2>
          <p className="text-slate-500 text-sm mb-4">
            {isTenantAdmin ? (
              <>
                <span className="font-semibold text-slate-700">{form.admin_email}</span> has been set as{" "}
                <span className="font-semibold text-blue-600">Tenant Administrator</span> for{" "}
                <span className="font-semibold text-slate-700">{form.company_name}</span>.
              </>
            ) : (
              <>
                <span className="font-semibold text-slate-700">{form.admin_email}</span> has been added as a{" "}
                <span className="font-semibold text-slate-700">Standard User</span> for{" "}
                <span className="font-semibold text-slate-700">{form.company_name}</span>.
              </>
            )}
          </p>
          {isTenantAdmin ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left text-sm text-blue-700 mb-4 space-y-1">
              <p className="font-semibold text-blue-800 mb-2">Your Tenant Admin privileges:</p>
              <p>• Full access to your tenant's Entra, Intune, and Security sections</p>
              <p>• Elevate other users' access levels</p>
              <p>• Manage policies, devices, users and scripts</p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left text-sm text-amber-700 mb-4">
              <p className="font-semibold text-amber-800 mb-1">Read-only access</p>
              <p>Your Tenant Administrator can elevate your permissions as required.</p>
            </div>
          )}
          <p className="text-xs text-slate-400">A confirmation email has been sent to <span className="font-semibold">{form.admin_email}</span>. Log in to access your dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-8 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Tenant Registration</h1>
              <p className="text-blue-100 text-sm">Azure Multi-Tenant Admin</p>
            </div>
          </div>
          <p className="text-blue-100 text-xs mt-3 bg-white/10 rounded-lg px-3 py-2">
            First registration for a Tenant ID creates a <strong>Tenant Admin</strong> account. Subsequent registrations with the same Tenant ID create <strong>Standard User</strong> accounts.
          </p>
        </div>

        {/* Step Indicators */}
        <div className="flex border-b border-slate-100">
          {STEPS.map((label, i) => (
            <div key={i} className={`flex-1 py-3 text-center text-xs font-medium transition-colors ${
              i === step ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50" :
              i < step ? "text-emerald-600 bg-emerald-50" : "text-slate-400"
            }`}>
              {i < step ? "✓ " : `${i + 1}. `}{label}
            </div>
          ))}
        </div>

        <div className="p-8 space-y-5">
          {/* Step 0: Company Info */}
          {step === 0 && (
            <>
              <p className="text-sm text-slate-500">Enter your organisation name to get started.</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Company / Organisation Name *</Label>
                <Input
                  placeholder="Contoso Ltd"
                  value={form.company_name}
                  onChange={e => set("company_name", e.target.value)}
                  className="h-10"
                />
              </div>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
                disabled={!canNextStep0}
                onClick={() => setStep(1)}
              >
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Step 1: Tenant Details */}
          {step === 1 && (
            <>
              <p className="text-sm text-slate-500">
                Provide your <strong>Azure Tenant ID</strong> — this uniquely identifies your organisation in Microsoft 365.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Azure Tenant ID *</Label>
                <Input
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={form.tenant_id}
                  onChange={e => set("tenant_id", e.target.value)}
                  className="h-10 font-mono text-sm"
                />
                <p className="text-xs text-slate-400">Found in: Azure Portal → Azure Active Directory → Overview</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Primary Domain *</Label>
                <Input
                  placeholder="contoso.onmicrosoft.com"
                  value={form.tenant_domain}
                  onChange={e => set("tenant_domain", e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>Back</Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
                  disabled={!canNextStep1}
                  onClick={() => setStep(2)}
                >
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {/* Step 2: Account Details */}
          {step === 2 && (
            <>
              <p className="text-sm text-slate-500">
                Provide your account details. You'll use this email to log in.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Full Name *</Label>
                <Input
                  placeholder="John Smith"
                  value={form.admin_username}
                  onChange={e => set("admin_username", e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Email Address *</Label>
                <Input
                  type="email"
                  placeholder="john@contoso.com"
                  value={form.admin_email}
                  onChange={e => set("admin_email", e.target.value)}
                  className="h-10"
                />
                <p className="text-xs text-slate-400">This email will be your login to access the tenant dashboard.</p>
              </div>

              <div className="bg-slate-50 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1">
                <p className="font-semibold text-slate-600">Registration summary</p>
                <p>Organisation: <span className="text-slate-800 font-medium">{form.company_name}</span></p>
                <p>Azure Tenant ID: <span className="text-slate-800 font-mono">{form.tenant_id}</span></p>
                <p>Domain: <span className="text-slate-800">{form.tenant_domain}</span></p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)} disabled={loading}>Back</Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
                  disabled={!canSubmit || loading}
                  onClick={handleSubmit}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {loading ? "Registering..." : "Register Account"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}