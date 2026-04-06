import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const GLOBAL_CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
const GLOBAL_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");

async function getAccessToken(tenantId, clientId, clientSecret) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default"
  });
  const res = await fetch(url, { method: "POST", body });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function graphGet(token, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph ${path} failed ${res.status}: ${err}`);
  }
  return res.json();
}

// Paginate through all results
async function graphGetAll(token, path) {
  let results = [];
  let url = `https://graph.microsoft.com/v1.0${path}`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Graph paginate failed ${res.status}: ${err}`);
    }
    const data = await res.json();
    results = results.concat(data.value || []);
    url = data['@odata.nextLink'] || null;
  }
  return results;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, azure_tenant_id } = body;

    // Look up per-tenant credentials
    let clientId = GLOBAL_CLIENT_ID;
    let clientSecret = GLOBAL_CLIENT_SECRET;
    try {
      const tenantRecords = await base44.asServiceRole.entities.Tenant.filter({ tenant_id: azure_tenant_id });
      const tenantRecord = tenantRecords[0];
      if (tenantRecord?.azure_client_id) clientId = tenantRecord.azure_client_id;
      if (tenantRecord?.azure_client_secret) clientSecret = tenantRecord.azure_client_secret;
    } catch (e) {
      console.warn("[azureAppRegistrations] Could not look up per-tenant creds:", e.message);
    }

    const token = await getAccessToken(azure_tenant_id, clientId, clientSecret);

    if (action === "list_app_registrations") {
      // Fetch all app registrations with their password credentials (secrets) and key credentials (certs)
      const apps = await graphGetAll(token, `/applications?$select=id,appId,displayName,createdDateTime,publisherDomain,passwordCredentials,keyCredentials&$top=999`);

      const enriched = apps.map(app => {
        const secrets = app.passwordCredentials || [];
        const certs = app.keyCredentials || [];

        // Find the nearest expiring secret
        const secretExpiries = secrets
          .filter(s => s.endDateTime)
          .map(s => new Date(s.endDateTime).getTime());

        const certExpiries = certs
          .filter(c => c.endDateTime)
          .map(c => new Date(c.endDateTime).getTime());

        const allExpiries = [...secretExpiries, ...certExpiries];
        const nearestExpiry = allExpiries.length > 0
          ? new Date(Math.min(...allExpiries)).toISOString()
          : null;

        return {
          id: app.id,
          appId: app.appId,
          displayName: app.displayName,
          createdDateTime: app.createdDateTime,
          publisherDomain: app.publisherDomain,
          secretCount: secrets.length,
          certCount: certs.length,
          nearestExpiry,
          secrets: secrets.map(s => ({
            displayName: s.displayName,
            startDateTime: s.startDateTime,
            endDateTime: s.endDateTime,
            hint: s.hint,
          })),
          certs: certs.map(c => ({
            displayName: c.displayName,
            startDateTime: c.startDateTime,
            endDateTime: c.endDateTime,
            type: c.type,
          })),
        };
      });

      // Sort by nearest expiry (expired/soonest first, then no-expiry)
      enriched.sort((a, b) => {
        if (!a.nearestExpiry && !b.nearestExpiry) return 0;
        if (!a.nearestExpiry) return 1;
        if (!b.nearestExpiry) return -1;
        return new Date(a.nearestExpiry) - new Date(b.nearestExpiry);
      });

      return Response.json({ success: true, apps: enriched, total: enriched.length });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[azureAppRegistrations]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});