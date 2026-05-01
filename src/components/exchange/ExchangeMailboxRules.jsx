import React, { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  AlertTriangle, ChevronDown, ChevronRight, RefreshCw,
  Upload, CheckCircle2, XCircle, Loader2, FileText, Download,
  ShieldAlert, Trash2, BellOff, Copy, ServerCrash
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ActionProgressBar from "@/components/shared/ActionProgressBar";

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
  });
}

function csvRowToRule(row) {
  const rule = {
    displayName: row.rule_name || "Imported Rule",
    isEnabled: row.enabled !== "false",
    sequence: parseInt(row.sequence || "1") || 1,
    conditions: {},
    actions: {},
  };
  if (row.from_contains) rule.conditions.senderContains = [row.from_contains];
  if (row.subject_contains) rule.conditions.subjectContains = [row.subject_contains];
  if (row.body_contains) rule.conditions.bodyContains = [row.body_contains];
  if (row.from_address) rule.conditions.fromAddresses = [{ emailAddress: { address: row.from_address } }];
  if (row.action === "markAsRead") rule.actions.markAsRead = true;
  if (row.action === "delete") rule.actions.delete = true;
  if (row.action === "stopProcessing") rule.actions.stopProcessingRules = true;
  if (row.action === "forwardTo" && row.action_value) {
    rule.actions.forwardTo = [{ emailAddress: { address: row.action_value } }];
  }
  return rule;
}

const SAMPLE_CSV = `user_email,rule_name,from_contains,subject_contains,body_contains,from_address,action,action_value,enabled,sequence
john@company.com,Mark Newsletters Read,,Newsletter,,,markAsRead,,true,1
jane@company.com,Delete Junk Mail,spam@evil.com,,,,delete,,true,2
admin@company.com,Forward Reports,,,Report,,,forwardTo,manager@company.com,true,3`;

function isSuspicious(rule) {
  return (
    rule.actions?.forwardTo?.length > 0 ||
    rule.actions?.redirectTo?.length > 0 ||
    rule.actions?.forwardAsAttachmentTo?.length > 0
  );
}

// Find duplicates: same displayName or same conditions hash
function findDuplicateGroups(userRules) {
  const groups = {};
  userRules.forEach(ur => {
    ur.rules.forEach(rule => {
      const key = rule.displayName?.toLowerCase().trim();
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ user: ur.user, rule });
    });
  });
  return Object.entries(groups)
    .filter(([, items]) => items.length > 1)
    .map(([name, items]) => ({ name, items }));
}

