import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { KeyRound, Plus, Copy, CheckCircle2, Loader2, Trash2, RefreshCw } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, differenceInDays } from "date-fns";

function getDaysLeft(expiry) {
  return differenceInDays(new Date(expiry), new Date());
}

export default function LicenseAdmin() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ client_name: "", tenant_ids: "", expiry_date: "" });
  const [generatedKey, setGeneratedKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const { data: licenses = [], isLoading } = useQuery({
    queryKey: ["licenses"],
    queryFn: () => base44.entities.License.list("-created_date"),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const res = await base44.functions.invoke("licenseManager", {
        action: "generate",
        ...form,
      });
      return res.data;
    },
    onSuccess: async (data) => {
      if (!data.success) { setError(data.error); return; }
      setGeneratedKey(data.license_key);
      // Save to DB
      await base44.entities.License.create({
        client_name: form.client_name,
        tenant_ids: form.tenant_ids,
        license_key: data.license_key,
        issued_date: new Date().toISOString().split("T")[0],
        expiry_date: form.expiry_date,
        status: "active",
      });
      qc.invalidateQueries({ queryKey: ["licenses"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.License.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licenses"] }),
  });

  const copyKey = (key) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Default expiry = 1 year from today
  const defaultExpiry = new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader title="License Management" subtitle="Generate and manage yearly license keys for clients" icon={KeyRound} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Generate Form */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="font-semibold text-slate-800 mb-4">Generate New License Key</h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1 block">Client / Company Name</label>
              <input
                value={form.client_name}
                onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                placeholder="Acme Corporation"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1 block">Azure Tenant ID(s)</label>
              <input
                value={form.tenant_ids}
                onChange={e => setForm(f => ({ ...f, tenant_ids: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx, yyyy..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1">Comma-separate multiple tenant IDs to cover all of them with one key</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1 block">Expiry Date</label>
              <input
                type="date"
                value={form.expiry_date || defaultExpiry}
                onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || !form.client_name || !form.tenant_ids || !form.expiry_date}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Generate License Key
            </Button>
          </div>
        </div>

        {/* Generated Key Display */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 flex flex-col">
          <h2 className="font-semibold text-slate-300 mb-4">Generated Key</h2>
          {!generatedKey ? (
            <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
              Fill the form and click Generate to create a license key
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4">
              <div className="bg-slate-800 rounded-lg p-4 break-all">
                <code className="text-emerald-400 text-xs leading-relaxed">{generatedKey}</code>
              </div>
              <Button
                variant="outline"
                className="border-slate-600 text-slate-300 hover:bg-slate-800 gap-2"
                onClick={() => copyKey(generatedKey)}
              >
                {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy Key"}
              </Button>
              <p className="text-xs text-slate-500">Send this key to your client. They will enter it in the License Activation screen.</p>
            </div>
          )}
        </div>
      </div>

      {/* Issued Licenses Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Issued Licenses</h2>
          <Button variant="ghost" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ["licenses"] })}>
            <RefreshCw className="h-4 w-4 text-slate-400" />
          </Button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : licenses.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">No licenses issued yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Client", "Tenant IDs", "Issued", "Expires", "Status", "Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {licenses.map(lic => {
                const days = getDaysLeft(lic.expiry_date);
                return (
                  <tr key={lic.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{lic.client_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate" title={lic.tenant_ids}>{lic.tenant_ids}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{lic.issued_date ? format(new Date(lic.issued_date), "dd MMM yyyy") : "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{format(new Date(lic.expiry_date), "dd MMM yyyy")}</td>
                    <td className="px-4 py-3">
                      {days < 0
                        ? <Badge className="bg-red-100 text-red-700">Expired</Badge>
                        : days <= 30
                        ? <Badge className="bg-amber-100 text-amber-700">Expiring in {days}d</Badge>
                        : <Badge className="bg-emerald-100 text-emerald-700">Active · {days}d left</Badge>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => copyKey(lic.license_key)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                          onClick={() => deleteMutation.mutate(lic.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}