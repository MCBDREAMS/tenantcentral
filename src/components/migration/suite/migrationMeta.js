export const SOURCE_TYPES = [
  {
    value: "sharepoint_onprem",
    label: "SharePoint on-premises",
    short: "SP on-prem",
    endpointLabel: "Web application URL",
    placeholder: "https://sps2019.contoso.local",
    hint: "SharePoint 2013 / 2016 / 2019 farms scanned with PnP.PowerShell.",
    tabHint: "Scan a farm, then copy site collections, libraries and permissions into Microsoft 365.",
    defaultWorkloads: ["sharepoint", "onedrive"],
    supportedWorkloads: ["sharepoint", "onedrive"],
    options: [
      { label: "Farm scan", detail: "Web applications, site collections, libraries and item counts read with PnP.PowerShell." },
      { label: "Permission carry-over", detail: "Unique permissions, SharePoint groups and inheritance copied with the structure." },
      { label: "Identity mapping", detail: "Classic and claims users matched to the destination tenant before any copy starts." },
    ],
  },
  {
    value: "sharepoint_online",
    label: "SharePoint Online (Microsoft 365)",
    short: "SP Online",
    endpointLabel: "Source tenant domain",
    placeholder: "contoso.sharepoint.com",
    hint: "SharePoint Online sites, libraries and lists read live from the source tenant with Microsoft Graph.",
    tabHint: "Pick source site collections live from Graph and copy them into the destination tenant.",
    defaultWorkloads: ["sharepoint", "onedrive", "teams"],
    supportedWorkloads: ["sharepoint", "onedrive", "teams"],
    options: [
      { label: "Site selection", detail: "Site collections and libraries enumerated from the source tenant, chosen per site." },
      { label: "Versions and metadata", detail: "Version history, content types and column values kept with each copy." },
      { label: "OneDrive per user", detail: "Each mapped user's OneDrive provisioned and copied on the destination side." },
    ],
  },
  {
    value: "file_share",
    label: "File share",
    short: "File share",
    endpointLabel: "UNC path or server",
    placeholder: "\\\\fs01\\Finance",
    hint: "SMB shares, DFS namespaces and home drives.",
    tabHint: "Lift SMB shares, DFS targets and home drives into SharePoint libraries and OneDrive.",
    defaultWorkloads: ["sharepoint", "onedrive"],
    supportedWorkloads: ["sharepoint", "onedrive"],
    options: [
      { label: "Share and DFS discovery", detail: "Share roots, DFS namespaces and folder depth walked before the copy." },
      { label: "NTFS permissions", detail: "ACLs mapped to SharePoint permissions through the migration map." },
      { label: "Path remediation", detail: "Long paths, blocked extensions and invalid characters flagged in the pre-scan." },
    ],
  },
  {
    value: "google_workspace",
    label: "Google Workspace",
    short: "Google",
    endpointLabel: "Domain",
    placeholder: "contoso.com",
    hint: "Drive, shared drives, Gmail mailboxes and calendars.",
    tabHint: "Move Drive and shared drives into SharePoint, and Gmail into Exchange Online.",
    defaultWorkloads: ["sharepoint", "onedrive", "exchange"],
    supportedWorkloads: ["sharepoint", "onedrive", "exchange"],
    options: [
      { label: "Drive mapping", detail: "My Drive to OneDrive, shared drives to SharePoint site libraries." },
      { label: "Gmail to Exchange", detail: "Mail, labels and attachments moved into Exchange Online mailboxes." },
      { label: "Calendar and contacts", detail: "Google calendars and contacts recreated in the destination mailbox." },
    ],
  },
  {
    value: "box",
    label: "Box.com",
    short: "Box",
    endpointLabel: "Enterprise ID",
    placeholder: "12345678",
    hint: "Box folders, files and Box Notes.",
    tabHint: "Copy Box folder trees, files and collaborations into SharePoint libraries.",
    defaultWorkloads: ["sharepoint"],
    supportedWorkloads: ["sharepoint"],
    options: [
      { label: "Folder tree copy", detail: "Box folders recreated as document libraries and folders." },
      { label: "Notes and versions", detail: "Box Notes converted and file version history carried across." },
      { label: "Collaborations", detail: "Box collaborators mapped to SharePoint permissions on the destination." },
    ],
  },
  {
    value: "m365_tenant",
    label: "Microsoft 365 tenant",
    short: "M365 tenant",
    endpointLabel: "Source tenant domain",
    placeholder: "contoso.onmicrosoft.com",
    hint: "Tenant-to-tenant moves between two Microsoft 365 organisations.",
    tabHint: "Full tenant-to-tenant move: users, mailboxes, SharePoint, OneDrive and Teams chats.",
    defaultWorkloads: ["sharepoint", "onedrive", "teams", "exchange"],
    supportedWorkloads: ["sharepoint", "onedrive", "teams", "exchange"],
    options: [
      { label: "Users and groups", detail: "Accounts, licences and group membership created on the destination first." },
      { label: "Exchange and calendar", detail: "Mailboxes, calendars, rules and permissions copied per mapped user." },
      { label: "Teams and chats", detail: "Teams, channels and chat history migrated with principal replacement." },
    ],
  },
];

