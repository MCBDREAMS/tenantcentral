import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  KeyRound, HelpCircle, Mail, CheckCircle2, XCircle, Loader2,
  ShieldCheck, BookOpen, MessageSquare, ExternalLink, Layers
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

function LicenseSection() {
  const [key, setKey] = useState(localStorage.getItem("tc_license_key") || "");
  const [status, setStatus] = useState(null); // null | valid | invalid
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("tc_license_key");
    if (stored) checkLicense(stored, true);
  }, []);

  const checkLicense = async (k, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await base44.functions.invoke("licenseManager", { action: "validate", license_key: k || key });
      if (res.data?.valid) {
        setStatus("valid");
        setInfo(res.data);
        localStorage.setItem("tc_license_key", k || key);
        if (res.data.expiry_date) localStorage.setItem("tc_license_expiry", res.data.expiry_date);
      } else {
        setStatus("invalid");
        setInfo(null);
      }
    } catch {
      setStatus("invalid");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const revoke = () => {
    localStorage.removeItem("tc_license_key");
    localStorage.removeItem("tc_license_expiry");
    setKey("");
    setStatus(null);
    setInfo(null);
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <KeyRound className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">License Activation</h3>
            <p className="text-xs text-slate-500">Enter your license key to activate the application</p>
          </div>
        </div>

        {status === "valid" && info && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
              <CheckCircle2 className="h-4 w-4" /> License Active
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              {info.client_name && <div><span className="text-slate-400">Client:</span> {info.client_name}</div>}
              {info.expiry_date && <div><span className="text-slate-400">Expires:</span> {info.expiry_date}</div>}
            </div>
          </div>
        )}

        {status === "invalid" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-600 text-sm">
            <XCircle className="h-4 w-4" /> Invalid or expired license key.
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600">License Key</Label>
          <Input
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="font-mono text-sm h-10"
          />
        </div>

        <div className="flex gap-3">
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
            disabled={!key.trim() || loading}
            onClick={() => checkLicense()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {loading ? "Validating..." : "Activate License"}
          </Button>
          {status === "valid" && (
            <Button variant="outline" onClick={revoke} className="text-red-500 border-red-200 hover:bg-red-50">
              Revoke
            </Button>
          )}
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-3">
        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> About This Application
        </h4>
        <div className="space-y-1.5 text-sm text-slate-600">
          <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-blue-400" /> Azure Multi-Tenant Admin <Badge className="ml-1 text-[10px] bg-blue-100 text-blue-700 border-0">v1.0</Badge></div>
          <p className="text-xs text-slate-400 mt-1">A centralised management portal for Microsoft Azure and Intune across multiple client tenants.</p>
        </div>
      </div>
    </div>
  );
}

function HelpSection() {
  const faqs = [
    { q: "How do I add a new tenant?", a: "Navigate to the Tenants page from the sidebar and click 'Add Tenant'. You'll need the Azure Tenant ID, domain, and App Registration credentials." },
    { q: "How do I sync data from Microsoft Graph?", a: "On any entity page (Users, Devices, Policies etc.), use the 'Quick Sync' button in the top right to pull the latest data from Microsoft Graph for the selected tenant." },
    { q: "What permissions does my Azure App Registration need?", a: "Your app registration needs: User.Read.All, Group.Read.All, Policy.Read.All, DeviceManagementManagedDevices.Read.All, and SecurityEvents.Read.All as application permissions." },
    { q: "How does tenant data separation work?", a: "Each tenant record is linked to a specific admin email. When a client logs in, the RBAC system automatically scopes all data queries to only their assigned tenant." },
    { q: "Where do I find my Azure Tenant ID?", a: "Go to Azure Portal → Azure Active Directory → Overview. The Tenant ID (a GUID) is displayed on the overview page." },
    { q: "How do I register a new client tenant?", a: "Share the /register link with your client. They fill in their company name, tenant ID, domain, and admin email. Once submitted, the system creates their scoped account automatically." },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {faqs.map((faq, i) => (
          <div key={i} className="p-5">
            <p className="text-sm font-semibold text-slate-800 mb-1.5 flex items-start gap-2">
              <HelpCircle className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" /> {faq.q}
            </p>
            <p className="text-sm text-slate-500 ml-6">{faq.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactSection() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSend = async () => {
    setLoading(true);
    await base44.integrations.Core.SendEmail({
      to: "support@yourdomain.com",
      subject: `[Support] ${form.subject} - from ${form.name}`,
      body: `Name: ${form.name}\nEmail: ${form.email}\n\nMessage:\n${form.message}`,
    });
    setLoading(false);
    setSent(true);
  };

  if (sent) return (
    <div className="max-w-lg">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
        <h3 className="font-semibold text-emerald-800 mb-1">Message Sent!</h3>
        <p className="text-sm text-emerald-600">We'll get back to you as soon as possible.</p>
        <Button variant="outline" className="mt-4" onClick={() => { setSent(false); setForm({ name: "", email: "", subject: "", message: "" }); }}>Send Another</Button>
      </div>
    </div>
  );

  return (
    <div className="max-w-lg space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Contact Support</h3>
            <p className="text-xs text-slate-500">We typically respond within 1 business day</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">Your Name</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Jane Smith" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">Email</Label>
            <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="you@company.com" className="h-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600">Subject</Label>
          <Input value={form.subject} onChange={e => set("subject", e.target.value)} placeholder="Describe your issue briefly" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600">Message</Label>
          <textarea
            value={form.message}
            onChange={e => set("message", e.target.value)}
            placeholder="Describe your issue in detail..."
            rows={5}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>
        <Button
          className="w-full bg-violet-600 hover:bg-violet-700 gap-2"
          disabled={!form.name || !form.email || !form.message || loading}
          onClick={handleSend}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {loading ? "Sending..." : "Send Message"}
        </Button>
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Other Ways to Reach Us</p>
        <div className="space-y-2 text-sm text-slate-600">
          <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /> support@yourdomain.com</div>
          <a href="https://docs.yourdomain.com" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline">
            <ExternalLink className="h-4 w-4" /> Documentation Portal
          </a>
        </div>
      </div>
    </div>
  );
}

export default function About() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="About"
        subtitle="License management, help resources, and support"
        icon={Layers}
      />
      <Tabs defaultValue="license">
        <TabsList className="mb-6">
          <TabsTrigger value="license" className="gap-2"><KeyRound className="h-3.5 w-3.5" />App Registration</TabsTrigger>
          <TabsTrigger value="help" className="gap-2"><HelpCircle className="h-3.5 w-3.5" />Help</TabsTrigger>
          <TabsTrigger value="contact" className="gap-2"><MessageSquare className="h-3.5 w-3.5" />Contact Support</TabsTrigger>
        </TabsList>
        <TabsContent value="license"><LicenseSection /></TabsContent>
        <TabsContent value="help"><HelpSection /></TabsContent>
        <TabsContent value="contact"><ContactSection /></TabsContent>
      </Tabs>
    </div>
  );
}