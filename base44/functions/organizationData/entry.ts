import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { authorizeAdminAction } from '../../shared/rbacCheck.ts';
import {
  getAccessToken,
  graphGet,
  graphGetBeta,
  graphGetAll,
  getTenantCreds,
} from '../../shared/graphClient.ts';

// Fetches a single page from Graph, returning { items, error } so one
// permission gap on a multi-source report doesn't discard the rest.
async function safeGraphPage(token, path) {
  try {
    const data = await graphGet(token, path);
    return { items: data.value || [], error: null };
  } catch (e) {
    console.error('[organizationData] graph fetch failed:', path, e.message);
    return { items: [], error: e.message };
  }
}

async function safeGraphBetaPage(token, path) {
  try {
    const data = await graphGetBeta(token, path);
    return { items: data.value || [], error: null };
  } catch (e) {
    console.error('[organizationData] graph beta fetch failed:', path, e.message);
    return { items: [], error: e.message };
  }
}

function cleanType(t) {
  return t ? t.replace('#microsoft.graph.', '') : null;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, azure_tenant_id } = body;

    // Tenant-scoped admin authorization
    const denied = await authorizeAdminAction(base44, user, [azure_tenant_id]);
    if (denied) return denied;

    const { clientId, clientSecret } = await getTenantCreds(base44, azure_tenant_id);
    const token = await getAccessToken(azure_tenant_id, clientId, clientSecret);

    // ── Organizational Profile (M365 admin center → Org settings → Organizational Profile) ──
    if (action === 'org_profile') {
      const orgResp = await graphGet(
        token,
        '/organization?$select=id,displayName,createdDateTime,tenantType,onPremisesSyncEnabled,isMultipleDataLocationsForServicesEnabled,preferredLanguage,preferredDataLocation,countryLetterCode,city,state,street,postalCode,businessPhones,fax,mobile,marketingNotificationEmails,technicalNotificationMails,securityComplianceNotificationMails,privacyProfile',
      );
      const org = (orgResp.value && orgResp.value[0]) || orgResp;

      const skuResp = await graphGet(token, '/subscribedSkus');
      const licenses = (skuResp.value || []).map((s) => ({
        skuId: s.skuId,
        skuPartNumber: s.skuPartNumber,
        capabilityStatus: s.capabilityStatus,
        consumedUnits: s.consumedUnits,
        appliesTo: s.appliesTo,
        prepaidUnits: s.prepaidUnits
          ? {
              enabled: s.prepaidUnits.enabled,
              suspended: s.prepaidUnits.suspended,
              warning: s.prepaidUnits.warning,
            }
          : null,
        servicePlans: (s.servicePlans || []).map((sp) => ({
          servicePlanId: sp.servicePlanId,
          servicePlanName: sp.servicePlanName,
          provisioningStatus: sp.provisioningStatus,
          appliesTo: sp.appliesTo,
        })),
      }));

      // Commercial subscriptions live on the beta endpoint and may not be readable
      // with app-only auth depending on tenant configuration — treat as optional.
      let subscriptions = null;
      let subscriptionError = null;
      try {
        const subResp = await graphGetBeta(
          token,
          '/directory/subscriptions?$select=id,skuId,skuPartNumber,status,totalUnits,isTrial,nextLifecycleDateTime,friendlyName,ownerId,ownerType',
        );
        subscriptions = (subResp.value || []).map((s) => ({
          id: s.id,
          skuId: s.skuId,
          skuPartNumber: s.skuPartNumber,
          status: s.status,
          totalUnits: s.totalUnits,
          isTrial: s.isTrial,
          nextLifecycleDateTime: s.nextLifecycleDateTime,
          friendlyName: s.friendlyName,
          ownerId: s.ownerId,
          ownerType: s.ownerType,
        }));
      } catch (e) {
        subscriptionError = e.message;
      }

      const domains = await graphGetAll(
        token,
        '/domains?$select=id,isVerified,isDefault,isRoot,isInitial,isAdminManaged,supportedServices,authenticationType&$top=999',
      );

      return Response.json({
        success: true,
        organization: {
          id: org.id,
          displayName: org.displayName,
          createdDateTime: org.createdDateTime,
          tenantType: org.tenantType,
          onPremisesSyncEnabled: org.onPremisesSyncEnabled,
          isMultipleDataLocationsForServicesEnabled: org.isMultipleDataLocationsForServicesEnabled,
          preferredLanguage: org.preferredLanguage,
          preferredDataLocation: org.preferredDataLocation,
          countryLetterCode: org.countryLetterCode,
          city: org.city,
          state: org.state,
          street: org.street,
          postalCode: org.postalCode,
          businessPhones: org.businessPhones,
          fax: org.fax,
          mobile: org.mobile,
          marketingNotificationEmails: org.marketingNotificationEmails,
          technicalNotificationMails: org.technicalNotificationMails,
          securityComplianceNotificationMails: org.securityComplianceNotificationMails,
          privacyProfile: org.privacyProfile,
        },
        licenses,
        subscriptions,
        subscriptionError,
        domains: (domains || []).map((d) => ({
          id: d.id,
          displayName: d.id,
          isVerified: d.isVerified,
          isDefault: d.isDefault,
          isRoot: d.isRoot,
          isInitial: d.isInitial,
          isAdminManaged: d.isAdminManaged,
          authenticationType: d.authenticationType,
          supportedServices: d.supportedServices || [],
        })),
      });
    }

    // ── Enterprise Applications (all service principals in the tenant) ──
    if (action === 'enterprise_apps') {
      const sps = await graphGetAll(
        token,
        '/servicePrincipals?$select=id,appId,displayName,servicePrincipalType,accountEnabled,appOwnerOrganizationId,publisherName,signInAudience,createdDateTime,homepage,tags,preferredSingleSignOnMode&$top=999',
      );

      const enriched = (sps || [])
        .map((sp) => {
          const publisher = (sp.publisherName || '').toLowerCase();
          // Microsoft first-party apps report the Microsoft home tenant as the
          // app owner (GUID prefix f8cdef31-...) and/or a Microsoft publisher name.
          const ownerIsMicrosoft =
            !!sp.appOwnerOrganizationId &&
            sp.appOwnerOrganizationId.toLowerCase().startsWith('f8cdef31-');
          const isFirstParty =
            ownerIsMicrosoft ||
            publisher.includes('microsoft services') ||
            publisher === 'microsoft';
          return {
            id: sp.id,
            appId: sp.appId,
            displayName: sp.displayName,
            servicePrincipalType: sp.servicePrincipalType,
            accountEnabled: sp.accountEnabled,
            publisherName: sp.publisherName,
            appOwnerOrganizationId: sp.appOwnerOrganizationId,
            signInAudience: sp.signInAudience,
            createdDateTime: sp.createdDateTime,
            homepage: sp.homepage,
            tags: sp.tags || [],
            preferredSingleSignOnMode: sp.preferredSingleSignOnMode,
            isFirstParty,
          };
        })
        .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

      return Response.json({
        success: true,
        servicePrincipals: enriched,
        total: enriched.length,
      });
    }

    // ── Entra ID directory inventory (users + Entra devices + Intune managed devices) ──
    if (action === 'entra_inventory') {
      const [usersRes, devicesRes, managedRes] = await Promise.all([
        safeGraphPage(
          token,
          '/users?$select=id,displayName,userPrincipalName,jobTitle,department,accountEnabled,userType,createdDateTime&$top=150',
        ),
        safeGraphPage(
          token,
          '/devices?$select=id,displayName,deviceCategory,operatingSystem,operatingSystemVersion,trustType,isManaged,isCompliant,approximateLastSignInDateTime&$top=150',
        ),
        safeGraphPage(
          token,
          '/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,userPrincipalName,lastSyncDateTime,model,manufacturer&$top=150',
        ),
      ]);

      return Response.json({
        success: true,
        users: {
          items: (usersRes.items || []).map((u) => ({
            id: u.id,
            displayName: u.displayName,
            userPrincipalName: u.userPrincipalName,
            jobTitle: u.jobTitle,
            department: u.department,
            accountEnabled: u.accountEnabled,
            userType: u.userType,
            createdDateTime: u.createdDateTime,
          })),
          total: (usersRes.items || []).length,
          error: usersRes.error,
        },
        entraDevices: {
          items: (devicesRes.items || []).map((d) => ({
            id: d.id,
            displayName: d.displayName,
            operatingSystem: d.operatingSystem,
            operatingSystemVersion: d.operatingSystemVersion,
            trustType: d.trustType,
            isManaged: d.isManaged,
            isCompliant: d.isCompliant,
            approximateLastSignInDateTime: d.approximateLastSignInDateTime,
          })),
          total: (devicesRes.items || []).length,
          error: devicesRes.error,
        },
        intuneDevices: {
          items: (managedRes.items || []).map((d) => ({
            id: d.id,
            deviceName: d.deviceName,
            operatingSystem: d.operatingSystem,
            osVersion: d.osVersion,
            complianceState: d.complianceState,
            userPrincipalName: d.userPrincipalName,
            lastSyncDateTime: d.lastSyncDateTime,
            model: d.model,
            manufacturer: d.manufacturer,
          })),
          total: (managedRes.items || []).length,
          error: managedRes.error,
        },
      });
    }

    // ── Intune configuration breakdown (6 policy/app categories) ──
    if (action === 'intune_config') {
      const common = 'id,displayName,description,createdDateTime,lastModifiedDateTime';
      const [cfg, comp, intent, appProt, mobApps, auto] = await Promise.all([
        safeGraphPage(token, `/deviceManagement/deviceConfigurations?$select=${common}&$top=200`),
        safeGraphPage(token, `/deviceManagement/deviceCompliancePolicies?$select=${common}&$top=200`),
        safeGraphBetaPage(
          token,
          '/deviceManagement/intents?$select=id,displayName,description,templateId,lastModifiedDateTime&$top=200',
        ),
        safeGraphPage(token, `/deviceAppManagement/managedAppPolicies?$select=${common}&$top=200`),
        safeGraphPage(token, `/deviceAppManagement/mobileApps?$select=${common}&$top=200`),
        safeGraphBetaPage(
          token,
          '/deviceManagement/windowsAutopilotDeploymentProfiles?$select=${common}&$top=200',
        ),
      ]);

      const mapCfg = (o) => ({
        id: o.id,
        displayName: o.displayName,
        description: o.description,
        type: cleanType(o['@odata.type']),
        createdDateTime: o.createdDateTime,
        lastModifiedDateTime: o.lastModifiedDateTime,
      });

      return Response.json({
        success: true,
        configProfiles: { items: cfg.items.map(mapCfg), error: cfg.error },
        compliancePolicies: { items: comp.items.map(mapCfg), error: comp.error },
        endpointSecurity: {
          items: intent.items.map((o) => ({
            ...mapCfg(o),
            templateId: o.templateId,
          })),
          error: intent.error,
        },
        appProtectionPolicies: {
          items: appProt.items.map((o) => ({ ...mapCfg(o), isAssigned: o.isAssigned })),
          error: appProt.error,
        },
        applications: { items: mobApps.items.map(mapCfg), error: mobApps.error },
        autopilotProfiles: { items: auto.items.map(mapCfg), error: auto.error },
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[organizationData]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}