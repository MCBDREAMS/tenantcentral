import React, { useState } from "react";
import { Loader2, Plus, Trash2, FileDown, Upload, Wand2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function MigrationMapping({
  sourceTenant, targetTenant, selection, workloads,
  userMapping, setUserMapping, groupMapping, setGroupMapping,
  principalRules, setPrincipalRules,
}) {
  const [autoLoading, setAutoLoading] = useState(false);
  const [error, setError] = useState("");

  const autoMap = async () => {
    setAutoLoading(true); setError("");
    try {
      const res = await base44.functions.invoke("migrationEngine", {
        action: "auto_map",
        source_azure_tenant_id: sourceTenant.tenant_id,
        target_azure_tenant_id: targetTenant.tenant_id,
        principal_replace_rules: principalRules,
      });
      setUserMapping(res.data.userMapping || []);
      setGroupMapping(res.data.groupMapping || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setAutoLoading(false); }
  };

  const updateUser = (i, patch) => setUserMapping(userMapping.map((m, x) => (x === i ? { ...m, ...patch } : m)));
  const updateGroup = (i, patch) => setGroupMapping(groupMapping.map((m, x) => (x === i ? { ...m, ...patch } : m)));

  const addRule = () => setPrincipalRules([...principalRules, { find: "", replace: "" }]);
  const updateRule = (i, patch) => setPrincipalRules(principalRules.map((r, x) => (x === i ? { ...r, ...patch } : r)));
  const removeRule = (i) => setPrincipalRules(principalRules.filter((_, x) => x !== i));

  const exportCsv = () => {
    const rows = [["source_upn", "source_mail", "action", "target_upn", "replaced"],
      ...userMapping.map((m) => [m.sourceUpn, m.sourceMail, m.action, m.targetUpn, m.replaced ? "yes" : ""])];
    const csv = rows.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "user_mapping.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      const parsed = lines.slice(1).map((l) => {
        const cols = l.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
        return { sourceUpn: cols[0], sourceMail: cols[1], action: cols[2] || "create", targetUpn: cols[3], replaced: cols[4] === "yes", sourceId: "", sourceName: "" };
      });
      setUserMapping(parsed);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Principal Replacement Rules</h3>
          <Button size="sm" variant="outline" onClick={addRule}><Plus className="h-4 w-4 mr-1" />Add rule</Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Replace a source user/group with a different target principal in copied permissions (ShareGate "replace user/group"). Match is by UPN, email, or display name.</p>
        {principalRules.length === 0 && <p className="text-sm text-muted-foreground">No rules — auto-match by UPN/SMTP only.</p>}
        {principalRules.map((r, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <Input placeholder="source UPN / email / name" value={r.find} onChange={(e) => updateRule(i, { find: e.target.value })} />
            <span className="text-muted-foreground">→</span>
            <Input placeholder="target UPN" value={r.replace} onChange={(e) => updateRule(i, { replace: e.target.value })} />
            <Button size="icon" variant="ghost" onClick={() => removeRule(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
        <Button className="mt-2" onClick={autoMap} disabled={autoLoading}>
          {autoLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
          Auto-map users & groups
        </Button>
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      </div>

      {userMapping.length > 0 && (
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">User Mapping ({userMapping.length})</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportCsv}><FileDown className="h-4 w-4 mr-1" />Export CSV</Button>
              <label className="inline-flex items-center gap-1 text-sm border rounded-md px-3 h-8 cursor-pointer hover:bg-muted">
                <Upload className="h-4 w-4" />Import
                <input type="file" accept=".csv" className="hidden" onChange={importCsv} />
              </label>
            </div>
          </div>
          <div className="overflow-auto max-h-72 border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr><th className="text-left p-2">Source UPN</th><th className="text-left p-2">Action</th><th className="text-left p-2">Target UPN</th><th className="p-2">Replaced</th></tr>
              </thead>
              <tbody>
                {userMapping.map((m, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{m.sourceUpn}</td>
                    <td className="p-2">
                      <Select value={m.action} onValueChange={(v) => updateUser(i, { action: v })}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="map">map</SelectItem><SelectItem value="create">create</SelectItem><SelectItem value="skip">skip</SelectItem></SelectContent>
                      </Select>
                    </td>
                    <td className="p-2"><Input className="h-8" value={m.targetUpn || ""} onChange={(e) => updateUser(i, { targetUpn: e.target.value })} /></td>
                    <td className="p-2 text-center">{m.replaced ? "✓" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {groupMapping.length > 0 && (
        <div className="bg-card border rounded-xl p-5">
          <h3 className="font-medium mb-3">Group Mapping ({groupMapping.length})</h3>
          <div className="overflow-auto max-h-72 border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr><th className="text-left p-2">Source Group</th><th className="text-left p-2">Action</th><th className="text-left p-2">Target Name</th></tr>
              </thead>
              <tbody>
                {groupMapping.map((m, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{m.sourceName}</td>
                    <td className="p-2">
                      <Select value={m.action} onValueChange={(v) => updateGroup(i, { action: v })}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="map">map</SelectItem><SelectItem value="create">create</SelectItem><SelectItem value="skip">skip</SelectItem></SelectContent>
                      </Select>
                    </td>
                    <td className="p-2"><Input className="h-8" value={m.targetName || ""} onChange={(e) => updateGroup(i, { targetName: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}