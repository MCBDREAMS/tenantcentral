import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Landmark, RefreshCw, Download, Loader2, Globe, MapPin,
  CheckCircle2, XCircle, ShieldAlert, Building2, Mail,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportToCSV } from "@/components/shared/exportUtils";
import { format } from "date-fns";

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
      <span className={`text-sm text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>
        {value === null || value === undefined || value === "" ? <span className="text-slate-400">—</span> : value}
      </span>
    </div>
  );
}

export default function OrganizationalProfile({ selectedTenant, tenants = [] }) {
  const azureTenantId = selectedTenant?.tenant_id;

  const { data: result, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["org-profile", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions
        .invoke("organizationData", { action: "org_profile", azure_tenant_id: azureTenantId })
        .then((r) => r.data),
  });

  const org = result?.organization;
  const licenses = result?.licenses || [];
  const subscriptions = result?.subscriptions;
  const domains = result?.domains || [];

  const licenseExport = useMemo(
    () =>
      licenses.map((l) => ({
        sku_part_number: l.skuPartNumber,
        consumed_units: l.consumedUnits,
        enabled_units: l.prepaidUnits?.enabled ?? "",
        suspended_units: l.prepaidUnits?.suspended ?? "",
        warning_units: l.prepaidUnits?.warning ?? "",
        capability_status: l.capabilityStatus || "",
        applies_to: l.appliesTo || "",
        service_plans: l.servicePlans.map((sp) => sp.servicePlanName).join("; "),
      })),
    [licenses],
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Organizational Profile"
        subtitle={
          selectedTenant
            ? `M365 admin center → Org settings → Organizational profile for ${selectedTenant.name}`
            : "Select a tenant to view its organizational profile"
        }
        icon={Landmark}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching || !azureTenantId}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading || isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {!azureTenantId && (
        <div className="text-center py-16 text-slate-400">
          <Landmark className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-500">No tenant selected</p>
          <p className="text-sm mt-1">Select a tenant from the sidebar to view its organizational profile.</p>
        </div>
      )}

      {azureTenantId && (isLoading || isRefetching) && (
        <div className="flex justify-center items-center py-20 gap-3 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="text-sm">Loading organizational profile from Microsoft Graph...</span>
        </div>
      )}

      {azureTenantId && !isLoading && !isRefetching && result?.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <p className="font-semibold mb-1">Could not load organizational profile</p>
          <p className="text-red-600 text-xs font-mono break-all">{result.error}</p>
        </div>
      )}

      {azureTenantId && !isLoading && !isRefetching && org && (
        <div className="space-y-6">
          {/* Organization identity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 lg:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-slate-500" />
                <h3 className="font-semibold text-slate-800">Organization</h3>
              </div>
              <div className="flex flex-col">
                <InfoRow label="Display Name" value={org.displayName} />
                <InfoRow label="Tenant Type" value={org.tenantType} />
                <InfoRow label="Object ID" value={org.id} mono />
                <InfoRow label="Created" value={org.createdDateTime ? format(new Date(org.createdDateTime), "dd MMM yyyy") : ""} />
                <InfoRow label="Preferred Language" value={org.preferredLanguage} />
                <InfoRow label="On-Premises Sync" value={org.onPremisesSyncEnabled ? "Enabled" : "Disabled"} />
              </div>
            </div>

            {/* Address + contacts */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 lg:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-slate-500" />
                <h3 className="font-semibold text-slate-800">Address & Contacts</h3>
              </div>
              <div className="flex flex-col">
                <InfoRow label="Country" value={org.countryLetterCode} />
                <InfoRow label="City" value={org.city} />
                <InfoRow label="State" value={org.state} />
                <InfoRow label="Street" value={org.street} />
                <InfoRow label="Postal Code" value={org.postalCode} />
                <InfoRow label="Business Phones" value={Array.isArray(org.businessPhones) ? org.businessPhones.join(", ") : org.businessPhones} />
                <InfoRow label="Technical Emails" value={Array.isArray(org.technicalNotificationMails) ? org.technicalNotificationMails.join(", ") : org.technicalNotificationMails} />
              </div>
            </div>

            {/* Data residency / geo */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 lg:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-4 w-4 text-slate-500" />
                <h3 className="font-semibold text-slate-800">Data Residency & Geo</h3>
              </div>
              <div className="flex flex-col">
                <InfoRow label="Preferred Data Location" value={org.preferredDataLocation} mono />
                <div className="py-2 border-b border-slate-100">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Multi-Geo Enabled</span>
                  <div className="mt-1">
                    {org.isMultipleDataLocationsForServicesEnabled ? (
                      <Badge className="bg-blue-100 text-blue-700 gap-1 border-blue-200">
                        <Globe className="h-3 w-3" /> Multi-Geo
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-600">Single-Geo</Badge>
                    )}
                  </div>
                </div>
                <InfoRow label="Marketing Emails" value={Array.isArray(org.marketingNotificationEmails) ? org.marketingNotificationEmails.join(", ") : org.marketingNotificationEmails} />
                <InfoRow label="Security Emails" value={Array.isArray(org.securityComplianceNotificationMails) ? org.securityComplianceNotificationMails.join(", ") : org.securityComplianceNotificationMails} />
              </div>
            </div>
          </div>

          {/* Subscriptions */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">Commercial Subscriptions</h3>
              {subscriptions && subscriptions.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => exportToCSV(
                  subscriptions.map((s) => ({
                    subscription_id: s.id,
                    sku_part_number: s.skuPartNumber,
                    friendly_name: s.friendlyName || "",
                    status: s.status,
                    total_units: s.totalUnits,
                    is_trial: s.isTrial,
                    next_lifecycle: s.nextLifecycleDateTime ? format(new Date(s.nextLifecycleDateTime), "dd MMM yyyy") : "",
                    owner_id: s.ownerId,
                  })),
                  "commercial_subscriptions",
                )} className="gap-2">
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              )}
            </div>
            {result?.subscriptionError ? (
              <div className="p-4 bg-amber-50 border-b border-amber-200 text-sm text-amber-700 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Subscriptions not available via Graph (beta)</p>
                  <p className="text-xs mt-1 font-mono break-all">{result.subscriptionError}</p>
                  <p className="text-xs mt-2 text-amber-600">License SKUs below still provide the available license detail.</p>
                </div>
              </div>
            ) : subscriptions && subscriptions.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Subscription ID", "SKU", "Friendly Name", "Status", "Units", "Trial", "Next Lifecycle"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subscriptions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{s.id}</code></td>
                      <td className="px-4 py-3 font-medium text-slate-700">{s.skuPartNumber}</td>
                      <td className="px-4 py-3 text-slate-600">{s.friendlyName || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={s.status === "Enabled" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600"}>{s.status || "—"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-700">{s.totalUnits ?? "—"}</td>
                      <td className="px-4 py-3 text-center">{s.isTrial ? <Badge className="bg-blue-100 text-blue-700 border-blue-200">Trial</Badge> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{s.nextLifecycleDateTime ? format(new Date(s.nextLifecycleDateTime), "dd MMM yyyy") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6 text-center text-sm text-slate-400">No commercial subscriptions returned.</div>
            )}
          </div>

          {/* Licenses (subscribed SKUs) */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">Licenses (Subscribed SKUs)</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{licenses.length} SKUs</span>
                {licenses.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => exportToCSV(licenseExport, "licenses")} className="gap-2">
                    <Download className="h-3.5 w-3.5" /> Export
                  </Button>
                )}
              </div>
            </div>
            {licenses.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">No subscribed SKUs found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["SKU", "Consumed", "Enabled", "Available", "Status", "Applies To"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {licenses.map((l) => {
                    const enabled = l.prepaidUnits?.enabled ?? 0;
                    const available = Math.max(enabled - (l.consumedUnits || 0), 0);
                    return (
                      <tr key={l.skuId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-700">{l.skuPartNumber}</td>
                        <td className="px-4 py-3 text-center text-slate-700">{l.consumedUnits ?? 0}</td>
                        <td className="px-4 py-3 text-center text-slate-700">{enabled}</td>
                        <td className="px-4 py-3 text-center text-slate-700">{available}</td>
                        <td className="px-4 py-3">
                          <Badge className={l.capabilityStatus === "Enabled" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600"}>{l.capabilityStatus || "—"}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{l.appliesTo || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Domains */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200"><h3 className="font-semibold text-slate-800">Verified Domains</h3></div>
            {domains.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">No domains found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Domain", "Verified", "Default", "Initial", "Auth Type", "Services"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {domains.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{d.displayName}</td>
                      <td className="px-4 py-3">{d.isVerified ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-300" />}</td>
                      <td className="px-4 py-3">{d.isDefault ? <Badge className="bg-blue-100 text-blue-700 border-blue-200">Default</Badge> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3">{d.isInitial ? <Badge className="bg-slate-100 text-slate-600">Initial</Badge> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{d.authenticationType || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[280px] truncate" title={(d.supportedServices || []).join(", ")}>{(d.supportedServices || []).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}