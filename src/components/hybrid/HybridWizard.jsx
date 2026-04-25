import React, { useState } from "react";
import { CheckCircle2, Circle, ChevronRight, ChevronLeft, ExternalLink, Terminal, Info, AlertTriangle, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const WIZARD_STEPS = [
  {
    id: "prereqs",
    title: "Prerequisites Check",
    subtitle: "Verify your environment meets all Hybrid join requirements",
    icon: "🔍",
    sections: [
      {
        heading: "Domain & Infrastructure",
        items: [
          "Active Directory on-premises domain (Windows Server 2012 R2+)",
          "Azure AD Connect installed and sync configured (v1.5.45+ recommended)",
          "Devices are domain-joined (not just workgroup)",
          "Network access to Azure AD endpoints (login.microsoftonline.com, device.login.microsoftonline.com)",
          "TLS 1.2 enabled on all devices and servers",
        ]
      },
      {
        heading: "Azure / Entra ID",
        items: [
          "Azure AD Premium P1 or P2 license (required for MDM auto-enrollment)",
          "Global Administrator or Hybrid Identity Administrator role",
          "Verified custom domain OR .onmicrosoft.com domain",
          "Entra Connect sync healthy with no critical errors",
        ]
      },
      {
        heading: "Intune (optional but recommended)",
        items: [
          "Microsoft Intune subscription active (M365 Business Premium / E3 / E5)",
          "MDM authority set to Intune in Device Management",
          "Intune auto-enrollment configured (Azure AD → Mobility → MDM & MAM)",
        ]
      }
    ]
  },
  {
    id: "scp",
    title: "Service Connection Point (SCP)",
    subtitle: "Configure SCP so devices can discover the Azure tenant",
    icon: "🔗",
    description: "The Service Connection Point (SCP) is an on-premises AD object that tells domain-joined devices which Azure AD tenant to register with. It must be created in each AD forest.",
    steps: [
      {
        label: "Open Azure AD Connect",
        detail: "On your Azure AD Connect server, launch the Azure AD Connect wizard.",
        powershell: null
      },
      {
        label: "Run Configure Device Options",
        detail: "Select 'Configure device options' → 'Configure Hybrid Azure AD join' → Next.",
        powershell: null
      },
      {
        label: "Select Forest and SCP Config",
        detail: "Choose your AD forest. For SCP authentication, select 'Azure Active Directory' and authenticate with a Global Admin.",
        powershell: null
      },
      {
        label: "Verify SCP via PowerShell",
        detail: "After configuring, verify SCP exists in AD:",
        powershell: `# Run on a Domain Controller
Import-Module ActiveDirectory

$scp = Get-ADObject -Filter {objectClass -eq "serviceConnectionPoint" -and Name -eq "62a0ff2e-97b9-4513-943f-0d221bd30080"} -Properties *
if ($scp) {
    Write-Host "✅ SCP Found:" -ForegroundColor Green
    $scp | Select-Object Name, DistinguishedName
    $scp.keywords
} else {
    Write-Host "❌ SCP NOT found. Re-run Azure AD Connect wizard." -ForegroundColor Red
}`
      }
    ]
  },
  {
    id: "entra_connect",
    title: "Entra Connect Configuration",
    subtitle: "Enable device sync and writeback in Azure AD Connect",
    icon: "⚙️",
    description: "Ensure Entra Connect is configured to sync devices and optionally enable device writeback for Hybrid join.",
    steps: [
      {
        label: "Open Azure AD Connect → Customize sync options",
        detail: "In the wizard, go to 'Optional Features' and ensure 'Device writeback' is checked.",
        powershell: null
      },
      {
        label: "Verify Sync Status via PowerShell",
        detail: "Check the current sync state and last sync time:",
        powershell: `# Run on AAD Connect server
Import-Module ADSync

# Check sync status
Get-ADSyncScheduler

# Force a sync cycle
Start-ADSyncSyncCycle -PolicyType Delta

# Check connector state
Get-ADSyncConnector | Select-Object Name, Type, Version`
      },
      {
        label: "Confirm device objects are syncing",
        detail: "Check Entra ID for synced computer objects:",
        powershell: `# Verify hybrid devices appear in Entra ID (run in Azure Cloud Shell or with Az module)
Connect-AzureAD
$devices = Get-AzureADDevice -Filter "trustType eq 'ServerAd'"
Write-Host "Hybrid joined devices in Entra: $($devices.Count)"
$devices | Select-Object DisplayName, DeviceTrustType, IsManaged | Format-Table`
      }
    ]
  },
  {
    id: "gpo_or_mdm",
    title: "Device Auto-Registration (GPO / MDM)",
    subtitle: "Configure domain devices to auto-register with Azure AD",
    icon: "📋",
    description: "Devices must be configured to automatically register with Azure AD. Use Group Policy (GPO) for domain-joined devices or Windows configuration.",
    options: [
      {
        label: "Option A — Group Policy (recommended for large environments)",
        steps: [
          "Open Group Policy Management Console (GPMC)",
          "Create a new GPO and link it to an OU containing target computers",
          "Navigate to: Computer Configuration → Policies → Administrative Templates → Windows Components → Device Registration",
          "Enable: 'Register domain computers as devices'",
          "Set value to 'Enabled'",
          "Run: gpupdate /force on target devices",
        ],
        powershell: `# Create and link GPO via PowerShell (run on DC)
Import-Module GroupPolicy

$gpoName = "Hybrid Azure AD Join - Auto Registration"
$ou = "OU=Computers,DC=contoso,DC=com"  # Change to your OU

New-GPO -Name $gpoName
New-GPLink -Name $gpoName -Target $ou

# Set the registry key via GPO preference (alternative direct registry method):
$regPath = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WorkplaceJoin"
if (!(Test-Path $regPath)) { New-Item -Path $regPath -Force }
Set-ItemProperty -Path $regPath -Name "autoWorkplaceJoin" -Value 1 -Type DWord

Write-Host "GPO created and linked. Run 'gpupdate /force' on target devices."`
      },
      {
        label: "Option B — Direct Registry (for testing / small environments)",
        steps: [
          "Run the following PowerShell on target devices (as Administrator)",
          "This triggers immediate Azure AD registration attempt",
        ],
        powershell: `# Run on target Windows device (as Administrator)
# Force Azure AD device registration
$regPath = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WorkplaceJoin"
if (!(Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
Set-ItemProperty -Path $regPath -Name "autoWorkplaceJoin" -Value 1 -Type DWord

# Trigger registration immediately
Start-Process "C:\\Windows\\System32\\dsregcmd.exe" -ArgumentList "/join" -Wait -NoNewWindow

# Verify result
Start-Sleep -Seconds 10
$status = dsregcmd /status
$status | Select-String "AzureAdJoined|DomainJoined|WorkplaceJoined"`
      }
    ]
  },
  {
    id: "intune_enroll",
    title: "Intune MDM Enrollment",
    subtitle: "Configure auto-enrollment for Hybrid joined devices",
    icon: "📱",
    description: "Once Hybrid Azure AD Join is working, configure Intune auto-enrollment so devices are automatically managed by Intune.",
    steps: [
      {
        label: "Step 1 — Enable MDM Auto-Enrollment in Azure",
        detail: "Azure Portal → Azure Active Directory → Mobility (MDM and MAM) → Microsoft Intune → MDM User scope: 'All' (or target group)",
        url: "https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/Mobility",
        powershell: null
      },
      {
        label: "Step 2 — Set MDM Authority to Intune",
        detail: "Microsoft Endpoint Manager → Tenant Administration → Tenant Status → MDM Authority must be 'Microsoft Intune'",
        url: "https://intune.microsoft.com/#view/Microsoft_Intune_Enrollment/ManagementStatusBlade",
        powershell: null
      },
      {
        label: "Step 3 — Deploy MDM enrollment via GPO",
        detail: "Push Intune auto-enrollment to hybrid devices using Group Policy:",
        powershell: `# Enable Intune auto-enrollment via GPO registry keys
# Deploy these settings to target computers via GPO Preferences > Registry

$mdmPath = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CurrentVersion\\MDM"
if (!(Test-Path $mdmPath)) { New-Item -Path $mdmPath -Force | Out-Null }

Set-ItemProperty -Path $mdmPath -Name "AutoEnrollMDM" -Value 1 -Type DWord
Set-ItemProperty -Path $mdmPath -Name "UseAADCredentialType" -Value 1 -Type DWord

# Trigger enrollment tasks
$taskNames = @(
  "Schedule #3 created by enrollment client",
  "Schedule created by enrollment client"
)
foreach ($t in $taskNames) {
  $task = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
  if ($task) { Start-ScheduledTask -TaskName $t; Write-Host "Triggered: $t" }
}

Write-Host "MDM auto-enrollment keys set. Device will enroll within 5-15 minutes."`
      },
      {
        label: "Step 4 — Verify enrollment",
        detail: "Check that the device appears in Intune Device Management:",
        powershell: `# Verify device MDM enrollment status on device
$enrolled = (Get-WmiObject -Namespace root/cimv2/mdm/dmmap -Class MDM_DevDetail_Ext01 -Filter "InstanceID='Ext' AND ParentID='./DevDetail'").DeviceName
Write-Host "MDM Enrolled Device: $enrolled"

# Check enrollment via dsregcmd
dsregcmd /status | Select-String "MdmEnrolled|MdmEnrollmentUrl|MDMUrl"`
      }
    ]
  },
  {
    id: "verify",
    title: "Verification & Testing",
    subtitle: "Confirm the full Hybrid join + Intune chain is working",
    icon: "✅",
    steps: [
      {
        label: "Verify Hybrid Join status on device",
        detail: "Run this on any target device to confirm it is Hybrid joined:",
        powershell: '# Full Hybrid Azure AD Join status check\n$status = dsregcmd /status\n\nWrite-Host "=== HYBRID JOIN STATUS ===" -ForegroundColor Cyan\n$status | Select-String "AzureAdJoined|DomainJoined|DeviceId|TenantId|WorkplaceJoined|MdmEnrolled|KeyProvider"\n\n# Check if device appears in Entra ID\n$deviceId = ($status | Select-String "DeviceId").ToString().Split(":")[1].Trim()\nWrite-Host "`nDevice ID: $deviceId" -ForegroundColor Yellow'
      },
      {
        label: "Verify device in Entra ID portal",
        detail: "Portal → Microsoft Entra ID → Devices → All Devices — filter by 'Join Type: Hybrid Azure AD joined'",
        url: "https://portal.azure.com/#view/Microsoft_AAD_IAM/DevicesMenuBlade/~/AllDevices",
        powershell: null
      },
      {
        label: "Verify device in Intune",
        detail: "Microsoft Intune → Devices → All Devices — confirm device appears with enrolled status",
        url: "https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/allDevices",
        powershell: null
      },
      {
        label: "Troubleshooting — Check event logs",
        detail: "If join fails, check Windows event logs:",
        powershell: `# Check device registration event logs
Get-WinEvent -LogName "Microsoft-Windows-User Device Registration/Admin" -MaxEvents 50 |
  Where-Object { $_.LevelDisplayName -in "Error","Warning" } |
  Select-Object TimeCreated, LevelDisplayName, Message |
  Format-List

# Also check AAD join errors
Get-WinEvent -LogName "Microsoft-Windows-AAD/Operational" -MaxEvents 30 |
  Select-Object TimeCreated, LevelDisplayName, Message |
  Format-List`
      }
    ]
  }
];

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-2">
      <pre className="bg-slate-900 text-emerald-300 text-[10px] rounded-lg p-3 overflow-auto max-h-56 whitespace-pre leading-relaxed font-mono">
        {code}
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute top-2 right-2 text-[10px] px-2 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function StepItem({ step, idx }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left"
      >
        <span className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
          {idx + 1}
        </span>
        <span className="text-sm font-medium text-slate-700 flex-1">{step.label}</span>
        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-100">
          <p className="text-xs text-slate-500 pt-3">{step.detail}</p>
          {step.url && (
            <a href={step.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <ExternalLink className="h-3 w-3" />Open in Azure Portal
            </a>
          )}
          {step.powershell && <CodeBlock code={step.powershell} />}
        </div>
      )}
    </div>
  );
}