export default function ExchangeMailboxRules({ tenantId }) {
  const [expanded, setExpanded] = useState({});
  const [csvRows, setCsvRows] = useState([]);
  const [csvError, setCsvError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState([]);
  const [taskBar, setTaskBar] = useState(null); // { task, status, message, progress }
  const fileRef = useRef();

  const { data, isLoading, refetch, isFetched } = useQuery({
    queryKey: ["all_mailbox_rules", tenantId],
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "get_all_mailbox_rules", azure_tenant_id: tenantId })
        .then(r => r.data),
    enabled: false,
  });

  const userRules = data?.userRules || [];
  const scannedCount = data?.scannedCount || 0;
  const errorCount = data?.errorCount || 0;
  const permissionError = data?.permissionError || false;
  const permissionNote = data?.permissionNote || null;
  const conflictingRules = data?.conflictingRules || [];
  const suspiciousCount = userRules.reduce((acc, ur) => acc + ur.rules.filter(isSuspicious).length, 0);
  const duplicateGroups = findDuplicateGroups(userRules);

  const exportConflictsCSV = () => {
    if (!conflictingRules.length) return;
    const headers = ["User Name", "User Email", "Rule Name", "Conflict Type", "Forward Targets", "Rule Enabled", "Rule ID"];
    const rows = conflictingRules.map(r => [
      `"${r.user_display_name}"`,
      `"${r.user_email}"`,
      `"${r.rule_name}"`,
      `"${r.conflict_type}"`,
      `"${r.forward_targets}"`,
      r.is_enabled ? "Yes" : "No",
      `"${r.rule_id}"`,
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `exchange_rule_conflicts_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (uid) => setExpanded(prev => ({ ...prev, [uid]: !prev[uid] }));

  const setTask = (task, status, message, progress = 0) =>
    setTaskBar({ task, status, message, progress });

  // Delete a rule via Graph
  const handleDeleteRule = async (userId, ruleId, ruleName) => {
    setTask(`Deleting rule "${ruleName}"`, "loading", `Removing from user ${userId}…`);
    try {
      await base44.functions.invoke("portalData", {
        action: "delete_mailbox_rule",
        azure_tenant_id: tenantId,
        user_id: userId,
        rule_id: ruleId,
      });
      setTask(`Rule deleted`, "success", `"${ruleName}" has been removed`);
      refetch();
    } catch (err) {
      setTask(`Delete failed`, "error", err.message);
    }
  };

  // Disable a rule via Graph
  const handleDisableRule = async (userId, ruleId, ruleName) => {
    setTask(`Disabling rule "${ruleName}"`, "loading", `Updating rule for ${userId}…`);
    try {
      await base44.functions.invoke("portalData", {
        action: "update_mailbox_rule",
        azure_tenant_id: tenantId,
        user_id: userId,
        rule_id: ruleId,
        patch: { isEnabled: false },
      });
      setTask(`Rule disabled`, "success", `"${ruleName}" has been disabled`);
      refetch();
    } catch (err) {
      setTask(`Disable failed`, "error", err.message);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(""); setCsvRows([]); setImportResults([]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCSV(ev.target.result);
        if (!rows.length) throw new Error("No data rows found in CSV");
        if (!rows[0].user_email || !rows[0].rule_name) throw new Error("CSV must have 'user_email' and 'rule_name' columns");
        setCsvRows(rows);
      } catch (err) { setCsvError(err.message); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImport = async () => {
    setImporting(true);
    setImportResults([]);
    const results = [];
    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i];
      const progress = Math.round((i / csvRows.length) * 100);
      setTask(`Importing rules`, "loading", `${i + 1} of ${csvRows.length}: ${row.rule_name}`, progress);
      try {
        await base44.functions.invoke("portalData", {
          action: "import_mailbox_rule",
          azure_tenant_id: tenantId,
          user_id: row.user_email,
          rule: csvRowToRule(row),
        });
        results.push({ row, success: true });
      } catch (err) {
        results.push({ row, success: false, error: err.message });
      }
      setImportResults([...results]);
    }
    setImporting(false);
    const failCount = results.filter(r => !r.success).length;
    if (failCount === 0) {
      setTask("Import complete", "success", `${results.length} rules imported successfully`);
    } else {
      setTask("Import done with errors", "error", `${results.filter(r => r.success).length} succeeded, ${failCount} failed`);
    }
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "exchange_rules_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const importProgress = csvRows.length > 0 ? Math.round((importResults.length / csvRows.length) * 100) : 0;

  function RuleRow({ rule, user, showActions = true }) {
    const suspicious = isSuspicious(rule);
    return (
      <div className={`px-4 py-3 ${suspicious ? "bg-red-50/40" : "bg-white"}`}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <p className="text-sm font-medium text-slate-700">{rule.displayName}</p>
              {suspicious && <Badge className="bg-red-100 text-red-600 text-[10px]">External Forward Risk</Badge>}
              {!rule.isEnabled && <Badge className="bg-slate-100 text-slate-400 text-[10px]">Disabled</Badge>}
            </div>
            {user && <p className="text-[10px] text-slate-400 mb-1">{user.mail || user.userPrincipalName}</p>}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
              {rule.conditions?.subjectContains?.length > 0 && <span>Subject: <b>{rule.conditions.subjectContains.join(", ")}</b></span>}
              {rule.conditions?.senderContains?.length > 0 && <span>Sender: <b>{rule.conditions.senderContains.join(", ")}</b></span>}
              {rule.conditions?.fromAddresses?.length > 0 && <span>From: <b>{rule.conditions.fromAddresses.map(a => a.emailAddress?.address).join(", ")}</b></span>}
              {rule.actions?.markAsRead && <span className="text-blue-600">→ Mark as read</span>}
              {rule.actions?.delete && <span className="text-red-600">→ Delete</span>}
              {rule.actions?.moveToFolder && <span className="text-slate-600">→ Move to folder</span>}
              {rule.actions?.stopProcessingRules && <span className="text-amber-600">→ Stop processing rules</span>}
              {rule.actions?.forwardTo?.length > 0 && <span className="text-red-600 font-medium">→ Forward to: {rule.actions.forwardTo.map(a => a.emailAddress?.address).join(", ")}</span>}
              {rule.actions?.redirectTo?.length > 0 && <span className="text-red-600 font-medium">→ Redirect to: {rule.actions.redirectTo.map(a => a.emailAddress?.address).join(", ")}</span>}
            </div>
          </div>
          {showActions && rule.id && (
            <div className="flex items-center gap-1 shrink-0">
              {rule.isEnabled && (
                <Button
                  variant="ghost" size="sm"
                  className="h-7 px-2 text-xs text-amber-600 hover:bg-amber-50"
                  onClick={() => handleDisableRule(user?.id || user?.mail, rule.id, rule.displayName)}
                >
                  <BellOff className="h-3.5 w-3.5 mr-1" />Disable
                </Button>
              )}
              <Button
                variant="ghost" size="sm"
                className="h-7 px-2 text-xs text-red-500 hover:bg-red-50"
                onClick={() => handleDeleteRule(user?.id || user?.mail, rule.id, rule.displayName)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <Tabs defaultValue="report">
        <TabsList className="mb-5">
          <TabsTrigger value="report">Rules Report</TabsTrigger>
          <TabsTrigger value="conflicts">
            Server Conflicts {conflictingRules.length > 0 && (
              <Badge className="ml-1.5 bg-red-100 text-red-700 text-[10px] py-0">{conflictingRules.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="duplicates">
            Duplicates {duplicateGroups.length > 0 && (
              <Badge className="ml-1.5 bg-amber-100 text-amber-700 text-[10px] py-0">{duplicateGroups.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="import">Import from CSV</TabsTrigger>
        </TabsList>

        {/* ── REPORT TAB ── */}
        <TabsContent value="report">
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <Button onClick={() => refetch()} disabled={isLoading} className="bg-slate-900 hover:bg-slate-800">
              {isLoading
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Scanning mailboxes…</>
                : <><RefreshCw className="h-4 w-4 mr-2" />Scan All Mailboxes</>}
            </Button>
            <p className="text-xs text-slate-400">Scans inbox rules across all enabled mailboxes</p>
            {isFetched && !isLoading && scannedCount > 0 && (
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                {scannedCount} mailboxes scanned · {errorCount > 0 ? `${errorCount} access errors` : "all accessible"}
              </span>
            )}
            {!isLoading && suspiciousCount > 0 && (
              <Badge className="bg-red-100 text-red-700 ml-auto">
                <AlertTriangle className="h-3 w-3 mr-1" />{suspiciousCount} forwarding rule(s) detected
              </Badge>
            )}
          </div>

          {isLoading && (
            <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2 text-sm text-blue-800 font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />Scanning mailboxes for inbox rules…
              </div>
              <Progress value={undefined} className="h-1.5 animate-pulse" />
              <p className="text-xs text-blue-600 mt-1.5">Fetching all mailboxes via Microsoft Graph (paginated). Large tenants may take 30–60 seconds.</p>
            </div>
          )}

          {!isFetched && !isLoading && (
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl">
              <FileText className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Click "Scan All Mailboxes" to generate the inbox rules report</p>
            </div>
          )}

          {isFetched && !isLoading && permissionError && (
            <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Permission Required</p>
                <p className="text-xs text-amber-700 mt-0.5">{permissionNote}</p>
              </div>
            </div>
          )}

          {isFetched && !isLoading && !permissionError && userRules.length === 0 && scannedCount > 0 && (
            <div className="text-center py-12 text-sm text-slate-400">No inbox rules found across {scannedCount} scanned mailboxes.</div>
          )}

          <div className="space-y-2">
            {userRules.map(ur => {
              const hasSuspicious = ur.rules.some(isSuspicious);
              const isOpen = expanded[ur.user.id];
              return (
                <div key={ur.user.id} className={`border rounded-xl overflow-hidden ${hasSuspicious ? "border-red-200" : "border-slate-200"}`}>
                  <button onClick={() => toggleExpand(ur.user.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50 ${hasSuspicious ? "bg-red-50/60" : "bg-white"}`}>
                    <div className="flex items-center gap-3">
                      {hasSuspicious && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                      <div>
                        <p className="text-sm font-medium text-slate-800">{ur.user.displayName}</p>
                        <p className="text-xs text-slate-500">{ur.user.mail || ur.user.userPrincipalName}</p>
                      </div>
                      <Badge className="bg-slate-100 text-slate-600 text-[10px]">{ur.rules.length} rule(s)</Badge>
                      {hasSuspicious && <Badge className="bg-red-100 text-red-700 text-[10px]">⚠ Forwarding</Badge>}
                    </div>
                    {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 divide-y divide-slate-100">
                      {ur.rules.map((rule, i) => (
                        <RuleRow key={i} rule={rule} user={ur.user} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ── SERVER CONFLICTS TAB ── */}
        <TabsContent value="conflicts">
          {!isFetched ? (
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl">
              <ServerCrash className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Scan mailboxes first to detect rules that conflict with server-side transport rules</p>
            </div>
          ) : conflictingRules.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl">
              <CheckCircle2 className="h-10 w-10 text-emerald-200 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No client rules conflicting with server transport rules detected</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className="bg-red-100 text-red-700">{conflictingRules.length} conflicting rule(s)</Badge>
                <p className="text-xs text-slate-500 flex-1">
                  These client-side inbox rules perform actions (forwarding, redirecting, stop-processing) that are commonly blocked or overridden by Exchange server transport rules / mail flow policies.
                </p>
                <Button size="sm" variant="outline" onClick={exportConflictsCSV} className="gap-1.5 shrink-0">
                  <Download className="h-3.5 w-3.5" />Export CSV
                </Button>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Why this matters:</strong> Exchange transport rules (mail flow rules) set by admins run server-side and take priority over client-side inbox rules.
                  Rules that forward externally, redirect, or stop processing may be silently blocked by server policies, causing user confusion.
                  Review these rules with your Exchange admin and disable or remove client rules that duplicate or conflict with server-side policies.
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">User</th>
                      <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">Rule Name</th>
                      <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">Conflict Type</th>
                      <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">Forward Target(s)</th>
                      <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">Status</th>
                      <th className="px-3 py-2.5 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {conflictingRules.map((r, i) => {
                      const ur = userRules.find(u => (u.user.mail || u.user.userPrincipalName) === r.user_email);
                      const rule = ur?.rules.find(rl => rl.id === r.rule_id);
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-700">{r.user_display_name}</div>
                            <div className="text-slate-400">{r.user_email}</div>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-700">{r.rule_name}</td>
                          <td className="px-3 py-2.5">
                            <Badge className="bg-red-100 text-red-700 text-[10px] border-0">{r.conflict_type}</Badge>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 max-w-[180px] truncate">{r.forward_targets || "—"}</td>
                          <td className="px-3 py-2.5">
                            <Badge className={r.is_enabled ? "bg-emerald-100 text-emerald-700 border-0 text-[10px]" : "bg-slate-100 text-slate-500 border-0 text-[10px]"}>
                              {r.is_enabled ? "Active" : "Disabled"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1">
                              {r.is_enabled && ur && rule && (
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-6 px-2 text-[10px] text-amber-600 hover:bg-amber-50"
                                  onClick={() => handleDisableRule(ur.user.id, r.rule_id, r.rule_name)}
                                >
                                  <BellOff className="h-3 w-3 mr-1" />Disable
                                </Button>
                              )}
                              {ur && (
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-6 px-2 text-[10px] text-red-500 hover:bg-red-50"
                                  onClick={() => handleDeleteRule(ur.user.id, r.rule_id, r.rule_name)}
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />Delete
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── DUPLICATES TAB ── */}
        <TabsContent value="duplicates">
          {!isFetched ? (
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl">
              <Copy className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Scan mailboxes first to detect duplicate rules</p>
            </div>
          ) : duplicateGroups.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl">
              <CheckCircle2 className="h-10 w-10 text-emerald-200 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No duplicate rules found across scanned mailboxes</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-amber-100 text-amber-700">{duplicateGroups.length} duplicate group(s)</Badge>
                <p className="text-xs text-slate-400">Rules with the same name appearing in multiple mailboxes</p>
              </div>
              {duplicateGroups.map(group => (
                <div key={group.name} className="border border-amber-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                    <Copy className="h-4 w-4 text-amber-600 shrink-0" />
                    <p className="text-sm font-semibold text-amber-800">"{group.name}"</p>
                    <Badge className="bg-amber-100 text-amber-700 text-[10px] ml-1">{group.items.length} copies</Badge>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {group.items.map((item, i) => (
                      <RuleRow key={i} rule={item.rule} user={item.user} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── IMPORT TAB ── */}
        <TabsContent value="import">
          <div className="max-w-2xl space-y-5">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm">
              <p className="font-medium text-blue-800 mb-1">CSV Import Format</p>
              <p className="text-xs text-blue-700 mb-1">Required columns: <code className="bg-blue-100 px-1 rounded">user_email</code>, <code className="bg-blue-100 px-1 rounded">rule_name</code></p>
              <p className="text-xs text-blue-700 mb-1">Optional: from_contains, subject_contains, body_contains, from_address, action, action_value, enabled, sequence</p>
              <p className="text-xs text-blue-600 mt-1">Supported actions: markAsRead · delete · forwardTo · stopProcessing</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={downloadSample}>
                <Download className="h-4 w-4 mr-1.5" />Download Template
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1.5" />Upload CSV
              </Button>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </div>

            {csvError && <div className="text-sm text-red-600 p-3 bg-red-50 border border-red-200 rounded-lg">{csvError}</div>}

            {csvRows.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-3">{csvRows.length} rule(s) to import:</p>
                <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold">User</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold">Rule Name</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold">Action</th>
                        <th className="px-3 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {csvRows.map((row, i) => {
                        const result = importResults[i];
                        const isCurrent = importing && i === importResults.length;
                        return (
                          <tr key={i} className={result ? (result.success ? "bg-emerald-50" : "bg-red-50") : isCurrent ? "bg-blue-50" : ""}>
                            <td className="px-3 py-2 text-slate-600">{row.user_email}</td>
                            <td className="px-3 py-2 font-medium text-slate-700">{row.rule_name}</td>
                            <td className="px-3 py-2 text-slate-600">{row.action}{row.action_value ? ` → ${row.action_value}` : ""}</td>
                            <td className="px-3 py-2">
                              {isCurrent && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
                              {result && (result.success
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                : <XCircle className="h-3.5 w-3.5 text-red-500" title={result.error} />)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {importResults.length < csvRows.length && (
                  <Button onClick={handleImport} disabled={importing} className="bg-slate-900 hover:bg-slate-800">
                    {importing
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing ({importResults.length}/{csvRows.length})…</>
                      : <><Upload className="h-4 w-4 mr-2" />Import {csvRows.length} Rule(s)</>}
                  </Button>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Global action progress bar */}
      {taskBar && (
        <ActionProgressBar
          task={taskBar.task}
          status={taskBar.status}
          message={taskBar.message}
          progress={taskBar.progress}
          onDismiss={() => setTaskBar(null)}
        />
      )}
    </>
  );
}