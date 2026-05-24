import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, Layers, LogOut } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";

const PAGE_TITLES = {
  "/": "Dashboard",
  "/Tenants": "Tenants",
  "/IntuneDevices": "Intune Devices",
  "/TenantAnalyzer": "Tenant Analyser",
  "/TenantSettings": "Tenant Settings",
  "/EntraUsers": "Entra Users",
  "/EntraGroups": "Entra Groups",
  "/EntraPolicies": "Conditional Access",
  "/IntuneProfiles": "Compliance & Config",
  "/SecurityBaselines": "Security Baselines",
  "/DeviceScripts": "Device Scripts",
  "/IntuneApps": "Apps & Packages",
  "/IntuneAutopilot": "Autopilot",
  "/WorkflowEngine": "Workflow Engine",
  "/AuditLogs": "Audit Logs",
  "/ApprovalQueue": "Approval Queue",
  "/IntuneStarterKit": "Starter Kit",
};

export default function MobileHeader({ currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isRoot = location.pathname === "/";
  const title = PAGE_TITLES[location.pathname] || currentPageName || "Admin";

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 flex items-center gap-2 px-3 pt-[env(safe-area-inset-top)]" style={{ minHeight: "calc(56px + env(safe-area-inset-top))" }}>
      {!isRoot ? (
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center h-11 w-11 rounded-lg text-slate-600 hover:bg-slate-100 active:bg-slate-200 select-none"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : (
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shrink-0">
          <Layers className="h-4 w-4 text-white" />
        </div>
      )}
      <span className="flex-1 font-semibold text-slate-800 text-base truncate">{title}</span>
      <button
        onClick={() => base44.auth.logout()}
        className="flex items-center justify-center h-11 w-11 rounded-lg text-slate-400 hover:bg-slate-100 active:bg-slate-200 select-none"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </header>
  );
}