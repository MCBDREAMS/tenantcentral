import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Upload, AlertTriangle, Terminal, Info } from "lucide-react";

const ONBOARD_SCRIPT = `# Intune MDM Auto-Enrollment Script
# Automatically enrolls device into Microsoft Intune MDM
# Requires: Azure AD joined or Hybrid Azure AD joined device

$ErrorActionPreference = "Stop"

Write-Output "Starting Intune enrollment process..."

# Check if device is Azure AD joined
$dsregStatus = dsregcmd /status
$isAzureADJoined = $dsregStatus | Select-String "AzureAdJoined : YES"
$isHybridJoined = $dsregStatus | Select-String "DomainJoined : YES"

if (-not $isAzureADJoined -and -not $isHybridJoined) {
    Write-Error "Device is not Azure AD joined or Hybrid joined. Cannot enroll."
    exit 1
}

# Set MDM enrollment registry keys
$mdmPath = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CurrentVersion\\MDM"
if (!(Test-Path $mdmPath)) { New-Item -Path $mdmPath -Force | Out-Null }
Set-ItemProperty -Path $mdmPath -Name "AutoEnrollMDM" -Value 1 -Type DWord
Set-ItemProperty -Path $mdmPath -Name "UseAADCredentialType" -Value 1 -Type DWord

# Trigger MDM enrollment task
$taskNames = @(
    "Schedule #3 created by enrollment client",
    "Schedule created by enrollment client",
    "Automatic-Device-Join"
)

$triggered = $false
foreach ($taskName in $taskNames) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Start-ScheduledTask -TaskName $taskName
        Write-Output "Triggered enrollment task: $taskName"
        $triggered = $true
        break
    }
}

if (-not $triggered) {
    # Fallback: force MDM enrollment via deviceenroller
    Write-Output "Attempting direct MDM enrollment..."
    Start-Process -FilePath "C:\\Windows\\System32\\deviceenroller.exe" -ArgumentList "/c /AutoEnrollMDM" -Wait
}

Write-Output "Intune enrollment initiated successfully. Device will appear in Intune within 5-15 minutes."
exit 0`;

export default function OnboardIntuneDialog({ device, selectedTenant, onClose }) {
  const [step, setStep] = useState("confirm"); // confirm | deploying | done | error
  const [result, setResult] = useState(null);

  const handleOnboard = async () => {
    setStep("deploying");
    try {
      const res = await base44.functions.invoke("portalData", {
        action: "onboard_device_to_intune",
        azure_tenant_id: selectedTenant?.tenant_id,
        device_id: device.id,
        device_name: device.displayName,
        script_content: ONBOARD_SCRIPT,
      });
      setResult(res.data);
      setStep("done");
    } catch (e) {
      setResult({ error: e.message });
      setStep("error");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Onboard to Intune
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {step === "confirm" && (
            <>
              <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">What this does</p>
                  <p>A PowerShell enrollment script will be deployed via Intune Device Management to <strong>{device.displayName}</strong>. The script configures MDM registry keys and triggers the Intune enrollment task remotely.</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Device</span>
                  <span className="font-medium text-slate-800">{device.displayName}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Tenant</span>
                  <span className="font-medium text-slate-800">{selectedTenant?.name}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">OS</span>
                  <span className="font-medium text-slate-800">{device.operatingSystem || "Windows"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Method</span>
                  <Badge variant="outline" className="text-xs">Remote PowerShell via Intune</Badge>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Device must be Azure AD joined or Hybrid joined. The enrollment process may take 5–15 minutes to complete.</span>
              </div>

              <details className="border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 cursor-pointer bg-slate-50">
                  <Terminal className="h-3.5 w-3.5" />View enrollment script
                </summary>
                <pre className="text-[10px] text-emerald-400 bg-slate-900 p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                  {ONBOARD_SCRIPT}
                </pre>
              </details>
            </>
          )}

          {step === "deploying" && (
            <div className="text-center py-10 space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto" />
              <p className="text-sm font-medium text-slate-700">Deploying enrollment script…</p>
              <p className="text-xs text-slate-400">Creating Intune script deployment for {device.displayName}</p>
            </div>
          )}

          {step === "done" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Enrollment script deployed!</p>
                  <p className="text-xs text-emerald-700 mt-0.5">The script has been pushed to {device.displayName}. The device will enroll into Intune within 5–15 minutes.</p>
                </div>
              </div>
              {result?.scriptId && (
                <div className="border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1">
                  <p><span className="font-medium">Script ID:</span> <span className="font-mono">{result.scriptId}</span></p>
                  {result?.deploymentId && <p><span className="font-medium">Deployment ID:</span> <span className="font-mono">{result.deploymentId}</span></p>}
                </div>
              )}
              {result?.note && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {result.note}
                </div>
              )}
            </div>
          )}

          {step === "error" && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <XCircle className="h-6 w-6 text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-800">Deployment failed</p>
                <p className="text-xs text-red-700 mt-0.5">{result?.error || "An unexpected error occurred."}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "confirm" && (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleOnboard} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                <Upload className="h-4 w-4" />Deploy Enrollment Script
              </Button>
            </>
          )}
          {(step === "done" || step === "error") && (
            <Button onClick={onClose} className="bg-slate-900 hover:bg-slate-800">Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}