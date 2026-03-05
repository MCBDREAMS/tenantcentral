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
import AuditLogs from './pages/AuditLogs';
import ComplianceReporting from './pages/ComplianceReporting';
import Dashboard from './pages/Dashboard';
import DeviceScripts from './pages/DeviceScripts';
import EntraAuthMethods from './pages/EntraAuthMethods';
import EntraGroups from './pages/EntraGroups';
import EntraNamedLocations from './pages/EntraNamedLocations';
import EntraPolicies from './pages/EntraPolicies';
import EntraRoles from './pages/EntraRoles';
import EntraUsers from './pages/EntraUsers';
import ExportCenter from './pages/ExportCenter';
import IntuneApps from './pages/IntuneApps';
import IntuneAutopilot from './pages/IntuneAutopilot';
import IntuneDevices from './pages/IntuneDevices';
import IntuneFilters from './pages/IntuneFilters';
import IntuneProfiles from './pages/IntuneProfiles';
import IntuneReports from './pages/IntuneReports';
import MdmSolutions from './pages/MdmSolutions';
import MobileDevices from './pages/MobileDevices';
import OnPremSync from './pages/OnPremSync';
import RbacAdmin from './pages/RbacAdmin';
import SecurityBaselines from './pages/SecurityBaselines';
import TenantAnalyzer from './pages/TenantAnalyzer';
import Tenants from './pages/Tenants';
import TenantSettings from './pages/TenantSettings';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AuditLogs": AuditLogs,
    "ComplianceReporting": ComplianceReporting,
    "Dashboard": Dashboard,
    "DeviceScripts": DeviceScripts,
    "EntraAuthMethods": EntraAuthMethods,
    "EntraGroups": EntraGroups,
    "EntraNamedLocations": EntraNamedLocations,
    "EntraPolicies": EntraPolicies,
    "EntraRoles": EntraRoles,
    "EntraUsers": EntraUsers,
    "ExportCenter": ExportCenter,
    "IntuneApps": IntuneApps,
    "IntuneAutopilot": IntuneAutopilot,
    "IntuneDevices": IntuneDevices,
    "IntuneFilters": IntuneFilters,
    "IntuneProfiles": IntuneProfiles,
    "IntuneReports": IntuneReports,
    "MdmSolutions": MdmSolutions,
    "MobileDevices": MobileDevices,
    "OnPremSync": OnPremSync,
    "RbacAdmin": RbacAdmin,
    "SecurityBaselines": SecurityBaselines,
    "TenantAnalyzer": TenantAnalyzer,
    "Tenants": Tenants,
    "TenantSettings": TenantSettings,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};