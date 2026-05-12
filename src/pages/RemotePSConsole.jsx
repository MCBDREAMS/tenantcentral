import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Terminal, Play, Loader2, CheckCircle2, XCircle, RefreshCw, AlertTriangle,
  ChevronDown, ChevronRight, MonitorSmartphone, Users, Copy, Trash2, Save,
  LayoutTemplate, Send, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/shared/PageHeader";
import { logAction } from "@/components/shared/auditLogger";

const QUICK_SCRIPTS = [
  { label: "Get OS Info", script: `Get-ComputerInfo | Select-Object WindowsProductName, OsVersion, CsName, TotalPhysicalMemory` },
  { label: "Disk Space", script: `Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N='Used(GB)';E={[math]::Round($_.Used/1GB,2)}}, @{N='Free(GB)';E={[math]::Round($_.Free/1GB,2)}}` },
  { label: "Installed Software", script: `Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Select-Object DisplayName, DisplayVersion, Publisher | Sort-Object DisplayName` },
  { label: "Running Services", script: `Get-Service | Where-Object {$_.Status -eq 'Running'} | Select-Object Name, DisplayName, Status | Sort-Object DisplayName` },
  { label: "Local Admins", script: `Get-LocalGroupMember -Group "Administrators" | Select-Object Name, ObjectClass, PrincipalSource` },
  { label: "Pending Reboots", script: `$reboot = $false
if (Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending") { $reboot = $true }
if (Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired") { $reboot = $true }
"Pending Reboot: $reboot"` },
  { label: "BitLocker Status", script: `Get-BitLockerVolume | Select-Object MountPoint, EncryptionMethod, ProtectionStatus, VolumeStatus` },
  { label: "Last 20 Events (Errors)", script: `Get-EventLog -LogName Application -EntryType Error -Newest 20 | Select-Object TimeGenerated, Source, Message | Format-Table -AutoSize` },
  { label: "Network Config", script: `Get-NetIPConfiguration | Select-Object InterfaceAlias, IPv4Address, IPv4DefaultGateway, DNSServer` },
  { label: "Windows Defender Status", script: `Get-MpComputerStatus | Select-Object AMServiceEnabled, AntispywareEnabled, AntivirusEnabled, RealTimeProtectionEnabled, AntivirusSignatureLastUpdated` },
];

