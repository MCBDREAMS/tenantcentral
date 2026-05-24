import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Building2, MonitorSmartphone, Shield, Settings } from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Tenants", icon: Building2, path: "/Tenants" },
  { label: "Devices", icon: MonitorSmartphone, path: "/IntuneDevices" },
  { label: "Security", icon: Shield, path: "/TenantAnalyzer" },
  { label: "Settings", icon: Settings, path: "/TenantSettings" },
];

export default function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 flex items-stretch pb-[env(safe-area-inset-bottom)]">
      {NAV_ITEMS.map(({ label, icon: Icon, path }) => {
        const active = pathname === path || (path !== "/" && pathname.startsWith(path));
        return (
          <Link
            key={path}
            to={path}
            className={`flex-1 flex flex-col items-center justify-center min-h-[56px] gap-0.5 text-[10px] font-medium transition-colors select-none
              ${active ? "text-blue-600" : "text-slate-400"}`}
          >
            <Icon className={`h-5 w-5 ${active ? "text-blue-600" : "text-slate-400"}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}