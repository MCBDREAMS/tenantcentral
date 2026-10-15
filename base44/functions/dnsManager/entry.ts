import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { authorizeAdminAction } from '../../shared/rbacCheck.ts';
import {
  getAccessToken,
  graphGet,
  graphGetAll,
  graphPatch,
  graphPost,
  graphPostAction,
  getTenantCreds,
} from '../../shared/graphClient.ts';

// ── Tenant DNS ──────────────────────────────────────────────────────────────
// DNS names (custom domains) come from Microsoft Graph /domains. Each domain's
// required records come from its verification + service configuration record sets,
// topped up with the standard Microsoft 365 mail records, and every record is then
// checked against live public DNS over HTTPS so the console shows what is actually
// published versus what is still missing.

const DNS_TYPES = ['A', 'AAAA', 'CAA', 'CNAME', 'MX', 'NS', 'PTR', 'SOA', 'SRV', 'TXT'];
const DNS_NAME_RE = /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)*$/i;

// ── Live DNS lookups (DNS-over-HTTPS, no credentials required) ──────────────
async function dohResolve(name, type) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { answers: [], error: `DNS lookup failed (${res.status})` };
    const data = await res.json();
    return { answers: (data.Answer || []).map((a) => String(a.data ?? '')), error: null };
  } catch (e) {
    return { answers: [], error: e.message };
  }
}

// Independent lookups run in small batches so one slow resolver cannot stall the rest.
async function resolveAll(targets) {
  const out = [];
  for (let i = 0; i < targets.length; i += 6) {
    const batch = targets.slice(i, i + 6);
    const settled = await Promise.allSettled(batch.map((t) => dohResolve(t.host, t.type)));
    settled.forEach((s, idx) => {
      out.push(s.status === 'fulfilled' ? s.value : { answers: [], error: 'DNS lookup failed' });
    });
  }
  return out;
}

function normalize(value) {
  return String(value ?? '').trim().replace(/^"|"$/g, '').replace(/\.$/, '').toLowerCase();
}

// CNAME/MX/A must match the expected value exactly. TXT and SRV records are
// routinely extended by the tenant (extra SPF includes, extra DMARC tags), so they
// are matched on the anchor that defines them instead.
function compareRecord(expected, answers, type) {
  if (!answers.length) return 'missing';
  const exp = normalize(expected);
  if (!exp) return 'unknown';
  const anchor = exp.startsWith('v=spf1') ? 'v=spf1' : exp.startsWith('v=dmarc1') ? 'v=dmarc1' : exp;
  for (const raw of answers) {
    const act = normalize(raw);
    if (!act) continue;
    // MX answers carry the preference first ("0 contoso-com.mail.protection.outlook.com.").
    if (type === 'MX') {
      if (act.replace(/^\d+\s+/, '') === exp) return 'correct';
    } else if (type === 'CNAME' || type === 'A' || type === 'AAAA') {
      if (act === exp) return 'correct';
    } else if (act.includes(anchor)) {
      return 'correct';
    }
  }
  return 'mismatch';
}

function mapGraphRecord(r, domain, source) {
  const kind = String(r['@odata.type'] || '').replace('#microsoft.graph.', '');
  const fromOdata = kind.replace('domainDns', '').replace('Record', '').toUpperCase();
  const type = fromOdata || String(r.recordType || '').toUpperCase();
  const label = String(r.label ?? '').trim() || String(r.name ?? '').trim();
  const host = !label || label === '@' || label === '.' ? domain : `${label}.${domain}`;

  let value = '';
  let detail = '';
  if (type === 'TXT') value = r.text || '';
  else if (type === 'MX') {
    value = r.mailExchange || '';
    detail = `priority ${r.preference ?? 0}`;
  } else if (type === 'CNAME') value = r.canonicalName || '';
  else if (type === 'SRV') {
    value = r.target || '';
    detail = `port ${r.port ?? 443}, priority ${r.priority ?? 100}, weight ${r.weight ?? 1}`;
  }

  return {
    id: r.id || `${type}-${host}`,
    type,
    host,
    value,
    detail,
    ttl: r.ttl ?? 3600,
    service: r.supportedService || '',
    required: !r.isOptional,
    source,
  };
}

async function safeGraphList(token, path) {
  try {
    const data = await graphGet(token, path);
    return { items: data.value || [], error: null, denied: false };
  } catch (e) {
    console.warn('[dnsManager] graph fetch failed:', path, e.message);
    return { items: [], error: e.message, denied: /403|Authorization_RequestDenied/i.test(e.message) };
  }
}

