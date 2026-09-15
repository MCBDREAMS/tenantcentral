import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { authorizeAdminAction } from '../../shared/rbacCheck.ts';
import {
  getAccessToken,
  graphGet,
  graphGetBeta,
  graphGetAll,
  getTenantCreds,
} from '../../shared/graphClient.ts';

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

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[organizationData]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}