export const WORKLOADS = [
  { id: "sharepoint", label: "SharePoint", detail: "Sites, libraries, lists" },
  { id: "onedrive", label: "OneDrive", detail: "Personal content" },
  { id: "teams", label: "Teams", detail: "Channels, apps, messaging" },
  { id: "exchange", label: "Exchange", detail: "Mailboxes, calendars, contacts" },
];

export const MODES = [
  {
    value: "standard",
    label: "Standard",
    detail: "Direct copy from the source host. Best for small sites and pilot batches.",
  },
  {
    value: "insane",
    label: "Insane mode",
    detail:
      "Stages every file through Azure Blob storage, so the destination tenant only sees one steady stream instead of thousands of throttled requests. No local temp storage on the workstation.",
  },
];

export const STATUS_META = {
  draft: {
    label: "Draft",
    dot: "#94A3B8",
    grad: "linear-gradient(180deg, #CBD5E1 0%, #94A3B8 100%)",
    ink: "#0F172A",
    pill: "bg-slate-100 text-slate-700 border-slate-200",
  },
  ready: {
    label: "Ready",
    dot: "#005FB8",
    grad: "linear-gradient(180deg, #3B9BE0 0%, #005FB8 100%)",
    ink: "#FFFFFF",
    pill: "bg-blue-50 text-blue-800 border-blue-200",
  },
  running: {
    label: "Running",
    dot: "#F59E0B",
    grad: "linear-gradient(180deg, #FBBF24 0%, #D97706 100%)",
    ink: "#1D283A",
    pill: "bg-amber-50 text-amber-800 border-amber-200",
  },
  completed: {
    label: "Completed",
    dot: "#16A34A",
    grad: "linear-gradient(180deg, #22C55E 0%, #15803D 100%)",
    ink: "#FFFFFF",
    pill: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  failed: {
    label: "Failed",
    dot: "#E11D48",
    grad: "linear-gradient(180deg, #FB7185 0%, #E11D48 100%)",
    ink: "#FFFFFF",
    pill: "bg-rose-50 text-rose-800 border-rose-200",
  },
};

export const FILTER_ORDER = ["all", "draft", "ready", "running", "completed", "failed"];

// Sources that live in a Microsoft 365 tenant the app can read directly with Graph.
export const CLOUD_SOURCES = ["sharepoint_online", "m365_tenant"];

export function isCloudSource(value) {
  return CLOUD_SOURCES.includes(value);
}

// Copy targets and defaults that belong to one migration type.
export function workloadsFor(sourceType) {
  const meta = SOURCE_TYPES.find((s) => s.value === sourceType);
  if (!meta?.supportedWorkloads) return WORKLOADS;
  return WORKLOADS.filter((w) => meta.supportedWorkloads.includes(w.id));
}

export function defaultWorkloads(sourceType) {
  const meta = SOURCE_TYPES.find((s) => s.value === sourceType);
  return [...(meta?.defaultWorkloads || ["sharepoint", "onedrive"])];
}

export function sourceLabel(project) {
  const meta = SOURCE_TYPES.find((s) => s.value === project.source_type);
  return project.source_label || meta?.short || project.source_type || "Source";
}

export function readingsLabel(project) {
  const ids = String(project.workloads || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return "No workloads selected";
  return ids
    .map((id) => WORKLOADS.find((w) => w.id === id)?.label || id)
    .join(", ");
}