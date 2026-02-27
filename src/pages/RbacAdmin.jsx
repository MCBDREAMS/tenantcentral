import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/shared/PageHeader";
import { logAction } from "@/components/shared/auditLogger";

const roleColors = {
  global_admin: "bg-red-50 text-red-700",
  intune_admin: "bg-blue-50 text-blue-700",
  entra_admin: "bg-violet-50 text-violet-700",
  security_admin: "bg-amber-50 text-amber-700",
  readonly: "bg-slate-100 text-slate-600",
};

const roleDescriptions = {
  global_admin: "Full access to all tenants and all sections",
  intune_admin: "Manage devices, profiles, apps, scripts",
  entra_admin: "Manage users, groups, conditional access",
  security_admin: "Manage security baselines and policies",
  readonly: "View-only access, no changes allowed",
};

const SECTIONS = ["entra", "intune", "security", "scripts", "export"];

const emptyForm = { user_email: "", role: "readonly", assigned_tenants: "", allowed_sections: SECTIONS.join(","), notes: "", is_active: true };

export default function RbacAdmin({ tenants }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => base44.entities.AdminRole.list(),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
    initialData: tenants || [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.AdminRole.create(data),
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      await logAction({ action: "ASSIGN_ADMIN_ROLE", category: "rbac", target_name: created.user_email, details: `Role: ${created.role}`, severity: "warning" });
      setShowAdd(false);
      setForm(emptyForm);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.AdminRole.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-roles"] }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.AdminRole.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-roles"] }),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const getTenantNames = (ids) => {
    if (!ids) return "All tenants";
    return ids.split(",").map(id => allTenants.find(t => t.id === id.trim())?.name || id).join(", ");
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="RBAC Administration"
        subtitle="Assign role-based access to admins across tenants and sections"
        icon={UserCog}
        actions={
          <Button onClick={() => setShowAdd(true)} className="gap-2 bg-slate-900 hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Add Admin
          </Button>
        }
      />

      {/* Role reference */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {Object.entries(roleDescriptions).map(([role, desc]) => (
          <div key={role} className={`rounded-xl p-3 border border-slate-100 ${roleColors[role]} bg-opacity-50`}>
            <p className="text-xs font-semibold mb-1">{role.replace(/_/g, " ").toUpperCase()}</p>
            <p className="text-xs opacity-80">{desc}</p>
          </div>
        ))}
      </div>

      {/* Roles table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Admin Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tenants</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sections</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Active</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">Loading...</td></tr>
            ) : roles.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">No admin roles assigned yet</td></tr>
            ) : roles.map(r => (
              <tr key={r.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium text-slate-800">{r.user_email}</td>
                <td className="px-4 py-3">
                  <Badge className={`${roleColors[r.role] || roleColors.readonly} border-0 text-xs`}>
                    {(r.role || "").replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{getTenantNames(r.assigned_tenants)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {(r.allowed_sections || SECTIONS.join(",")).split(",").map(s => (
                    <Badge key={s} variant="outline" className="text-xs mr-1 mb-1">{s.trim()}</Badge>
                  ))}
                </td>
                <td className="px-4 py-3">
                  <Switch
                    checked={r.is_active !== false}
                    onCheckedChange={(v) => toggleActive.mutate({ id: r.id, is_active: v })}
                  />
                </td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(r.id)} className="px-2">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign Admin Role</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Admin Email</Label>
              <Input value={form.user_email} onChange={e => set("user_email", e.target.value)} placeholder="admin@contoso.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={v => set("role", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(roleDescriptions).map(r => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">{roleDescriptions[form.role]}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Assigned Tenants (leave blank = all)</Label>
              <Select value={form.assigned_tenants || "__all__"} onValueChange={v => set("assigned_tenants", v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All Tenants" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Tenants</SelectItem>
                  {allTenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Allowed Sections</Label>
              <div className="flex flex-wrap gap-2">
                {SECTIONS.map(s => {
                  const active = (form.allowed_sections || "").includes(s);
                  return (
                    <button key={s} onClick={() => {
                      const current = (form.allowed_sections || "").split(",").filter(Boolean);
                      const next = active ? current.filter(x => x !== s) : [...current, s];
                      set("allowed_sections", next.join(","));
                    }} className={`px-3 py-1 rounded-full text-xs border transition-all ${active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate(form)} className="bg-slate-900 hover:bg-slate-800" disabled={!form.user_email}>
              Assign Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}