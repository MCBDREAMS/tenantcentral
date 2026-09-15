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

  const mdTable = (columns, rows) => {
    if (!rows || rows.length === 0) return "_None._";
    const esc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim() || "—";
    const header = `| ${columns.map((c) => c.label).join(" | ")} |`;
    const sep = `| ${columns.map(() => "---").join(" | ")} |`;
    const body = rows
      .map((r) => `| ${columns.map((c) => esc(typeof c.value === "function" ? c.value(r) : r[c.value])).join(" | ")} |`)
      .join("\n");
    return `${header}\n${sep}\n${body}`;
  };

  const generateSOP = async () => {
    if (!chosenTenant) return;
    setGenerating(true);
    setSop("");

    const complianceRate = devices.length > 0
      ? Math.round((devices.filter(d => d.compliance_state === "compliant").length / devices.length) * 100)
      : 0;

    // Pull live Graph inventory in parallel: org profile, enterprise apps,
    // Intune config breakdown, Entra directory (users + devices), plus M365
    // workloads (SharePoint/Teams/Exchange/OneDrive) from tenantInventory.
    let org = null, enterpriseApps = [], intuneCfg = null, entraInv = null;
    let inv = null, invWarnings = [];
    try {
      const [orgRes, appsRes, cfgRes, invRes, tenantInvRes] = await Promise.all([
        base44.functions.invoke("organizationData", { action: "org_profile", azure_tenant_id: chosenTenant.tenant_id }),
        base44.functions.invoke("organizationData", { action: "enterprise_apps", azure_tenant_id: chosenTenant.tenant_id }),
        base44.functions.invoke("organizationData", { action: "intune_config", azure_tenant_id: chosenTenant.tenant_id }),
        base44.functions.invoke("organizationData", { action: "entra_inventory", azure_tenant_id: chosenTenant.tenant_id }),
        base44.functions.invoke("tenantInventory", { action: "full_inventory", azure_tenant_id: chosenTenant.tenant_id, top: 50 }),
      ]);
      org = orgRes.data;
      enterpriseApps = appsRes.data?.servicePrincipals || [];
      intuneCfg = cfgRes.data;
      entraInv = invRes.data;
      inv = tenantInvRes.data?.inventory || null;
      invWarnings = inv?.warnings || [];
    } catch (e) {
      invWarnings.push(`Live inventory fetch failed: ${e.message}`);
    }

    // ── Build Markdown tables for every inventory section ──
    const o = org?.organization || {};
    const orgTable = org?.success ? mdTable(
      [{ label: "Field", value: "k" }, { label: "Value", value: "v" }],
      [
        { k: "Display Name", v: o.displayName },
        { k: "Tenant Type", v: o.tenantType },
        { k: "Object ID", v: o.id },
        { k: "Created", v: o.createdDateTime },
        { k: "Country", v: o.countryLetterCode },
        { k: "City / State", v: [o.city, o.state].filter(Boolean).join(", ") },
        { k: "Street", v: o.street },
        { k: "Postal Code", v: o.postalCode },
        { k: "Business Phones", v: (o.businessPhones || []).join(", ") },
        { k: "Preferred Language", v: o.preferredLanguage },
        { k: "On-Prem Sync", v: o.onPremisesSyncEnabled ? "Enabled" : "Not enabled" },
        { k: "Preferred Data Location", v: o.preferredDataLocation },
        { k: "Multi-Geo Enabled", v: o.isMultipleDataLocationsForServicesEnabled ? "Yes" : "No" },
        { k: "Technical Emails", v: (o.technicalNotificationMails || []).join(", ") },
      ]
    ) : "_Not available._";

    const subsTable = org?.subscriptions?.length
      ? mdTable(
          [
            { label: "Subscription ID", value: "id" },
            { label: "SKU", value: "skuPartNumber" },
            { label: "Friendly Name", value: "friendlyName" },
            { label: "Status", value: "status" },
            { label: "Units", value: "totalUnits" },
            { label: "Trial", value: (s) => (s.isTrial ? "Yes" : "No") },
            { label: "Next Lifecycle", value: "nextLifecycleDateTime" },
          ],
          org.subscriptions
        )
      : (org?.subscriptionError ? `_Not available via Graph: ${org.subscriptionError}_` : "_None._");

    const licensesTable = org?.licenses?.length
      ? mdTable(
          [
            { label: "SKU", value: "skuPartNumber" },
            { label: "Consumed", value: "consumedUnits" },
            { label: "Enabled", value: (l) => l.prepaidUnits?.enabled ?? 0 },
            { label: "Available", value: (l) => Math.max((l.prepaidUnits?.enabled ?? 0) - (l.consumedUnits || 0), 0) },
            { label: "Status", value: "capabilityStatus" },
            { label: "Applies To", value: "appliesTo" },
          ],
          org.licenses
        )
      : "_None._";

    const domainsTable = org?.domains?.length
      ? mdTable(
          [
            { label: "Domain", value: "displayName" },
            { label: "Verified", value: (d) => (d.isVerified ? "Yes" : "No") },
            { label: "Default", value: (d) => (d.isDefault ? "Yes" : "No") },
            { label: "Initial", value: (d) => (d.isInitial ? "Yes" : "No") },
            { label: "Auth Type", value: "authenticationType" },
            { label: "Services", value: (d) => (d.supportedServices || []).join(", ") },
          ],
          org.domains
        )
      : "_None._";

    const entAppsTable = enterpriseApps.length
      ? mdTable(
          [
            { label: "Application", value: "displayName" },
            { label: "App ID", value: "appId" },
            { label: "Type", value: "servicePrincipalType" },
            { label: "Publisher", value: "publisherName" },
            { label: "First-Party", value: (a) => (a.isFirstParty ? "Yes" : "No") },
            { label: "Audience", value: "signInAudience" },
            { label: "Enabled", value: (a) => (a.accountEnabled ? "Yes" : "No") },
            { label: "SSO", value: "preferredSingleSignOnMode" },
          ],
          enterpriseApps.slice(0, 150)
        )
      : "_None._";

    const entUsers = entraInv?.users?.items || [];
    const entUsersTable = entUsers.length
      ? mdTable(
          [
            { label: "Display Name", value: "displayName" },
            { label: "UPN", value: "userPrincipalName" },
            { label: "Job Title", value: "jobTitle" },
            { label: "Department", value: "department" },
            { label: "Type", value: "userType" },
            { label: "Enabled", value: (u) => (u.accountEnabled ? "Yes" : "No") },
          ],
          entUsers
        )
      : (entraInv?.users?.error ? `_Not available: ${entraInv.users.error}_` : "_None._");

    const entDevices = entraInv?.entraDevices?.items || [];
    const entDevicesTable = entDevices.length
      ? mdTable(
          [
            { label: "Device", value: "displayName" },
            { label: "OS", value: "operatingSystem" },
            { label: "OS Version", value: "operatingSystemVersion" },
            { label: "Trust Type", value: "trustType" },
            { label: "Managed", value: (d) => (d.isManaged ? "Yes" : "No") },
            { label: "Compliant", value: (d) => (d.isCompliant ? "Yes" : "No") },
            { label: "Last Sign-in", value: "approximateLastSignInDateTime" },
          ],
          entDevices
        )
      : (entraInv?.entraDevices?.error ? `_Not available: ${entraInv.entraDevices.error}_` : "_None._");

    const intDevices = entraInv?.intuneDevices?.items || [];
    const intDevicesTable = intDevices.length
      ? mdTable(
          [
            { label: "Device", value: "deviceName" },
            { label: "OS", value: "operatingSystem" },
            { label: "Version", value: "osVersion" },
            { label: "Compliance", value: "complianceState" },
            { label: "User", value: "userPrincipalName" },
            { label: "Model", value: "model" },
            { label: "Last Sync", value: "lastSyncDateTime" },
          ],
          intDevices
        )
      : (entraInv?.intuneDevices?.error ? `_Not available: ${entraInv.intuneDevices.error}_` : "_None._");

    const cfg = intuneCfg || {};
    const cfgTable = (section, cols) => {
      const s = cfg[section];
      if (!s) return "_Not available._";
      if (s.error && (!s.items || s.items.length === 0)) return `_Not available: ${s.error}_`;
      return mdTable(cols, s.items);
    };
    const configProfilesTable = cfgTable("configProfiles", [
      { label: "Name", value: "displayName" }, { label: "Type", value: "type" },
      { label: "Description", value: "description" }, { label: "Created", value: "createdDateTime" }, { label: "Modified", value: "lastModifiedDateTime" },
    ]);
    const compliancePoliciesTable = cfgTable("compliancePolicies", [
      { label: "Name", value: "displayName" }, { label: "Type", value: "type" },
      { label: "Description", value: "description" }, { label: "Modified", value: "lastModifiedDateTime" },
    ]);
    const endpointSecurityTable = cfgTable("endpointSecurity", [
      { label: "Name", value: "displayName" }, { label: "Template ID", value: "templateId" },
      { label: "Description", value: "description" }, { label: "Modified", value: "lastModifiedDateTime" },
    ]);
    const appProtectionTable = cfgTable("appProtectionPolicies", [
      { label: "Name", value: "displayName" }, { label: "Type", value: "type" },
      { label: "Assigned", value: (a) => (a.isAssigned ? "Yes" : "No") }, { label: "Modified", value: "lastModifiedDateTime" },
    ]);
    const applicationsTable = cfgTable("applications", [
      { label: "Name", value: "displayName" }, { label: "Type", value: "type" },
      { label: "Description", value: "description" }, { label: "Modified", value: "lastModifiedDateTime" },
    ]);
    const autopilotTable = cfgTable("autopilotProfiles", [
      { label: "Name", value: "displayName" }, { label: "Description", value: "description" }, { label: "Modified", value: "lastModifiedDateTime" },
    ]);

    // SharePoint detailed inventory (from tenantInventory)
    const sp = inv?.sharepoint || {};
    const spSitesTable = sp.sites?.length
      ? mdTable(
          [
            { label: "Site", value: "displayName" },
            { label: "URL", value: "webUrl" },
            { label: "Description", value: "description" },
            { label: "Created", value: "createdDateTime" },
            { label: "Modified", value: "lastModifiedDateTime" },
            { label: "Personal", value: (s) => (s.isPersonal ? "Yes" : "No") },
          ],
          sp.sites
        )
      : (sp.warnings?.length ? `_Not available: ${sp.warnings.join("; ")}_` : "_None._");
    const spLibrariesTable = sp.libraries?.length
      ? mdTable(
          [
            { label: "Site", value: "siteName" },
            { label: "Library", value: "libraryName" },
            { label: "Type", value: "driveType" },
            { label: "Used (GB)", value: "usedGb" },
            { label: "Quota (GB)", value: "totalGb" },
            { label: "Used %", value: "usedPct" },
            { label: "Modified", value: "lastModifiedDateTime" },
          ],
          sp.libraries
        )
      : "_None._";
    const spPermissionsTable = sp.permissions?.length
      ? mdTable(
          [
            { label: "Site", value: "siteName" },
            { label: "Roles", value: "roles" },
            { label: "Granted To", value: "grantedTo" },
          ],
          sp.permissions
        )
      : "_Not available (Sites.FullControl.All / Sites.Read.All permission may be required to read site permissions)._";
    const spStorageTable = sp.storage?.length
      ? mdTable(
          [
            { label: "Site", value: "siteName" },
            { label: "Libraries", value: "libraryCount" },
            { label: "Used (GB)", value: "usedGb" },
          ],
          sp.storage
        )
      : "_None._";
    const teamsSummary = inv?.teams?.teams?.length
      ? inv.teams.teams.slice(0, 15).map(t => `- ${t.displayName} [${t.visibility || "private"}]`).join("\n")
      : "- Not available";
    const mailboxSummary = inv?.exchange?.mailboxes?.length
      ? `- Total mail-enabled users: ${inv.exchange.mailboxes.length}\n- Licensed mailboxes: ${inv.exchange.mailboxes.filter(m => m.licensed).length}\n- Disabled with mailbox: ${inv.exchange.mailboxes.filter(m => !m.accountEnabled).length}`
      : "- Not available";
    const oneDriveSummary = inv?.oneDrive?.driveSamples?.length
      ? `- Provisioned sample: ${inv.oneDrive.driveSamples.length} drives\n- Avg used (GB): ${inv.oneDrive.avgUsedGb}`
      : "- Not available";

    const prompt = `
You are a senior Microsoft 365 and Azure IT consultant. Generate a comprehensive, professional Service Operations Procedure (SOP) document for the tenant configuration below.

The SOP MUST include these sections (use ## headings): Executive Summary, Azure Tenant & Organisation Details, Billing & Licensing, Identity & Access Management (Entra ID), Enterprise Applications, Entra ID Devices, Device Management (Intune), Intune Configuration Breakdown, Security Baseline & Policies, Microsoft 365 Workloads (Exchange, SharePoint, Teams, OneDrive), Key Observations, Operational Procedures (daily/weekly/monthly), Incident Response, Escalation Matrix, Compliance Summary, Reference Table.

STRICT FORMATTING RULES:
- Use Markdown throughout. ## for sections, ### for sub-sections.
- NEVER compress details into inline pipe-delimited text such as "Name | Status | Value". Render ALL structured/tabular data as proper Markdown tables (a header row followed by a "---" separator row). Use bulleted lists only for narrative observations.
- Reproduce the inventory tables provided below VERBATIM inside the relevant sections — the user wants the COMPLETE inventory, not a truncated summary. If a table is large, include the full table.
- Insert a blank line before and after every heading and every table so the document is airy and well spaced.
- In "## Key Observations", list each observation as its own bullet starting with a short bolded label (e.g. **Label:** detail). Put a blank line between each bullet.
- "## Reference Table" must be a single Markdown table with columns: Area | Current State / Value | Status | Notes. One row per major area: Tenant, Geo/Data Residency, Licensing, Identity/MFA, Conditional Access, Enterprise Apps, Entra Devices, Intune Devices, Configuration Profiles, Compliance Policies, Endpoint Security, App Protection, Applications, Autopilot, Exchange, SharePoint, Teams, OneDrive. Status: OK / Warning / Action Required / N/A.
- "## Intune Configuration Breakdown" must contain one ### sub-section per category, each with its full table and a short configuration-analysis paragraph: ### Configuration Profiles, ### Compliance Policies, ### Endpoint Security Policies, ### App Protection Policies, ### Applications, ### Autopilot Profiles.
- Under the SharePoint part of "## Microsoft 365 Workloads (Exchange, SharePoint, Teams, OneDrive)", include four ### sub-sections, each reproducing the corresponding table verbatim followed by a one-line analysis note: ### SharePoint Sites, ### Document Libraries, ### Site Permissions, ### Storage Utilisation.

---
TENANT:
- Name: ${chosenTenant.name}
- Azure Tenant ID: ${chosenTenant.tenant_id}
- Domain: ${chosenTenant.domain}
- Subscription Type: ${chosenTenant.subscription_type || "Not specified"}
- Status: ${chosenTenant.status}
- Notes: ${chosenTenant.notes || "None"}

ORGANISATION (from Microsoft Graph):
${orgTable}

SUBSCRIPTIONS (M365 admin):
${subsTable}

LICENSES (subscribed SKUs):
${licensesTable}

ACCEPTED DOMAINS:
${domainsTable}

ENTERPRISE APPLICATIONS (service principals):
${entAppsTable}

ENTRA ID USERS:
${entUsersTable}

ENTRA ID DEVICES:
${entDevicesTable}

INTUNE MANAGED DEVICES:
${intDevicesTable}

INTUNE CONFIGURATION PROFILES:
${configProfilesTable}

INTUNE COMPLIANCE POLICIES:
${compliancePoliciesTable}

INTUNE ENDPOINT SECURITY POLICIES:
${endpointSecurityTable}

INTUNE APP PROTECTION POLICIES:
${appProtectionTable}

INTUNE APPLICATIONS:
${applicationsTable}

INTUNE AUTOPILOT PROFILES:
${autopilotTable}

SYNCED TENANT CONTEXT — IDENTITY SUMMARY:
${mdTable(
  [
    { label: "Metric", value: "k" },
    { label: "Value", value: "v" },
  ],
  [
    { k: "Total Users (synced)", v: users.length },
    { k: "MFA Enabled / Enforced", v: users.filter(u => u.mfa_status === "enabled" || u.mfa_status === "enforced").length },
    { k: "Guest Users", v: users.filter(u => u.user_type === "guest").length },
    { k: "Total Groups", v: groups.length },
    { k: "  - Security Groups", v: groups.filter(g => g.group_type === "security").length },
    { k: "  - Microsoft 365 Groups", v: groups.filter(g => g.group_type === "microsoft_365").length },
    { k: "Intune Devices (synced)", v: devices.length },
    { k: "Compliant Devices", v: devices.filter(d => d.compliance_state === "compliant").length },
    { k: "Compliance Rate", v: `${complianceRate}%` },
  ]
)}

SYNCED TENANT CONTEXT — POLICY & BASELINE SUMMARY:
- Conditional Access Policies: ${policies.length > 0 ? policies.slice(0, 15).map(p => `${p.policy_name} [${p.state}] (${p.policy_type})`).join("; ") : "None configured"}
- Security Baselines: ${baselines.length > 0 ? baselines.map(b => `${b.baseline_name} [${b.state}]`).join("; ") : "None deployed"}
- MDM Solutions: ${mdmSolutions.length > 0 ? mdmSolutions.map(m => `${m.solution_name} [${m.connection_status}]`).join("; ") : "Intune (primary MDM)"}

EXCHANGE ONLINE:
${mailboxSummary}

SHAREPOINT ONLINE — SITES:
${spSitesTable}

SHAREPOINT ONLINE — DOCUMENT LIBRARIES:
${spLibrariesTable}

SHAREPOINT ONLINE — SITE PERMISSIONS:
${spPermissionsTable}

SHAREPOINT ONLINE — STORAGE UTILISATION:
${spStorageTable}

MICROSOFT TEAMS:
${teamsSummary}

ONEDRIVE:
${oneDriveSummary}

${invWarnings.length > 0 ? `INVENTORY NOTES (partial data — some sections could not be read):\n${invWarnings.slice(0, 8).map(w => "- " + w).join("\n")}` : ""}
---

Generate the full SOP document now. Include every inventory table above verbatim in the appropriate section.
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
                h1: ({ children }) => <h1 className="text-2xl font-bold text-slate-900 mt-10 mb-5 border-b border-slate-200 pb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-xl font-bold text-slate-800 mt-10 mb-4">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold text-slate-700 mt-6 mb-3">{children}</h3>,
                ul: ({ children }) => <ul className="list-disc pl-6 my-4 space-y-3 text-slate-600 leading-relaxed">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-6 my-4 space-y-3 text-slate-600 leading-relaxed">{children}</ol>,
                table: ({ children }) => <div className="overflow-x-auto my-6"><table className="w-full border border-slate-300 rounded-lg text-xs border-collapse">{children}</table></div>,
                thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
                th: ({ children }) => <th className="px-3 py-2.5 text-left font-semibold text-slate-700 border border-slate-300">{children}</th>,
                td: ({ children }) => <td className="px-3 py-2.5 text-slate-600 border border-slate-200">{children}</td>,
                li: ({ children }) => <li className="text-slate-600 leading-relaxed">{children}</li>,
                p: ({ children }) => <p className="text-slate-600 my-3 leading-relaxed">{children}</p>,
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