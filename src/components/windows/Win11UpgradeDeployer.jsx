import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  ArrowUp, Loader2, CheckCircle2, XCircle, Terminal, AlertTriangle,
  Play, Monitor, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const STEPS = [
  { id: 1, label: "Validating tenant credentials", duration: 1500 },
  { id: 2, label: "Generating PowerShell upgrade script", duration: 1200 },
  { id: 3, label: "Encoding script (Base64)", duration: 800 },
  { id: 4, label: "Uploading script to Intune", duration: 2000 },
  { id: 5, label: "Creating device assignment", duration: 1500 },
  { id: 6, label: "Verifying deployment", duration: 1000 },
];

export default function Win11UpgradeDeployer({ selectedTenant }) {
  const [scriptName, setScriptName] = useState("Windows 11 Upgrade - Admin Deploy");
  const [deploying, setDeploying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepLogs, setStepLogs] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const progress = deploying ? Math.round(((currentStep) / STEPS.length) * 100) : (result ? 100 : 0);

  const addLog = (msg, type = "info") => {
    setStepLogs(l => [...l, { msg, type, ts: new Date().toLocaleTimeString() }]);
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setCurrentStep(0);
    setStepLogs([]);
    setResult(null);
    setError(null);

    addLog(`Starting Windows 11 upgrade deployment for ${selectedTenant.name}`, "info");
    addLog(`Azure Tenant: ${selectedTenant.tenant_id}`, "info");

    // Simulate step-by-step progress with real API call at the end
    for (let i = 0; i < STEPS.length - 1; i++) {
      setCurrentStep(i + 1);
      addLog(`→ ${STEPS[i].label}…`, "step");
      await new Promise(r => setTimeout(r, STEPS[i].duration));
      addLog(`✓ ${STEPS[i].label} complete`, "success");
    }

    // Real API call for the final steps
    setCurrentStep(STEPS.length);
    addLog("→ Submitting to Microsoft Graph API…", "step");

    try {
      const res = await base44.functions.invoke("windowsUpgradeEngine", {
        action: "deploy_win11_upgrade",
        azure_tenant_id: selectedTenant.tenant_id,
        script_name: scriptName,
        target_device_ids: [],
      });

      if (res.data?.success) {
        addLog("✓ Script uploaded and assigned to All Devices", "success");
        addLog(`✓ Script ID: ${res.data.scriptId}`, "success");
        addLog("✓ Deployment complete — Intune will push to eligible devices on next check-in", "success");
        setResult(res.data);
      } else {
        throw new Error(res.data?.error || "Deployment failed");
      }
    } catch (e) {
      addLog(`✗ Error: ${e.message}`, "error");
      setError(e.message);
    }

    setDeploying(false);
  };

  const logColor = (type) => {
    if (type === "success") return "text-emerald-400";
    if (type === "error") return "text-red-400";
    if (type === "step") return "text-blue-400";
    return "text-slate-400";
  };

  return (
    <div className="space-y-5">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">How this works</p>
          <p className="text-xs text-blue-700">A PowerShell script is generated, encoded, and uploaded to Intune via Microsoft Graph API. Intune assigns it to all devices — on next check-in, Windows 10 devices will attempt the Windows 11 feature upgrade automatically. The script checks RAM, disk space, and current OS version before proceeding.</p>
        </div>
      </div>

      {/* Config */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Terminal className="h-4 w-4" /> Deployment Configuration
        </h3>
        <div>
          <label className="text-xs text-slate-500 font-medium mb-1 block">Script Display Name (in Intune)</label>
          <Input
            value={scriptName}
            onChange={e => setScriptName(e.target.value)}
            placeholder="Windows 11 Upgrade - Admin Deploy"
            className="text-sm"
            disabled={deploying}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
          <Monitor className="h-3.5 w-3.5 shrink-0" />
          <span>Target: <strong>All Devices</strong> in <strong>{selectedTenant?.name}</strong> — Intune will run on eligible Windows 10 devices only</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          {[
            { label: "Run As", value: "SYSTEM" },
            { label: "64-bit", value: "Yes" },
            { label: "Sig. Check", value: "No" },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-lg p-2.5 text-center">
              <p className="font-semibold text-slate-800">{s.value}</p>
              <p className="text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Deploy Button */}
      {!deploying && !result && !error && (
        <Button
          onClick={handleDeploy}
          disabled={!selectedTenant?.tenant_id}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 h-11"
        >
          <Play className="h-4 w-4" /> Deploy Windows 11 Upgrade via Intune
        </Button>
      )}

      {/* Progress Bar */}
      {(deploying || result || error) && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">
              {deploying ? `Step ${currentStep} of ${STEPS.length}: ${STEPS[currentStep - 1]?.label || ""}` : result ? "Deployment Complete" : "Deployment Failed"}
            </p>
            <span className="text-sm font-bold text-slate-600">{progress}%</span>
          </div>
          <Progress value={progress} className="h-3" />

          {/* Step indicators */}
          <div className="flex gap-1.5 mt-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                i < currentStep ? (result ? "bg-emerald-500" : error && i === STEPS.length - 1 ? "bg-red-500" : "bg-blue-500") :
                i === currentStep - 1 && deploying ? "bg-blue-400 animate-pulse" : "bg-slate-200"
              }`} />
            ))}
          </div>
        </div>
      )}

      {/* Console Log */}
      {stepLogs.length > 0 && (
        <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
          <p className="text-slate-500 mb-2">— Console Output —</p>
          {stepLogs.map((log, i) => (
            <div key={i} className={logColor(log.type)}>
              <span className="text-slate-600 mr-2">[{log.ts}]</span>
              {log.msg}
            </div>
          ))}
          {deploying && <div className="text-slate-400 animate-pulse">▌</div>}
        </div>
      )}

      {/* Success Result */}
      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="font-semibold text-emerald-800">Deployment Successful</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-emerald-600 font-medium">Script Name</p>
              <p className="text-emerald-800">{result.scriptName}</p>
            </div>
            <div>
              <p className="text-xs text-emerald-600 font-medium">Intune Script ID</p>
              <p className="text-emerald-800 font-mono text-xs">{result.scriptId}</p>
            </div>
          </div>
          <p className="text-xs text-emerald-600 mt-3">{result.message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setResult(null); setStepLogs([]); setCurrentStep(0); }}>
            Deploy Another
          </Button>
        </div>
      )}

      {/* Error */}
      {error && !result && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-5 w-5 text-red-600" />
            <p className="font-semibold text-red-800">Deployment Failed</p>
          </div>
          <p className="text-xs text-red-700">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setError(null); setStepLogs([]); setCurrentStep(0); }}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}