// The standard Microsoft 365 record set for a custom domain. It fills any gap left by
// the tenant's own record sets (which Graph only returns with Domain.Read.All) and
// covers the records Microsoft does not return at all, such as SPF and DMARC. Records
// the tenant's own sets already describe are never duplicated.
function standardRecords(domain, initialDomain, mailEnabled) {
  const dashed = domain.replace(/\./g, '-');
  // The mail records below only apply to a domain that actually hosts mail.
  const mailRows = [
    { type: 'MX', label: '@', value: `${dashed}.mail.protection.outlook.com`, detail: 'priority 0', service: 'Email routing', required: true },
    { type: 'TXT', label: '@', value: 'v=spf1 include:spf.protection.outlook.com -all', detail: '', service: 'Email (SPF)', required: true },
    { type: 'CNAME', label: 'autodiscover', value: 'autodiscover.outlook.com', detail: '', service: 'Email (autodiscover)', required: true },
    { type: 'CNAME', label: 'selector1._domainkey', value: `selector1-${dashed}._domainkey.${initialDomain}`, detail: '', service: 'Email (DKIM 1)', required: false },
    { type: 'CNAME', label: 'selector2._domainkey', value: `selector2-${dashed}._domainkey.${initialDomain}`, detail: '', service: 'Email (DKIM 2)', required: false },
    { type: 'TXT', label: '_dmarc', value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`, detail: '', service: 'Email (DMARC)', required: false },
  ];
  const serviceRows = [
    { type: 'CNAME', label: 'enterpriseregistration', value: 'enterpriseregistration.windows.net', detail: '', service: 'Entra ID device registration', required: false },
    { type: 'CNAME', label: 'enterprisemanagement', value: 'enterprisemanagement.windows.net', detail: '', service: 'MDM enrollment', required: false },
    { type: 'CNAME', label: 'EnterpriseEnrollment', value: 'EnterpriseEnrollment.manage.microsoft.com', detail: '', service: 'Intune enrollment', required: false },
    { type: 'CNAME', label: 'lyncdiscover', value: 'webdir.online.lync.com', detail: '', service: 'Teams / Skype discovery', required: false },
    { type: 'SRV', label: '_sipfederationtls._tcp', value: 'sipdir.online.lync.com', detail: 'priority 100, weight 1, port 5061', service: 'Teams federation', required: false },
  ];
  const rows = mailEnabled ? [...mailRows, ...serviceRows] : serviceRows;
  return rows.map((r) => ({
    id: `standard-${r.type}-${r.label}`,
    type: r.type,
    host: r.label === '@' ? domain : `${r.label}.${domain}`,
    value: r.value,
    detail: r.detail,
    ttl: 3600,
    service: r.service,
    required: r.required,
    source: 'standard',
  }));
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, azure_tenant_id } = body;

    // ── Ad-hoc DNS lookup (public DNS, no tenant access needed) ──
    if (action === 'lookup') {
      const denied = await authorizeAdminAction(base44, user, []);
      if (denied) return denied;

      const name = String(body.name || '').trim().toLowerCase().replace(/\.$/, '');
      const type = String(body.type || 'A').toUpperCase();
      if (!name || name.length > 253 || !DNS_NAME_RE.test(name)) {
        return Response.json({ error: 'Enter a valid DNS name (for example mail.contoso.com)' }, { status: 400 });
      }
      if (!DNS_TYPES.includes(type)) return Response.json({ error: 'Unsupported record type' }, { status: 400 });

      const result = await dohResolve(name, type);
      return Response.json({ success: true, name, type, answers: result.answers, lookup_error: result.error });
    }

    if (!azure_tenant_id) return Response.json({ error: 'Tenant is required' }, { status: 400 });
    const denied = await authorizeAdminAction(base44, user, [azure_tenant_id]);
    if (denied) return denied;

    const { clientId, clientSecret } = await getTenantCreds(base44, azure_tenant_id);
    const token = await getAccessToken(azure_tenant_id, clientId, clientSecret);

    // ── All DNS names (domains) for the tenant ──
    if (action === 'list_domains') {
      const domains = await graphGetAll(
        token,
        '/domains?$select=id,isVerified,isDefault,isInitial,isRoot,isAdminManaged,supportedServices,authenticationType&$top=999',
      );
      const mapped = (domains || [])
        .map((d) => ({
          id: d.id,
          name: d.id,
          isVerified: !!d.isVerified,
          isDefault: !!d.isDefault,
          isInitial: !!d.isInitial,
          isRoot: !!d.isRoot,
          isAdminManaged: !!d.isAdminManaged,
          authenticationType: d.authenticationType || 'Managed',
          supportedServices: d.supportedServices || [],
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return Response.json({
        success: true,
        domains: mapped,
        initialDomain: (mapped.find((d) => d.isInitial) || {}).name || '',
      });
    }

    const domain = String(body.domain || '').trim().toLowerCase();
    if (!domain || domain.length > 253 || !DNS_NAME_RE.test(domain)) {
      return Response.json({ error: 'Invalid domain name' }, { status: 400 });
    }

    // ── Required DNS records for one domain, checked against live public DNS ──
    if (action === 'domain_records') {
      const [domainList, verification, serviceConfig] = await Promise.all([
        graphGetAll(token, '/domains?$select=id,isInitial,supportedServices&$top=999'),
        safeGraphList(token, `/domains/${encodeURIComponent(domain)}/verificationDnsRecords`),
        safeGraphList(token, `/domains/${encodeURIComponent(domain)}/serviceConfigurationRecords`),
      ]);

      const current = (domainList || []).find((d) => d.id.toLowerCase() === domain);
      const initialDomain = ((domainList || []).find((d) => d.isInitial) || {}).id || '';

      const records = [
        ...verification.items.map((r) => mapGraphRecord(r, domain, 'verification')),
        ...serviceConfig.items.map((r) => mapGraphRecord(r, domain, 'service')),
      ];

      if (current && !current.isInitial) {
        const mailEnabled = current.supportedServices ? current.supportedServices.includes('Email') : true;
        const standard = standardRecords(domain, initialDomain || 'contoso.onmicrosoft.com', mailEnabled);
        for (const extra of standard) {
          if (!records.some((r) => r.type === extra.type && r.host.toLowerCase() === extra.host.toLowerCase())) {
            records.push(extra);
          }
        }
      }

      const resolved = await resolveAll(records.map((r) => ({ host: r.host, type: r.type })));
      const checked = records.map((r, i) => {
        const live = resolved[i] || { answers: [], error: 'DNS lookup failed' };
        return {
          ...r,
          published: live.answers,
          lookup_error: live.error,
          status: compareRecord(r.value, live.answers, r.type),
        };
      });

      return Response.json({
        success: true,
        domain,
        isInitial: !!(current && current.isInitial),
        records: checked,
        record_sets_available: !(verification.denied || serviceConfig.denied),
        record_set_note: verification.denied || serviceConfig.denied
          ? "Microsoft Graph denied access to this domain's own DNS record sets: the app registration needs the Domain.ReadWrite.All permission of type Application (a Delegated one has no effect on app-only calls). Until it is granted with admin consent, the standard Microsoft 365 record set is shown instead, and the Verify and Set default actions may also be refused."
          : null,
        warnings: verification.denied || serviceConfig.denied
          ? []
          : [verification.error, serviceConfig.error].filter(Boolean),
        summary: {
          total: checked.length,
          required: checked.filter((r) => r.required).length,
          published: checked.filter((r) => r.status === 'correct').length,
          mismatch: checked.filter((r) => r.status === 'mismatch').length,
          missing: checked.filter((r) => r.status === 'missing').length,
        },
      });
    }

    // ── Register a new DNS name (custom domain) on the tenant ──
    if (action === 'add_domain') {
      let created;
      try {
        created = await graphPost(token, '/domains', { id: domain });
      } catch (e) {
        const message = /403|Authorization_RequestDenied/i.test(e.message)
          ? 'Microsoft Graph refused the registration: the app registration needs the Domain.ReadWrite.All application permission with admin consent.'
          : /already exists|conflict/i.test(e.message)
            ? `${domain} is already registered on this tenant.`
            : e.message;
        return Response.json({ error: message }, { status: 400 });
      }

      const verification = await safeGraphList(
        token,
        `/domains/${encodeURIComponent(domain)}/verificationDnsRecords`,
      );

      return Response.json({
        success: true,
        domain,
        is_verified: !!created.isVerified,
        verification_records: verification.items.map((r) => {
          const mapped = mapGraphRecord(r, domain, 'verification');
          return { type: mapped.type, host: mapped.host, value: mapped.value, ttl: mapped.ttl };
        }),
        record_sets_available: !verification.denied,
        note: verification.denied
          ? 'Publish the MS=ms... ownership TXT record shown in the Microsoft 365 admin center for this domain, then verify it.'
          : 'Publish the record above at your DNS host, then verify the domain.',
      });
    }

    // ── Configure: verify the domain ownership record in Entra ID ──
    if (action === 'verify_domain') {
      await graphPostAction(token, `/domains/${encodeURIComponent(domain)}/verify`);
      return Response.json({ success: true, domain, message: `${domain} passed verification in Entra ID.` });
    }

    // ── Configure: make this the tenant's default domain ──
    if (action === 'set_default_domain') {
      await graphPatch(token, `/domains/${encodeURIComponent(domain)}`, { isDefault: true });
      return Response.json({ success: true, domain, message: `${domain} is now the default domain.` });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[dnsManager]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}