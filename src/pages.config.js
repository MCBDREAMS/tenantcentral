/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Dashboard from './pages/Dashboard';
import Tenants from './pages/Tenants';
import EntraUsers from './pages/EntraUsers';
import EntraGroups from './pages/EntraGroups';
import EntraPolicies from './pages/EntraPolicies';
import IntuneDevices from './pages/IntuneDevices';
import IntuneProfiles from './pages/IntuneProfiles';
import SecurityBaselines from './pages/SecurityBaselines';
import ExportCenter from './pages/ExportCenter';
import DeviceScripts from './pages/DeviceScripts';
import AuditLogs from './pages/AuditLogs';
import RbacAdmin from './pages/RbacAdmin';
import IntuneApps from './pages/IntuneApps';
import EntraRoles from './pages/EntraRoles';
import EntraNamedLocations from './pages/EntraNamedLocations';
import EntraAuthMethods from './pages/EntraAuthMethods';
import IntuneAutopilot from './pages/IntuneAutopilot';
import IntuneFilters from './pages/IntuneFilters';
import IntuneReports from './pages/IntuneReports';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Tenants": Tenants,
    "EntraUsers": EntraUsers,
    "EntraGroups": EntraGroups,
    "EntraPolicies": EntraPolicies,
    "IntuneDevices": IntuneDevices,
    "IntuneProfiles": IntuneProfiles,
    "SecurityBaselines": SecurityBaselines,
    "ExportCenter": ExportCenter,
    "DeviceScripts": DeviceScripts,
    "AuditLogs": AuditLogs,
    "RbacAdmin": RbacAdmin,
    "IntuneApps": IntuneApps,
    "EntraRoles": EntraRoles,
    "EntraNamedLocations": EntraNamedLocations,
    "EntraAuthMethods": EntraAuthMethods,
    "IntuneAutopilot": IntuneAutopilot,
    "IntuneFilters": IntuneFilters,
    "IntuneReports": IntuneReports,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};