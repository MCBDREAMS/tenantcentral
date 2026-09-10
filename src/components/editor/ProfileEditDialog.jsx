import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Save, AlertTriangle, ExternalLink, Plus, Trash2, Loader2, ShieldCheck } from "lucide-react";

const PLATFORM_LABEL = { windows: "Windows", macos: "macOS", ios: "iOS", android: "Android", linux: "Linux", all: "All" };
const DATA_TYPES = [
  { key: "string", label: "String" },
  { key: "integer", label: "Integer" },
  { key: "boolean", label: "Boolean" },
  { key: "datetime", label: "DateTime" },
  { key: "stringxml", label: "String XML" },
];

// Reconstruct any previously-saved local-only metadata (scope tags names, applicability, generic settings).
function parseSettingsSummary(raw) {
  if (!raw) return { scopeTagNames: [], applicability: { ruleType: "none", column: "", value: "" }, genericSettings: "" };
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return {
        scopeTagNames: obj.scopeTagNames || [],
        applicability: obj.applicability || { ruleType: "none", column: "", value: "" },
        genericSettings: obj.genericSettings || "",
      };
    }
  } catch {}
  // Legacy plain-text summary → treat as generic settings
  return { scopeTagNames: [], applicability: { ruleType: "none", column: "", value: "" }, genericSettings: String(raw) };
}

