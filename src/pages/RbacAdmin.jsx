import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, Trash2, UserCog, ChevronUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import { logAction } from "@/components/shared/auditLogger";
import { useRbac } from "@/components/shared/useRbac";

const roleColors = {
  local_admin:    "bg-purple-50 text-purple-700",
  global_admin:   "bg-red-50 text-red-700",
  tenant_admin:   "bg-blue-50 text-blue-700",
  intune_admin:   "bg-cyan-50 text-cyan-700",
  entra_admin:    "bg-violet-50 text-violet-700",
  security_admin: "bg-amber-50 text-amber-700",
  approval_admin: "bg-orange-50 text-orange-700",
  deployment_mgr: "bg-emerald-50 text-emerald-700",
  readonly:       "bg-slate-100 text-slate-600",
};

const roleDescriptions = {
  local_admin:    "Full access to ALL tenants — platform-level administrator",
  global_admin:   "Full access to all tenants and all sections",
  tenant_admin:   "Full access to their assigned tenant(s) only",
  intune_admin:   "Manage devices, profiles, apps, scripts",
  entra_admin:    "Manage users, groups, conditional access",
  security_admin: "Manage security baselines and policies",
  approval_admin: "Process approval queue requests",
  deployment_mgr: "Manage deployment plans and scripts",
  readonly:       "View-only access, no changes allowed",
};

// Roles a tenant admin can assign to their users (cannot escalate beyond tenant_admin)
const TENANT_ASSIGNABLE_ROLES = ["intune_admin", "entra_admin", "security_admin", "deployment_mgr", "readonly"];
// Full role list for local/global admins
const ALL_ROLES = Object.keys(roleDescriptions);

const SECTIONS = ["entra", "intune", "security", "scripts", "export", "approval_queue", "deployment_plans"];

const emptyForm = { user_email: "", role: "readonly", assigned_tenants: "", allowed_sections: "entra,intune,security,scripts,export", notes: "", is_active: true };

