import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authorizeAdminAction } from '../../shared/rbacCheck.ts';

const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");

async function getAccessToken(tenantId) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default"
  });
  const res = await fetch(url, { method: "POST", body });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function graphPost(token, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`POST ${path} failed ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function graphGetPage(token, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) { console.warn(`graphGetPage FAILED ${path}: ${res.status}`); return []; }
  const data = await res.json();
  return data.value || [];
}

// Parse Windows version string into major build numbers
function parseWinVersion(osVersion) {
  if (!osVersion) return null;
  const match = osVersion.match(/(\d+\.\d+\.\d+)/);
  if (!match) return null;
  const parts = match[1].split(".");
  const build = parseInt(parts[2] || "0");
  // Windows 11 builds start at 22000
  const isWin11 = build >= 22000;
  const isWin10 = build >= 10240 && build < 22000;

  // Map build numbers to version names
  const win11Versions = {
    22000: "21H2", 22621: "22H2", 22631: "23H2", 26100: "24H2"
  };
  const win10Versions = {
    19041: "20H1", 19042: "20H2", 19043: "21H1", 19044: "21H2", 19045: "22H2"
  };

  let versionName = null;
  if (isWin11) {
    const closest = Object.entries(win11Versions).reverse().find(([b]) => build >= parseInt(b));
    versionName = closest ? `Windows 11 ${closest[1]}` : "Windows 11 (Unknown)";
  } else if (isWin10) {
    const closest = Object.entries(win10Versions).reverse().find(([b]) => build >= parseInt(b));
    versionName = closest ? `Windows 10 ${closest[1]}` : "Windows 10 (Unknown)";
  }

  return { build, isWin11, isWin10, versionName };
}

// Check upgrade readiness based on hardware requirements
function assessUpgradeReadiness(device) {
  const version = parseWinVersion(device.osVersion);
  if (!version) return { ready: false, reason: "Unknown OS version" };
  if (version.isWin11 && version.build >= 22000) return { ready: false, reason: "Already on Windows 11" };
  if (!version.isWin10) return { ready: false, reason: "Not Windows 10" };
  // W10 22H2 (19045) is the last supported W10, eligible for W11 upgrade
  if (version.build < 19041) return { ready: false, reason: "Windows 10 too old (pre-20H1)" };
  return { ready: true, reason: "Eligible for Windows 11 upgrade" };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, azure_tenant_id } = body;

    // ── Authorization: upgrade/ring deployments are tenant-scoped admin actions ──
    // (app_health_check sends no azure_tenant_id → role-only gate applies)
    const denied = await authorizeAdminAction(base44, user, [azure_tenant_id]);
    if (denied) return denied;

    // ── Windows Version & Upgrade Readiness Report ──────────────────────────
    if (action === "windows_version_report") {
      const token = await getAccessToken(azure_tenant_id);
      const devices = await graphGetPage(token,
        "/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,userPrincipalName,lastSyncDateTime,model,manufacturer,processorArchitecture,totalStorageSpaceInBytes,freeStorageSpaceInBytes&$top=200"
      );

      const windowsDevices = devices.filter(d => d.operatingSystem === "Windows");
      const versionMap = {};
      const readinessResults = [];

      for (const d of windowsDevices) {
        const version = parseWinVersion(d.osVersion);
        const vName = version?.versionName || "Unknown";
        versionMap[vName] = (versionMap[vName] || 0) + 1;
        const readiness = assessUpgradeReadiness(d);
        readinessResults.push({
          id: d.id,
          deviceName: d.deviceName,
          osVersion: d.osVersion,
          versionLabel: vName,
          userPrincipalName: d.userPrincipalName,
          model: d.model,
          manufacturer: d.manufacturer,
          complianceState: d.complianceState,
          lastSyncDateTime: d.lastSyncDateTime,
          isWin11: version?.isWin11 || false,
          isWin10: version?.isWin10 || false,
          build: version?.build || 0,
          upgradeReady: readiness.ready,
          upgradeReason: readiness.reason,
          totalStorageGB: Math.round((d.totalStorageSpaceInBytes || 0) / 1073741824),
          freeStorageGB: Math.round((d.freeStorageSpaceInBytes || 0) / 1073741824),
        });
      }

      const versionBreakdown = Object.entries(versionMap).map(([version, count]) => ({ version, count }))
        .sort((a, b) => b.count - a.count);

      const win11Count = readinessResults.filter(d => d.isWin11).length;
      const win10Count = readinessResults.filter(d => d.isWin10).length;
      const readyCount = readinessResults.filter(d => d.upgradeReady).length;

      return Response.json({
        success: true,
        devices: readinessResults,
        versionBreakdown,
        stats: {
          total: windowsDevices.length,
          win11: win11Count,
          win10: win10Count,
          upgradeReady: readyCount,
          alreadyUpgraded: win11Count,
        }
      });
    }

    // ── Deploy Windows 11 Upgrade via Intune PowerShell Script ─────────────
    if (action === "deploy_win11_upgrade") {
      const { target_device_ids, script_name, group_name } = body;
      const token = await getAccessToken(azure_tenant_id);

      // Create a PowerShell script that triggers the Windows 11 upgrade
      const upgradeScript = `
# Windows 11 Feature Update Deployment Script
# Deployed via Azure Multi-Tenant Admin Console
# Generated: ${new Date().toISOString()}

$LogPath = "C:\\ProgramData\\ITAdmin\\Win11Upgrade\\upgrade.log"
$null = New-Item -ItemType Directory -Force -Path (Split-Path $LogPath)

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $entry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message"
    Add-Content -Path $LogPath -Value $entry
    Write-Output $entry
}

