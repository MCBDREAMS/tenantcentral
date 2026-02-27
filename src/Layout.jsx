import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useRbac } from "@/components/shared/useRbac";
import {
  LayoutDashboard, Building2, Shield, Laptop, Users, FolderCog,
  ChevronDown, ChevronRight, Menu, X, LogOut, Settings, Layers,
  MonitorSmartphone, UserCheck, ShieldCheck, FileText, Lock, Globe, Terminal,
  AppWindow, ClipboardList, UserCog, MapPin, KeyRound, Rocket, Filter,
  BarChart2, ShieldAlert, Smartphone, Server
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const navSections = [
  {
    label: "Overview",
    section: null,
    items: [
      { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
      { name: "Tenants", icon: Building2, page: "Tenants" },
    ]
  },
  {
    label: "Entra ID",
    section: "entra",
    items: [
      { name: "Users", icon: Users, page: "EntraUsers" },
      { name: "Groups", icon: UserCheck, page: "EntraGroups" },
      { name: "Conditional Access", icon: Shield, page: "EntraPolicies" },
      { name: "Directory Roles", icon: ShieldAlert, page: "EntraRoles" },
      { name: "Named Locations", icon: MapPin, page: "EntraNamedLocations" },
      { name: "Auth Methods", icon: KeyRound, page: "EntraAuthMethods" },
    ]
  },
  {
    label: "Intune",
    section: "intune",
    items: [
      { name: "Devices", icon: MonitorSmartphone, page: "IntuneDevices" },
      { name: "Mobile Devices", icon: Smartphone, page: "MobileDevices" },
      { name: "Compliance & Config", icon: FolderCog, page: "IntuneProfiles" },
      { name: "Security Baselines", icon: ShieldCheck, page: "SecurityBaselines" },
      { name: "Device Scripts", icon: Terminal, page: "DeviceScripts" },
      { name: "Apps & Packages", icon: AppWindow, page: "IntuneApps" },
      { name: "Autopilot", icon: Rocket, page: "IntuneAutopilot" },
      { name: "Filters", icon: Filter, page: "IntuneFilters" },
      { name: "Reports", icon: BarChart2, page: "IntuneReports" },
    ]
  },
  {
    label: "Admin",
    section: "admin",
    items: [
      { name: "Export Center", icon: FileText, page: "ExportCenter" },
      { name: "Audit Logs", icon: ClipboardList, page: "AuditLogs" },
      { name: "RBAC / Roles", icon: UserCog, page: "RbacAdmin" },
    ]
  }
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState(
    navSections.map((_, i) => true)
  );
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenants, setTenants] = useState([]);
  const { rbac, canAccess, filterTenants } = useRbac();

  useEffect(() => {
    base44.entities.Tenant.list().then(t => {
      const scoped = filterTenants(t);
      setTenants(scoped);
      if (scoped.length > 0 && !selectedTenant) {
        setSelectedTenant(scoped[0]);
      }
    });
  }, [rbac]);

  const toggleSection = (index) => {
    setExpandedSections(prev => prev.map((v, i) => i === index ? !v : v));
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
          <select
            value={selectedTenant?.id || ""}
            onChange={(e) => {
              const t = tenants.find(t => t.id === e.target.value);
              setSelectedTenant(t);
            }}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Tenants</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {navSections.filter(s => !s.section || canAccess(s.section)).map((section, sIndex) => (
          <div key={section.label} className="mb-1">
            {(sidebarOpen || mobile) && (
              <button
                onClick={() => toggleSection(sIndex)}
                className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 hover:text-slate-400 transition-colors"
              >
                {section.label}
                {expandedSections[sIndex] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            )}
            {(expandedSections[sIndex] || (!sidebarOpen && !mobile)) && (
              <div className="space-y-0.5">
                {section.items.map(item => {
                  const isActive = currentPageName === item.page;
                  return (
                    <Link
                      key={item.page}
                      to={createPageUrl(item.page)}
                      onClick={() => mobile && setMobileSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150
                        ${isActive
                          ? 'bg-blue-600/20 text-blue-400 font-medium'
                          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                        }
                        ${!sidebarOpen && !mobile ? 'justify-center' : ''}
                      `}
                      title={item.name}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {(sidebarOpen || mobile) && <span>{item.name}</span>}
                    </Link>
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
              <Badge className="ml-auto text-[9px] px-1.5 py-0 bg-slate-700 text-slate-300 border-0 shrink-0">
                {rbac.role?.replace(/_/g, " ")}
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
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
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
        <main className="flex-1 overflow-auto">
          {React.cloneElement(children, { selectedTenant, tenants })}
        </main>
      </div>
    </div>
  );
}