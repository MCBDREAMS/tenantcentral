// Shared Microsoft 365 tenant inventory builder.
// Fetches Azure organisation, billing/licensing, domains, users, SharePoint sites,
// Teams, Exchange mailboxes + settings sample, and OneDrive drive samples from Graph.
// Each section degrades gracefully so a single permission gap doesn't fail the whole call.

import { graphGet, graphGetAll } from "./graphClient.ts";

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

  // ── SharePoint sites ───────────────────────────────────────────────────────
  let sharepoint = { sites: [], siteCount: 0 };
  try {
    const sitesRes = await graphGet(token, `/sites/root/sites?$select=id,displayName,webUrl,description,createdDateTime,lastModifiedDateTime&$top=${top}`);
    sharepoint.sites = sitesRes.value || [];
    sharepoint.siteCount = sharepoint.sites.length;
  } catch (e) { warnings.push(`sharepoint sites: ${e.message}`); }

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