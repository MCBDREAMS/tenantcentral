import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Fetches the rich device inventory for a tenant (one Graph call powers several report tabs).
export function useDeviceInventoryReport(azureTenantId, opts = {}) {
  return useQuery({
    queryKey: ["device-inventory-report", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions
        .invoke("windowsUpgradeEngine", { action: "device_inventory_report", azure_tenant_id: azureTenantId })
        .then(r => r.data),
    ...opts,
  });
}

export function timeSince(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return { label: "just now", ms: 0, bucket: "recent" };
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return { label: "<1 min", ms: diff, bucket: "recent" };
  if (mins < 60) return { label: `${mins} min`, ms: diff, bucket: "recent" };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { label: `${hrs}h ${mins % 60}m`, ms: diff, bucket: hrs < 8 ? "aging" : "stale" };
  const days = Math.floor(hrs / 24);
  return { label: `${days}d ${hrs % 24}h`, ms: diff, bucket: days >= 7 ? "critical" : "stale" };
}

export function checkinBucket(iso) {
  if (!iso) return "never";
  const t = timeSince(iso);
  return t.bucket;
}