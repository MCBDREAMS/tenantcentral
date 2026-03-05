import React, { useState } from "react";
import { Search, Shield, Mail, Users, MessageSquare, Globe, Server, Database, Lock, Settings, BarChart2, FileText, Layers, ArrowLeft, RefreshCw, ExternalLink, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";

const CONSOLES = [
  {
    category: "Microsoft 365",
    color: "from-blue-600 to-blue-500",
    items: [
      { name: "Microsoft 365 Admin Center", desc: "Users, licenses, billing, domains, support", icon: Settings, url: "https://admin.microsoft.com", tag: "Core" },
      { name: "Exchange Admin Center", desc: "Mailboxes, transport rules, connectors, anti-spam", icon: Mail, url: "https://admin.exchange.microsoft.com", tag: "Exchange" },
      { name: "Teams Admin Center", desc: "Policies, meetings, call quality, devices", icon: MessageSquare, url: "https://admin.teams.microsoft.com", tag: "Teams" },
      { name: "SharePoint Admin Center", desc: "Sites, permissions, sharing, OneDrive", icon: Globe, url: "https://admin.microsoft.com/sharepoint", tag: "SharePoint" },
      { name: "OneDrive Admin Center", desc: "Storage, sync, sharing policies", icon: Database, url: "https://admin.onedrive.com", tag: "OneDrive" },
      { name: "Viva Insights Admin", desc: "Workforce analytics and insights", icon: BarChart2, url: "https://insights.viva.office.com", tag: "Viva" },
    ]
  },
  {
    category: "Security & Compliance",
    color: "from-red-600 to-rose-500",
    items: [
      { name: "Microsoft Defender Portal", desc: "XDR, incidents, threat hunting, device compliance", icon: Shield, url: "https://security.microsoft.com", tag: "Defender" },
      { name: "Microsoft Purview", desc: "Compliance, DLP, information protection, eDiscovery", icon: Lock, url: "https://compliance.microsoft.com", tag: "Purview" },
      { name: "Microsoft Sentinel", desc: "SIEM, threat intelligence, playbooks", icon: Server, url: "https://portal.azure.com/#blade/Microsoft_Azure_Security_Insights/WorkspaceSelectorBlade", tag: "Sentinel" },
      { name: "Defender for Cloud Apps", desc: "CASB, shadow IT, session policies", icon: Layers, url: "https://security.microsoft.com/cloudapps", tag: "CASB" },
      { name: "Defender for Endpoint", desc: "EDR, vulnerability management, attack surface", icon: Shield, url: "https://security.microsoft.com/machines", tag: "MDE" },
      { name: "Defender for Identity", desc: "AD threat protection, lateral movement detection", icon: Users, url: "https://security.microsoft.com/atpidentities", tag: "MDI" },
    ]
  },
  {
    category: "Azure & Entra",
    color: "from-slate-700 to-slate-600",
    items: [
      { name: "Azure Portal", desc: "Full Azure management — subscriptions, resources, cost", icon: Server, url: "https://portal.azure.com", tag: "Azure" },
      { name: "Entra Admin Center", desc: "Users, groups, conditional access, identity governance", icon: Users, url: "https://entra.microsoft.com", tag: "Entra" },
      { name: "Azure Active Directory", desc: "Legacy AAD blade — apps, enterprise apps, app registrations", icon: Lock, url: "https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade", tag: "AAD" },
      { name: "Privileged Identity Management", desc: "JIT access, role activation, access reviews", icon: Shield, url: "https://portal.azure.com/#view/Microsoft_Azure_PIMCommon/CommonMenuBlade/~/quickStart", tag: "PIM" },
      { name: "Conditional Access", desc: "CA policies, named locations, authentication context", icon: Lock, url: "https://portal.azure.com/#view/Microsoft_AAD_ConditionalAccess/CaTemplates.ReactView", tag: "CA" },
      { name: "Azure Cost Management", desc: "Budgets, cost analysis, reservations", icon: BarChart2, url: "https://portal.azure.com/#view/Microsoft_Azure_CostManagement/Menu/~/costanalysis", tag: "Cost" },
    ]
  },
  {
    category: "Intune & Device Management",
    color: "from-emerald-600 to-teal-500",
    items: [
      { name: "Microsoft Intune", desc: "Device management, compliance, configuration profiles", icon: Settings, url: "https://intune.microsoft.com", tag: "Intune" },
      { name: "Windows 365 Admin", desc: "Cloud PCs, provisioning, user assignments", icon: Server, url: "https://windows365.microsoft.com", tag: "W365" },
      { name: "Autopilot Deployment", desc: "Autopilot profiles, deployment status, OOBE config", icon: Settings, url: "https://intune.microsoft.com/#view/Microsoft_Intune_Enrollment/AutoPilotMenuBlade", tag: "Autopilot" },
      { name: "Endpoint Analytics", desc: "Device performance, startup score, app reliability", icon: BarChart2, url: "https://intune.microsoft.com/#view/Microsoft_Intune_Enrollment/UXAnalyticsMenu/~/overview", tag: "Analytics" },
    ]
  },
  {
    category: "Reporting & Monitoring",
    color: "from-violet-600 to-purple-500",
    items: [
      { name: "Microsoft 365 Usage Reports", desc: "Email, Teams, OneDrive, SharePoint usage analytics", icon: BarChart2, url: "https://admin.microsoft.com/Adminportal/Home#/reportsUsage", tag: "Reports" },
      { name: "Azure Monitor", desc: "Logs, metrics, alerts, workbooks", icon: BarChart2, url: "https://portal.azure.com/#view/Microsoft_Azure_Monitoring/AzureMonitoringBrowseBlade/~/overview", tag: "Monitor" },
      { name: "Sign-In Logs (Entra)", desc: "Audit and sign-in log explorer", icon: FileText, url: "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/SignInEventsV3Blade", tag: "Logs" },
      { name: "Service Health", desc: "Microsoft 365 and Azure service status", icon: Server, url: "https://admin.microsoft.com/Adminportal/Home#/servicehealth", tag: "Health" },
    ]
  }
];

const tagColors = {
  Core: "bg-blue-50 text-blue-700", Exchange: "bg-amber-50 text-amber-700", Teams: "bg-violet-50 text-violet-700",
  SharePoint: "bg-emerald-50 text-emerald-700", OneDrive: "bg-cyan-50 text-cyan-700", Defender: "bg-red-50 text-red-700",
  Purview: "bg-indigo-50 text-indigo-700", Sentinel: "bg-orange-50 text-orange-700", CASB: "bg-rose-50 text-rose-700",
  MDE: "bg-red-50 text-red-800", MDI: "bg-red-50 text-red-600", Azure: "bg-slate-100 text-slate-700",
  Entra: "bg-blue-50 text-blue-800", AAD: "bg-blue-50 text-blue-600", PIM: "bg-yellow-50 text-yellow-700",
  CA: "bg-purple-50 text-purple-700", Cost: "bg-green-50 text-green-700", Intune: "bg-teal-50 text-teal-700",
  W365: "bg-teal-50 text-teal-800", Autopilot: "bg-emerald-50 text-emerald-800", Analytics: "bg-violet-50 text-violet-800",
  Reports: "bg-purple-50 text-purple-600", Monitor: "bg-orange-50 text-orange-700", Logs: "bg-slate-50 text-slate-600",
  Health: "bg-green-50 text-green-800", Viva: "bg-pink-50 text-pink-700",
};

export default function AdminConsole({ selectedTenant }) {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(null); // { name, url, color, icon }
  const [iframeKey, setIframeKey] = useState(0);

  const filtered = CONSOLES.map(cat => ({
    ...cat,
    items: cat.items.filter(i =>
      !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.desc.toLowerCase().includes(search.toLowerCase()) ||
      i.tag.toLowerCase().includes(search.toLowerCase())
    )
  })).filter(cat => cat.items.length > 0);

  const launch = (item, cat) => {
    setActive({ ...item, color: cat.color });
    setIframeKey(k => k + 1);
  };

  // ── Embedded viewer ──────────────────────────────────────────────────────
  if (active) {
    const Icon = active.icon;
    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 shrink-0">
          <Button variant="ghost" size="sm" className="gap-1.5 text-slate-600" onClick={() => setActive(null)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="h-4 w-px bg-slate-200" />
          <div className={`h-7 w-7 rounded-lg bg-gradient-to-br ${active.color} flex items-center justify-center shrink-0`}>
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{active.name}</span>
          <span className="text-xs text-slate-400 truncate hidden sm:block max-w-xs">{active.url}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Reload" onClick={() => setIframeKey(k => k + 1)}>
            <RefreshCw className="h-4 w-4 text-slate-500" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Open in new tab" onClick={() => window.open(active.url, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-4 w-4 text-slate-500" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setActive(null)}>
            <X className="h-4 w-4 text-slate-400" />
          </Button>
        </div>

        {/* Notice banner — Microsoft portals block embedding via X-Frame-Options */}
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 shrink-0">
          <span className="text-xs text-amber-700">
            <strong>Note:</strong> Microsoft portals enforce X-Frame-Options and may not load inside an iframe due to browser security policies.
            Use the <button className="underline font-semibold" onClick={() => window.open(active.url, "_blank", "noopener,noreferrer")}>Open in new tab</button> button if the frame stays blank.
          </span>
        </div>

        {/* iFrame */}
        <iframe
          key={iframeKey}
          src={active.url}
          title={active.name}
          className="flex-1 w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // ── Portal grid ──────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Admin Console"
        subtitle="Access Microsoft 365, Azure, Security, and Intune admin portals within this app"
        icon={Settings}
      />

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search consoles (Exchange, Defender, Teams…)"
          className="pl-9"
        />
      </div>

      <div className="space-y-8">
        {filtered.map(cat => (
          <div key={cat.category}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-1.5 w-6 rounded-full bg-gradient-to-r ${cat.color}`} />
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{cat.category}</h2>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cat.items.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.name}
                    onClick={() => launch(item, cat)}
                    className="group text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-md transition-all duration-150 flex items-start gap-3"
                  >
                    <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${cat.color} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate mb-0.5">{item.name}</p>
                      <p className="text-xs text-slate-500 leading-snug">{item.desc}</p>
                      <Badge className={`mt-2 text-[10px] px-1.5 py-0 border-0 ${tagColors[item.tag] || "bg-slate-100 text-slate-500"}`}>
                        {item.tag}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}