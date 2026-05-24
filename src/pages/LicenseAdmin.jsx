import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  KeyRound, Plus, Copy, CheckCircle2, Loader2, Trash2, RefreshCw,
  Users, Mail, Shield, UserPlus, Building2, Crown, Eye
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, differenceInDays } from "date-fns";

function getDaysLeft(expiry) {
  return differenceInDays(new Date(expiry), new Date());
}

const ROLE_COLORS = {
  admin: "bg-purple-100 text-purple-700",
  user: "bg-blue-100 text-blue-700",
};

const ROLE_ICONS = {
  admin: Crown,
  user: Eye,
};

export default function LicenseAdmin() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("licenses");

  // License state
  const [form, setForm] = useState({ client_name: "", tenant_ids: "", expiry_date: "" });
  const [generatedKey, setGeneratedKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [licError, setLicError] = useState(null);

  // User invite state
  const [inviteForm, setInviteForm] = useState({ email: "", role: "user", tenant_id: "" });
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // ── Data queries ────────────────────────────────────────────────────────
  const { data: licenses = [], isLoading: licLoading } = useQuery({
    queryKey: ["licenses"],
    queryFn: () => base44.entities.License.list("-created_date"),
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["app-users"],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
  });

  // ── License mutations ────────────────────────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: async () => {
      setLicError(null);
      const res = await base44.functions.invoke("licenseManager", { action: "generate", ...form });
      return res.data;
    },
    onSuccess: async (data) => {
      if (!data.success) { setLicError(data.error); return; }
      setGeneratedKey(data.license_key);
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

  const deleteLicMutation = useMutation({
    mutationFn: (id) => base44.entities.License.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licenses"] }),
  });

  // ── User mutations ────────────────────────────────────────────────────────
  const inviteMutation = useMutation({
    mutationFn: async () => {
      setInviteError(null);
      setInviteSuccess(false);
      await base44.users.inviteUser(inviteForm.email, inviteForm.role);
      // Link to tenant if selected
      if (inviteForm.tenant_id) {
        const tenant = tenants.find(t => t.id === inviteForm.tenant_id);
        if (tenant) {
          await base44.entities.Tenant.update(inviteForm.tenant_id, {
            linked_user_email: inviteForm.email.toUpperCase()
          });
        }
      }
    },
    onSuccess: () => {
      setInviteSuccess(true);
      setInviteForm({ email: "", role: "user", tenant_id: "" });
      qc.invalidateQueries({ queryKey: ["app-users"] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (err) => setInviteError(err.message || "Failed to invite user"),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }) => base44.entities.User.update(id, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });

  const copyKey = (key) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const defaultExpiry = new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0];

  // Find which tenant a user is linked to
  const getUserTenant = (email) =>
    tenants.find(t => t.linked_user_email?.toUpperCase() === email?.toUpperCase());

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader title="License & User Management" subtitle="Manage license keys and app user accounts" icon={KeyRound} />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("licenses")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === "licenses" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
        >
          <span className="flex items-center gap-2"><KeyRound className="h-4 w-4" />License Keys</span>
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === "users" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
        >
          <span className="flex items-center gap-2"><Users className="h-4 w-4" />User Accounts {users.length > 0 && <span className="bg-blue-100 text-blue-700 text-xs px-1.5 rounded-full">{users.length}</span>}</span>
        </button>
      </div>

      {/* ── LICENSE TAB ── */}
      {activeTab === "licenses" && (
        <>
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
                  <p className="text-xs text-slate-400 mt-1">Comma-separate multiple tenant IDs</p>
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
                {licError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{licError}</p>}
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
            {licLoading ? (
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
                              onClick={() => deleteLicMutation.mutate(lic.id)}>
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
        </>
      )}

      {/* ── USERS TAB ── */}
      {activeTab === "users" && (
        <div className="space-y-6">
          {/* Invite new user */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-blue-600" /> Invite New User
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1 block">Email Address</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="user@company.com"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1 block">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1 block">Link to Tenant</label>
                <select
                  value={inviteForm.tenant_id}
                  onChange={e => setInviteForm(f => ({ ...f, tenant_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">— None —</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button
                onClick={() => inviteMutation.mutate()}
                disabled={inviteMutation.isPending || !inviteForm.email}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              >
                {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send Invite
              </Button>
              {inviteSuccess && <span className="text-sm text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Invite sent!</span>}
              {inviteError && <span className="text-sm text-red-600">{inviteError}</span>}
            </div>
          </div>

          {/* User list */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" /> App Users
              </h2>
              <Button variant="ghost" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ["app-users"] })}>
                <RefreshCw className="h-4 w-4 text-slate-400" />
              </Button>
            </div>
            {usersLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : users.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-400">No users found</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["User", "Email", "Role", "Linked Tenant", "Joined", "Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map(u => {
                    const linkedTenant = getUserTenant(u.email);
                    const RoleIcon = ROLE_ICONS[u.role] || Eye;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {(u.full_name || u.email || "?")[0].toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-800 truncate max-w-[120px]">{u.full_name || "—"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{u.email}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Badge className={`${ROLE_COLORS[u.role] || "bg-slate-100 text-slate-600"} gap-1 flex items-center`}>
                              <RoleIcon className="h-3 w-3" />{u.role}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {linkedTenant ? (
                            <span className="flex items-center gap-1 text-xs text-slate-700">
                              <Building2 className="h-3 w-3 text-blue-500" />{linkedTenant.name}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {u.created_date ? format(new Date(u.created_date), "dd MMM yyyy") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {/* Toggle role */}
                            <Button
                              size="sm" variant="ghost"
                              title={u.role === "admin" ? "Demote to user" : "Promote to admin"}
                              onClick={() => updateRoleMutation.mutate({ id: u.id, role: u.role === "admin" ? "user" : "admin" })}
                            >
                              <Shield className="h-3.5 w-3.5 text-slate-400" />
                            </Button>
                            <Button
                              size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                              title="Delete user"
                              onClick={() => {
                                if (confirm(`Delete ${u.email}?`)) deleteUserMutation.mutate(u.id);
                              }}
                            >
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
      )}
    </div>
  );
}