import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { authorizeAdminAction } from '../../shared/rbacCheck.ts';
import { getAccessToken, getTenantCreds, graphGet, graphGetAll, graphPatch } from '../../shared/graphClient.ts';

/**
 * CloudCommand — PowerShell session backend.
 *
 * The migration console runs the cmdlets that CAN be executed against Microsoft 365
 * from the cloud here (Graph equivalent), and hands the user a ready-to-run
 * Exchange Online / on-premises PowerShell script for everything that cannot be
 * driven from a web app (delegate permissions, PST export, mailbox type changes).
 *
 * Supported actions:
 *   connect             - validate the session token and return tenant identity
 *   get_user            - identity snapshot of one account
 *   set_immutable_id    - stamp onPremisesImmutableId (hybrid / staged migration)
 *   reset_password      - issue a temporary password
 *   set_enabled         - enable / disable an account at cutover
 *   get_domains         - verified domains with their authentication type
 */

const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UPN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function strongPassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?'];
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = '';
  for (let i = 0; i < 16; i++) {
    const set = sets[i % sets.length];
    out += set[bytes[i] % set.length];
  }
  return out;
}

function asBool(value) {
  const v = String(value === true ? 'true' : value || '').toLowerCase().replace('$', '');
  if (['true', '1', 'yes', 'enabled'].includes(v)) return true;
  if (['false', '0', 'no', 'disabled'].includes(v)) return false;
  return null;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const azureTenantId = String(body.azure_tenant_id || '');
    const params = body.params && typeof body.params === 'object' ? body.params : {};

    if (!action) return Response.json({ error: 'action is required' }, { status: 400 });
    if (!GUID.test(azureTenantId)) return Response.json({ error: 'Invalid azure_tenant_id' }, { status: 400 });

    const upn = String(params.userprincipalname || params.identity || '').trim();
    const needsUpn = ['get_user', 'set_immutable_id', 'reset_password', 'set_enabled'];
    if (needsUpn.includes(action) && !UPN.test(upn)) {
      return Response.json({ error: 'A valid -UserPrincipalName is required' }, { status: 400 });
    }

    const denied = await authorizeAdminAction(base44, user, [azureTenantId]);
    if (denied) return denied;

    const creds = await getTenantCreds(base44, azureTenantId);
    const token = await getAccessToken(azureTenantId, creds.clientId, creds.clientSecret);
    const userPath = `/users/${encodeURIComponent(upn)}`;

    if (action === 'connect') {
      const org = await graphGet(token, '/organization?$select=id,displayName');
      const domains = await graphGetAll(token, '/domains?$select=id,isVerified,isDefault,authenticationType');
      const verified = domains.filter((d) => d.isVerified).map((d) => d.id);
      const defaultDomain = (domains.find((d) => d.isDefault) || {}).id || '';
      return Response.json({
        success: true,
        lines: [
          'Connected to Microsoft Graph',
          '',
          `Tenant         : ${(org.value || [])[0]?.displayName || 'Unknown'}`,
          `Tenant ID      : ${azureTenantId}`,
          `Default domain : ${defaultDomain || 'none reported'}`,
          `Verified       : ${verified.join(', ') || 'none'}`,
          `App (client) ID: ${creds.clientId || 'not configured'}`,
          '',
          'Graph token acquired with the app registration. Exchange-only tasks can now be generated as a local script.',
        ],
      });
    }

    if (action === 'get_user') {
      const u = await graphGet(
        token,
        `${userPath}?$select=id,userPrincipalName,displayName,mail,accountEnabled,onPremisesImmutableId,onPremisesSyncEnabled,proxyAddresses,assignedLicenses,createdDateTime,usageLocation`,
      );
      const proxies = u.proxyAddresses || [];
      return Response.json({
        success: true,
        lines: [
          `DisplayName            : ${u.displayName || ''}`,
          `UserPrincipalName      : ${u.userPrincipalName || ''}`,
          `Mail                   : ${u.mail || '(none)'}`,
          `ObjectId               : ${u.id || ''}`,
          `AccountEnabled         : ${u.accountEnabled}`,
          `OnPremisesImmutableId  : ${u.onPremisesImmutableId || '(not set)'}`,
          `OnPremisesSyncEnabled  : ${u.onPremisesSyncEnabled || 'false'}`,
          `Licences               : ${(u.assignedLicenses || []).length}`,
          `UsageLocation          : ${u.usageLocation || '(not set)'}`,
          `Created                : ${(u.createdDateTime || '').slice(0, 10)}`,
          '',
          `ProxyAddresses (${proxies.length}):`,
          ...(proxies.length ? proxies.map((p) => `  ${p}`) : ['  (none)']),
        ],
      });
    }

    if (action === 'set_immutable_id') {
      const immutableId = String(params.immutableid || '').trim();
      if (!immutableId) return Response.json({ error: 'A valid -ImmutableId is required' }, { status: 400 });
      await graphPatch(token, userPath, { onPremisesImmutableId: immutableId });
      const u = await graphGet(token, `${userPath}?$select=userPrincipalName,onPremisesImmutableId`);
      return Response.json({
        success: true,
        lines: [
          `onPremisesImmutableId set for ${u.userPrincipalName}`,
          `Value now: ${u.onPremisesImmutableId || '(empty)'}`,
          '',
          'The cloud account now matches its on-premises/AD object — required before the final cutover sync.',
        ],
      });
    }

    if (action === 'reset_password') {
      const supplied = String(params.password || '').trim();
      const password = supplied || strongPassword();
      await graphPatch(token, userPath, {
        passwordProfile: { password, forceChangePasswordNextSignIn: true },
      });
      return Response.json({
        success: true,
        lines: [
          `Password reset for ${upn}`,
          `Temporary password: ${password}`,
          '',
          'The user must change this password at next sign-in. Copy it now — it is not stored by CloudCommand.',
        ],
      });
    }

    if (action === 'set_enabled') {
      const enabled = asBool(params.enabled);
      if (enabled === null) {
        return Response.json({ error: 'Use -Enabled $true or -Enabled $false' }, { status: 400 });
      }
      await graphPatch(token, userPath, { accountEnabled: enabled });
      return Response.json({
        success: true,
        lines: [
          `accountEnabled set to ${enabled} for ${upn}`,
          enabled
            ? 'Account is live — sign-in and licence assignment are possible.'
            : 'Account is blocked — use this after the source-side cutover to stop sign-in on the old identity.',
        ],
      });
    }

    if (action === 'get_domains') {
      const domains = await graphGetAll(
        token,
        '/domains?$select=id,isVerified,isDefault,isInitial,authenticationType,supportedServices',
      );
      const rows = domains.map(
        (d) =>
          `${d.isVerified ? 'verified  ' : 'UNVERIFIED'}  ${d.id}${d.isDefault ? '  (default)' : ''}` +
          `${d.isInitial ? '  (initial)' : ''}  auth=${d.authenticationType || 'Managed'}`,
      );
      return Response.json({
        success: true,
        lines: [
          `Domains in ${azureTenantId}`,
          '',
          ...(rows.length ? rows : ['(none returned)']),
        ],
      });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (err) {
    console.error('[psConsole]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}