import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Search, RefreshCw, User, CheckCircle2, XCircle, Mail, Briefcase, Building } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function InfoRow({ label, value, mono }) {
  return (
    <div>
      <dt className="text-slate-400 uppercase text-[10px] tracking-wide mb-0.5">{label}</dt>
      <dd className={`text-slate-700 break-all ${mono ? "font-mono text-[10px]" : "text-xs"}`}>{value || "—"}</dd>
    </div>
  );
}

export default function ExchangeMailboxes({ tenantId }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const { data: mailboxes = [], isLoading, error, refetch } = useQuery({
    queryKey: ["exchange_mailboxes", tenantId],
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "list_mailboxes", azure_tenant_id: tenantId, top: 200 })
        .then(r => r.data.mailboxes || []),
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ["exchange_mailbox_detail", tenantId, selected?.id],
    enabled: !!selected,
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "get_mailbox", azure_tenant_id: tenantId, user_id: selected.id })
        .then(r => r.data),
  });

  const filtered = mailboxes.filter(m =>
    !search ||
    m.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    m.mail?.toLowerCase().includes(search.toLowerCase()) ||
    m.department?.toLowerCase().includes(search.toLowerCase()) ||
    m.jobTitle?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex gap-5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mailboxes…" className="pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <span className="text-xs text-slate-400">{filtered.length} users</span>
        </div>
        {error && <div className="text-sm text-red-500 mb-3">Error: {error.message}</div>}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Department</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Job Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" /></td></tr>
                ))
              ) : filtered.map(m => (
                <tr key={m.id} onClick={() => setSelected(selected?.id === m.id ? null : m)}
                  className={`cursor-pointer transition-colors hover:bg-blue-50/40 ${selected?.id === m.id ? "bg-blue-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-xs font-semibold text-slate-500">
                        {m.displayName?.[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-800">{m.displayName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell text-xs">{m.mail || m.userPrincipalName}</td>
                  <td className="px-4 py-3 text-slate-500 hidden md:table-cell text-xs">{m.department || "—"}</td>
                  <td className="px-4 py-3 text-slate-500 hidden lg:table-cell text-xs">{m.jobTitle || "—"}</td>
                  <td className="px-4 py-3">
                    {m.accountEnabled
                      ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px]">Active</Badge>
                      : <Badge className="bg-red-50 text-red-700 border-red-100 text-[10px]">Disabled</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && filtered.length === 0 && <div className="text-center py-12 text-sm text-slate-400">No mailboxes found</div>}
        </div>
      </div>

      {selected && (
        <div className="w-80 shrink-0">
          <div className="bg-white border border-slate-200 rounded-xl p-5 sticky top-4">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
                {selected.displayName?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-800">{selected.displayName}</p>
                <p className="text-xs text-slate-500">{selected.jobTitle || "No title"}</p>
              </div>
            </div>
            {loadingDetail ? (
              <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-3 bg-slate-100 rounded animate-pulse" />)}</div>
            ) : detail ? (
              <dl className="space-y-3">
                <InfoRow label="Email" value={detail.details?.mail} />
                <InfoRow label="UPN" value={detail.details?.userPrincipalName} mono />
                <InfoRow label="Department" value={detail.details?.department} />
                <InfoRow label="Job Title" value={detail.details?.jobTitle} />
                <div>
                  <dt className="text-slate-400 uppercase text-[10px] tracking-wide mb-0.5">Account Status</dt>
                  <dd className="flex items-center gap-1.5 text-xs">
                    {detail.details?.accountEnabled
                      ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-700">Enabled</span></>
                      : <><XCircle className="h-3.5 w-3.5 text-red-500" /><span className="text-red-700">Disabled</span></>}
                  </dd>
                </div>
                <InfoRow label="Licenses Assigned" value={`${detail.details?.assignedLicenses?.length || 0}`} />
                {detail.mailSettings?.timeZone && <InfoRow label="Timezone" value={detail.mailSettings.timeZone} />}
                {detail.mailSettings?.language?.displayName && <InfoRow label="Language" value={detail.mailSettings.language.displayName} />}
                {detail.details?.createdDateTime && <InfoRow label="Account Created" value={new Date(detail.details.createdDateTime).toLocaleDateString()} />}
                {detail.details?.lastPasswordChangeDateTime && <InfoRow label="Last Pwd Change" value={new Date(detail.details.lastPasswordChangeDateTime).toLocaleDateString()} />}
              </dl>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}