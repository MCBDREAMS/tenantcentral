import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Plus, Trash2, Pencil, LogIn, Plug, CheckCircle2,
  XCircle, Loader2, Link, Eye, EyeOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";

const emptyTenant = { name: "", tenant_id: "", domain: "", status: "pending", subscription_type: "E5", notes: "" };

export default function Tenants() {
  const [showDialog, setShowDialog] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [connectingTenant, setConnectingTenant] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyTenant);
  const [connectForm, setConnectForm] = useState({ client_id: "", client_secret: "", link_user_email: "" });
  const [showSecret, setShowSecret] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkResult, setLinkResult] = useState(null);
  const queryClient = useQueryClient();

  const { data: tenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Tenant.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); closeDialog(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Tenant.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); closeDialog(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Tenant.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenants'] }),
  });

  const openCreate = () => { setEditing(null); setForm(emptyTenant); setShowDialog(true); };
  const openEdit = (t) => {
    setEditing(t);
    setForm({ name: t.name, tenant_id: t.tenant_id, domain: t.domain, status: t.status, subscription_type: t.subscription_type, notes: t.notes || "" });
    setShowDialog(true);
  };
  const closeDialog = () => { setShowDialog(false); setEditing(null); setForm(emptyTenant); };

  const openConnect = (t) => {
    setConnectingTenant(t);
    setConnectForm({ client_id: t.azure_client_id || "", client_secret: "", link_user_email: t.linked_user_email || "" });
    setTestResult(null);
    setLinkResult(null);
    setShowConnectDialog(true);
  };
  const closeConnect = () => { setShowConnectDialog(false); setConnectingTenant(null); setTestResult(null); setLinkResult(null); };

  const handleSave = () => {
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await base44.functions.invoke("testTenantConnection", {
        action: "test_connection",
        tenant_id: connectingTenant.tenant_id,
        client_id: connectForm.client_id || undefined,
        client_secret: connectForm.client_secret || undefined,
      });
      const data = res.data;
      if (data.success) {
        // Save credentials and mark connected
        await base44.entities.Tenant.update(connectingTenant.id, {
          azure_client_id: connectForm.client_id || undefined,
          azure_client_secret: connectForm.client_secret || undefined,
          status: "connected",
        });
        queryClient.invalidateQueries({ queryKey: ['tenants'] });
        setTestResult({ success: true, message: `✓ Connected to ${data.org_name || connectingTenant.name}` });
      } else {
        await base44.entities.Tenant.update(connectingTenant.id, { status: "disconnected" });
        queryClient.invalidateQueries({ queryKey: ['tenants'] });
        setTestResult({ success: false, message: data.error || "Connection failed" });
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    }
    setTesting(false);
  };

  const handleLinkUser = async () => {
    if (!connectForm.link_user_email) return;
    setLinking(true);
    setLinkResult(null);
    try {
      const res = await base44.functions.invoke("testTenantConnection", {
        action: "link_user",
        tenant_record_id: connectingTenant.id,
        link_user_email: connectForm.link_user_email,
      });
      const data = res.data;
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['tenants'] });
        setLinkResult({ success: true, message: `✓ ${connectForm.link_user_email} is now restricted to this tenant only` });
      } else {
        setLinkResult({ success: false, message: data.error || "Linking failed" });
      }
    } catch (err) {
      setLinkResult({ success: false, message: err.message });
    }
    setLinking(false);
  };

  const handleAzureLogin = (tenant) => {
    window.open(`https://portal.azure.com/${tenant.tenant_id || tenant.domain}`, "_blank");
  };

  const columns = [
    { header: "Name", accessor: "name", render: (row) => <span className="font-medium text-slate-800">{row.name}</span> },
    { header: "Tenant ID", accessor: "tenant_id", render: (row) => <code className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{row.tenant_id}</code> },
    { header: "Domain", accessor: "domain" },
    { header: "License", accessor: "subscription_type" },
    {
      header: "Status", accessor: "status", render: (row) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={row.status} />
          {row.azure_client_id && <Badge className="bg-blue-50 text-blue-600 border-blue-100 text-[10px]">Custom Creds</Badge>}
        </div>
      )
    },
    {
      header: "Linked User", accessor: "linked_user_email", render: (row) => (
        row.linked_user_email
          ? <span className="text-xs text-slate-500 flex items-center gap-1"><Link className="h-3 w-3" />{row.linked_user_email}</span>
          : <span className="text-xs text-slate-300">—</span>
      )
    },
    {
      header: "", accessor: "actions", render: (row) => (
        <div className="flex gap-1 items-center">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => openConnect(row)}>
            <Plug className="h-3.5 w-3.5" /> Connect
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => handleAzureLogin(row)}>
            <LogIn className="h-3.5 w-3.5" /> Portal
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(row)}>
            <Pencil className="h-3.5 w-3.5 text-slate-400" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate(row.id)}>
            <Trash2 className="h-3.5 w-3.5 text-red-400" />
          </Button>
        </div>
      )
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Tenants"
        subtitle="Manage your Azure AD tenants"
        icon={Building2}
        actions={
          <Button onClick={openCreate} className="gap-2 bg-slate-900 hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Add Tenant
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={tenants}
        onExport={(d) => exportToCSV(d, "tenants")}
        emptyMessage="No tenants added yet. Click 'Add Tenant' to get started."
      />

      {/* Add / Edit Tenant Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Tenant" : "Add Tenant"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Tenant Name</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Contoso Ltd" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tenant ID</Label>
              <Input value={form.tenant_id} onChange={e => setForm({...form, tenant_id: e.target.value})} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Domain</Label>
              <Input value={form.domain} onChange={e => setForm({...form, domain: e.target.value})} placeholder="contoso.onmicrosoft.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="connected">Connected</SelectItem>
                    <SelectItem value="disconnected">Disconnected</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">License</Label>
                <Select value={form.subscription_type} onValueChange={v => setForm({...form, subscription_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["E3", "E5", "P1", "P2", "Business Premium", "Other"].map(l => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} className="bg-slate-900 hover:bg-slate-800">
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connect & Link Dialog */}
      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-slate-600" />
              Connect: {connectingTenant?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Credentials section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-5 w-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center font-bold shrink-0">1</div>
                <p className="text-sm font-semibold text-slate-700">Azure App Registration Credentials</p>
              </div>
              <p className="text-xs text-slate-500 ml-7">Leave blank to use the global credentials from environment variables. Enter custom credentials to override for this tenant only.</p>
              <div className="ml-7 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Client ID (optional override)</Label>
                  <Input
                    value={connectForm.client_id}
                    onChange={e => setConnectForm({ ...connectForm, client_id: e.target.value })}
                    placeholder="Use global AZURE_CLIENT_ID"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Client Secret (optional override)</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? "text" : "password"}
                      value={connectForm.client_secret}
                      onChange={e => setConnectForm({ ...connectForm, client_secret: e.target.value })}
                      placeholder="Use global AZURE_CLIENT_SECRET"
                      className="font-mono text-xs pr-10"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowSecret(!showSecret)}>
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button onClick={handleTestConnection} disabled={testing} className="bg-slate-900 hover:bg-slate-800 w-full">
                  {testing
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Testing…</>
                    : <><Plug className="h-4 w-4 mr-2" />Test Connection & Save</>}
                </Button>
                {testResult && (
                  <div className={`flex items-center gap-2 text-sm p-3 rounded-lg border ${testResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {testResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                    {testResult.message}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* Link user section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-5 w-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center font-bold shrink-0">2</div>
                <p className="text-sm font-semibold text-slate-700">Link App User to This Tenant</p>
              </div>
              <p className="text-xs text-slate-500 ml-7">The linked user will only be able to see and manage <strong>this tenant</strong>. They cannot access any other tenant's data.</p>
              <div className="ml-7 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">User Email (must already be invited to this app)</Label>
                  <Input
                    value={connectForm.link_user_email}
                    onChange={e => setConnectForm({ ...connectForm, link_user_email: e.target.value })}
                    placeholder="user@company.com"
                    type="email"
                  />
                </div>
                <Button onClick={handleLinkUser} disabled={linking || !connectForm.link_user_email} variant="outline" className="w-full">
                  {linking
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Linking…</>
                    : <><Link className="h-4 w-4 mr-2" />Link User to Tenant</>}
                </Button>
                {linkResult && (
                  <div className={`flex items-center gap-2 text-sm p-3 rounded-lg border ${linkResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {linkResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                    {linkResult.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeConnect}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}