export default function ProfileEditDialog({ profile, tenants, onClose }) {
  const qc = useQueryClient();
  const tenant = tenants.find(t => t.id === profile.tenant_id);

  const saved = parseSettingsSummary(profile.settings_summary);

  const [name, setName] = useState(profile.profile_name);
  const [description, setDescription] = useState(profile.description || "");
  const [state, setState] = useState(profile.state);

  // Assignments
  const [assignments, setAssignments] = useState([{ groupId: "", intent: "include" }]);

  // Scope tags (selected IDs from Graph catalog)
  const [selectedScopeTagIds, setSelectedScopeTagIds] = useState([]);

  // Settings
  const isCustomConfig = profile.profile_type === "configuration_profile" && ["windows", "macos"].includes(profile.platform);
  const [omaSettings, setOmaSettings] = useState(isCustomConfig ? [{ displayName: "", omaUri: "", dataType: "string", value: "" }] : []);
  const [genericSettings, setGenericSettings] = useState(saved.genericSettings);

  // Applicability (local)
  const [applicability, setApplicability] = useState(saved.applicability);

  // Catalogs
  const [groups, setGroups] = useState([]);
  const [scopeTags, setScopeTags] = useState([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [catalogError, setCatalogError] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("basics");

  useEffect(() => {
    if (!tenant?.tenant_id) return;
    setLoadingCatalogs(true);
    base44.functions.invoke("tenantWrite", { action: "list_intune_options", azure_tenant_id: tenant.tenant_id })
      .then(res => {
        if (res.data?.success) {
          setGroups(res.data.groups || []);
          setScopeTags(res.data.scopeTags || []);
        } else setCatalogError(res.data?.error || "Could not load tenant groups/scope tags");
      })
      .catch(e => setCatalogError(e.message))
      .finally(() => setLoadingCatalogs(false));
  }, [tenant?.tenant_id]);

  const securityGroups = groups.filter(g => g.securityEnabled && !g.mailEnabled);

  const addAssignment = () => setAssignments(a => [...a, { groupId: "", intent: "include" }]);
  const removeAssignment = (i) => setAssignments(a => a.filter((_, idx) => idx !== i));
  const updateAssignment = (i, patch) => setAssignments(a => a.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  const addOma = () => setOmaSettings(o => [...o, { displayName: "", omaUri: "", dataType: "string", value: "" }]);
  const removeOma = (i) => setOmaSettings(o => o.filter((_, idx) => idx !== i));
  const updateOma = (i, patch) => setOmaSettings(o => o.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  const toggleScopeTag = (id) => setSelectedScopeTagIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const save = async () => {
    setSaving(true); setError(null);
    const cleanAssignments = assignments.filter(a => a.groupId);
    const cleanOma = omaSettings.filter(o => o.omaUri && o.value !== "").map(o => ({ ...o, value: String(o.value) }));
    try {
      if (profile.graph_profile_id && tenant?.tenant_id) {
        const res = await base44.functions.invoke("tenantWrite", {
          action: "update_intune_profile",
          azure_tenant_id: tenant.tenant_id,
          graph_profile_id: profile.graph_profile_id,
          profile_type: profile.profile_type,
          display_name: name,
          description,
          assignments: cleanAssignments,
          scope_tag_ids: selectedScopeTagIds,
          oma_settings: isCustomConfig ? cleanOma : undefined,
        });
        if (!res.data.success) { setError(res.data.error || "Graph update failed"); setSaving(false); return; }
      }
      const assignedGroupNames = cleanAssignments
        .map(a => { const g = groups.find(x => x.id === a.groupId); return g ? `${a.intent === "exclude" ? "!(" + g.displayName + ")" : g.displayName}` : null; })
        .filter(Boolean).join(", ");
      const settingsSummary = JSON.stringify({
        scopeTagNames: selectedScopeTagIds.map(id => scopeTags.find(t => t.id === id)?.displayName).filter(Boolean),
        applicability,
        genericSettings,
        omaSettings: isCustomConfig ? cleanOma : undefined,
      });
      await base44.entities.IntuneProfile.update(profile.id, {
        profile_name: name,
        description,
        state,
        assigned_groups: assignedGroupNames || profile.assigned_groups || "",
        settings_summary: settingsSummary,
      });
      qc.invalidateQueries({ queryKey: ["intune-profiles"] });
      onClose();
    } catch (e) {
      setError(e.message); setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Intune Profile
            {tenant?.tenant_id && (
              <a href="https://intune.microsoft.com/" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-500 hover:underline text-xs font-normal flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Open in Intune
              </a>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-5 bg-slate-100 shrink-0">
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="scope">Scope tags</TabsTrigger>
            <TabsTrigger value="applicability">Applicability</TabsTrigger>
          </TabsList>

          <div className="overflow-auto py-3 pr-1 flex-1">
            {/* BASICS */}
            <TabsContent value="basics" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Platform</p>
                  <p className="font-medium text-slate-700">{PLATFORM_LABEL[profile.platform] || profile.platform}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Type</p>
                  <Badge variant="outline">{profile.profile_type?.replace(/_/g, ' ')}</Badge>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Profile Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Description</label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">State</label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active (enabled)</SelectItem>
                    <SelectItem value="inactive">Inactive (disabled)</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!profile.graph_profile_id && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-xs text-amber-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  No Azure Graph ID stored — only the local record updates. Re-sync to link Graph IDs.
                </div>
              )}
            </TabsContent>

            {/* SETTINGS */}
            <TabsContent value="settings" className="space-y-3 mt-0">
              <p className="text-xs text-slate-500">
                {isCustomConfig
                  ? "Custom OMA-URI settings (pushed to Graph on save)."
                  : "Settings for this profile type are template-driven in Intune. Capture the intended settings as JSON for reference and local tracking."}
              </p>
              {isCustomConfig ? (
                <div className="space-y-2">
                  {omaSettings.map((o, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-start">
                      <Input className="col-span-3" placeholder="Setting name" value={o.displayName} onChange={e => updateOma(i, { displayName: e.target.value })} />
                      <Input className="col-span-4" placeholder="OMA-URI (./Device/Vendor/MSFT/...)" value={o.omaUri} onChange={e => updateOma(i, { omaUri: e.target.value })} />
                      <div className="col-span-2">
                        <Select value={o.dataType} onValueChange={v => updateOma(i, { dataType: v })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>{DATA_TYPES.map(d => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <Input className="col-span-2" placeholder="Value" value={o.value} onChange={e => updateOma(i, { value: e.target.value })} />
                      <Button variant="ghost" size="icon" className="col-span-1 h-9 w-9" onClick={() => removeOma(i)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addOma} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add OMA-URI setting</Button>
                </div>
              ) : (
                <Textarea value={genericSettings} onChange={e => setGenericSettings(e.target.value)} rows={10} className="font-mono text-xs" placeholder='{ "passwordRequired": true, "minPasswordLength": 8 }' />
              )}
            </TabsContent>

            {/* ASSIGNMENTS */}
            <TabsContent value="assignments" className="space-y-3 mt-0">
              {loadingCatalogs && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tenant groups…</div>}
              {catalogError && <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">Could not load groups: {catalogError}. You can still save basics; assignments require Graph access.</div>}
              {profile.assigned_groups && !profile.graph_profile_id && (
                <div className="text-xs text-slate-500">Existing assignments (local): {profile.assigned_groups}</div>
              )}
              <div className="space-y-2">
                {assignments.map((a, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-3">
                      <Select value={a.intent} onValueChange={v => updateAssignment(i, { intent: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="include">Include</SelectItem>
                          <SelectItem value="exclude">Exclude</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-8">
                      <Select value={a.groupId} onValueChange={v => updateAssignment(i, { groupId: v })}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select group…" /></SelectTrigger>
                        <SelectContent>
                          {securityGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.displayName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="ghost" size="icon" className="col-span-1 h-9 w-9" onClick={() => removeAssignment(i)} disabled={assignments.length === 1}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addAssignment} disabled={!groups.length} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add group</Button>
              </div>
              <p className="text-xs text-slate-400">Include/exclude assignments are pushed to Intune via the Graph <code>assign</code> endpoint on save.</p>
            </TabsContent>

            {/* SCOPE TAGS */}
            <TabsContent value="scope" className="space-y-3 mt-0">
              {loadingCatalogs && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading scope tags…</div>}
              {catalogError && <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">Could not load scope tags: {catalogError}.</div>}
              {!loadingCatalogs && !scopeTags.length && <p className="text-xs text-slate-500">No scope tags found in this tenant.</p>}
              <div className="grid grid-cols-2 gap-2">
                {scopeTags.map(t => (
                  <label key={t.id} className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                    <Switch checked={selectedScopeTagIds.includes(t.id)} onCheckedChange={() => toggleScopeTag(t.id)} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{t.displayName}</p>
                      {t.description && <p className="text-xs text-slate-400 truncate">{t.description}</p>}
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400">Selected scope tags are applied to the profile via <code>roleScopeTagIds</code> on save.</p>
            </TabsContent>

            {/* APPLICABILITY */}
            <TabsContent value="applicability" className="space-y-3 mt-0">
              <p className="text-xs text-slate-500">Applicability rules let you target the profile only to devices matching an OS edition or version. Stored locally on the profile record.</p>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Rule type</label>
                <Select value={applicability.ruleType} onValueChange={v => setApplicability(a => ({ ...a, ruleType: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (assign to all targeted devices)</SelectItem>
                    <SelectItem value="osEdition">Assign if OS edition equals</SelectItem>
                    <SelectItem value="osVersion">Assign if OS version equals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {applicability.ruleType !== "none" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Column</label>
                    <Input value={applicability.column} onChange={e => setApplicability(a => ({ ...a, column: e.target.value }))} placeholder="edition / version" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Value</label>
                    <Input value={applicability.value} onChange={e => setApplicability(a => ({ ...a, value: e.target.value }))} placeholder="e.g. Enterprise" />
                  </div>
                </div>
              )}
            </TabsContent>

            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 mt-2">{error}</div>}
          </div>
        </Tabs>

        <DialogFooter className="shrink-0 border-t pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white gap-1">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}