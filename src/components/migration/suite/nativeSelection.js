// Maps the workloads stored on a migration project onto the workloads the in-app
// migration engine understands, then turns discovered source objects into batch items.
const WORKLOAD_TO_ENGINE = {
  exchange: "mailboxes",
  users: "mailboxes",
  onedrive: "onedrive",
  sharepoint: "sharepoint",
  teams: "teams",
};

export function engineWorkloads(workloads) {
  return String(workloads || "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => WORKLOAD_TO_ENGINE[w] || w);
}

export const COPY_SETTINGS = {
  maxFilesPerRun: 50,
  folderDepth: 2,
  includeTeamChats: true,
  maxChannelsPerRun: 10,
};

// opts.mailboxIds narrows the mailboxes (and their target accounts) to the ones
// ticked in the mailbox picker; omitted means every discovered mailbox.
export function buildSelection(objects, mapping, list, opts = {}) {
  const byUpn = Object.fromEntries(
    (mapping?.userMapping || []).map((m) => [m.sourceUpn, m]),
  );
  const items = [];
  const onlyMailboxes = Array.isArray(opts.mailboxIds) ? new Set(opts.mailboxIds) : null;

  if (list.includes("mailboxes")) {
    (objects.mailboxes || []).forEach((u) => {
      if (onlyMailboxes && !onlyMailboxes.has(u.id)) return;
      const m = byUpn[u.upn] || { action: "create", targetUpn: u.upn };
      items.push({
        kind: "user",
        source: {
          id: u.id,
          upn: u.upn,
          mail: u.mail,
          displayName: u.displayName,
          jobTitle: u.jobTitle,
          department: u.department,
        },
        target: {
          upn: m.targetUpn || u.upn,
          mode: m.action === "map" ? "migrate" : "create",
          action: m.action === "map" ? "map" : "create",
        },
        mailbox: u.mail ? {} : null,
      });
    });
  }

  if (list.includes("onedrive")) {
    (objects.onedrive || []).forEach((d) => {
      const m = byUpn[d.upn];
      items.push({
        kind: "onedrive",
        source: d,
        target: { userId: m?.targetId || "", upn: m?.targetUpn || d.upn },
      });
    });
  }

  if (list.includes("sharepoint")) {
    (objects.sharepoint || []).forEach((s) => {
      items.push({
        kind: "sharepoint",
        source: { siteId: s.id, displayName: s.displayName, webUrl: s.webUrl },
        target: { displayName: s.displayName, description: s.description || "" },
      });
    });
  }

  if (list.includes("teams")) {
    (objects.teams || []).forEach((t) => {
      items.push({
        kind: "team",
        source: { teamId: t.id, displayName: t.displayName, description: t.description || "" },
        target: { displayName: t.displayName, description: t.description || "" },
      });
    });
  }

  return items;
}