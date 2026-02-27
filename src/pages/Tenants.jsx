import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { exportToCSV } from "@/components/shared/exportUtils";

const emptyTenant = { name: "", tenant_id: "", domain: "", status: "pending", subscription_type: "E5", notes: "" };

export default function Tenants() {
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyTenant);
  const queryClient = useQueryClient();

  const { data: tenants = [], isLoading } = useQuery({
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
  const openEdit = (t) => { setEditing(t); setForm({ name: t.name, tenant_id: t.tenant_id, domain: t.domain, status: t.status, subscription_type: t.subscription_type, notes: t.notes || "" }); setShowDialog(true); };
  const closeDialog = () => { setShowDialog(false); setEditing(null); setForm(emptyTenant); };

  const handleSave = () => {
    if (editing) {
      updateMut.mutate({ id: editing.id, data: form });
    } else {
      createMut.mutate(form);
    }
  };

  const columns = [
    { header: "Name", accessor: "name", render: (row) => <span className="font-medium text-slate-800">{row.name}</span> },
    { header: "Tenant ID", accessor: "tenant_id", render: (row) => <code className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{row.tenant_id}</code> },
    { header: "Domain", accessor: "domain" },
    { header: "License", accessor: "subscription_type" },
    { header: "Status", accessor: "status", render: (row) => <StatusBadge status={row.status} /> },
    {
      header: "", accessor: "actions", render: (row) => (
        <div className="flex gap-1">
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
    </div>
  );
}