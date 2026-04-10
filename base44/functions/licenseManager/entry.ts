import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const LICENSE_SECRET = Deno.env.get("LICENSE_SECRET") || "default-secret";

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
  // Convert first 8 bytes of hex to a readable key segment
  return hex.slice(0, 16).toUpperCase();
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
  const sigFormatted = sig.slice(0, 16);
  return `TC-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${sigFormatted}-${encoded}`;
}

// Validate key and check tenant ID is in allowed list
async function validateKey(licenseKey, azureTenantId) {
  try {
    // Key format: TC-XXXX-XXXX-XXXX-XXXX-SIG-{encoded_payload}
    const parts = licenseKey.trim().split("-");
    if (parts.length < 8 || parts[0] !== "TC") {
      return { valid: false, reason: "Invalid key format" };
    }
    // Payload is after the 6th dash segment
    const encoded = parts.slice(7).join("-");
    const payload = decodePayload(encoded);

    // Verify signature
    const expectedSig = await hmacSign(encoded);
    const providedSig = parts[6].toUpperCase();
    if (providedSig !== expectedSig) {
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