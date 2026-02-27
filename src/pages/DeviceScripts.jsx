import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Terminal, Plus, Trash2, Rocket, Eye, Copy, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import ScriptEditor from "@/components/scripts/ScriptEditor";
import DeployScriptDialog from "@/components/scripts/DeployScriptDialog";
import DeploymentResults from "@/components/scripts/DeploymentResults";
import { exportToCSV } from "@/components/shared/exportUtils";

const TEMPLATES = [
  {
    script_name: "Auto Enroll - MDM",
    description: "Automatically enroll device into Intune MDM",
    script_type: "powershell",
    category: "enrollment",
    platform: "windows",
    run_as_account: "system",
    run_in_64bit: true,
    script_content: `# Auto MDM Enrollment Script
$enrollmentPath = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CurrentVersion\\MDM"
if (!(Test-Path $enrollmentPath)) {
    New-Item -Path $enrollmentPath -Force | Out-Null
}
Set-ItemProperty -Path $enrollmentPath -Name "AutoEnrollMDM" -Value 1 -Type DWord
Set-ItemProperty -Path $enrollmentPath -Name "UseAADCredentialType" -Value 1 -Type DWord

# Trigger enrollment
$task = Get-ScheduledTask -TaskName "Schedule #3 created by enrollment client"
if ($task) { Start-ScheduledTask -TaskName $task.TaskName }
Write-Output "MDM Auto Enrollment configured successfully."`,
  },
  {
    script_name: "Enable BitLocker",
    description: "Enable BitLocker encryption on system drive",
    script_type: "powershell",
    category: "security",
    platform: "windows",
    run_as_account: "system",
    run_in_64bit: true,
    script_content: `# Enable BitLocker
$drive = $env:SystemDrive
$status = Get-BitLockerVolume -MountPoint $drive
if ($status.ProtectionStatus -eq "Off") {
    Enable-BitLocker -MountPoint $drive -EncryptionMethod XtsAes256 -UsedSpaceOnly -RecoveryPasswordProtector
    Write-Output "BitLocker enabled on $drive"
} else {
    Write-Output "BitLocker already active on $drive"
}`,
  },
  {
    script_name: "Set Timezone & NTP",
    description: "Configure timezone and sync time with NTP server",
    script_type: "powershell",
    category: "configuration",
    platform: "windows",
    run_as_account: "system",
    run_in_64bit: true,
    script_content: `# Set timezone and NTP
Set-TimeZone -Id "UTC"
w32tm /config /manualpeerlist:"time.windows.com" /syncfromflags:manual /reliable:YES /update
net stop w32tm
net start w32tm
w32tm /resync /force
Write-Output "Timezone set to UTC and NTP synced."`,
  },
  {
    script_name: "Install Company Root CA",
    description: "Import and trust the company root certificate authority",
    script_type: "powershell",
    category: "security",
    platform: "windows",
    run_as_account: "system",
    run_in_64bit: true,
    script_content: `# Install Root CA Certificate
# Replace $certPath with actual cert location or download URL
$certPath = "\\\\fileserver\\certs\\CompanyRootCA.cer"
if (Test-Path $certPath) {
    Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\\LocalMachine\\Root
    Write-Output "Root CA certificate installed successfully."
} else {
    Write-Error "Certificate file not found at $certPath"
}`,
  },
  {
    script_name: "Disable Guest Account",
    description: "Ensure the built-in Guest account is disabled",
    script_type: "powershell",
    category: "security",
    platform: "windows",
    run_as_account: "system",
    run_in_64bit: true,
    script_content: `# Disable Guest Account
$guest = Get-LocalUser -Name "Guest" -ErrorAction SilentlyContinue
if ($guest -and $guest.Enabled) {
    Disable-LocalUser -Name "Guest"
    Write-Output "Guest account disabled."
} else {
    Write-Output "Guest account already disabled or not found."
}`,
  },
];

const categoryColors = {
  enrollment: "bg-blue-50 text-blue-700",
  security: "bg-red-50 text-red-700",
  configuration: "bg-violet-50 text-violet-700",
  maintenance: "bg-amber-50 text-amber-700",
  monitoring: "bg-cyan-50 text-cyan-700",
  custom: "bg-slate-100 text-slate-600",
};

const typeIcons = { powershell: "PS>", shell: "$", batch: "bat", python: "py" };

const emptyScript = { script_name: "", description: "", script_type: "powershell", category: "custom", platform: "windows", run_as_account: "system", run_in_64bit: true, enforce_signature_check: false, is_template: false, script_content: "" };

