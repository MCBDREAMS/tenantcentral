// Per-mailbox migration options offered when selecting accounts in the
// tenant-to-tenant wizard. Each key is carried through the selection payload so
// the run report can list the Exchange follow-up steps for that mailbox.

export const MAILBOX_OPTIONS = [
  { key: "includeArchive", label: "Archive mailbox", hint: "Carry the online archive with the move" },
  { key: "keepPermissions", label: "Mailbox permissions", hint: "FullAccess / SendAs / Send on behalf" },
  { key: "keepDelegates", label: "Calendar delegates", hint: "Delegate access and calendar sharing" },
  { key: "keepRules", label: "Inbox rules", hint: "Recreate server-side inbox rules" },
  { key: "copyContacts", label: "Contacts & tasks", hint: "Copy contacts and tasks across" },
  { key: "keepLitigationHold", label: "Litigation hold", hint: "Re-enable retention / litigation hold" },
  { key: "convertToShared", label: "Convert to shared", hint: "Shared mailbox once the move completes" },
];

export const DEFAULT_MAILBOX = {
  includeArchive: true,
  keepPermissions: true,
  keepDelegates: true,
  keepRules: true,
  copyContacts: false,
  keepLitigationHold: false,
  convertToShared: false,
  forwardTo: "",
};

export const splitUpn = (upn, fallbackDomain) => {
  const [local, domain] = String(upn || "").split("@");
  return { localPart: local || "", domain: domain || fallbackDomain || "" };
};

export const joinUpn = (localPart, domain) => (localPart && domain ? `${localPart}@${domain}` : "");