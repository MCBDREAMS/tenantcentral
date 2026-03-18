import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const GLOBAL_CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
const GLOBAL_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, tenant_id, client_id, client_secret, link_user_email, tenant_record_id } = body;

    const effectiveClientId = client_id || GLOBAL_CLIENT_ID;
    const effectiveClientSecret = client_secret || GLOBAL_CLIENT_SECRET;

    // ── Test connection credentials ───────────────────────────────────────────
    if (action === "test_connection") {
      const url = `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`;
      const tokenRes = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: effectiveClientId,
          client_secret: effectiveClientSecret,
          scope: "https://graph.microsoft.com/.default"
        })
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        return Response.json({ success: false, error: tokenData.error_description || "Authentication failed" });
      }

      // Get tenant info to confirm
      const infoRes = await fetch("https://graph.microsoft.com/v1.0/organization?$select=displayName,verifiedDomains,id", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const info = await infoRes.json();
      const org = info.value?.[0];

      return Response.json({ success: true, org_name: org?.displayName, org_id: org?.id });
    }

    // ── Link a user to this tenant (restrict access) ──────────────────────────
    if (action === "link_user") {
      if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

      // Find the user to link
      const appUsers = await base44.asServiceRole.entities.User.list();
      const targetUser = appUsers.find(u => u.email?.toLowerCase() === link_user_email?.toLowerCase());
      if (!targetUser) return Response.json({ success: false, error: `User '${link_user_email}' not found in the app. They must be invited first.` });

      // Upsert AdminRole - restrict to this tenant only
      const existing = await base44.asServiceRole.entities.AdminRole.filter({ user_email: link_user_email });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.AdminRole.update(existing[0].id, {
          assigned_tenants: tenant_record_id,
          allowed_sections: "entra,intune,security,scripts,export",
          role: "readonly",
          is_active: true,
        });
      } else {
        await base44.asServiceRole.entities.AdminRole.create({
          user_email: link_user_email,
          role: "readonly",
          assigned_tenants: tenant_record_id,
          allowed_sections: "entra,intune,security,scripts,export",
          is_active: true,
        });
      }

      // Also store the linked user on the tenant record
      await base44.asServiceRole.entities.Tenant.update(tenant_record_id, {
        linked_user_email: link_user_email
      });

      return Response.json({ success: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});