import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STEPS = ["Company Info", "Tenant Details", "Admin User"];

export default function ClientRegister() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
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
      await base44.functions.invoke("registerClientTenant", form);
      setDone(true);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Registration Complete!</h2>
          <p className="text-slate-500 text-sm mb-6">
            Your organisation <span className="font-semibold text-slate-700">{form.company_name}</span> has been registered.
            A confirmation email has been sent to <span className="font-semibold text-slate-700">{form.admin_email}</span>.
          </p>
          <p className="text-xs text-slate-400">You can now log in with your registered email to access your tenant dashboard.</p>
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
              <p className="text-sm text-slate-500">Enter your company name to get started.</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Company Name *</Label>
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
              <p className="text-sm text-slate-500">Provide your Azure Tenant ID and domain.</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Azure Tenant ID *</Label>
                <Input
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={form.tenant_id}
                  onChange={e => set("tenant_id", e.target.value)}
                  className="h-10 font-mono text-sm"
                />
                <p className="text-xs text-slate-400">Found in Azure Portal → Azure Active Directory → Overview</p>
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

          {/* Step 2: Admin User */}
          {step === 2 && (
            <>
              <p className="text-sm text-slate-500">Provide the site administrator who will manage this tenant.</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Administrator Username *</Label>
                <Input
                  placeholder="John Smith"
                  value={form.admin_username}
                  onChange={e => set("admin_username", e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Administrator Email Address *</Label>
                <Input
                  type="email"
                  placeholder="admin@contoso.com"
                  value={form.admin_email}
                  onChange={e => set("admin_email", e.target.value)}
                  className="h-10"
                />
                <p className="text-xs text-slate-400">This email will be used to log in and access the tenant dashboard.</p>
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
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {loading ? "Registering..." : "Complete Registration"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}