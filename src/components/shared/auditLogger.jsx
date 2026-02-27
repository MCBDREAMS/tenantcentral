import { base44 } from "@/api/base44Client";

export async function logAction({ action, category, tenant_id, tenant_name, target_name, details, severity = "info", status = "success" }) {
  try {
    const user = await base44.auth.me();
    await base44.entities.AuditLog.create({
      action,
      category,
      actor: user?.email || "unknown",
      tenant_id: tenant_id || "",
      tenant_name: tenant_name || "",
      target_name: target_name || "",
      details: typeof details === "object" ? JSON.stringify(details) : (details || ""),
      severity,
      status,
    });
  } catch (e) {
    console.warn("Audit log failed:", e);
  }
}