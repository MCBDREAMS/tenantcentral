import React, { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  // Store the last visited path for each tab
  const tabHistoryRef = useRef({});

  const getActiveTab = () =>
    NAV_ITEMS.findIndex(({ path }) =>
      path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(path + "/")
    );

  const activeTabIndex = getActiveTab();

  const handleTabPress = (item, index) => {
    // Save current path for the current tab before switching
    if (activeTabIndex >= 0) {
      tabHistoryRef.current[NAV_ITEMS[activeTabIndex].path] = pathname;
    }

    const isAlreadyActive = index === activeTabIndex;

    if (isAlreadyActive) {
      // Tap active tab → go to tab root
      navigate(item.path);
    } else {
      // Restore last visited path for this tab, or go to root
      const restored = tabHistoryRef.current[item.path];
      navigate(restored && restored !== "/" ? restored : item.path);
    }
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 flex items-stretch pb-[env(safe-area-inset-bottom)]">
      {NAV_ITEMS.map((item, index) => {
        const { label, icon: Icon, path } = item;
        const active = path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(path + "/");
        return (
          <button
            key={path}
            onClick={() => handleTabPress(item, index)}
            className={`flex-1 flex flex-col items-center justify-center min-h-[56px] gap-0.5 text-[10px] font-medium transition-colors select-none
              ${active ? "text-blue-600" : "text-slate-400"}`}
          >
            <Icon className={`h-5 w-5 ${active ? "text-blue-600" : "text-slate-400"}`} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}