export default function RbacAdmin({ tenants }) {
  const { rbac, isTenantAdmin } = useRbac();
  const isLocalOrGlobalAdmin = rbac?.role === "local_admin" || rbac?.role === "global_admin";
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // for elevation dialog
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();

  const { data: allRoles = [], isLoading } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => base44.entities.AdminRole.list(),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
    initialData: tenants || [],
  });

  // Filter what this user can see — local/global admins see all, tenant admins see their tenant's users
  const visibleRoles = isLocalOrGlobalAdmin
    ? allRoles
    : allRoles.filter(r => {
        if (!rbac?.assignedTenants) return false;
        return rbac.assignedTenants.some(tid => (r.assigned_tenants || "").includes(tid));
      });

  // Available tenants in the form (tenant admins can only assign within their tenants)
  const availableTenants = isLocalOrGlobalAdmin
    ? allTenants
    : allTenants.filter(t => rbac?.assignedTenants?.includes(t.id));

  const assignableRoles = isLocalOrGlobalAdmin ? ALL_ROLES : TENANT_ASSIGNABLE_ROLES;

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.AdminRole.create(data),
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      await logAction({ action: "ASSIGN_ADMIN_ROLE", category: "rbac", target_name: created.user_email, details: `Role: ${created.role}`, severity: "warning" });
      setShowAdd(false);
      setForm(emptyForm);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.AdminRole.update(id, data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      await logAction({ action: "UPDATE_ADMIN_ROLE", category: "rbac", target_name: editTarget?.user_email, details: `Role elevated`, severity: "warning" });
      setEditTarget(null);
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
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="RBAC & User Management"
        subtitle="Manage role-based access for admins and users across tenants"
        icon={UserCog}
        actions={
          <Button onClick={() => { setForm(emptyForm); setShowAdd(true); }} className="gap-2 bg-slate-900 hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Assign Role
          </Button>
        }
      />

      {/* Role reference grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {Object.entries(roleDescriptions).filter(([r]) => isLocalOrGlobalAdmin || r !== "local_admin").map(([role, desc]) => (
          <div key={role} className={`rounded-xl p-3 border border-slate-100 ${roleColors[role]}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1">{role.replace(/_/g, " ")}</p>
            <p className="text-[10px] opacity-80 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* Roles table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tenant(s)</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sections</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Active</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">Loading...</td></tr>
            ) : visibleRoles.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">No role assignments found</td></tr>
            ) : visibleRoles.map(r => (
              <tr key={r.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium text-slate-800">{r.user_email}</td>
                <td className="px-4 py-3">
                  <Badge className={`${roleColors[r.role] || roleColors.readonly} border-0 text-xs`}>
                    {(r.role || "").replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate">{getTenantNames(r.assigned_tenants)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {(r.allowed_sections || "").split(",").slice(0, 3).map(s => (
                    <Badge key={s} variant="outline" className="text-[10px] mr-1 mb-1 py-0">{s.trim()}</Badge>
                  ))}
                  {(r.allowed_sections || "").split(",").length > 3 && (
                    <span className="text-[10px] text-slate-400">+{(r.allowed_sections || "").split(",").length - 3} more</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Switch
                    checked={r.is_active !== false}
                    onCheckedChange={(v) => toggleActive.mutate({ id: r.id, is_active: v })}
                  />
                </td>
                <td className="px-4 py-3 flex items-center gap-1">
                  {/* Elevate button — tenant admins can elevate standard users */}
                  {r.role === "readonly" && (
                    <Button variant="ghost" size="sm" title="Elevate permissions" onClick={() => setEditTarget(r)} className="px-2">
                      <ChevronUp className="h-3.5 w-3.5 text-blue-500" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(r.id)} className="px-2">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Role Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign Role to User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">User Email</Label>
              <Input value={form.user_email} onChange={e => set("user_email", e.target.value)} placeholder="user@contoso.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={v => set("role", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assignableRoles.map(r => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">{roleDescriptions[form.role]}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Assign to Tenant {isLocalOrGlobalAdmin && "(leave blank = all)"}</Label>
              <Select
                value={form.assigned_tenants || "__all__"}
                onValueChange={v => set("assigned_tenants", v === "__all__" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {isLocalOrGlobalAdmin && <SelectItem value="__all__">All Tenants</SelectItem>}
                  {availableTenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Allowed Sections</Label>
              <div className="flex flex-wrap gap-2">
                {SECTIONS.map(s => {
                  const active = (form.allowed_sections || "").split(",").map(x => x.trim()).includes(s);
                  return (
                    <button key={s} onClick={() => {
                      const current = (form.allowed_sections || "").split(",").map(x => x.trim()).filter(Boolean);
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
            <Button onClick={() => createMut.mutate(form)} className="bg-slate-900 hover:bg-slate-800" disabled={!form.user_email || createMut.isPending}>
              {createMut.isPending ? "Assigning..." : "Assign Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Elevate User Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Elevate User Permissions</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-600">
                Elevate access for <span className="font-semibold text-slate-900">{editTarget.user_email}</span>
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">New Role</Label>
                <Select
                  defaultValue={editTarget.role}
                  onValueChange={(v) => setEditTarget(t => ({ ...t, role: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map(r => (
                      <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400">{roleDescriptions[editTarget.role]}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={updateMut.isPending}
              onClick={() => updateMut.mutate({
                id: editTarget.id,
                data: {
                  role: editTarget.role,
                  allowed_sections: (ROLE_SECTIONS_FOR_ROLE[editTarget.role] || SECTIONS).join(","),
                },
              })}
            >
              {updateMut.isPending ? "Saving..." : "Elevate Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper for elevation dialog
const ROLE_SECTIONS_FOR_ROLE = {
  tenant_admin:   ["entra", "intune", "security", "scripts", "export", "approval_queue", "deployment_plans"],
  intune_admin:   ["intune", "scripts", "export", "deployment_plans"],
  entra_admin:    ["entra", "export"],
  security_admin: ["security", "entra", "intune", "export", "approval_queue"],
  approval_admin: ["approval_queue"],
  deployment_mgr: ["intune", "scripts", "export", "deployment_plans"],
  readonly:       ["entra", "intune", "security", "scripts", "export"],
};