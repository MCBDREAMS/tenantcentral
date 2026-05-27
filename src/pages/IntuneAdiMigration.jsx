import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  ArrowRightLeft, Terminal, Monitor, Loader2, CheckCircle2, XCircle,
  ChevronRight, Download, Upload, RefreshCw, AlertTriangle, Info
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Step indicators
const STEPS = ["Configure Tenants", "Select Data", "Review & Migrate"];

export default function IntuneAdiMigration({ tenants: propTenants }) {
  const [step, setStep] = useState(0);
  const [sourceTenantId, setSourceTenantId] = useState(""); // Azure tenant GUID
  const [targetTenantRecord, setTargetTenantRecord] = useState(null); // full tenant record

  const [scripts, setScripts] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedScripts, setSelectedScripts] = useState([]);
  const [selectedDevices, setSelectedDevices] = useState([]);

  const [loadingScripts, setLoadingScripts] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [dataType, setDataType] = useState("scripts"); // "scripts" | "devices" | "both"

  const { data: allTenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => base44.entities.Tenant.list(),
    initialData: propTenants || [],
  });

  // ── Step 1: Load data from source ──────────────────────────────────────────
  const loadSourceData = async () => {
    setError(null);
    if (dataType === "scripts" || dataType === "both") {
      setLoadingScripts(true);
      const res = await base44.functions.invoke("tenantWrite", {
        action: "list_source_scripts",
        source_tenant_id: sourceTenantId,
        azure_tenant_id: sourceTenantId,
      });
      setScripts(res.data?.scripts || []);
      setSelectedScripts((res.data?.scripts || []).map(s => s.id));
      setLoadingScripts(false);
    }
    if (dataType === "devices" || dataType === "both") {
      setLoadingDevices(true);
      const res = await base44.functions.invoke("tenantWrite", {
        action: "list_source_devices",
        source_tenant_id: sourceTenantId,
        azure_tenant_id: sourceTenantId,
      });
      setDevices(res.data?.devices || []);
      setSelectedDevices((res.data?.devices || []).map(d => d.id));
      setLoadingDevices(false);
    }
    setStep(1);
  };

  // ── Step 2: Run migration ───────────────────────────────────────────────────
  const runMigration = async () => {
    setMigrating(true);
    setError(null);
    const migrationResults = { scripts: null, devices: null };

    if ((dataType === "scripts" || dataType === "both") && selectedScripts.length > 0) {
      const toMigrate = scripts.filter(s => selectedScripts.includes(s.id));
      const res = await base44.functions.invoke("tenantWrite", {
        action: "push_scripts_to_target",
        target_tenant_id: targetTenantRecord.tenant_id,
        azure_tenant_id: targetTenantRecord.tenant_id,
        scripts: toMigrate,
      });
      migrationResults.scripts = res.data?.results || [];
    }

    if ((dataType === "devices" || dataType === "both") && selectedDevices.length > 0) {
      const toMigrate = devices.filter(d => selectedDevices.includes(d.id));
      const res = await base44.functions.invoke("tenantWrite", {
        action: "import_devices_to_target",
        target_tenant_record_id: targetTenantRecord.id,
        azure_tenant_id: targetTenantRecord.tenant_id,
        devices: toMigrate,
      });
      migrationResults.devices = res.data;
    }

    setResults(migrationResults);
    setMigrating(false);
    setStep(2);
  };

  const toggleScript = (id) =>
    setSelectedScripts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleDevice = (id) =>
    setSelectedDevices(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const reset = () => {
    setStep(0); setScripts([]); setDevices([]); setSelectedScripts([]);
    setSelectedDevices([]); setResults(null); setError(null); setSourceTenantId("");
    setTargetTenantRecord(null);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Adidy → Intune Migration"
        subtitle="Migrate PowerShell scripts and device inventory from a source tenant (ADI/Adidy) into a target Intune tenant"
        icon={ArrowRightLeft}
      />

      {/* Step Progress */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => (
          <React.Fragment key={i}>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              i === step ? "bg-blue-600 text-white" : i < step ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
            }`}>
              {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-4 w-4 flex items-center justify-center font-bold">{i + 1}</span>}
              {label}
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-red-700">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── STEP 0: Configure ── */}
      {step === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex gap-2 text-sm text-blue-700">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>The <strong>source tenant</strong> is the Adidy/ADI environment to pull from. The <strong>target tenant</strong> is the Intune tenant to migrate into. Both must have the app's service principal granted <code>DeviceManagementManagedDevices.ReadWrite.All</code> and <code>DeviceManagementConfiguration.ReadWrite.All</code> in Azure.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Source */}
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1 block">
                Source Tenant — Azure Tenant ID (Adidy/ADI)
              </label>
              <input
                value={sourceTenantId}
                onChange={e => setSourceTenantId(e.target.value.trim())}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1">Azure tenant GUID from your Adidy/ADI environment</p>
            </div>

            {/* Target */}
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1 block">
                Target Tenant (Intune destination)
              </label>
              <select
                value={targetTenantRecord?.id || ""}
                onChange={e => setTargetTenantRecord(allTenants.find(t => t.id === e.target.value) || null)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">— Select target tenant —</option>
                {allTenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.domain})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Data type selection */}
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">What to Migrate</label>
            <div className="flex gap-3">
              {[
                { value: "scripts", label: "PowerShell Scripts", icon: Terminal },
                { value: "devices", label: "Device Inventory", icon: Monitor },
                { value: "both", label: "Both", icon: ArrowRightLeft },
              ].map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setDataType(opt.value)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      dataType === opt.value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            onClick={loadSourceData}
            disabled={!sourceTenantId || !targetTenantRecord || loadingScripts || loadingDevices}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            {(loadingScripts || loadingDevices) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Connect & Load Source Data
          </Button>
        </div>
      )}

      {/* ── STEP 1: Select items ── */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Scripts */}
          {(dataType === "scripts" || dataType === "both") && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-slate-500" />
                  PowerShell Scripts
                  <Badge className="bg-blue-100 text-blue-700 border-0">{scripts.length} found</Badge>
                </h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelectedScripts(scripts.map(s => s.id))}>All</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedScripts([])}>None</Button>
                </div>
              </div>
              {scripts.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-400">No scripts found in source tenant</div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {scripts.map(s => (
                    <label key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedScripts.includes(s.id)}
                        onChange={() => toggleScript(s.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      <div className="h-7 w-7 rounded bg-slate-900 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-mono text-emerald-400">PS&gt;</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{s.displayName}</p>
                        <p className="text-xs text-slate-400 truncate">{s.description || "No description"}</p>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{s.runAsAccount || "system"}</Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Devices */}
          {(dataType === "devices" || dataType === "both") && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-slate-500" />
                  Device Inventory
                  <Badge className="bg-blue-100 text-blue-700 border-0">{devices.length} found</Badge>
                </h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelectedDevices(devices.map(d => d.id))}>All</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedDevices([])}>None</Button>
                </div>
              </div>
              {devices.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-400">No devices found in source tenant</div>
              ) : (
                <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                  {devices.map(d => (
                    <label key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDevices.includes(d.id)}
                        onChange={() => toggleDevice(d.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      <Monitor className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{d.deviceName}</p>
                        <p className="text-xs text-slate-400">{d.operatingSystem} · {d.userPrincipalName || "No user"}</p>
                      </div>
                      <Badge
                        className={`text-xs border-0 shrink-0 ${d.complianceState === "compliant" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
                      >
                        {d.complianceState}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
            <Button
              onClick={() => setStep(2)}
              disabled={(dataType === "scripts" || dataType === "both") && selectedScripts.length === 0 && (dataType === "devices" || dataType === "both") && selectedDevices.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              Review Migration <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Review & confirm or show results ── */}
      {step === 2 && !results && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h2 className="font-semibold text-slate-800 text-lg">Migration Summary</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Source</p>
              <p className="text-sm font-mono font-semibold text-slate-800">{sourceTenantId}</p>
              <p className="text-xs text-slate-400">(Adidy / ADI tenant)</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Target</p>
              <p className="text-sm font-semibold text-slate-800">{targetTenantRecord?.name}</p>
              <p className="text-xs text-slate-400">{targetTenantRecord?.domain}</p>
            </div>
          </div>

          <div className="flex gap-4">
            {(dataType === "scripts" || dataType === "both") && (
              <div className="flex items-center gap-2 bg-slate-900 text-emerald-400 rounded-lg px-4 py-2 text-sm font-mono">
                <Terminal className="h-4 w-4" />
                {selectedScripts.length} scripts to migrate
              </div>
            )}
            {(dataType === "devices" || dataType === "both") && (
              <div className="flex items-center gap-2 bg-slate-100 text-slate-700 rounded-lg px-4 py-2 text-sm">
                <Monitor className="h-4 w-4" />
                {selectedDevices.length} devices to import
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            Scripts will be <strong>pushed directly to Intune</strong> in the target tenant via Graph API. Device records will be imported into this app's inventory (not enrolled in Intune). Review selections carefully before proceeding.
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button
              onClick={runMigration}
              disabled={migrating}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              {migrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {migrating ? "Migrating..." : "Start Migration"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {results && (
        <div className="space-y-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-800">Migration Complete</p>
              <p className="text-sm text-emerald-700">Migration from Adidy → {targetTenantRecord?.name} finished.</p>
            </div>
          </div>

          {/* Script results */}
          {results.scripts && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 font-semibold text-slate-800 flex items-center gap-2">
                <Terminal className="h-4 w-4" /> Script Migration Results
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs text-slate-500 font-semibold uppercase">Script Name</th>
                    <th className="px-4 py-2 text-left text-xs text-slate-500 font-semibold uppercase">Status</th>
                    <th className="px-4 py-2 text-left text-xs text-slate-500 font-semibold uppercase">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {results.scripts.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-2.5">
                        {r.success
                          ? <Badge className="bg-emerald-100 text-emerald-700 border-0">Pushed ✓</Badge>
                          : <Badge className="bg-red-100 text-red-700 border-0">Failed</Badge>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{r.id || r.error || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Device results */}
          {results.devices && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
                <Monitor className="h-4 w-4" /> Device Inventory Import
              </p>
              <div className="flex gap-4 text-sm">
                <div className="bg-emerald-50 rounded-lg px-4 py-2 text-emerald-700 font-semibold">{results.devices.imported} imported</div>
                <div className="bg-amber-50 rounded-lg px-4 py-2 text-amber-700 font-semibold">{results.devices.skipped} skipped (already exist)</div>
                <div className="bg-slate-50 rounded-lg px-4 py-2 text-slate-600 font-semibold">{results.devices.total} total</div>
              </div>
            </div>
          )}

          <Button variant="outline" onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Start New Migration
          </Button>
        </div>
      )}
    </div>
  );
}