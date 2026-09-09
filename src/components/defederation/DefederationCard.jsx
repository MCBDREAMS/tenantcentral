import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { exportToCSV } from "@/components/shared/exportUtils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, Unlink, ShieldCheck, Users, Globe, Download,
  ChevronDown, ChevronRight
} from "lucide-react";

const safeParse = (s, fallback) => {
  try { return JSON.parse(s); } catch { return fallback; }
};

const STATUS_LABEL = {
  not_scanned: "Not Scanned", detected: "Federated", analyzing: "Analyzing…",
  analyzed: "Users Scanned", dry_run: "DNS Checked", issues_pending: "Issues Pending",
  ready: "Ready", executing: "Executing…", completed: "Completed", failed: "Failed",
  not_federated: "Not Federated"
};

// 8 chars, 1 uppercase, 1 special, rest lowercase + digits
function genPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%^*-_=";
  const rest = lower + digits;
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  let pwd = [pick(upper), pick(special)];
  for (let i = 0; i < 6; i++) pwd.push(pick(rest));
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join("");
}

export default function DefederationCard({ tenant, job, onRefresh }) {
  const [busy, setBusy] = useState(null);
  const [users, setUsers] = useState(null);
  const [dns, setDns] = useState(null);
  const [showUsers, setShowUsers] = useState(true);
  const [showDns, setShowDns] = useState(true);

  const run = async (action, extra = {}) => {
    setBusy(action);
    try {
      const res = await base44.functions.invoke("godaddyDefederation", {
        action, tenant_id: tenant.id, azure_tenant_id: tenant.tenant_id, ...extra
      });
      const data = res?.data || {};
      if (action === "scan_users" && data.users) {
        setUsers(data.users.map((u) => ({ ...u, password: u.onPremSync ? "" : genPassword() })));
      }
      if (action === "check_dns" && data.dns) {
        setDns(data.dns);
      }
      await onRefresh();
    } catch (e) {
      const detail = e?.response?.data?.error || e?.message || String(e);
      alert(`${action} failed: ${detail}`);
    } finally {
      setBusy(null);
    }
  };

  const status = job?.status || "not_scanned";
  const linked = job?.is_godaddy_linked;
  const fedDomains = safeParse(job?.federated_domains, []);
  const isFederated = fedDomains.length > 0;

  const exportCsv = () => {
    if (!users) return;
    exportToCSV(
      users.map((u) => ({
        userPrincipalName: u.upn,
        generatedPassword: u.password,
        hasImmutableId: u.immutableId ? "yes" : "no",
        onPremSync: u.onPremSync ? "yes" : "no",
        accountEnabled: u.enabled ? "yes" : "no"
      })),
      `defederation_passwords_${tenant.domain}`
    );
  };

  const fedBadge = status === "not_scanned" ? "secondary"
    : linked ? "destructive"
    : status === "not_federated" ? "secondary"
    : "outline";

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isFederated ? "bg-rose-50" : "bg-slate-100"}`}>
            {isFederated ? <Unlink className="h-4 w-4 text-rose-600" /> : <ShieldCheck className="h-4 w-4 text-slate-500" />}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 text-sm truncate">{tenant.name}</div>
            <div className="text-xs text-slate-400 truncate">{tenant.domain} · {tenant.tenant_id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={fedBadge} className="text-[10px]">
            {linked ? "GoDaddy Federated" : status === "not_federated" ? "Not Federated" : status === "not_scanned" ? "Unknown" : "Federated"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[status] || status}</Badge>
        </div>
      </div>

      {/* Federated domains */}
      {fedDomains.length > 0 && (
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-2">
          {fedDomains.map((f, i) => (
            <div key={i} className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1">
              <span className="font-medium text-slate-700">{f.domain}</span>
              {f.isGodaddy && <span className="ml-2 text-rose-600">GoDaddy</span>}
              <span className="ml-2 text-slate-400 truncate">{f.issuerUri || "no issuer"}</span>
            </div>
          ))}
        </div>
      )}

      {/* Detect */}
      <div className="px-5 py-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => run("detect")} disabled={busy !== null} className="gap-1.5">
          {busy === "detect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Check Federation
        </Button>
      </div>

      {/* Defederation steps (any federated tenant) */}
      {isFederated && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {/* Step 1 — Users & passwords */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">1</span>
                <Users className="h-4 w-4 text-blue-600" />
                Scan User Accounts & Generate Passwords
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => run("scan_users")} disabled={busy !== null} className="gap-1.5">
                  {busy === "scan_users" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                  Scan Users
                </Button>
                <Button size="sm" variant="outline" onClick={exportCsv} disabled={!users || users.length === 0} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-2">
              Generates an 8-character password (1 uppercase, 1 special) per federated user. Passwords are NOT reset — generated for documentation only.
            </p>
            {users && (
              <div>
                <button onClick={() => setShowUsers(!showUsers)} className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                  {showUsers ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {users.length} user(s) · {users.filter((u) => u.password).length} passwords generated
                </button>
                {showUsers && (
                  <div className="overflow-auto max-h-64 border border-slate-200 rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1 font-medium">User Principal Name</th>
                          <th className="text-left px-2 py-1 font-medium">Generated Password</th>
                          <th className="text-left px-2 py-1 font-medium">ImmutableId</th>
                          <th className="text-left px-2 py-1 font-medium">On-Prem Sync</th>
                          <th className="text-left px-2 py-1 font-medium">Enabled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-2 py-1 text-slate-700">{u.upn}</td>
                            <td className="px-2 py-1 font-mono text-slate-900">{u.password || "— (synced)"}</td>
                            <td className="px-2 py-1">{u.immutableId ? "yes" : "no"}</td>
                            <td className="px-2 py-1">{u.onPremSync ? "yes" : "no"}</td>
                            <td className="px-2 py-1">{u.enabled ? "yes" : "no"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2 — DNS / MX */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">2</span>
                <Globe className="h-4 w-4 text-blue-600" />
                Check MX / DNS Records
              </div>
              <Button size="sm" variant="outline" onClick={() => run("check_dns")} disabled={busy !== null} className="gap-1.5">
                {busy === "check_dns" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                Check DNS
              </Button>
            </div>
            {dns && (
              <div className="space-y-3">
                <button onClick={() => setShowDns(!showDns)} className="flex items-center gap-1 text-xs text-slate-500">
                  {showDns ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {dns.length} domain(s)
                </button>
                {showDns && dns.map((d, i) => (
                  <div key={i} className="border border-slate-200 rounded-md p-3 bg-slate-50">
                    <div className="font-medium text-sm text-slate-700 mb-2">{d.domain}</div>
                    <DnsSection title="MX Records" records={d.mx} />
                    <DnsSection title="TXT Records" records={d.txt} />
                    <DnsSection title="Autodiscover CNAME" records={d.autodiscover} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DnsSection({ title, records }) {
  const list = (records || []).filter((r) => !r.error);
  const err = (records || []).find((r) => r.error);
  return (
    <div className="mb-2">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{title}</div>
      {err ? (
        <div className="text-xs text-rose-600">{err.error}</div>
      ) : list.length === 0 ? (
        <div className="text-xs text-slate-400">none found</div>
      ) : (
        <div className="text-xs text-slate-600 space-y-0.5">
          {list.map((r, i) => (
            <div key={i} className="font-mono break-all">{r.data}</div>
          ))}
        </div>
      )}
    </div>
  );
}