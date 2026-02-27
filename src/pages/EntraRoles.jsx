import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import ReadOnlyBanner from "@/components/shared/ReadOnlyBanner";
import { useRbac } from "@/components/shared/useRbac";
import { logAction } from "@/components/shared/auditLogger";

// Static Entra built-in roles for reference
const BUILTIN_ROLES = [
  { name: "Global Administrator", description: "Full access to all Azure AD features", category: "privileged" },
  { name: "Global Reader", description: "Read-only access to all Azure AD features", category: "privileged" },
  { name: "User Administrator", description: "Manage users and groups", category: "identity" },
  { name: "Helpdesk Administrator", description: "Reset passwords, manage service requests", category: "identity" },
  { name: "Security Administrator", description: "Manage security features and policies", category: "security" },
  { name: "Security Reader", description: "Read security information and reports", category: "security" },
  { name: "Conditional Access Administrator", description: "Manage conditional access policies", category: "security" },
  { name: "Intune Administrator", description: "Manage Intune service", category: "device" },
  { name: "Cloud Device Administrator", description: "Enable, disable, delete cloud devices", category: "device" },
  { name: "Exchange Administrator", description: "Manage Exchange Online", category: "apps" },
  { name: "SharePoint Administrator", description: "Manage SharePoint Online", category: "apps" },
  { name: "Teams Administrator", description: "Manage Teams service", category: "apps" },
  { name: "Application Administrator", description: "Manage app registrations and service principals", category: "apps" },
  { name: "Privileged Identity Management Administrator", description: "Manage PIM features", category: "privileged" },
  { name: "Compliance Administrator", description: "Manage compliance features", category: "compliance" },
];

const catColors = {
  privileged: "bg-red-50 text-red-700",
  identity: "bg-blue-50 text-blue-700",
  security: "bg-amber-50 text-amber-700",
  device: "bg-emerald-50 text-emerald-700",
  apps: "bg-violet-50 text-violet-700",
  compliance: "bg-cyan-50 text-cyan-700",
};

export default function EntraRoles({ selectedTenant, tenants }) {
  const { canEdit } = useRbac();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAssign, setShowAssign] = useState(null); // role name
  const [assignEmail, setAssignEmail] = useState("");

  const filtered = BUILTIN_ROLES.filter(r => {
    if (filter !== "all" && r.category !== filter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Entra ID Roles"
        subtitle={selectedTenant ? `Directory roles for ${selectedTenant.name}` : "All directory roles reference"}
        icon={ShieldCheck}
      />

      {!canEdit() && <ReadOnlyBanner />}

      <div className="flex gap-3 mb-5 flex-wrap">
        <Input placeholder="Search roles..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 w-56 text-sm" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {["privileged","identity","security","device","apps","compliance"].map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-400 self-center ml-auto">{filtered.length} roles</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(role => (
          <div key={role.name} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{role.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{role.description}</p>
              </div>
              <Badge className={`${catColors[role.category]} border-0 text-xs shrink-0`}>{role.category}</Badge>
            </div>
            {canEdit() && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs mt-auto" onClick={() => { setShowAssign(role.name); setAssignEmail(""); }}>
                <Users className="h-3.5 w-3.5" /> Assign Member
              </Button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!showAssign} onOpenChange={() => setShowAssign(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Assign Role: {showAssign}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs">User or Group Email / UPN</Label>
            <Input value={assignEmail} onChange={e => setAssignEmail(e.target.value)} placeholder="user@contoso.com" />
            {selectedTenant && (
              <p className="text-xs text-slate-400">Will be assigned in tenant: <strong>{selectedTenant.name}</strong></p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(null)}>Cancel</Button>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={async () => {
              await logAction({ action: "ASSIGN_ENTRA_ROLE", category: "entra_policy", tenant_id: selectedTenant?.id, tenant_name: selectedTenant?.name, target_name: `${assignEmail} → ${showAssign}`, severity: "warning" });
              setShowAssign(null);
            }} disabled={!assignEmail}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}