import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useRbac } from "@/components/shared/useRbac";
import BottomNav from "@/components/mobile/BottomNav";
import MobileHeader from "@/components/mobile/MobileHeader";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Building2, Shield, Laptop, Users, FolderCog,
  ChevronDown, ChevronRight, Menu, X, LogOut, Settings, Layers, Settings2, GitMerge,
  MonitorSmartphone, UserCheck, ShieldCheck, FileText, Lock, Globe, Terminal,
  AppWindow, ClipboardList, UserCog, MapPin, KeyRound, Rocket, Filter,
  BarChart2, ShieldAlert, Smartphone, Server, Mail, MessageSquare, Database, Activity, Zap, GitBranch, Cpu, Bot, HeartPulse, Unlink, Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const navSections = [
  {
    label: "Overview",
    section: null,
    items: [
      { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
      { name: "Tenant Health Overview", icon: HeartPulse, page: "TenantHealthOverview" },
      { name: "Tenants", icon: Building2, page: "Tenants" },
      { name: "Tenant Settings", icon: Settings, page: "TenantSettings" },
    ]
  },
  {
    label: "Microsoft Entra ID",
    section: "entra",
    items: [
      { group: "Identity", name: "Users", icon: Users, page: "EntraUsers" },
      { group: "Identity", name: "Groups", icon: UserCheck, page: "EntraGroups" },
      { group: "Identity", name: "Devices", icon: MonitorSmartphone, page: "EntraDevices" },
      { group: "Applications", name: "App Registrations", icon: AppWindow, page: "AzureAppRegistrations" },
      { group: "Protection", name: "Conditional Access", icon: Shield, page: "EntraPolicies" },
      { group: "Protection", name: "MFA & Auth Methods", icon: KeyRound, page: "EntraAuthMethods" },
      { group: "Protection", name: "Named Locations", icon: MapPin, page: "EntraNamedLocations" },
      { group: "Protection", name: "Directory Roles", icon: ShieldAlert, page: "EntraRoles" },
      { group: "Monitoring", name: "Compliance", icon: ShieldCheck, page: "EntraCompliance" },
      { group: "Hybrid Management", name: "Hybrid Setup Analyzer", icon: GitMerge, page: "HybridSetupAnalyzer" },
      { group: "Hybrid Management", name: "AD → Entra ID Migration", icon: GitMerge, page: "AdUserMigration" },
    ]
  },
  {
    label: "Microsoft Intune",
    section: "intune",
    items: [
      { group: "Devices", name: "Devices", icon: MonitorSmartphone, page: "IntuneDevices" },
      { group: "Devices", name: "Mobile Devices", icon: Smartphone, page: "MobileDevices" },
      { group: "Devices", name: "Compliance & Config", icon: FolderCog, page: "IntuneProfiles" },
      { group: "Devices", name: "Security Baselines", icon: ShieldCheck, page: "SecurityBaselines" },
      { group: "Devices", name: "Device Scripts", icon: Terminal, page: "DeviceScripts" },
      { group: "Devices", name: "Autopilot", icon: Rocket, page: "IntuneAutopilot" },
      { group: "Apps", name: "Apps & Packages", icon: AppWindow, page: "IntuneApps" },
      { group: "Apps", name: "Company Portal", icon: AppWindow, page: "CompanyPortal" },
      { group: "Apps", name: "App Monitor", icon: Activity, page: "DeviceAppMonitor" },
      { group: "Updates", name: "Windows Updates", icon: ShieldCheck, page: "WindowsUpdates" },
      { group: "Reports", name: "Reports", icon: BarChart2, page: "IntuneReports" },
      { group: "Reports", name: "Sophos Report", icon: ShieldCheck, page: "SophosReport" },
      { group: "Reports", name: "Threat Insights", icon: ShieldAlert, page: "ThreatInsights" },
      { group: "Reports", name: "Filters", icon: Filter, page: "IntuneFilters" },
      { group: "Deploy", name: "Deployment Plans", icon: GitBranch, page: "DeploymentPlans" },
      { group: "Deploy", name: "Starter Kit", icon: Rocket, page: "IntuneStarterKit" },
      { group: "Deploy", name: "Remote PS Console", icon: Terminal, page: "RemotePSConsole" },
      { group: "Migrate", name: "Adidy → Intune Migration", icon: GitBranch, page: "IntuneAdiMigration" },
      { group: "Assist", name: "AI Assistant", icon: Bot, page: "IntuneAssistant" },
    ]
  },
  {
    label: "Security (Defender)",
    section: null,
    items: [
      { name: "Tenant Analyser", icon: ShieldCheck, page: "TenantAnalyzer" },
      { name: "Compliance Reporting", icon: BarChart2, page: "ComplianceReporting" },
      { name: "Workflow Engine", icon: Zap, page: "WorkflowEngine" },
      { name: "GoDaddy Defederation", icon: Unlink, page: "GoDaddyDefederation" },
    ]
  },
  {
    label: "Infrastructure",
    section: null,
    items: [
      { name: "MDM Solutions", icon: Layers, page: "MdmSolutions" },
      { name: "On-Prem Sync", icon: Server, page: "OnPremSync" },
      { name: "Network Map", icon: Globe, page: "NetworkMap" },
    ]
  },
  {
    label: "Microsoft 365 Portals",
    section: "entra",
    items: [
      { name: "Exchange", icon: Mail, page: "PortalExchange" },
      { name: "Teams", icon: MessageSquare, page: "PortalTeams" },
      { name: "SharePoint", icon: Globe, page: "PortalSharePoint" },
      { name: "Defender Alerts", icon: Shield, page: "PortalDefender" },
      { name: "Service Health", icon: Server, page: "PortalServiceHealth" },
    ]
  },
  {
    label: "Administration",
    section: "admin",
    items: [
      { name: "Approval Queue", icon: Shield, page: "ApprovalQueue", badgeKey: "approvals" },
      { name: "Export Center", icon: FileText, page: "ExportCenter" },
      { name: "Audit Logs", icon: ClipboardList, page: "AuditLogs" },
      { name: "RBAC / Roles", icon: UserCog, page: "RbacAdmin" },
      { name: "Copy App Permissions", icon: GitMerge, page: "AppPermissionsCopy" },
      { name: "License Manager", icon: KeyRound, page: "LicenseAdmin" },
      { name: "SOP Generator", icon: FileText, page: "SopGenerator" },
      { name: "App Health Check", icon: Activity, page: "AppHealthCheck" },
      { name: "Tenant-to-Tenant Migration", icon: GitMerge, page: "TenantMigration" },
    ]
  },
  {
    label: "About",
    section: null,
    items: [
      { name: "About & License", icon: Layers, page: "About" },
    ]
  }
];

export default function Layout({ children, currentPageName }) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState(() => {
    try {
      const stored = sessionStorage.getItem("nav_expanded_sections");
      return stored ? JSON.parse(stored) : navSections.map(() => true);
    } catch {
      return navSections.map(() => true);
    }
  });
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [navSearch, setNavSearch] = useState("");
  const { rbac, canAccess, filterTenants } = useRbac();

  const navQuery = navSearch.trim().toLowerCase();
  const filteredNav = navSections
    .filter(s => !s.section || canAccess(s.section))
    .map(s => ({ ...s, items: s.items.filter(it => !navQuery || it.name.toLowerCase().includes(navQuery)) }))
    .filter(s => !navQuery || s.items.length > 0 || s.label.toLowerCase().includes(navQuery));

  useEffect(() => {
    if (!rbac) return;
    base44.entities.Tenant.list().then(t => {
      const scoped = filterTenants(t);
      setTenants(scoped);
      if (scoped.length > 0 && !selectedTenant) {
        try {
          const storedId = sessionStorage.getItem("selected_tenant_id");
          const restored = storedId ? scoped.find(x => x.id === storedId) : null;
          setSelectedTenant(restored || scoped[0]);
        } catch {
          setSelectedTenant(scoped[0]);
        }
      }
    });
    // Poll for pending approvals every 60s (only for admins)
    if (["global_admin", "security_admin", "approval_admin"].includes(rbac?.role)) {
      const fetchCount = () => {
        base44.functions.invoke("approvalEngine", { action: "count_pending" })
          .then(res => setPendingApprovals(res.data?.count || 0))
          .catch(() => {});
      };
      fetchCount();
      const t = setInterval(fetchCount, 60000);
      return () => clearInterval(t);
    }
  }, [rbac]);

  const toggleSection = (index) => {
    setExpandedSections(prev => {
      const next = prev.map((v, i) => i === index ? !v : v);
      try { sessionStorage.setItem("nav_expanded_sections", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const Sidebar = ({ mobile = false }) => (
    <div className={`flex flex-col h-full bg-slate-950 text-white ${mobile ? 'w-72' : sidebarOpen ? 'w-64' : 'w-16'} transition-all duration-300`}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-800 shrink-0">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shrink-0">
          <Layers className="h-4 w-4 text-white" />
        </div>
        {(sidebarOpen || mobile) && (
          <span className="font-semibold text-sm tracking-wide">Azure Multi-Tenant</span>
        )}
      </div>

      {/* Tenant Selector */}
      {(sidebarOpen || mobile) && (
        <div className="px-3 py-3 border-b border-slate-800">
          <Select
            value={selectedTenant?.id || ""}
            onValueChange={(val) => {
              const t = tenants.find(t => t.id === val) || null;
              setSelectedTenant(t);
              try { sessionStorage.setItem("selected_tenant_id", val); } catch {}
            }}
          >
            <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-slate-200 text-sm focus:ring-blue-500 min-h-[44px]">
              <SelectValue placeholder="All Tenants" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
              {rbac?.role === "global_admin" && <SelectItem value={null}>All Tenants</SelectItem>}
              {tenants.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {(sidebarOpen || mobile) && (
          <div className="px-1 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
                placeholder="Search menu..."
                className="w-full bg-slate-900 border border-slate-700 rounded-md pl-8 pr-2 py-1.5 text-[13px] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
        {filteredNav.map((section, sIndex) => (
          <div key={section.label} className="mb-1">
            {(sidebarOpen || mobile) && (
              <button
                onClick={() => toggleSection(sIndex)}
                className="flex items-center justify-between w-full px-2 py-1.5 text-[13px] font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-300 transition-colors"
              >
                {section.label}
                {expandedSections[sIndex] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            )}
            {(navQuery || expandedSections[sIndex] || (!sidebarOpen && !mobile)) && (
              <div className="space-y-0.5">
                {section.items.map((item, i) => {
                  const isActive = currentPageName === item.page;
                  const prevGroup = i > 0 ? section.items[i - 1].group : null;
                  const showGroup = !navQuery && (sidebarOpen || mobile) && item.group && item.group !== prevGroup;
                  return (
                    <div key={item.page}>
                      {showGroup && (
                        <div className="px-3 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{item.group}</div>
                      )}
                      <Link
                        to={createPageUrl(item.page)}
                        onClick={() => mobile && setMobileSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[15px] transition-all duration-150
                          ${isActive
                            ? 'bg-blue-600/20 text-blue-400 font-medium'
                            : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                          }
                          ${!sidebarOpen && !mobile ? 'justify-center' : ''}
                        `}
                        title={item.name}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {(sidebarOpen || mobile) && <span className="flex-1">{item.name}</span>}
                        {(sidebarOpen || mobile) && item.badgeKey === "approvals" && pendingApprovals > 0 && (
                          <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">{pendingApprovals}</span>
                        )}
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      {(sidebarOpen || mobile) && (
        <div className="p-3 border-t border-slate-800 shrink-0 space-y-1">
          {rbac && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-900/60">
              <Lock className="h-3 w-3 text-slate-500" />
              <span className="text-xs text-slate-400 truncate">{rbac.email}</span>
              <Badge className={`ml-auto text-[9px] px-1.5 py-0 border-0 shrink-0 ${rbac.role === "local_admin" ? "bg-purple-600 text-white" : rbac.role === "tenant_admin" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300"}`}>
                {rbac.role === "local_admin" ? "Local Admin" : rbac.role?.replace(/_/g, " ")}
              </Badge>
            </div>
          )}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-500">
            <Globe className="h-3 w-3" />
            <span>Multi-Tenant Admin v1.0</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileSidebarOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 z-50">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar — desktop only */}
        <header className="hidden md:flex h-14 bg-white border-b border-slate-200 items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu className="h-4 w-4 text-slate-500" />
            </Button>
            {selectedTenant && (
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${selectedTenant.status === 'connected' ? 'bg-emerald-500' : selectedTenant.status === 'pending' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="text-sm font-medium text-slate-700">{selectedTenant.name}</span>
                <span className="text-xs text-slate-400">({selectedTenant.domain})</span>
              </div>
            )}
            {!selectedTenant && (
              <span className="text-sm text-slate-500">All Tenants</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => base44.auth.logout()}>
              <LogOut className="h-4 w-4 text-slate-500" />
            </Button>
          </div>
        </header>

        {/* Page Content */}
        {isMobile ? (
          <PullToRefresh onRefresh={() => queryClient.invalidateQueries()}>
            <div className="h-14" />
            {React.cloneElement(children, { selectedTenant, tenants })}
            <div className="h-16" />
          </PullToRefresh>
        ) : (
          <main className="flex-1 overflow-auto h-full">
            {React.cloneElement(children, { selectedTenant, tenants })}
          </main>
        )}
      </div>

      <MobileHeader currentPageName={currentPageName} />
      <BottomNav />
    </div>
  );

}