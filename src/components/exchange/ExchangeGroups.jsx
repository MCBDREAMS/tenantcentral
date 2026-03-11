import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Users, RefreshCw, Search, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function getGroupType(g) {
  if (g.groupTypes?.includes("Unified")) return { label: "Microsoft 365", color: "bg-blue-100 text-blue-700" };
  if (g.groupTypes?.includes("DynamicMembership")) return { label: "Dynamic", color: "bg-purple-100 text-purple-700" };
  return { label: "Distribution / Security", color: "bg-slate-100 text-slate-600" };
}

export default function ExchangeGroups({ tenantId }) {
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);

  const { data: groups = [], isLoading, error, refetch } = useQuery({
    queryKey: ["exchange_groups", tenantId],
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "list_mail_groups", azure_tenant_id: tenantId, top: 100 })
        .then(r => r.data.groups || []),
  });

  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["exchange_group_members", tenantId, selectedGroup?.id],
    enabled: !!selectedGroup,
    queryFn: () =>
      base44.functions.invoke("portalData", { action: "get_group_members", azure_tenant_id: tenantId, group_id: selectedGroup.id })
        .then(r => r.data.members || []),
  });

  const filtered = groups.filter(g =>
    !search ||
    g.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    g.mail?.toLowerCase().includes(search.toLowerCase()) ||
    g.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex gap-5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search groups…" className="pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <span className="text-xs text-slate-400">{filtered.length} groups</span>
        </div>
        {error && <div className="text-sm text-red-500 mb-3">Error: {error.message}</div>}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Group Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" /></td></tr>
                ))
              ) : filtered.map(g => {
                const { label, color } = getGroupType(g);
                return (
                  <tr key={g.id} onClick={() => setSelectedGroup(selectedGroup?.id === g.id ? null : g)}
                    className={`cursor-pointer transition-colors hover:bg-blue-50/40 ${selectedGroup?.id === g.id ? "bg-blue-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <Users className="h-4 w-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{g.displayName}</p>
                          {g.description && <p className="text-xs text-slate-400 truncate max-w-xs">{g.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell">{g.mail || "—"}</td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] ${color}`}>{label}</Badge></td>
                    <td className="px-4 py-3 text-right"><ChevronRight className="h-4 w-4 text-slate-300" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!isLoading && filtered.length === 0 && <div className="text-center py-12 text-sm text-slate-400">No mail-enabled groups found</div>}
        </div>
      </div>

      {selectedGroup && (
        <div className="w-80 shrink-0">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">{selectedGroup.displayName}</p>
                <p className="text-xs text-slate-500">{selectedGroup.mail || "No email"}</p>
              </div>
            </div>
            {selectedGroup.description && (
              <p className="text-xs text-slate-500 mb-4 p-3 bg-slate-50 rounded-lg">{selectedGroup.description}</p>
            )}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Members</p>
            {loadingMembers ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {members.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No members found</p>
                ) : members.map(m => (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50">
                    <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-[10px] font-semibold text-blue-700">
                      {m.displayName?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700">{m.displayName}</p>
                      <p className="text-[10px] text-slate-400">{m.mail || m.userPrincipalName}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-3 text-center">{members.length} member(s)</p>
          </div>
        </div>
      )}
    </div>
  );
}