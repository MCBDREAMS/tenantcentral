import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  CheckCircle2, XCircle, Loader2, Wifi, ShieldCheck, Cloud, Smartphone,
  PlayCircle, RefreshCw, AlertTriangle, ExternalLink, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Microsoft endpoints required for each cloud service
const ENDPOINT_GROUPS = [
  {
    group: "Microsoft Entra ID",
    color: "blue",
    icon: ShieldCheck,
    endpoints: [
      { name: "Login / Auth", url: "https://login.microsoftonline.com", description: "Azure AD authentication" },
      { name: "Graph API", url: "https://graph.microsoft.com", description: "Microsoft Graph API" },
      { name: "Device Registration", url: "https://enterpriseregistration.windows.net", description: "Entra device registration service" },
      { name: "Entra OIDC Discovery", url: "https://login.microsoftonline.com/.well-known/openid-configuration", description: "OIDC / token endpoint discovery" },
    ]
  },
  {
    group: "Microsoft Intune",
    color: "violet",
    icon: Cloud,
    endpoints: [
      { name: "Intune Service", url: "https://manage.microsoft.com", description: "Primary Intune MDM service" },
      { name: "Intune Portal", url: "https://portal.manage.microsoft.com", description: "Company portal & enrollment" },
      { name: "Enrollment Svc", url: "https://fef.msua08.manage.microsoft.com", description: "Intune enrollment service" },
      { name: "Device Health", url: "https://has.spserv.microsoft.com", description: "Device health attestation" },
    ]
  },
  {
    group: "Windows Autopilot",
    color: "amber",
    icon: Smartphone,
    endpoints: [
      { name: "Autopilot Service", url: "https://ztd.dds.microsoft.com", description: "Zero-touch deployment service" },
      { name: "Autopilot CDN", url: "https://cs.dds.microsoft.com", description: "Autopilot config delivery" },
      { name: "OOBE Update", url: "https://activation.sls.microsoft.com", description: "OOBE / SLS activation" },
      { name: "Windows Update", url: "https://windowsupdate.com", description: "Windows Update service" },
    ]
  },
  {
    group: "Microsoft 365 / CDN",
    color: "emerald",
    icon: Wifi,
    endpoints: [
      { name: "M365 Login", url: "https://login.microsoftonline.com/common/oauth2/v2.0/token", description: "OAuth2 token endpoint" },
      { name: "Office CDN", url: "https://officeclient.microsoft.com", description: "Office client service" },
      { name: "Telemetry", url: "https://vortex.data.microsoft.com", description: "Windows / M365 telemetry" },
      { name: "Azure DNS", url: "https://dns.msftncsi.com", description: "Microsoft NCSI DNS check" },
    ]
  },
];

const COLOR_MAP = {
  blue: { badge: "bg-blue-100 text-blue-700", icon: "text-blue-500", header: "border-blue-100 bg-blue-50" },
  violet: { badge: "bg-violet-100 text-violet-700", icon: "text-violet-500", header: "border-violet-100 bg-violet-50" },
  amber: { badge: "bg-amber-100 text-amber-700", icon: "text-amber-500", header: "border-amber-100 bg-amber-50" },
  emerald: { badge: "bg-emerald-100 text-emerald-700", icon: "text-emerald-500", header: "border-emerald-100 bg-emerald-50" },
};

async function testEndpoint(url) {
  const start = Date.now();
  try {
    // Use no-cors fetch — we can only detect network reachability, not HTTP status
    await fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-store" });
    const latency = Date.now() - start;
    return { status: "reachable", latency };
  } catch {
    return { status: "unreachable", latency: null };
  }
}

