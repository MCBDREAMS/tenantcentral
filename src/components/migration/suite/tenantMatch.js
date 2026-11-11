// Resolve a typed tenant name / domain / GUID to a stored Tenant record.
export function matchTenant(tenants = [], input) {
  const value = String(input || "").trim().toLowerCase();
  if (!value) return null;
  const exact =
    tenants.find((t) => String(t.id).toLowerCase() === value) ||
    tenants.find((t) => String(t.tenant_id || "").toLowerCase() === value) ||
    tenants.find((t) => String(t.domain || "").toLowerCase() === value) ||
    tenants.find((t) => String(t.name || "").toLowerCase() === value);
  if (exact) return exact;
  return (
    tenants.find((t) => {
      const domain = String(t.domain || "").toLowerCase();
      return domain && value.includes(domain);
    }) || null
  );
}