export default function HybridWizard({ selectedTenant, analysisResult }) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = WIZARD_STEPS[currentStep];

  return (
    <div className="flex gap-6">
      {/* Sidebar nav */}
      <div className="w-56 shrink-0 space-y-1">
        {WIZARD_STEPS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setCurrentStep(i)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
              i === currentStep ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span className="text-base shrink-0">{s.icon}</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-tight truncate">{s.title}</p>
              <p className={`text-[10px] truncate ${i === currentStep ? "text-blue-100" : "text-slate-400"}`}>
                Step {i + 1} of {WIZARD_STEPS.length}
              </p>
            </div>
            {i < currentStep && <CheckCircle2 className="h-3.5 w-3.5 ml-auto shrink-0 text-emerald-400" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{step.icon}</span>
              <h2 className="text-lg font-bold text-slate-900">{step.title}</h2>
              <Badge className="ml-auto text-[10px] bg-blue-100 text-blue-700 border-0">Step {currentStep + 1}/{WIZARD_STEPS.length}</Badge>
            </div>
            <p className="text-sm text-slate-500">{step.subtitle}</p>
          </div>

          {step.description && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {step.description}
            </div>
          )}

          {/* Prerequisites style */}
          {step.sections && step.sections.map(sec => (
            <div key={sec.heading}>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">{sec.heading}</p>
              <ul className="space-y-1.5">
                {sec.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <Circle className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Steps style */}
          {step.steps && (
            <div className="space-y-2">
              {step.steps.map((s, i) => <StepItem key={i} step={s} idx={i} />)}
            </div>
          )}

          {/* Options style */}
          {step.options && step.options.map((opt, oi) => (
            <div key={oi} className="border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-800">{opt.label}</p>
              <ol className="space-y-1">
                {opt.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className="font-bold text-slate-400 shrink-0">{i + 1}.</span>{s}
                  </li>
                ))}
              </ol>
              {opt.powershell && <CodeBlock code={opt.powershell} />}
            </div>
          ))}

          {/* Intune warning */}
          {step.id === "intune_enroll" && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Intune auto-enrollment requires <strong>Azure AD Premium P1 or P2</strong>. Without it, you can still manually enroll devices or use scripts via the Device Scanner tab.</span>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2 border-t border-slate-100">
            <Button variant="outline" onClick={() => setCurrentStep(p => p - 1)} disabled={currentStep === 0} className="gap-2">
              <ChevronLeft className="h-4 w-4" />Previous
            </Button>
            <Button onClick={() => setCurrentStep(p => p + 1)} disabled={currentStep === WIZARD_STEPS.length - 1} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              Next Step<ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}