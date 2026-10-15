import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Globe, RefreshCw, Loader2, AlertTriangle, CheckCircle2, ShieldX, Plus } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import DomainList from "@/components/dns/DomainList";
import DnsRecordsTable from "@/components/dns/DnsRecordsTable";
import DnsLookupTool from "@/components/dns/DnsLookupTool";
import AddDomainDialog from "@/components/dns/AddDomainDialog";
import { useRbac } from "@/components/shared/useRbac";

function StatCard({ label, value, hint, tone = "default" }) {
  const tones = {
    default: "text-foreground",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-rose-600",
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

export default function DnsDomains({ selectedTenant }) {
  const azureTenantId = selectedTenant?.tenant_id;
  const { canEdit } = useRbac();
  const [picked, setPicked] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState({ message: "", error: "" });

  const domainsQuery = useQuery({
    queryKey: ["dns-domains", azureTenantId],
    enabled: !!azureTenantId,
    queryFn: () =>
      base44.functions
        .invoke("dnsManager", { action: "list_domains", azure_tenant_id: azureTenantId })
        .then((r) => r.data),
  });

  const domains = domainsQuery.data?.domains || [];
  const activeDomain =
    picked && domains.some((d) => d.id === picked)
      ? picked
      : domains.find((d) => d.isDefault)?.id ||
        domains.find((d) => !d.isInitial)?.id ||
        domains[0]?.id ||
        null;

  const recordsQuery = useQuery({
    queryKey: ["dns-records", azureTenantId, activeDomain],
    enabled: !!azureTenantId && !!activeDomain,
    queryFn: () =>
      base44.functions
        .invoke("dnsManager", { action: "domain_records", azure_tenant_id: azureTenantId, domain: activeDomain })
        .then((r) => r.data),
  });

  const runDomainAction = async (action, domain) => {
    setBusy(`${action === "verify_domain" ? "verify" : "default"}:${domain}`);
    setNotice({ message: "", error: "" });
    try {
      const res = await base44.functions.invoke("dnsManager", {
        action,
        azure_tenant_id: azureTenantId,
        domain,
      });
      setNotice({ message: res.data?.message || "Domain updated.", error: "" });
      await Promise.all([domainsQuery.refetch(), recordsQuery.refetch()]);
    } catch (e) {
      setNotice({ message: "", error: e?.response?.data?.error || e.message });
    } finally {
      setBusy("");
    }
  };

  const loadingDomains = domainsQuery.isLoading || domainsQuery.isFetching;
  const verified = domains.filter((d) => d.isVerified).length;
  const summary = recordsQuery.data?.summary;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Domains & DNS"
        subtitle={
          selectedTenant
            ? `DNS names and records for ${selectedTenant.name} (${selectedTenant.domain || "no domain"})`
            : "Select a tenant to review its DNS names and records"
        }
        icon={Globe}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!azureTenantId || loadingDomains || recordsQuery.isFetching}
            onClick={() => {
              domainsQuery.refetch();
              recordsQuery.refetch();
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingDomains || recordsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {!azureTenantId && (
        <div className="text-center py-16 text-muted-foreground">
          <Globe className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No tenant selected</p>
          <p className="text-sm mt-1">Select a tenant from the sidebar to review its DNS names and entries.</p>
        </div>
      )}

      {azureTenantId && domainsQuery.isLoading && (
        <div className="flex items-center justify-center gap-3 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Reading DNS names from Microsoft Graph...
        </div>
      )}

      {azureTenantId && !domainsQuery.isLoading && domainsQuery.data?.error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          <p className="font-semibold mb-1">Could not read DNS names</p>
          <p className="font-mono text-xs break-all">{domainsQuery.data.error}</p>
        </div>
      )}

      {azureTenantId && !domainsQuery.isLoading && !domainsQuery.data?.error && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="DNS names" value={domains.length} hint={`${verified} verified in Entra ID`} />
            <StatCard
              label="DNS entries"
              value={summary ? summary.total : "—"}
              hint={summary ? `${summary.required} required` : "Select a name"}
            />
            <StatCard
              label="Published"
              value={summary ? summary.published : "—"}
              hint="Matching live public DNS"
              tone="good"
            />
            <StatCard
              label="Needs attention"
              value={summary ? summary.mismatch + summary.missing : "—"}
              hint="Missing or mismatched"
              tone={summary && summary.mismatch + summary.missing > 0 ? "warn" : "good"}
            />
          </div>

          {(notice.message || notice.error) && (
            <div
              className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
                notice.error ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"
              }`}
            >
              {notice.error ? (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <span className="break-all">{notice.error || notice.message}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
                <div>
                  <h3 className="font-semibold text-foreground">DNS names</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Custom domains registered on the tenant</p>
                </div>
                {canEdit() && (
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setAddOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Register
                  </Button>
                )}
              </div>
              <DomainList
                domains={domains}
                selected={activeDomain}
                onSelect={setPicked}
                canEdit={canEdit()}
                busy={busy}
                onVerify={(d) => runDomainAction("verify_domain", d)}
                onSetDefault={(d) => runDomainAction("set_default_domain", d)}
              />
              {!canEdit() && (
                <div className="px-5 py-3 border-t border-border text-[11px] text-muted-foreground flex items-start gap-2">
                  <ShieldX className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Read-only role: verification and default-domain changes are disabled.
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <DnsRecordsTable
                domain={activeDomain}
                records={recordsQuery.data?.records || []}
                summary={summary}
                warnings={recordsQuery.data?.warnings || []}
                note={recordsQuery.data?.record_set_note}
                isInitial={recordsQuery.data?.isInitial}
                loading={recordsQuery.isLoading || recordsQuery.isFetching}
              />
            </div>
          </div>

          <DnsLookupTool domain={activeDomain} />

          <AddDomainDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            azureTenantId={azureTenantId}
            onAdded={() => domainsQuery.refetch()}
          />
        </div>
      )}
    </div>
  );
}