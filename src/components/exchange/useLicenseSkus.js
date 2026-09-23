import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Fetches the tenant's subscribed SKUs and exposes a resolver that maps a
// user's assignedLicenses array (from Graph /users) into readable product names.
export function useLicenseSkus(tenantId) {
  const { data: skus = [], isLoading } = useQuery({
    queryKey: ["license_skus", tenantId],
    enabled: !!tenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "list_license_skus", azure_tenant_id: tenantId })
        .then(r => r.data.skus || []),
    staleTime: 5 * 60 * 1000,
  });

  const skuMap = {};
  skus.forEach(s => { skuMap[s.skuId] = s; });

  // assignedLicenses: [{ skuId, disabledPlans?: [planId] }]
  // Returns an array of product display names (skuPartNumber) the user is licensed for.
  const resolveLicenses = (assignedLicenses) => {
    if (!assignedLicenses || assignedLicenses.length === 0) return [];
    return assignedLicenses
      .map(al => skuMap[al.skuId]?.skuPartNumber)
      .filter(Boolean);
  };

  // Returns [{ skuId, skuPartNumber, servicePlans: [{id,name}] }] for richer export/detail.
  const resolveLicenseDetails = (assignedLicenses) => {
    if (!assignedLicenses || assignedLicenses.length === 0) return [];
    return assignedLicenses
      .map(al => {
        const sku = skuMap[al.skuId];
        if (!sku) return null;
        return {
          skuId: al.skuId,
          skuPartNumber: sku.skuPartNumber,
          servicePlans: sku.servicePlans || [],
        };
      })
      .filter(Boolean);
  };

  return { skus, isLoading, resolveLicenses, resolveLicenseDetails };
}