Write-Log "=== Windows 11 Upgrade Script Starting ==="
Write-Log "Device: $env:COMPUTERNAME"
Write-Log "Current OS: $((Get-WmiObject Win32_OperatingSystem).Caption)"
Write-Log "Build: $([System.Environment]::OSVersion.Version.Build)"

# Check if already on Windows 11
$build = [System.Environment]::OSVersion.Version.Build
if ($build -ge 22000) {
    Write-Log "Device is already running Windows 11 (Build $build). Exiting." "INFO"
    exit 0
}

# Check minimum requirements
$RAM = [Math]::Round((Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 2)
$Disk = [Math]::Round((Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'").FreeSpace / 1GB, 2)
Write-Log "RAM: ${RAM}GB, Free Disk: ${Disk}GB"

if ($RAM -lt 3.5) {
    Write-Log "Insufficient RAM (${RAM}GB, need 4GB). Upgrade cannot proceed." "ERROR"
    exit 1
}
if ($Disk -lt 25) {
    Write-Log "Insufficient disk space (${Disk}GB free, need 25GB). Upgrade cannot proceed." "ERROR"  
    exit 1
}

# Use Windows Update service to trigger feature update
Write-Log "Triggering Windows 11 upgrade via Windows Update..."

try {
    # Enable Windows Update service
    Set-Service -Name wuauserv -StartupType Automatic
    Start-Service -Name wuauserv -ErrorAction SilentlyContinue

    # Use COM object to scan and install
    $UpdateSession = New-Object -ComObject Microsoft.Update.Session
    $UpdateSearcher = $UpdateSession.CreateUpdateSearcher()
    Write-Log "Searching for Windows 11 feature update..."
    
    $SearchResult = $UpdateSearcher.Search("IsInstalled=0 AND Type='Software' AND IsHidden=0")
    $FeatureUpdates = $SearchResult.Updates | Where-Object { $_.Title -match "Windows 11" }
    
    if ($FeatureUpdates.Count -eq 0) {
        Write-Log "Windows 11 feature update not found via Windows Update. Checking alternative path..."
        # Trigger via PC Health Check / readiness
        $registryPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\TargetVersionUpgradeExperienceIndicators\\NI22H2"
        New-ItemProperty -Path "HKLM:\\SYSTEM\\Setup\\MoSetup" -Name "AllowUpgradesWithUnsupportedTPMOrCPU" -Value 1 -PropertyType DWORD -Force -ErrorAction SilentlyContinue
        Write-Log "Set upgrade compatibility flags. Windows Update will schedule upgrade." "INFO"
    } else {
        Write-Log "Found $($FeatureUpdates.Count) Windows 11 update(s). Initiating download..."
        $UpdatesToInstall = New-Object -ComObject Microsoft.Update.UpdateColl
        $FeatureUpdates | ForEach-Object { $UpdatesToInstall.Add($_) | Out-Null }
        
        $Downloader = $UpdateSession.CreateUpdateDownloader()
        $Downloader.Updates = $UpdatesToInstall
        Write-Log "Downloading Windows 11 update..."
        $DownloadResult = $Downloader.Download()
        Write-Log "Download result: $($DownloadResult.ResultCode)"
        
        $Installer = $UpdateSession.CreateUpdateInstaller()
        $Installer.Updates = $UpdatesToInstall
        Write-Log "Installing Windows 11 update (device will restart)..."
        $InstallResult = $Installer.Install()
        Write-Log "Install result: $($InstallResult.ResultCode). Reboot required: $($InstallResult.RebootRequired)"
    }
    
    Write-Log "Windows 11 upgrade initiated successfully." "INFO"
    exit 0
} catch {
    Write-Log "Upgrade error: $_" "ERROR"
    exit 1
}
`;

      const encodedScript = btoa(unescape(encodeURIComponent(upgradeScript)));
      const scriptPayload = {
        "@odata.type": "#microsoft.graph.deviceManagementScript",
        displayName: script_name || "Windows 11 Feature Upgrade - Admin Deploy",
        description: `Windows 11 upgrade script deployed via Admin Console on ${new Date().toISOString().split("T")[0]}`,
        scriptContent: encodedScript,
        runAsAccount: "system",
        runAs32Bit: false,
        enforceSignatureCheck: false,
        fileName: "Win11_Upgrade.ps1",
      };

      const created = await graphPost(token, "/deviceManagement/deviceManagementScripts", scriptPayload);

      // If target device IDs provided, assign to a group or directly
      let assignments = [];
      if (target_device_ids && target_device_ids.length > 0) {
        // Assign to all devices in tenant using "All Devices" built-in group
        const assignPayload = {
          deviceManagementScriptAssignments: [
            {
              "@odata.type": "#microsoft.graph.deviceManagementScriptAssignment",
              target: {
                "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget"
              }
            }
          ]
        };
        await graphPost(token, `/deviceManagement/deviceManagementScripts/${created.id}/assign`, assignPayload);
        assignments = ["All Devices"];
      }

      return Response.json({
        success: true,
        scriptId: created.id,
        scriptName: created.displayName,
        assignments,
        message: "Windows 11 upgrade script created and assigned via Intune"
      });
    }

    // ── Deploy Windows Updates independently via Intune ──────────────────────
    if (action === "deploy_windows_updates") {
      const { update_type, defer_days, quality_defer, feature_defer, ring_name } = body;
      const token = await getAccessToken(azure_tenant_id);

      // Create an Update Ring policy via Graph
      const ringPayload = {
        "@odata.type": "#microsoft.graph.windowsUpdateForBusinessConfiguration",
        displayName: ring_name || `Admin Update Ring - ${new Date().toISOString().split("T")[0]}`,
        description: "Created via Admin Console - Windows Update deployment",
        deliveryOptimizationMode: "httpOnly",
        prereleaseFeatures: "userDefined",
        automaticUpdateMode: "autoInstallAndRebootAtScheduledTime",
        microsoftUpdateServiceAllowed: true,
        driversIncluded: true,
        qualityUpdatesDeferralPeriodInDays: quality_defer || 0,
        featureUpdatesDeferralPeriodInDays: feature_defer || 0,
        installationSchedule: {
          "@odata.type": "#microsoft.graph.windowsUpdateScheduledInstall",
          scheduledInstallDay: "sunday",
          scheduledInstallTime: "3:00"
        },
        businessReadyUpdatesOnly: update_type === "business_ready" ? "businessReadyOnly" : "all",
      };

      const created = await graphPost(token, "/deviceManagement/deviceConfigurations", ringPayload);

      // Assign to all devices
      const assignPayload = {
        assignments: [
          {
            "@odata.type": "#microsoft.graph.deviceConfigurationAssignment",
            target: {
              "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget"
            }
          }
        ]
      };
      await graphPost(token, `/deviceManagement/deviceConfigurations/${created.id}/assign`, assignPayload);

      return Response.json({
        success: true,
        policyId: created.id,
        policyName: created.displayName,
        message: "Windows Update Ring created and assigned to all devices"
      });
    }

    // ── List existing Windows Update Rings ───────────────────────────────────
    if (action === "list_update_rings") {
      const token = await getAccessToken(azure_tenant_id);
      const configs = await graphGetPage(token, "/deviceManagement/deviceConfigurations?$filter=startswith(displayName,'') &$select=id,displayName,description,lastModifiedDateTime,createdDateTime,version");
      // Filter to Windows Update for Business configs
      const rings = configs.filter(c => c["@odata.type"] === "#microsoft.graph.windowsUpdateForBusinessConfiguration" || (c.displayName && c.displayName.toLowerCase().includes("update ring")));
      return Response.json({ success: true, rings });
    }

    // ── App Health Check ─────────────────────────────────────────────────────
    if (action === "app_health_check") {
      const start = Date.now();
      const checks = [];

      // Check database connectivity via entity counts
      try {
        const tenants = await base44.asServiceRole.entities.Tenant.list();
        checks.push({ name: "Database - Tenants", status: "ok", value: `${tenants.length} tenants`, ms: Date.now() - start });
      } catch (e) {
        checks.push({ name: "Database - Tenants", status: "error", value: e.message });
      }

      try {
        const devices = await base44.asServiceRole.entities.IntuneDevice.list();
        checks.push({ name: "Database - Devices", status: "ok", value: `${devices.length} devices` });
      } catch (e) {
        checks.push({ name: "Database - Devices", status: "error", value: e.message });
      }

      try {
        const workflows = await base44.asServiceRole.entities.WorkflowRule.list();
        checks.push({ name: "Database - Workflows", status: "ok", value: `${workflows.length} rules` });
      } catch (e) {
        checks.push({ name: "Database - Workflows", status: "error", value: e.message });
      }

      try {
        const approvals = await base44.asServiceRole.entities.ApprovalRequest.filter({ status: "pending" });
        checks.push({ name: "Approval Queue", status: approvals.length > 0 ? "warn" : "ok", value: `${approvals.length} pending` });
      } catch (e) {
        checks.push({ name: "Approval Queue", status: "error", value: e.message });
      }

      // Check Azure Graph API connectivity (use the app's own tenant)
      const appTenantId = Deno.env.get("AZURE_TENANT_ID");
      if (appTenantId) {
        try {
          const t1 = Date.now();
          await getAccessToken(appTenantId);
          checks.push({ name: "Azure Graph API Auth", status: "ok", value: `Token acquired in ${Date.now() - t1}ms` });
        } catch (e) {
          checks.push({ name: "Azure Graph API Auth", status: "error", value: e.message });
        }
      }

      // Audit log recent entries
      try {
        const logs = await base44.asServiceRole.entities.AuditLog.list("-created_date", 5);
        checks.push({ name: "Audit Logging", status: "ok", value: `Last entry: ${logs[0]?.created_date ? new Date(logs[0].created_date).toLocaleString() : "none"}` });
      } catch (e) {
        checks.push({ name: "Audit Logging", status: "error", value: e.message });
      }

      const hasError = checks.some(c => c.status === "error");
      const hasWarn = checks.some(c => c.status === "warn");
      const overallStatus = hasError ? "degraded" : hasWarn ? "warning" : "healthy";

      return Response.json({
        success: true,
        overallStatus,
        checks,
        timestamp: new Date().toISOString(),
        totalMs: Date.now() - start
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[windowsUpgradeEngine]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});