function DeviceResult({ result }) {
  const [expanded, setExpanded] = useState(false);
  const success = result.status === "success" || result.success;
  const output = result.output || result.result || result.error || "No output";
  return (
    <div className={`rounded-xl border ${success ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"} overflow-hidden`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-black/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {success ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
        <MonitorSmartphone className="h-3.5 w-3.5 text-slate-500 shrink-0" />
        <span className="text-sm font-medium text-slate-800 flex-1 truncate">{result.deviceName}</span>
        <span className="text-xs text-slate-400">{result.duration ? `${result.duration}ms` : ""}</span>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
      </button>
      {expanded && (
        <div className="px-4 pb-3">
          <pre className="bg-slate-950 text-emerald-300 text-xs rounded-lg p-3 overflow-auto max-h-52 whitespace-pre-wrap font-mono">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function RemotePSConsole({ selectedTenant }) {
  const [script, setScript] = useState(`# Remote PowerShell - runs via Intune Management Extension\nGet-ComputerInfo | Select-Object WindowsProductName, OsVersion, CsName`);
  const [targetMode, setTargetMode] = useState("all"); // "all" | "select"
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [liveDevices, setLiveDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [jobName, setJobName] = useState("");
  const azureTenantId = selectedTenant?.tenant_id;

  const loadDevices = async () => {
    if (!azureTenantId) return;
    setLoadingDevices(true);
    try {
      const res = await base44.functions.invoke("portalData", {
        action: "list_intune_devices",
        azure_tenant_id: azureTenantId,
      });
      setLiveDevices(res.data?.devices || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    if (azureTenantId) loadDevices();
  }, [azureTenantId]);

  const toggleDevice = (id) => {
    setSelectedDevices(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const filteredDevices = liveDevices.filter(d =>
    !deviceSearch || (d.deviceName || "").toLowerCase().includes(deviceSearch.toLowerCase()) ||
    (d.userPrincipalName || "").toLowerCase().includes(deviceSearch.toLowerCase())
  );

  const targetDevices = targetMode === "all"
    ? liveDevices
    : liveDevices.filter(d => selectedDevices.includes(d.id));

  const executeScript = async () => {
    if (!script.trim() || !azureTenantId || targetDevices.length === 0) return;
    setRunning(true);
    setResults(null);

    try {
      const res = await base44.functions.invoke("portalData", {
        action: "execute_ps_script_via_intune",
        azure_tenant_id: azureTenantId,
        script_content: script,
        script_name: jobName || `RemotePS-${Date.now()}`,
        device_ids: targetDevices.map(d => d.id),
        device_names: Object.fromEntries(targetDevices.map(d => [d.id, d.deviceName])),
      });

      setResults(res.data);
      await logAction({
        action: "REMOTE_PS_EXECUTE",
        category: "script",
        tenant_id: selectedTenant?.id,
        tenant_name: selectedTenant?.name,
        target_name: jobName || "Remote PowerShell",
        details: `Targeting ${targetDevices.length} devices`,
        severity: "warning",
      });
    } catch (e) {
      setResults({ success: false, error: e.message, results: [] });
    } finally {
      setRunning(false);
    }
  };

  const copyScript = () => navigator.clipboard.writeText(script);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Remote PowerShell Console"
        subtitle={selectedTenant ? `Execute scripts on Intune-managed devices in ${selectedTenant.name}` : "Select a tenant"}
        icon={Terminal}
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={loadDevices} disabled={loadingDevices || !azureTenantId}>
            {loadingDevices ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh Devices
          </Button>
        }
      />

      {!azureTenantId && (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-2xl text-slate-400">
          <Terminal className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium text-slate-500">Select a tenant to use the remote console</p>
        </div>
      )}

      {azureTenantId && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* ── LEFT: Script Editor ── */}
          <div className="xl:col-span-2 space-y-4">
            {/* Quick Scripts */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                <LayoutTemplate className="h-3.5 w-3.5" /> Quick Scripts
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SCRIPTS.map((qs) => (
                  <button
                    key={qs.label}
                    onClick={() => setScript(qs.script)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
                  >
                    {qs.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Editor */}
            <div className="bg-slate-950 rounded-2xl overflow-hidden border border-slate-800">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-red-500 opacity-70" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500 opacity-70" />
                    <div className="h-3 w-3 rounded-full bg-emerald-500 opacity-70" />
                  </div>
                  <span className="text-xs text-slate-500 ml-2 font-mono">PowerShell</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-slate-400 hover:text-white px-2" onClick={copyScript}>
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
              </div>
              <Textarea
                value={script}
                onChange={e => setScript(e.target.value)}
                className="min-h-52 bg-transparent border-0 text-emerald-300 font-mono text-sm resize-none focus-visible:ring-0 rounded-none placeholder:text-slate-600 p-4"
                placeholder="# Write your PowerShell script here..."
                spellCheck={false}
              />
            </div>

            {/* Job name + Execute */}
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Job Name (optional)</Label>
                <Input value={jobName} onChange={e => setJobName(e.target.value)} placeholder="e.g. BitLocker Audit" className="h-9" />
              </div>
              <Button
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 h-9 px-6 shrink-0"
                onClick={executeScript}
                disabled={running || !script.trim() || targetDevices.length === 0}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? "Running..." : `Run on ${targetDevices.length} Device${targetDevices.length !== 1 ? "s" : ""}`}
              </Button>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl text-xs text-blue-800 border border-blue-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
              <span>Scripts are deployed via the <strong>Intune Management Extension (IME)</strong> as a device management script. Results are collected once Intune syncs the device (typically within 15–30 minutes). Requires <code className="bg-blue-100 px-1 rounded">DeviceManagementConfiguration.ReadWrite.All</code> permission.</span>
            </div>

            {/* Results */}
            {results && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Execution Results</p>
                  <div className="flex gap-2">
                    {results.deployed != null && <Badge className="bg-blue-50 text-blue-700 border-0">{results.deployed} Deployed</Badge>}
                    {results.results?.filter(r => r.success || r.status === "success").length > 0 && (
                      <Badge className="bg-emerald-50 text-emerald-700 border-0">{results.results.filter(r => r.success || r.status === "success").length} OK</Badge>
                    )}
                    {results.results?.filter(r => !r.success && r.status !== "success").length > 0 && (
                      <Badge className="bg-red-50 text-red-700 border-0">{results.results.filter(r => !r.success && r.status !== "success").length} Failed</Badge>
                    )}
                  </div>
                </div>

                {results.error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
                    <p className="font-semibold">Error: {results.error}</p>
                  </div>
                )}

                {results.note && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                    <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{results.note}</span>
                  </div>
                )}

                {results.scriptId && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800">
                    <p className="font-semibold mb-1">✅ Script deployed to Intune</p>
                    <p>Script ID: <code className="bg-emerald-100 px-1 rounded">{results.scriptId}</code></p>
                    <p className="mt-1 text-emerald-700">Devices will execute this script on next Intune sync. Check Intune portal for per-device run status.</p>
                  </div>
                )}

                <div className="space-y-2">
                  {(results.results || []).map((r, i) => <DeviceResult key={i} result={r} />)}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Device Selector ── */}
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                <MonitorSmartphone className="h-3.5 w-3.5" /> Target Devices
              </p>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-3">
                <button
                  onClick={() => setTargetMode("all")}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${targetMode === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  All Devices ({liveDevices.length})
                </button>
                <button
                  onClick={() => setTargetMode("select")}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${targetMode === "select" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  Select ({selectedDevices.length})
                </button>
              </div>

              {targetMode === "select" && (
                <Input
                  placeholder="Filter devices..."
                  value={deviceSearch}
                  onChange={e => setDeviceSearch(e.target.value)}
                  className="h-8 text-xs mb-2"
                />
              )}
            </div>

            {loadingDevices && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}

            {!loadingDevices && liveDevices.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                No devices found. Click Refresh.
              </div>
            )}

            {targetMode === "select" && !loadingDevices && (
              <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">{filteredDevices.length} devices</span>
                  <button onClick={() => setSelectedDevices(selectedDevices.length === liveDevices.length ? [] : liveDevices.map(d => d.id))} className="text-xs text-blue-600 hover:underline">
                    {selectedDevices.length === liveDevices.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                {filteredDevices.map(d => (
                  <label key={d.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <Checkbox checked={selectedDevices.includes(d.id)} onCheckedChange={() => toggleDevice(d.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{d.deviceName}</p>
                      <p className="text-[10px] text-slate-400 truncate">{d.operatingSystem} · {d.userPrincipalName || "No user"}</p>
                    </div>
                    <div className={`h-2 w-2 rounded-full shrink-0 ${d.complianceState === "compliant" ? "bg-emerald-500" : d.complianceState === "noncompliant" ? "bg-red-500" : "bg-amber-400"}`} />
                  </label>
                ))}
              </div>
            )}

            {targetMode === "all" && !loadingDevices && liveDevices.length > 0 && (
              <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
                {liveDevices.slice(0, 50).map(d => (
                  <div key={d.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50">
                    <MonitorSmartphone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{d.deviceName}</p>
                      <p className="text-[10px] text-slate-400 truncate">{d.operatingSystem}</p>
                    </div>
                    <div className={`h-2 w-2 rounded-full shrink-0 ${d.complianceState === "compliant" ? "bg-emerald-500" : d.complianceState === "noncompliant" ? "bg-red-500" : "bg-amber-400"}`} />
                  </div>
                ))}
                {liveDevices.length > 50 && <p className="text-xs text-slate-400 text-center py-1">+{liveDevices.length - 50} more devices</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}