export default function ConnectivityTester({ selectedTenant }) {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [ranAt, setRanAt] = useState(null);

  const allEndpoints = ENDPOINT_GROUPS.flatMap(g => g.endpoints.map(e => ({ ...e, group: g.group })));

  const runTests = async () => {
    setRunning(true);
    setResults({});
    const newResults = {};

    // Run all in parallel
    await Promise.all(
      allEndpoints.map(async (ep) => {
        newResults[ep.url] = { status: "testing" };
        setResults(prev => ({ ...prev, [ep.url]: { status: "testing" } }));
        const r = await testEndpoint(ep.url);
        newResults[ep.url] = r;
        setResults(prev => ({ ...prev, [ep.url]: r }));
      })
    );

    setRanAt(new Date());
    setRunning(false);
  };

  const getStats = () => {
    const tested = Object.values(results).filter(r => r.status !== "testing");
    const reachable = tested.filter(r => r.status === "reachable").length;
    const unreachable = tested.filter(r => r.status === "unreachable").length;
    return { total: allEndpoints.length, tested: tested.length, reachable, unreachable };
  };

  const stats = getStats();
  const overallOk = stats.tested === stats.total && stats.unreachable === 0;
  const hasIssues = stats.unreachable > 0;

  return (
    <div className="space-y-5">
      {/* Header / Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800 mb-0.5">Cloud Endpoint Connectivity Test</h3>
          <p className="text-xs text-slate-500">
            Tests reachability of Microsoft Intune, Autopilot, and Entra ID endpoints from <strong>this browser</strong>.
            {selectedTenant && <span className="text-blue-600"> Tenant: {selectedTenant.name}</span>}
          </p>
        </div>
        <Button
          onClick={runTests}
          disabled={running}
          className="bg-slate-900 hover:bg-slate-800 gap-2 shrink-0"
        >
          {running
            ? <><Loader2 className="h-4 w-4 animate-spin" />Testing…</>
            : <><PlayCircle className="h-4 w-4" />Run Tests</>}
        </Button>
      </div>

      {/* Info note */}
      <div className="flex gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong>How it works:</strong> Tests are run directly from your browser using HTTP HEAD requests. 
          A "reachable" result means the endpoint is network-accessible from this machine. 
          Firewall or proxy rules blocking these URLs will prevent Intune/Autopilot/Entra enrollment from working on client devices on the same network.
          <br /><strong>Note:</strong> These tests reflect browser-level connectivity — run this page from inside the client's network for accurate results.
        </div>
      </div>

      {/* Summary bar (shown after running) */}
      {stats.tested > 0 && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${overallOk ? "bg-emerald-50 border-emerald-200" : hasIssues ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
          {overallOk
            ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            : hasIssues
            ? <XCircle className="h-5 w-5 text-red-500 shrink-0" />
            : <Loader2 className="h-5 w-5 animate-spin text-amber-500 shrink-0" />}
          <div className="flex-1 text-sm">
            {overallOk
              ? <span className="font-semibold text-emerald-700">All {stats.total} endpoints reachable — client network looks good for cloud onboarding.</span>
              : <span className="font-semibold text-red-700">{stats.unreachable} endpoint(s) unreachable — review firewall/proxy rules for the blocked URLs below.</span>}
          </div>
          {ranAt && <span className="text-xs text-slate-400 shrink-0">Tested {ranAt.toLocaleTimeString()}</span>}
        </div>
      )}

      {/* Endpoint groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {ENDPOINT_GROUPS.map(group => {
          const c = COLOR_MAP[group.color];
          const GroupIcon = group.icon;
          const groupResults = group.endpoints.map(e => results[e.url]);
          const groupReachable = groupResults.filter(r => r?.status === "reachable").length;
          const groupTested = groupResults.filter(r => r && r.status !== "testing").length;

          return (
            <div key={group.group} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className={`flex items-center gap-2 px-4 py-3 border-b ${c.header}`}>
                <GroupIcon className={`h-4 w-4 ${c.icon}`} />
                <span className="font-semibold text-sm text-slate-800">{group.group}</span>
                {groupTested > 0 && (
                  <Badge className={`ml-auto text-[10px] ${groupReachable === group.endpoints.length ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"} border-0`}>
                    {groupReachable}/{group.endpoints.length} OK
                  </Badge>
                )}
              </div>
              <div className="divide-y divide-slate-50">
                {group.endpoints.map(ep => {
                  const r = results[ep.url];
                  const status = r?.status;
                  return (
                    <div key={ep.url} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-slate-700">{ep.name}</span>
                          <a href={ep.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 text-slate-400 hover:text-blue-500" />
                          </a>
                        </div>
                        <p className="text-xs text-slate-400 truncate">{ep.description}</p>
                        <p className="text-[10px] text-slate-300 font-mono truncate">{ep.url}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {!r && (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                        {status === "testing" && (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                        )}
                        {status === "reachable" && (
                          <>
                            <span className="text-xs text-emerald-600 font-medium">{r.latency}ms</span>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          </>
                        )}
                        {status === "unreachable" && (
                          <>
                            <span className="text-xs text-red-500 font-medium">BLOCKED</span>
                            <XCircle className="h-4 w-4 text-red-500" />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Remediation tips (only shown if there are failures) */}
      {hasIssues && stats.tested === stats.total && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Remediation Steps for Blocked Endpoints
          </div>
          <ul className="text-xs text-amber-800 space-y-1 list-disc ml-5">
            <li>Check firewall outbound rules — allow HTTPS (TCP 443) to <code>*.microsoft.com</code>, <code>*.windows.net</code>, and <code>*.microsoftonline.com</code></li>
            <li>If using a proxy: ensure the proxy allows CONNECT to Microsoft endpoints without SSL inspection breaking the certificate chain</li>
            <li>Check for DNS filtering (e.g. Cisco Umbrella, Zscaler, Forcepoint) blocking Microsoft cloud service FQDNs</li>
            <li>Review Microsoft's official required URL list: <a href="https://learn.microsoft.com/mem/intune/fundamentals/intune-endpoints" target="_blank" rel="noopener noreferrer" className="underline font-medium">Intune Network Endpoints</a></li>
            <li>For Autopilot: ensure <code>ztd.dds.microsoft.com</code> and <code>cs.dds.microsoft.com</code> are reachable without proxy interception</li>
          </ul>
        </div>
      )}
    </div>
  );
}