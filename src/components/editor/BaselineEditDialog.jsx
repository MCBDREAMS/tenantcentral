import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, ExternalLink } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import { Progress } from "@/components/ui/progress";

const typeLabels = {
  security_baseline_windows: "Windows",
  security_baseline_edge: "Edge",
  security_baseline_defender: "Defender",
  security_baseline_m365: "Microsoft 365",
  security_baseline_office: "Office",
  custom: "Custom",
};

export default function BaselineEditDialog({ baseline, tenants, onClose }) {
  const [name, setName] = useState(baseline.baseline_name);
  const [state, setState] = useState(baseline.state);
  const [assignedGroups, setAssignedGroups] = useState(baseline.assigned_groups || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const qc = useQueryClient();

  const tenant = tenants.find(t => t.id === baseline.tenant_id);
  const total = (baseline.compliant_devices || 0) + (baseline.non_compliant_devices || 0);
  const compliancePct = total > 0 ? Math.round((baseline.compliant_devices / total) * 100) : 0;

  const save = async () => {
    setSaving(true); setError(null);
    await base44.entities.SecurityBaseline.update(baseline.id, { baseline_name: name, state, assigned_groups: assignedGroups });
    qc.invalidateQueries({ queryKey: ["baselines"] });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Security Baseline
            {tenant?.tenant_id && (
              <a href="https://intune.microsoft.com/#view/Microsoft_Intune_Workflows/SecurityManagementMenu/~/securityBaselines" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-500 hover:underline text-xs font-normal flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Open in Intune
              </a>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">Type</p>
              <Badge variant="outline">{typeLabels[baseline.baseline_type] || baseline.baseline_type}</Badge>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Version</p>
              <p className="text-sm font-medium text-slate-700">{baseline.version || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Settings Count</p>
              <p className="text-sm font-medium text-slate-700">{baseline.settings_count || 0}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Tenant</p>
              <p className="text-sm font-medium text-slate-700">{tenant?.name || baseline.tenant_id}</p>
            </div>
          </div>

          {/* Compliance bar */}
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-slate-600">Device Compliance</span>
              <span className="text-emerald-600">{compliancePct}%</span>
            </div>
            <Progress value={compliancePct} className="h-2" />
            <div className="flex justify-between text-xs text-slate-500">
              <span className="text-emerald-600">{baseline.compliant_devices || 0} compliant</span>
              <span className="text-red-500">{baseline.non_compliant_devices || 0} non-compliant</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Baseline Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">State</label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="deployed">Deployed</SelectItem>
                <SelectItem value="not_deployed">Not Deployed</SelectItem>
                <SelectItem value="conflict">Conflict</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Assigned Groups</label>
            <Input value={assignedGroups} onChange={e => setAssignedGroups(e.target.value)} placeholder="Group1, Group2" />
          </div>

          {baseline.settings_detail && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Settings Detail</p>
              <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-40">{baseline.settings_detail}</pre>
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white gap-1">
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}