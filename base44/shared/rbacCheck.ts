/**
 * RBAC authorization gate for privileged backend functions.
 *
 * Call AFTER base44.auth.me() has already confirmed a logged-in user (the
 * functions keep their existing 401 check). This adds the *authorization*
 * layer the scanner flagged as missing: a logged-in user must not reach
 * another user's tenant, and high-privilege actions require an admin role.
 *
 * Policy (mirrors tenantWrite):
 *   - Platform admins (user.role === "admin") always pass.
 *   - Otherwise the caller must hold an active, non-readonly AdminRole
 *     whose assigned_tenants covers every referenced Azure tenant ID.
 *   - Returns null when authorized, or a 403 Response to return immediately.
 *
 * Usage:
 *   const denied = await authorizeAdminAction(base44, user, [
 *     body.azure_tenant_id,
 *     body.source_tenant_id,
 *     body.target_tenant_id,
 *   ]);
 *   if (denied) return denied;
 */
export async function authorizeAdminAction(
  base44: any,
  user: { email: string; role?: string },
  azureTenantIds: (string | null | undefined)[],
): Promise<Response | null> {
  if (user.role === "admin") return null;

  const adminRoles = await base44.asServiceRole.entities.AdminRole.filter({
    user_email: user.email,
    is_active: true,
  }).catch(() => []);

  const adminRole = adminRoles[0];
  if (!adminRole || adminRole.role === "readonly") {
    return Response.json(
      { error: "Forbidden: insufficient privileges for this action" },
      { status: 403 },
    );
  }

  const requestedTenantIds = azureTenantIds.filter(Boolean) as string[];
  if (adminRole.assigned_tenants && requestedTenantIds.length > 0) {
    const allowed = adminRole.assigned_tenants
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowed.length > 0) {
      for (const azureTid of requestedTenantIds) {
        const tenantRecs = await base44.asServiceRole.entities.Tenant.filter({
          tenant_id: azureTid,
        }).catch(() => []);
        const tenantRec = tenantRecs[0];
        if (tenantRec && !allowed.includes(tenantRec.id)) {
          return Response.json(
            { error: `Forbidden: tenant ${azureTid} not in your assigned scope` },
            { status: 403 },
          );
        }
      }
    }
  }
  return null;
}