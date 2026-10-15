import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Fail closed: never fall back to a baked-in default key (would enable license forgery).
const LICENSE_SECRET = Deno.env.get("LICENSE_SECRET");

function constTimeEq(a, b) {
  const sa = String(a), sb = String(b);
  if (sa.length !== sb.length) return false;
  let r = 0;
  for (let i = 0; i < sa.length; i++) r |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return r === 0;
}

// HMAC-SHA256 using Web Crypto API
async function hmacSign(data) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(LICENSE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", keyMaterial, enc.encode(data));
  // Convert to base36 string, uppercase, trimmed to 16 chars
  const arr = Array.from(new Uint8Array(sig));
  const hex = arr.map(b => b.toString(16).padStart(2, "0")).join("");
  // Return the full HMAC output (256-bit); callers truncate for display.
  return hex.toUpperCase();
}

// Encode payload to base64url
function encodePayload(obj) {
  const json = JSON.stringify(obj);
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePayload(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return JSON.parse(atob(padded + pad));
}

// Generate key: TC-{encoded_payload}-{hmac_signature}
async function generateKey(tenantIds, expiryDate, clientName) {
  const payload = {
    t: tenantIds.split(",").map(s => s.trim()).filter(Boolean),
    e: expiryDate,
    c: clientName,
  };
  const encoded = encodePayload(payload);
  const sig = await hmacSign(encoded);
  // Format nicely: TC-XXXX-XXXX-XXXX-XXXX-SIG
  const raw = encoded.slice(0, 20).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  // 128-bit (32 hex) signature segment for newly issued keys.
  const sigFormatted = sig.slice(0, 32);
  return `TC-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${sigFormatted}-${encoded}`;
}

// Validate key and check tenant ID is in allowed list
async function validateKey(licenseKey, azureTenantId) {
  try {
    // Key layout (as emitted by generateKey): TC-{4 display groups}-{SIGNATURE}-{base64url payload}
    // → "TC" is segment 0, the 4 display groups are 1-4, the SIGNATURE is segment 5, and the
    // payload is every segment from 6 onward. The payload is base64url, so it can itself contain
    // "-" and therefore span several segments — never assume a fixed total segment count.
    const parts = String(licenseKey).replace(/\s+/g, "").split("-");
    if (parts[0] !== "TC" || parts.length < 7) {
      return { valid: false, reason: "Invalid key format" };
    }
    const providedSig = parts[5].toUpperCase();
    const encoded = parts.slice(6).join("-");
    const payload = decodePayload(encoded);

    // Verify signature — the signature is a hex prefix of the HMAC, so accept any truncation
    // length we have ever issued (16-char legacy, 32-char current) in constant time.
    if (providedSig.length < 16) {
      return { valid: false, reason: "Invalid key signature" };
    }
    const expectedSig = await hmacSign(encoded);
    if (!constTimeEq(providedSig, expectedSig.slice(0, providedSig.length))) {
      return { valid: false, reason: "Invalid key signature" };
    }

    // Check expiry
    const expiry = new Date(payload.e);
    if (isNaN(expiry.getTime())) return { valid: false, reason: "Invalid expiry date in key" };
    if (expiry < new Date()) {
      return { valid: false, reason: `License expired on ${payload.e}` };
    }

    // Check tenant ID (if provided for validation)
    if (azureTenantId) {
      const allowed = (payload.t || []).map(s => s.toLowerCase().trim());
      if (allowed.length > 0 && !allowed.includes(azureTenantId.toLowerCase().trim())) {
        return { valid: false, reason: "This license key is not valid for your Azure Tenant ID" };
      }
    }

    return {
      valid: true,
      clientName: payload.c,
      tenantIds: payload.t,
      expiryDate: payload.e,
      daysRemaining: Math.ceil((expiry - new Date()) / 86400000),
    };
  } catch (e) {
    return { valid: false, reason: "Could not parse license key: " + e.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    if (!LICENSE_SECRET) {
      return Response.json({ error: "License signing secret is not configured. Set the LICENSE_SECRET environment variable." }, { status: 500 });
    }

    // Generate license key — admin only
    if (action === "generate") {
      if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      const { tenant_ids, expiry_date, client_name } = body;
      if (!tenant_ids || !expiry_date || !client_name) {
        return Response.json({ error: "tenant_ids, expiry_date and client_name are required" }, { status: 400 });
      }
      const key = await generateKey(tenant_ids, expiry_date, client_name);
      return Response.json({ success: true, license_key: key });
    }

    // Validate a license key
    if (action === "validate") {
      const { license_key, azure_tenant_id } = body;
      if (!license_key) return Response.json({ error: "license_key required" }, { status: 400 });
      const result = await validateKey(license_key, azure_tenant_id);
      return Response.json({ success: true, ...result });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[licenseManager]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});