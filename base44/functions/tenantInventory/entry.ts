import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { authorizeAdminAction } from '../../shared/rbacCheck.ts';
import { getAccessToken, getTenantCreds } from '../../shared/graphClient.ts';
import { buildInventory } from '../../shared/tenantInventory.ts';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, azure_tenant_id, top = 50 } = body;

    const denied = await authorizeAdminAction(base44, user, [azure_tenant_id]);
    if (denied) return denied;

    if (!azure_tenant_id || !GUID.test(azure_tenant_id)) {
      return Response.json({
        success: false,
        error: "Invalid or missing azure_tenant_id. The selected tenant must have a valid Azure Tenant ID (GUID) configured in Tenants settings.",
      }, { status: 400 });
    }

    const { clientId, clientSecret } = await getTenantCreds(base44, azure_tenant_id);
    const token = await getAccessToken(azure_tenant_id, clientId, clientSecret);

    if (action === "full_inventory") {
      const inventory = await buildInventory(token, top);
      return Response.json({ success: true, inventory });
    }

    return Response.json({ error: "Unknown action: " + action }, { status: 400 });
  } catch (err) {
    console.error("[tenantInventory]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}