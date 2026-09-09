// Shared Microsoft Graph helpers used by backend functions.
// Plain module — export only, no Deno.serve.

const GLOBAL_CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
const GLOBAL_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");

export async function getAccessToken(tenantId, clientId, clientSecret) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default"
  });
  const res = await fetch(url, { method: "POST", body });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Token error for tenant ${tenantId}: ${data.error_description || JSON.stringify(data)}`);
  }
  return data.access_token;
}

export async function graphGet(token, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph ${path} failed ${res.status}: ${err}`);
  }
  return res.json();
}

export async function graphGetBeta(token, path) {
  const res = await fetch(`https://graph.microsoft.com/beta${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph beta ${path} failed ${res.status}: ${err}`);
  }
  return res.json();
}

// Fetches ALL pages from a Graph endpoint by following @odata.nextLink.
// Accepts either a relative path ("/users?...") or a full URL (existing nextLink).
export async function graphGetAll(token, urlOrPath) {
  let url = urlOrPath.startsWith("http") ? urlOrPath : `https://graph.microsoft.com/v1.0${urlOrPath}`;
  const allValues = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Graph paginated fetch failed ${res.status}: ${err}`);
    }
    const data = await res.json();
    allValues.push(...(data.value || []));
    url = data["@odata.nextLink"] || null;
  }
  return allValues;
}

export async function graphPatch(token, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph PATCH ${path} failed: ${res.status} ${text}`);
  }
  return res.status === 204 ? {} : res.json().catch(() => ({}));
}

// Look up per-tenant Azure app credentials, falling back to the global secret.
export async function getTenantCreds(base44, azureTenantId) {
  let clientId = GLOBAL_CLIENT_ID;
  let clientSecret = GLOBAL_CLIENT_SECRET;
  try {
    const recs = await base44.asServiceRole.entities.Tenant.filter({ tenant_id: azureTenantId });
    const t = recs[0];
    if (t?.azure_client_id) clientId = t.azure_client_id;
    if (t?.azure_client_secret) clientSecret = t.azure_client_secret;
  } catch (e) {
    console.warn("[graphClient] per-tenant creds lookup failed:", e.message);
  }
  return { clientId, clientSecret };
}