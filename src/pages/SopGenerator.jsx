import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Loader2, RefreshCw, ChevronDown, ChevronRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import ReactMarkdown from "react-markdown";
import { exportSop, EXPORT_FORMATS } from "@/utils/sopExport";

export default function SopGenerator({ selectedTenant, tenants }) {
  const [chosenTenantId, setChosenTenantId] = useState(selectedTenant?.id || "");
  const [sop, setSop] = useState("");
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState("pdf");
  const [expanded, setExpanded] = useState({});

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
    initialData: tenants || [],
  });

  const effectiveTenantId = chosenTenantId || selectedTenant?.id;
  const chosenTenant = allTenants.find(t => t.id === effectiveTenantId);

  const { data: devices = [] } = useQuery({
    queryKey: ["sop-devices", effectiveTenantId],
    enabled: !!effectiveTenantId,
    queryFn: () => base44.entities.IntuneDevice.filter({ tenant_id: effectiveTenantId }),
  });

  const { data: policies = [] } = useQuery({
    queryKey: ["sop-policies", effectiveTenantId],
    enabled: !!effectiveTenantId,
    queryFn: () => base44.entities.EntraPolicy.filter({ tenant_id: effectiveTenantId }),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["sop-profiles", effectiveTenantId],
    enabled: !!effectiveTenantId,
    queryFn: () => base44.entities.IntuneProfile.filter({ tenant_id: effectiveTenantId }),
  });

  const { data: baselines = [] } = useQuery({
    queryKey: ["sop-baselines", effectiveTenantId],
    enabled: !!effectiveTenantId,
    queryFn: () => base44.entities.SecurityBaseline.filter({ tenant_id: effectiveTenantId }),
  });

  const { data: users = [] } = useQuery({
    queryKey: ["sop-users", effectiveTenantId],
    enabled: !!effectiveTenantId,
    queryFn: () => base44.entities.EntraUser.filter({ tenant_id: effectiveTenantId }),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["sop-groups", effectiveTenantId],
    enabled: !!effectiveTenantId,
    queryFn: () => base44.entities.EntraGroup.filter({ tenant_id: effectiveTenantId }),
  });

  const { data: mdmSolutions = [] } = useQuery({
    queryKey: ["sop-mdm", effectiveTenantId],
    enabled: !!effectiveTenantId,
    queryFn: () => base44.entities.MdmSolution.filter({ tenant_id: effectiveTenantId }),
  });

  const generateSOP = async () => {
    if (!chosenTenant) return;
    setGenerating(true);
    setSop("");

    const complianceRate = devices.length > 0
      ? Math.round((devices.filter(d => d.compliance_state === "compliant").length / devices.length) * 100)
      : 0;

    // Pull live Azure tenant inventory (SharePoint, billing/licenses, Exchange, Teams, OneDrive)
    let inv = null;
    let invWarnings = [];
    try {
      const res = await base44.functions.invoke("tenantInventory", {
        action: "full_inventory",
        azure_tenant_id: chosenTenant.tenant_id,
        top: 50,
      });
      inv = res.data?.inventory || null;
      invWarnings = inv?.warnings || [];
    } catch (e) {
      invWarnings.push(`Inventory fetch failed: ${e.message}`);
    }

    const licenseSummary = inv?.subscribedSkus?.length
      ? inv.subscribedSkus.map(s => `- ${s.skuPartNumber}: ${s.consumedUnits}/${s.prepaidEnabled} consumed`).join("\n")
      : "- Not available";

    const sitesSummary = inv?.sharepoint?.sites?.length
      ? inv.sharepoint.sites.slice(0, 15).map(s => `- ${s.displayName} — ${s.webUrl}`).join("\n")
      : "- Not available";

    const teamsSummary = inv?.teams?.teams?.length
      ? inv.teams.teams.slice(0, 15).map(t => `- ${t.displayName} [${t.visibility || "private"}]`).join("\n")
      : "- Not available";

    const mailboxSummary = inv?.exchange?.mailboxes?.length
      ? `- Total mail-enabled users: ${inv.exchange.mailboxes.length}
- Licensed mailboxes: ${inv.exchange.mailboxes.filter(m => m.licensed).length}
- Disabled with mailbox: ${inv.exchange.mailboxes.filter(m => !m.accountEnabled).length}`
      : "- Not available";

    const domainsSummary = inv?.domains?.length
      ? inv.domains.map(d => `- ${d.id} [${d.authenticationType || "managed"}${d.isDefault ? ", default" : ""}${d.isVerified ? ", verified" : ", unverified"}]`).join("\n")
      : "- Not available";

    const oneDriveSummary = inv?.oneDrive?.driveSamples?.length
      ? `- Provisioned sample: ${inv.oneDrive.driveSamples.length} drives
- Avg used (GB): ${inv.oneDrive.avgUsedGb}`
      : "- Not available";

    const orgSummary = inv?.organization
      ? `- Display name: ${inv.organization.displayName}
- Country: ${inv.organization.country || "—"}
- On-prem sync: ${inv.organization.onPremisesSyncEnabled ? "Enabled (last: " + (inv.organization.onPremisesLastSyncDateTime || "unknown") + ")" : "Not enabled (cloud-only)"}`
      : "- Not available";

    const prompt = `
You are a senior Microsoft 365 and Azure IT consultant. Generate a comprehensive, professional Service Operations Procedure (SOP) document for the following tenant configuration.

The SOP must cover: Executive Summary, Azure Tenant & Organisation Details, Billing & Licensing (M365 admin), Identity & Access Management (Entra ID), Device Management (Intune), Security Baseline & Policies, Microsoft 365 Workloads (Exchange, SharePoint, Teams, OneDrive), Operational Procedures (daily/weekly/monthly tasks), Incident Response, Escalation Matrix, and a Compliance Summary.

Format using Markdown with clear headings (##, ###), bullet points, and tables where appropriate. Be thorough and professional.

IMPORTANT FORMATTING RULES:
- The "## Key Observations" section MUST list each observation as its own separate bullet point. Put a blank line between each bullet so they are spaced out and easy to read. Never bunch multiple observations into a single dense paragraph or a tight run-on list.
- Each bullet should start with a short bolded label (e.g. **Label:**) followed by the detail.
- Include a dedicated "## Reference Table" section near the end. Render it as a single Markdown table with columns: Area | Current State / Value | Status | Notes. Populate one row per major configuration area covered in this SOP (Tenant, Licensing, Identity/MFA, Conditional Access, Intune/Devices, Security Baselines, Exchange, SharePoint, Teams, OneDrive). Keep Status as one of: OK / Warning / Action Required / N/A.

---
TENANT DATA:
- Name: ${chosenTenant.name}
- Azure Tenant ID: ${chosenTenant.tenant_id}
- Domain: ${chosenTenant.domain}
- Subscription Type: ${chosenTenant.subscription_type || "Not specified"}
- Status: ${chosenTenant.status}
- Notes: ${chosenTenant.notes || "None"}

AZURE ORGANISATION (from Azure itself):
${orgSummary}

BILLING & LICENSING (M365 admin — subscribedSkus):
${licenseSummary}

ACCEPTED DOMAINS:
${domainsSummary}

IDENTITY (Entra ID):
- Total Users: ${users.length}
- MFA Enabled: ${users.filter(u => u.mfa_status === "enabled" || u.mfa_status === "enforced").length}
- Guest Users: ${users.filter(u => u.user_type === "guest").length}
- Groups: ${groups.length} (Security: ${groups.filter(g => g.group_type === "security").length}, M365: ${groups.filter(g => g.group_type === "microsoft_365").length})

CONDITIONAL ACCESS POLICIES:
${policies.length > 0 ? policies.slice(0, 15).map(p => `- ${p.policy_name} [${p.state}] (${p.policy_type})`).join("\n") : "- None configured"}

DEVICE MANAGEMENT (Intune):
- Total Devices: ${devices.length}
- Compliant: ${devices.filter(d => d.compliance_state === "compliant").length}
- Non-Compliant: ${devices.filter(d => d.compliance_state === "non_compliant").length}
- Compliance Rate: ${complianceRate}%
- OS Breakdown: Windows: ${devices.filter(d => d.os?.includes("Windows")).length}, macOS: ${devices.filter(d => d.os === "macOS").length}, iOS: ${devices.filter(d => d.os === "iOS").length}, Android: ${devices.filter(d => d.os === "Android").length}

CONFIGURATION PROFILES:
${profiles.length > 0 ? profiles.slice(0, 10).map(p => `- ${p.profile_name} [${p.platform}] (${p.profile_type}) — ${p.state}`).join("\n") : "- None configured"}

SECURITY BASELINES:
${baselines.length > 0 ? baselines.map(b => `- ${b.baseline_name} [${b.state}]: ${b.compliant_devices || 0} compliant, ${b.non_compliant_devices || 0} non-compliant`).join("\n") : "- None deployed"}

MDM SOLUTIONS:
${mdmSolutions.length > 0 ? mdmSolutions.map(m => `- ${m.solution_name} [${m.connection_status}] covering ${m.platform_scope}`).join("\n") : "- Intune (primary MDM)"}

EXCHANGE ONLINE (mailboxes, settings, config):
${mailboxSummary}

SHAREPOINT ONLINE (sites & users):
${sitesSummary}

MICROSOFT TEAMS (setup & config):
${teamsSummary}

ONEDRIVE (config & set details):
${oneDriveSummary}

${invWarnings.length > 0 ? `INVENTORY NOTES (partial data — some sections could not be read):\n${invWarnings.slice(0, 8).map(w => "- " + w).join("\n")}` : ""}
---

Generate the full SOP document now.
`;

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude_sonnet_4_6",
      });
      setSop(typeof result === "string" ? result : result?.text || JSON.stringify(result));
    } catch (e) {
      setSop("Error generating SOP: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const downloadSOP = async () => {
    if (!sop) return;
    setExporting(true);
    try {
      await exportSop(sop, chosenTenant?.name || "tenant", exportFormat);
    } catch (e) {
      console.error("SOP export failed", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="SOP Generator"
        subtitle="Generate a Service Operations Procedure document for any tenant"
        icon={FileText}
      />

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[220px]">
          <p className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Select Tenant</p>
          <Select value={effectiveTenantId} onValueChange={setChosenTenantId}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Choose a tenant..." />
            </SelectTrigger>
            <SelectContent>
              {allTenants.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    {t.name}
                    <Badge className={`ml-1 text-[10px] border-0 ${t.status === "connected" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {t.status}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {chosenTenant && (
          <div className="text-xs text-slate-500 space-y-0.5">
            <p><span className="text-slate-400">Domain:</span> {chosenTenant.domain}</p>
            <p><span className="text-slate-400">Subscription:</span> {chosenTenant.subscription_type || "—"}</p>
          </div>
        )}

        <div className="flex gap-2 ml-auto">
          {sop && (
            <div className="flex items-center gap-2">
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger className="h-10 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPORT_FORMATS.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={downloadSOP} disabled={exporting} className="gap-2">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {exporting ? "Exporting..." : "Download"}
              </Button>
            </div>
          )}
          <Button
            className="bg-slate-900 hover:bg-slate-800 gap-2"
            onClick={generateSOP}
            disabled={!effectiveTenantId || generating}
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {generating ? "Generating SOP..." : sop ? "Regenerate SOP" : "Generate SOP"}
          </Button>
        </div>
      </div>

      {/* Data Summary */}
      {effectiveTenantId && !generating && !sop && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Users", value: users.length },
            { label: "Devices", value: devices.length },
            { label: "Policies", value: policies.length },
            { label: "Profiles", value: profiles.length },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Generating state */}
      {generating && (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="font-semibold text-slate-700">Generating SOP Document...</p>
          <p className="text-sm text-slate-400 mt-1">Analysing tenant configuration and writing procedures. This may take 30–60 seconds.</p>
          <p className="text-xs text-amber-600 mt-2">Note: Uses Claude Sonnet — consumes more integration credits.</p>
        </div>
      )}

      {/* SOP Output */}
      {sop && !generating && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              <span className="font-semibold text-slate-700 text-sm">SOP — {chosenTenant?.name}</span>
              <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">
                {new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPORT_FORMATS.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={downloadSOP} disabled={exporting} className="gap-2">
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {exporting ? "Exporting..." : "Download"}
              </Button>
            </div>
          </div>
          <div className="p-6 sm:p-10 prose prose-sm prose-slate max-w-none overflow-auto max-h-[75vh]">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-2xl font-bold text-slate-900 mt-8 mb-4 border-b border-slate-200 pb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold text-slate-700 mt-5 mb-2">{children}</h3>,
                ul: ({ children }) => <ul className="list-disc pl-6 my-3 space-y-2.5 text-slate-600 leading-relaxed">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-6 my-3 space-y-2.5 text-slate-600 leading-relaxed">{children}</ol>,
                table: ({ children }) => <div className="overflow-x-auto my-5"><table className="w-full border border-slate-300 rounded-lg text-xs border-collapse">{children}</table></div>,
                thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
                th: ({ children }) => <th className="px-3 py-2.5 text-left font-semibold text-slate-700 border border-slate-300">{children}</th>,
                td: ({ children }) => <td className="px-3 py-2 text-slate-600 border border-slate-200">{children}</td>,
                li: ({ children }) => <li className="text-slate-600">{children}</li>,
                p: ({ children }) => <p className="text-slate-600 my-2.5 leading-relaxed">{children}</p>,
                code: ({ children }) => <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
              }}
            >
              {sop}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {!sop && !generating && !effectiveTenantId && (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-16 text-center text-slate-400">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Select a tenant and click Generate SOP to create a Service Operations Procedure document</p>
        </div>
      )}
    </div>
  );
}