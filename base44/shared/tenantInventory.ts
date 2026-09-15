// Shared Microsoft 365 tenant inventory builder.
// Fetches Azure organisation, billing/licensing, domains, users, SharePoint sites,
// Teams, Exchange mailboxes + settings sample, and OneDrive drive samples from Graph.
// Each section degrades gracefully so a single permission gap doesn't fail the whole call.

import { graphGet, graphGetAll } from "./graphClient.ts";

// Builds a rich SharePoint inventory: all sites, document libraries (with storage),
// site permission grants, and per-site storage aggregates. Each part degrades
// gracefully so a single permission gap (e.g. Sites.FullControl.All for permissions)
// doesn't fail the whole call.
export async function buildSharepointInventory(token, top = 50) {
  const result = { sites: [], siteCount: 0, libraries: [], libraryCount: 0, permissions: [], storage: [], warnings: [] };

  // ── All sites (follow pagination) ──────────────────────────────────────────
  let rawSites = [];
  try {
    rawSites = await graphGetAll(token, `https://graph.microsoft.com/v1.0/sites/root/sites?$select=id,displayName,webUrl,description,createdDateTime,lastModifiedDateTime,isPersonal,siteCollection&$top=999`);
  } catch (e) {
    result.warnings.push(`sites: ${e.message}`);
    try {
      const fallback = await graphGet(token, `/sites/root/sites?$select=id,displayName,webUrl,description,createdDateTime,lastModifiedDateTime&$top=${top}`);
      rawSites = fallback.value || [];
    } catch (e2) { result.warnings.push(`sites (fallback): ${e2.message}`); }
  }
  // Include the root site collection itself if not already present
  try {
    const root = await graphGet(token, `/sites/root?$select=id,displayName,webUrl,description,createdDateTime,lastModifiedDateTime,siteCollection`);
    if (root && !rawSites.find(s => s.id === root.id)) rawSites.unshift(root);
  } catch {}

  result.sites = rawSites.map(s => ({
    id: s.id,
    displayName: s.displayName,
    webUrl: s.webUrl,
    description: s.description,
    createdDateTime: s.createdDateTime,
    lastModifiedDateTime: s.lastModifiedDateTime,
    isPersonal: s.isPersonal,
    siteCollection: s.siteCollection?.hostname || null,
  }));
  result.siteCount = result.sites.length;

  // ── Document libraries (drives) + storage per site (cap to limit throttling) ─
  const libBatch = rawSites.slice(0, Math.min(top, 40));
  const libResults = await Promise.all(libBatch.map(async (site) => {
    try {
      const d = await graphGet(token, `/sites/${site.id}/drives?$select=id,name,driveType,quota,owner,lastModifiedDateTime,description&$top=50`);
      return { siteName: site.displayName || site.webUrl, drives: d.value || [], error: null };
    } catch (e) {
      return { siteName: site.displayName || site.webUrl, drives: [], error: e.message };
    }
  }));
  const siteStorageMap = {};
  libResults.forEach((r) => {
    (r.drives || []).forEach((d) => {
      const usedGb = d.quota?.used != null ? Math.round((d.quota.used / 1e9) * 10) / 10 : 0;
      const totalGb = d.quota?.total != null && d.quota.total > 0 ? Math.round((d.quota.total / 1e9) * 10) / 10 : 0;
      result.libraries.push({
        siteName: r.siteName,
        libraryName: d.name,
        driveType: d.driveType,
        usedGb,
        totalGb,
        usedPct: totalGb ? Math.min(Math.round((usedGb / totalGb) * 100), 100) : 0,
        lastModifiedDateTime: d.lastModifiedDateTime,
      });
      if (!siteStorageMap[r.siteName]) siteStorageMap[r.siteName] = { siteName: r.siteName, usedGb: 0, libraryCount: 0 };
      siteStorageMap[r.siteName].usedGb = Math.round((siteStorageMap[r.siteName].usedGb + usedGb) * 10) / 10;
      siteStorageMap[r.siteName].libraryCount += 1;
    });
    if (r.error) result.warnings.push(`libraries[${r.siteName}]: ${r.error}`);
  });
  result.storage = Object.values(siteStorageMap);
  result.libraryCount = result.libraries.length;

  // ── Site permission grants (cap to first 25 sites; may require FullControl) ─
  const permBatch = rawSites.slice(0, Math.min(top, 25));
  const permResults = await Promise.all(permBatch.map(async (site) => {
    try {
      const p = await graphGet(token, `/sites/${site.id}/permissions?$top=50`);
      return { siteName: site.displayName || site.webUrl, permissions: p.value || [], error: null };
    } catch (e) {
      return { siteName: site.displayName || site.webUrl, permissions: [], error: e.message };
    }
  }));
  permResults.forEach((r) => {
    (r.permissions || []).forEach((p) => {
      const identities = [];
      if (p.grantedTo?.user?.displayName) identities.push(p.grantedTo.user.displayName);
      if (p.grantedTo?.group?.displayName) identities.push(p.grantedTo.group.displayName);
      if (p.grantedTo?.site?.displayName) identities.push(p.grantedTo.site.displayName);
      (p.grantedToIdentitiesV2 || p.grantedToIdentities || []).forEach((g) => {
        const n = g.user?.displayName || g.group?.displayName || g.site?.displayName;
        if (n && !identities.includes(n)) identities.push(n);
      });
      result.permissions.push({
        siteName: r.siteName,
        roles: (p.roles || []).join(", "),
        grantedTo: identities.length ? identities.join("; ") : "—",
        permissionId: p.id,
      });
    });
    if (r.error) result.warnings.push(`permissions[${r.siteName}]: ${r.error}`);
  });

  return result;
}

