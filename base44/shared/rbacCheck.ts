/**
 * RBAC authorization gate for privileged backend functions.
 *
 * Call AFTER base44.auth.me() has already confirmed a logged-in user (the
 * functions keep their existing 401 check). This adds the *authorization*
 * layer: a logged-in user must not reach another user's tenant, high-privilege
 * actions require an admin role, and the app must be licensed for that tenant.
 *
 * Policy:
 *   - License entitlement is enforced server-side for every call (see
 *     assertLicense) — the browser gate alone is not a control.
 *   - Platform admins (user.role === "admin") pass the role/tenant checks.
 *   - Otherwise the caller must hold an active, non-readonly AdminRole with a
 *     NON-EMPTY assigned_tenants list that contains every referenced tenant.
 *
 * Tenant scoping fails closed: if a referenced Azure tenant has no Tenant
 * record in this app, or the caller's role has no assigned tenants, the call is
 * denied rather than silently allowed.
 *
 * Usage:
 *   const denied = await authorizeAdminAction(base44, user, [
 *     body.azure_tenant_id,
 *     body.source_tenant_id,
 *     body.target_tenant_id,
 *   ]);
 *   if (denied) return denied;
 */
import { assertLicense } from "./licenseCheck.ts";

export async function authorizeAdminAction(
  base44: any,
  user: { email: string; role?: string },
  azureTenantIds: (string | null | undefined)[],
): Promise<Response | null> {
  const requestedTenantIds = azureTenantIds.filter(Boolean) as string[];

  // ── License entitlement (applies to admins and scoped users alike) ────────
  const unlicensed = await assertLicense(base44);
  if (unlicensed) return unlicensed;

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

  if (requestedTenantIds.length === 0) return null;

  // Fail closed: the role must name the tenants it may act on.
  const allowed = String(adminRole.assigned_tenants || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowed.length === 0) {
    return Response.json(
      { error: "Forbidden: no tenants are assigned to your role" },
      { status: 403 },
    );
  }

  for (const azureTid of requestedTenantIds) {
    const tenantRecs = await base44.asServiceRole.entities.Tenant.filter({ tenant_id: azureTid })
      .catch(() => []);
    const tenantRec = tenantRecs?.[0];
    if (!tenantRec || !allowed.includes(tenantRec.id)) {
      return Response.json(
        { error: `Forbidden: tenant ${azureTid} not in your assigned scope` },
        { status: 403 },
      );
    }
  }

  return null;
}