import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Mail, Search, RefreshCw, CheckCircle2, XCircle, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";

export default function PortalExchange({ selectedTenant }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const tenantId = selectedTenant?.tenant_id;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["exchange_mailboxes", tenantId],
    enabled: !!tenantId,
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "list_mailboxes", azure_tenant_id: tenantId, top: 100 })
        .then(r => r.data.mailboxes || []),
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ["exchange_mailbox_detail", tenantId, selected?.id],
    enabled: !!tenantId && !!selected,
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "get_mailbox", azure_tenant_id: tenantId, user_id: selected.id })
        .then(r => r.data),
  });

  const mailboxes = (data || []).filter(m =>
    !search ||
    m.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    m.mail?.toLowerCase().includes(search.toLowerCase()) ||
    m.department?.toLowerCase().includes(search.toLowerCase())
  );

  if (!tenantId) return (
    <div className="p-6">
      <PageHeader title="Exchange" subtitle="Mailbox management" icon={Mail} />
      <div className="text-sm text-slate-500 mt-4">Select a tenant from the sidebar to continue.</div>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Exchange"
        subtitle={`Mailboxes for ${selectedTenant?.name}`}
        icon={Mail}
        actions={
          <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="flex gap-6">
        {/* List */}
        <div className="flex-1 min-w-0">
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mailboxes…" className="pl-9" />
          </div>

          {error && <div className="text-sm text-red-500 mb-4">{error.message}</div>}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Department</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" /></td></tr>
                  ))
                  : mailboxes.map(m => (
                    <tr
                      key={m.id}
                      onClick={() => setSelected(m)}
                      className={`cursor-pointer transition-colors hover:bg-blue-50/40 ${selected?.id === m.id ? "bg-blue-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">{m.displayName}</td>
                      <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{m.mail || m.userPrincipalName}</td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{m.department || "—"}</td>
                      <td className="px-4 py-3">
                        {m.accountEnabled
                          ? <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[10px]">Active</Badge>
                          : <Badge className="bg-red-50 text-red-700 border-0 text-[10px]">Disabled</Badge>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!isLoading && mailboxes.length === 0 && (
              <div className="text-center py-12 text-sm text-slate-400">No mailboxes found</div>
            )}
          </div>
          {!isLoading && <div className="mt-2 text-xs text-slate-400">{mailboxes.length} mailbox(es)</div>}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-72 shrink-0">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-800">{selected.displayName}</p>
                  <p className="text-xs text-slate-500">{selected.jobTitle || "No title"}</p>
                </div>
              </div>
              {loadingDetail
                ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-3 bg-slate-100 rounded animate-pulse" />)}</div>
                : detail && (
                  <dl className="space-y-3 text-xs">
                    <div>
                      <dt className="text-slate-400 font-medium uppercase tracking-wide text-[10px]">Email</dt>
                      <dd className="text-slate-700 mt-0.5 break-all">{detail.details?.mail || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 font-medium uppercase tracking-wide text-[10px]">UPN</dt>
                      <dd className="text-slate-700 mt-0.5 break-all">{detail.details?.userPrincipalName}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 font-medium uppercase tracking-wide text-[10px]">Department</dt>
                      <dd className="text-slate-700 mt-0.5">{detail.details?.department || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 font-medium uppercase tracking-wide text-[10px]">Status</dt>
                      <dd className="mt-0.5 flex items-center gap-1.5">
                        {detail.details?.accountEnabled
                          ? <><CheckCircle2 className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Enabled</span></>
                          : <><XCircle className="h-3 w-3 text-red-500" /><span className="text-red-600">Disabled</span></>}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 font-medium uppercase tracking-wide text-[10px]">Licenses</dt>
                      <dd className="text-slate-700 mt-0.5">{detail.details?.assignedLicenses?.length || 0} assigned</dd>
                    </div>
                    {detail.mailSettings?.timeZone && (
                      <div>
                        <dt className="text-slate-400 font-medium uppercase tracking-wide text-[10px]">Timezone</dt>
                        <dd className="text-slate-700 mt-0.5">{detail.mailSettings.timeZone}</dd>
                      </div>
                    )}
                    {detail.mailSettings?.language?.displayName && (
                      <div>
                        <dt className="text-slate-400 font-medium uppercase tracking-wide text-[10px]">Language</dt>
                        <dd className="text-slate-700 mt-0.5">{detail.mailSettings.language.displayName}</dd>
                      </div>
                    )}
                  </dl>
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}