export async function buildInventory(token, top = 50) {
  const warnings = [];

  // ── Azure organisation / tenant details ──────────────────────────────────
  let organization = null;
  try {
    const orgRes = await graphGet(token, `/organization?$select=id,displayName,city,country,countryLetterCode,postalCode,state,street,preferredLanguage,onPremisesSyncEnabled,onPremisesLastSyncDateTime,assignedPlans,provisionedPlans,technicalNotificationMails`);
    organization = (orgRes.value && orgRes.value[0]) || null;
  } catch (e) { warnings.push(`organization: ${e.message}`); }

  // ── Billing & licensing (M365 admin — subscribedSkus) ─────────────────────
  let subscribedSkus = [];
  try {
    const skusRes = await graphGet(token, `/subscribedSkus`);
    subscribedSkus = (skusRes.value || []).map(s => ({
      skuPartNumber: s.skuPartNumber,
      skuId: s.skuId,
      appliesTo: s.appliesTo,
      capabilityStatus: s.capabilityStatus,
      consumedUnits: s.consumedUnits,
      prepaidEnabled: s.prepaidUnits?.enabled || 0,
      prepaidSuspended: s.prepaidUnits?.suspended || 0,
      servicePlans: (s.servicePlans || []).map(p => ({
        servicePlanName: p.servicePlanName,
        provisioningStatus: p.provisioningStatus,
        appliesTo: p.appliesTo,
      })),
    }));
  } catch (e) { warnings.push(`subscribedSkus: ${e.message}`); }

  // ── Accepted domains ───────────────────────────────────────────────────────
  let domains = [];
  try {
    const domRes = await graphGet(token, `/domains?$select=id,isDefault,isVerified,authenticationType,supportedServices,isRoot,availabilityStatus`);
    domains = domRes.value || [];
  } catch (e) { warnings.push(`domains: ${e.message}`); }

  // ── Users (all, capped) ────────────────────────────────────────────────────
  let users = [];
  try {
    users = await graphGetAll(token, `/users?$select=id,displayName,mail,userPrincipalName,accountEnabled,userType,assignedLicenses,jobTitle,department&$top=${Math.min(top, 999)}`);
  } catch (e) { warnings.push(`users: ${e.message}`); }

  // ── SharePoint (sites, libraries, permissions, storage) ────────────────────
  let sharepoint = { sites: [], siteCount: 0, libraries: [], permissions: [], storage: [], libraryCount: 0 };
  try {
    sharepoint = await buildSharepointInventory(token, top);
    (sharepoint.warnings || []).forEach(w => warnings.push(`sharepoint ${w}`));
  } catch (e) { warnings.push(`sharepoint: ${e.message}`); }

  // ── Microsoft Teams ────────────────────────────────────────────────────────
  let teams = { teams: [], teamCount: 0 };
  try {
    const teamsRes = await graphGet(token, `/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')&$select=id,displayName,description,mail,visibility,createdDateTime&$top=${top}`);
    teams.teams = teamsRes.value || [];
    teams.teamCount = teams.teams.length;
  } catch (e) { warnings.push(`teams: ${e.message}`); }

  // ── Exchange mailboxes + mailbox settings sample ──────────────────────────
  let exchange = { mailboxes: [], mailboxSettingsSample: [], acceptedDomains: domains };
  try {
    exchange.mailboxes = users.map(u => ({
      id: u.id,
      displayName: u.displayName,
      mail: u.mail,
      upn: u.userPrincipalName,
      accountEnabled: u.accountEnabled,
      jobTitle: u.jobTitle,
      department: u.department,
      licensed: (u.assignedLicenses && u.assignedLicenses.length) > 0,
    }));
    const sample = users.slice(0, 5);
    exchange.mailboxSettingsSample = await Promise.all(sample.map(async u => {
      try {
        const s = await graphGet(token, `/users/${u.id}/mailboxSettings?$select=automaticRepliesSetting,archiveFolder,language,timezone,workingHours,userPurpose`);
        return { user: u.userPrincipalName, settings: s };
      } catch (e) {
        return { user: u.userPrincipalName, error: e.message };
      }
    }));
  } catch (e) { warnings.push(`exchange: ${e.message}`); }

  // ── OneDrive (per-user drive samples) ─────────────────────────────────────
  let oneDrive = { driveSamples: [], provisionedCount: 0, avgUsedGb: 0 };
  try {
    const sample = users.slice(0, 8);
    const drives = await Promise.all(sample.map(async u => {
      try {
        const d = await graphGet(token, `/users/${u.id}/drive?$select=id,quota,owner,name`);
        return { user: u.userPrincipalName, drive: d };
      } catch (e) {
        return { user: u.userPrincipalName, error: e.message };
      }
    }));
    oneDrive.driveSamples = drives.filter(d => !d.error);
    oneDrive.provisionedCount = oneDrive.driveSamples.length;
    const usedBytes = oneDrive.driveSamples.reduce((a, d) => a + ((d.drive?.quota?.used || 0)), 0);
    oneDrive.avgUsedGb = oneDrive.driveSamples.length ? Math.round((usedBytes / 1e9) / oneDrive.driveSamples.length * 10) / 10 : 0;
  } catch (e) { warnings.push(`onedrive: ${e.message}`); }

  return {
    organization,
    subscribedSkus,
    domains,
    users: {
      total: users.length,
      enabled: users.filter(u => u.accountEnabled).length,
      guest: users.filter(u => u.userType === "Guest").length,
      licensed: users.filter(u => (u.assignedLicenses || []).length > 0).length,
    },
    sharepoint,
    teams,
    exchange,
    oneDrive,
    warnings,
  };
}