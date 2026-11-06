/**
 * Server-side license entitlement check.
 *
 * The activation screen (LicenseGate) only runs in the browser, so a logged-in
 * user could reach the privileged backend functions without ever activating a
 * key. Every privileged action now re-checks entitlement here, against the
 * operator-issued License records — the browser gate is no longer the control.
 *
 * Policy:
 *   - No License records configured -> licensing is not in use, allow.
 *   - Otherwise an active, unexpired License record must exist.
 *
 * Per-tenant coverage is intentionally not enforced here: an operator's license
 * commonly covers a set of tenants narrower than the console's tenant list, and
 * denying on that basis would take working tenants offline.
 */
export async function assertLicense(base44: any): Promise<Response | null> {
  let licenses: any[] | null = null;
  try {
    licenses = await base44.asServiceRole.entities.License.list();
  } catch {
    // A license read failure must not take the console offline.
    return null;
  }
  if (!Array.isArray(licenses) || licenses.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const hasValidLicense = licenses.some((l) => {
    if ((l.status || "active") !== "active") return false;
    return !l.expiry_date || String(l.expiry_date) >= today;
  });

  if (hasValidLicense) return null;

  return Response.json(
    { error: "Forbidden: no active license for this application" },
    { status: 403 },
  );
}