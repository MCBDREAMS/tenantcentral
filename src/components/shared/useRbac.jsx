import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Role capability map
const ROLE_SECTIONS = {
  local_admin:     ["entra", "intune", "security", "scripts", "export", "admin", "approval_queue", "deployment_plans"],
  global_admin:    ["entra", "intune", "security", "scripts", "export", "admin", "approval_queue", "deployment_plans"],
  tenant_admin:    ["entra", "intune", "security", "scripts", "export", "approval_queue", "deployment_plans"],
  intune_admin:    ["intune", "scripts", "export", "deployment_plans"],
  entra_admin:     ["entra", "export"],
  security_admin:  ["security", "entra", "intune", "export", "approval_queue"],
  approval_admin:  ["approval_queue", "admin"],
  deployment_mgr:  ["intune", "scripts", "export", "deployment_plans"],
  readonly:        ["entra", "intune", "security", "scripts", "export"],
};

const READONLY_ROLES = ["readonly"];
// Roles that can edit/write within their allowed sections
const EDIT_ROLES = ["local_admin", "global_admin", "tenant_admin", "intune_admin", "entra_admin", "security_admin", "approval_admin", "deployment_mgr"];

let cachedRbac = null;

export function clearRbacCache() {
  cachedRbac = null;
}

export function useRbac() {
  const [rbac, setRbac] = useState(cachedRbac);

  useEffect(() => {
    if (cachedRbac) return;
    (async () => {
      try {
        const user = await base44.auth.me();

        // Platform-level admin (local_admin) — sees ALL tenants, full access
        if (user?.role === "admin") {
          const result = {
            role: "local_admin",
            isReadOnly: false,
            allowedSections: ROLE_SECTIONS.local_admin,
            assignedTenants: null, // null = all tenants
            email: user.email,
          };
          cachedRbac = result;
          setRbac(result);
          return;
        }

        // Check AdminRole entity for an explicit role assignment
        const roles = await base44.entities.AdminRole.filter({ user_email: user.email, is_active: true });

        if (roles.length > 0) {
          const r = roles[0];
          const sections = r.allowed_sections
            ? r.allowed_sections.split(",").map(s => s.trim())
            : (ROLE_SECTIONS[r.role] || ROLE_SECTIONS.readonly);

          // Tenant scoping: explicit list wins, otherwise derive from Tenant.linked_user_email
          let assignedTenants = r.assigned_tenants
            ? r.assigned_tenants.split(",").map(s => s.trim()).filter(Boolean)
            : null;

          if (!assignedTenants || assignedTenants.length === 0) {
            const linked = await base44.entities.Tenant.filter({ linked_user_email: user.email });
            assignedTenants = linked.length > 0 ? linked.map(t => t.id) : [];
          }

          const result = {
            role: r.role,
            isReadOnly: READONLY_ROLES.includes(r.role),
            allowedSections: sections,
            assignedTenants,
            email: user.email,
          };
          cachedRbac = result;
          setRbac(result);
        } else {
          // No AdminRole found — treat as standard (readonly) user scoped to their registered tenant
          const linked = await base44.entities.Tenant.filter({ linked_user_email: user.email });
          const assignedTenants = linked.length > 0 ? linked.map(t => t.id) : [];
          const result = {
            role: "readonly",
            isReadOnly: true,
            allowedSections: ROLE_SECTIONS.readonly,
            assignedTenants,
            email: user.email,
          };
          cachedRbac = result;
          setRbac(result);
        }
      } catch {
        setRbac({ role: "local_admin", isReadOnly: false, allowedSections: ROLE_SECTIONS.local_admin, assignedTenants: null, email: "" });
      }
    })();
  }, []);

  const canAccess = (section) => {
    if (!rbac) return true;
    return rbac.allowedSections.includes(section);
  };

  const canEdit = () => {
    if (!rbac) return true;
    return EDIT_ROLES.includes(rbac.role);
  };

  // Strict tenant filter — local_admin sees all, everyone else sees only their scoped tenants
  const filterTenants = (tenants) => {
    if (!rbac) return tenants;
    if (rbac.role === "local_admin" || rbac.role === "global_admin") return tenants;
    if (rbac.assignedTenants && rbac.assignedTenants.length > 0) {
      return tenants.filter(t => rbac.assignedTenants.includes(t.id));
    }
    // No assigned tenants — return empty (no accidental data leak)
    return [];
  };

  // Whether this user is a tenant admin for a specific tenant record id
  const isTenantAdmin = (tenantRecordId) => {
    if (!rbac) return false;
    if (rbac.role === "local_admin" || rbac.role === "global_admin") return true;
    return rbac.role === "tenant_admin" && (!rbac.assignedTenants || rbac.assignedTenants.includes(tenantRecordId));
  };

  return { rbac, canAccess, canEdit, filterTenants, isTenantAdmin };
}