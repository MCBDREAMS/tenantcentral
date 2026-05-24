/**
 * pages.config.js - Page routing configuration (lazy-loaded for mobile WebView perf)
 */
import React, { Suspense } from 'react';
import __Layout from './Layout.jsx';

const lazy = (fn) => React.lazy(fn);

const AdminConsole        = lazy(() => import('./pages/AdminConsole'));
const DeviceAppMonitor    = lazy(() => import('./pages/DeviceAppMonitor'));
const AppPermissionsCopy  = lazy(() => import('./pages/AppPermissionsCopy'));
const AuditLogs           = lazy(() => import('./pages/AuditLogs'));
const ComplianceReporting = lazy(() => import('./pages/ComplianceReporting'));
const Dashboard           = lazy(() => import('./pages/Dashboard'));
const DeviceScripts       = lazy(() => import('./pages/DeviceScripts'));
const EntraAuthMethods    = lazy(() => import('./pages/EntraAuthMethods'));
const EntraGroups         = lazy(() => import('./pages/EntraGroups'));
const EntraNamedLocations = lazy(() => import('./pages/EntraNamedLocations'));
const EntraPolicies       = lazy(() => import('./pages/EntraPolicies'));
const EntraRoles          = lazy(() => import('./pages/EntraRoles'));
const EntraUsers          = lazy(() => import('./pages/EntraUsers'));
const ExportCenter        = lazy(() => import('./pages/ExportCenter'));
const IntuneApps          = lazy(() => import('./pages/IntuneApps'));
const IntuneAutopilot     = lazy(() => import('./pages/IntuneAutopilot'));
const IntuneDevices       = lazy(() => import('./pages/IntuneDevices'));
const IntuneFilters       = lazy(() => import('./pages/IntuneFilters'));
const IntuneProfiles      = lazy(() => import('./pages/IntuneProfiles'));
const IntuneReports       = lazy(() => import('./pages/IntuneReports'));
const MdmSolutions        = lazy(() => import('./pages/MdmSolutions'));
const MobileDevices       = lazy(() => import('./pages/MobileDevices'));
const OnPremSync          = lazy(() => import('./pages/OnPremSync'));
const PortalDefender      = lazy(() => import('./pages/PortalDefender'));
const PortalExchange      = lazy(() => import('./pages/PortalExchange'));
const PortalServiceHealth = lazy(() => import('./pages/PortalServiceHealth'));
const PortalSharePoint    = lazy(() => import('./pages/PortalSharePoint'));
const PortalTeams         = lazy(() => import('./pages/PortalTeams'));
const RbacAdmin           = lazy(() => import('./pages/RbacAdmin'));
const SecurityBaselines   = lazy(() => import('./pages/SecurityBaselines'));
const TenantAnalyzer      = lazy(() => import('./pages/TenantAnalyzer'));
const TenantSettings      = lazy(() => import('./pages/TenantSettings'));
const Tenants             = lazy(() => import('./pages/Tenants'));
const ThreatInsights      = lazy(() => import('./pages/ThreatInsights'));
const WindowsUpdates      = lazy(() => import('./pages/WindowsUpdates'));
const SophosReport        = lazy(() => import('./pages/SophosReport'));
const LicenseAdmin        = lazy(() => import('./pages/LicenseAdmin'));
const AzureAppRegistrations = lazy(() => import('./pages/AzureAppRegistrations'));
const About               = lazy(() => import('./pages/About'));
const NetworkMap          = lazy(() => import('./pages/NetworkMap'));
const SopGenerator        = lazy(() => import('./pages/SopGenerator'));
const EntraDevices        = lazy(() => import('./pages/EntraDevices'));
const EntraCompliance     = lazy(() => import('./pages/EntraCompliance'));
const WorkflowEngine      = lazy(() => import('./pages/WorkflowEngine'));
const HybridSetupAnalyzer = lazy(() => import('./pages/HybridSetupAnalyzer'));
const CompanyPortal       = lazy(() => import('./pages/CompanyPortal'));
const RemotePSConsole     = lazy(() => import('./pages/RemotePSConsole'));
const ApprovalQueue       = lazy(() => import('./pages/ApprovalQueue'));
const DeploymentPlans     = lazy(() => import('./pages/DeploymentPlans'));

export const PAGES = {
    "AdminConsole": AdminConsole,
    "DeviceAppMonitor": DeviceAppMonitor,
    "AppPermissionsCopy": AppPermissionsCopy,
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
    "PortalDefender": PortalDefender,
    "PortalExchange": PortalExchange,
    "PortalServiceHealth": PortalServiceHealth,
    "PortalSharePoint": PortalSharePoint,
    "PortalTeams": PortalTeams,
    "RbacAdmin": RbacAdmin,
    "SecurityBaselines": SecurityBaselines,
    "TenantAnalyzer": TenantAnalyzer,
    "TenantSettings": TenantSettings,
    "Tenants": Tenants,
    "WindowsUpdates": WindowsUpdates,
    "ThreatInsights": ThreatInsights,
    "SophosReport": SophosReport,
    "LicenseAdmin": LicenseAdmin,
    "AzureAppRegistrations": AzureAppRegistrations,
    "About": About,
    "NetworkMap": NetworkMap,
    "SopGenerator": SopGenerator,
    "EntraDevices": EntraDevices,
    "EntraCompliance": EntraCompliance,
    "WorkflowEngine": WorkflowEngine,
    "HybridSetupAnalyzer": HybridSetupAnalyzer,
    "CompanyPortal": CompanyPortal,
    "RemotePSConsole": RemotePSConsole,
    "ApprovalQueue": ApprovalQueue,
    "DeploymentPlans": DeploymentPlans,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};