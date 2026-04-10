import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Role capability map
const ROLE_SECTIONS = {
  global_admin: ["entra", "intune", "security", "scripts", "export", "admin"],
  intune_admin: ["intune", "scripts", "export"],
  entra_admin: ["entra", "export"],
  security_admin: ["security", "entra", "intune", "export"],
  readonly: ["entra", "intune", "security", "scripts", "export"],
};

const READONLY_ROLES = ["readonly"];

let cachedRbac = null;

export function useRbac() {
  const [rbac, setRbac] = useState(cachedRbac);

  useEffect(() => {
    if (cachedRbac) return;
    (async () => {
      try {
        const user = await base44.auth.me();
        // Platform admins always have global_admin — see all tenants
        if (user?.role === "admin") {
          const result = { role: "global_admin", isReadOnly: false, allowedSections: ROLE_SECTIONS.global_admin, assignedTenants: null, email: user.email };
          cachedRbac = result;
          setRbac(result);
          return;
        }
        // Check AdminRole entity for explicit role assignment
        const roles = await base44.entities.AdminRole.filter({ user_email: user.email, is_active: true });
        if (roles.length > 0) {
          const r = roles[0];
          const sections = r.allowed_sections ? r.allowed_sections.split(",").map(s => s.trim()) : (ROLE_SECTIONS[r.role] || []);
          let assignedTenants = r.assigned_tenants ? r.assigned_tenants.split(",").map(s => s.trim()).filter(Boolean) : null;
          // If no explicit tenants, fall back to email-linked tenants
          if (!assignedTenants || assignedTenants.length === 0) {
            const linkedTenants = await base44.entities.Tenant.filter({ linked_user_email: user.email });
            assignedTenants = linkedTenants.length > 0 ? linkedTenants.map(t => t.id) : null;
          }
          const result = { role: r.role, isReadOnly: READONLY_ROLES.includes(r.role), allowedSections: sections, assignedTenants, email: user.email };
          cachedRbac = result;
          setRbac(result);
        } else {
          // Regular user — scope to tenants linked to their email only
          const linkedTenants = await base44.entities.Tenant.filter({ linked_user_email: user.email });
          const assignedTenants = linkedTenants.length > 0 ? linkedTenants.map(t => t.id) : [];
          const result = { role: "readonly", isReadOnly: true, allowedSections: ROLE_SECTIONS.readonly, assignedTenants, email: user.email };
          cachedRbac = result;
          setRbac(result);
        }
      } catch {
        setRbac({ role: "global_admin", isReadOnly: false, allowedSections: ROLE_SECTIONS.global_admin, assignedTenants: null, email: "" });
      }
    })();
  }, []);

  const canAccess = (section) => {
    if (!rbac) return true;
    return rbac.allowedSections.includes(section);
  };

  const canEdit = () => rbac ? !rbac.isReadOnly : true;

  const filterTenants = (tenants) => {
    if (!rbac) return tenants;
    // Platform admins see everything
    if (rbac.role === "global_admin") return tenants;
    // If explicit tenant IDs are assigned via AdminRole, use those
    if (rbac.assignedTenants) return tenants.filter(t => rbac.assignedTenants.includes(t.id));
    // Otherwise, filter by linked_user_email — clients only see their own tenants
    if (rbac.email) return tenants.filter(t => !t.linked_user_email || t.linked_user_email === rbac.email);
    return tenants;
  };

  return { rbac, canAccess, canEdit, filterTenants };
}