export default function DeviceScripts({ selectedTenant, tenants }) {
  const [tab, setTab] = useState("scripts");
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [viewScript, setViewScript] = useState(null);
  const [deployScript, setDeployScript] = useState(null);
  const [form, setForm] = useState(emptyScript);
  const queryClient = useQueryClient();

  const { data: scripts = [] } = useQuery({
    queryKey: ["scripts", selectedTenant?.id],
    queryFn: () => selectedTenant?.id
      ? base44.entities.DeviceScript.filter({ tenant_id: selectedTenant.id })
      : base44.entities.DeviceScript.list(),
  });

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
  });

  const resolvedTenants = tenants?.length ? tenants : allTenants;

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.DeviceScript.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["scripts"] }); setShowCreate(false); setForm(emptyScript); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.DeviceScript.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scripts"] }),
  });

  const handleSave = () => {
    const tenantId = selectedTenant?.id || resolvedTenants[0]?.id || "";
    createMut.mutate({ ...form, tenant_id: tenantId });
  };

  const useTemplate = (tpl) => {
    const tenantId = selectedTenant?.id || resolvedTenants[0]?.id || "";
    setForm({ ...tpl, is_template: false, tenant_id: tenantId });
    setShowTemplates(false);
    setShowCreate(true);
  };

  const getTenantName = (tid) => resolvedTenants.find(t => t.id === tid)?.name || "Unknown";

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Device Scripts"
        subtitle={selectedTenant ? `Scripts for ${selectedTenant.name}` : "All tenant scripts"}
        icon={Terminal}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowTemplates(true)} className="gap-2">
              <LayoutTemplate className="h-4 w-4" /> Templates
            </Button>
            <Button onClick={() => { setForm({ ...emptyScript, tenant_id: selectedTenant?.id || resolvedTenants[0]?.id || "" }); setShowCreate(true); }} className="gap-2 bg-slate-900 hover:bg-slate-800">
              <Plus className="h-4 w-4" /> New Script
            </Button>
          </div>
        }
      />

      {/* Script Library */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {scripts.map(script => (
          <div key={script.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
                  <span className="text-xs font-mono text-emerald-400">{typeIcons[script.script_type] || ">"}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{script.script_name}</p>
                  <p className="text-xs text-slate-400">{script.platform} · {script.run_as_account}</p>
                </div>
              </div>
              <Badge className={`${categoryColors[script.category] || categoryColors.custom} text-xs border-0`}>
                {script.category}
              </Badge>
            </div>

            {script.description && (
              <p className="text-xs text-slate-500 line-clamp-2">{script.description}</p>
            )}

            <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-2 py-1">
              Tenant: <span className="font-medium text-slate-600">{getTenantName(script.tenant_id)}</span>
            </div>

            <div className="flex gap-2 mt-auto pt-1">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => setViewScript(script)}>
                <Eye className="h-3.5 w-3.5" /> View
              </Button>
              <Button size="sm" className="flex-1 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => setDeployScript(script)}>
                <Rocket className="h-3.5 w-3.5" /> Deploy
              </Button>
              <Button variant="ghost" size="sm" className="px-2" onClick={() => deleteMut.mutate(script.id)}>
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            </div>
          </div>
        ))}
        {scripts.length === 0 && (
          <div className="col-span-3 text-center py-16 text-slate-400">
            <Terminal className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No scripts yet. Create one or use a template.</p>
          </div>
        )}
      </div>

      {/* Create Script Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Script</DialogTitle>
          </DialogHeader>
          <ScriptEditor form={form} onChange={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-slate-900 hover:bg-slate-800">Save Script</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Script + Deployments */}
      <Dialog open={!!viewScript} onOpenChange={() => setViewScript(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewScript?.script_name}</DialogTitle>
          </DialogHeader>
          {viewScript && (
            <Tabs defaultValue="script">
              <TabsList className="bg-slate-100 mb-4">
                <TabsTrigger value="script">Script</TabsTrigger>
                <TabsTrigger value="deployments">Deployment Results</TabsTrigger>
              </TabsList>
              <TabsContent value="script">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-slate-500 text-xs">Type:</span> <span className="font-medium">{viewScript.script_type}</span></div>
                    <div><span className="text-slate-500 text-xs">Platform:</span> <span className="font-medium">{viewScript.platform}</span></div>
                    <div><span className="text-slate-500 text-xs">Category:</span> <span className="font-medium">{viewScript.category}</span></div>
                    <div><span className="text-slate-500 text-xs">Run As:</span> <span className="font-medium">{viewScript.run_as_account}</span></div>
                  </div>
                  {viewScript.description && <p className="text-sm text-slate-600">{viewScript.description}</p>}
                  <pre className="text-xs bg-slate-950 text-emerald-400 rounded-lg p-4 overflow-auto max-h-72 whitespace-pre-wrap">
                    {viewScript.script_content || "# No content"}
                  </pre>
                </div>
              </TabsContent>
              <TabsContent value="deployments">
                <DeploymentResults scriptId={viewScript?.id} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Templates Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Script Templates</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {TEMPLATES.map((tpl, i) => (
              <div key={i} className="flex items-start justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
                    <span className="text-xs font-mono text-emerald-400">{typeIcons[tpl.script_type]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{tpl.script_name}</p>
                    <p className="text-xs text-slate-500">{tpl.description}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge className={`${categoryColors[tpl.category]} text-xs border-0`}>{tpl.category}</Badge>
                      <Badge variant="outline" className="text-xs">{tpl.platform}</Badge>
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => useTemplate(tpl)}>
                  <Copy className="h-3.5 w-3.5" /> Use
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Deploy Dialog */}
      <DeployScriptDialog
        script={deployScript}
        tenants={resolvedTenants}
        open={!!deployScript}
        onClose={() => setDeployScript(null)}
      />
    </div>
  );
}