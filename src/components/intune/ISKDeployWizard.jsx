import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Rocket, CheckCircle2, XCircle, Loader2, Users, Shield,
  MonitorSmartphone, Settings, ClipboardList, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  { key: "Creating AAD Groups", icon: Users, label: "AAD Groups (Autopilot + Standard)" },
  { key: "Creating Autopilot Profile", icon: MonitorSmartphone, label: "Autopilot Deployment Profile" },
  { key: "Creating Enrollment Status Page (ESP)", icon: ClipboardList, label: "Enrollment Status Page (ESP)" },
  { key: "Creating Compliance Policy", icon: Shield, label: "Windows Compliance Policy (Baseline)" },
  { key: "Creating Defender Security Profile", icon: Shield, label: "Defender Security Settings Profile" },
  { key: "Creating Windows Basic Settings Profile (OneDrive KFM)", icon: Settings, label: "Windows Basic Settings (OneDrive KFM)" },
];

export default function ISKDeployWizard({ azureTenantId, tenantName }) {
  const [config, setConfig] = useState({
    apGroupName: "DEV-WIN-Autopilot",
    stdGroupName: "DEV-WIN-Standard",
    language: "en-US",
    userType: "standard",
  });
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function deploy() {
    setRunning(true);
    setError(null);
    setLog(null);
    setDone(false);
    try {
      const res = await base44.functions.invoke("intuneStarterKit", {
        action: "deploy_full_isk",
        azure_tenant_id: azureTenantId,
        ...config,
      });
      if (res.data?.success) {
        setLog(res.data.log);
        setDone(true);
      } else {
        setError(res.data?.error || "Deployment failed");
      }
    } catch (e) {
      setError(e.message);
    }
    setRunning(false);
  }

  return (
    <div className="space-y-6">
      {/* What will be deployed */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Rocket className="h-4 w-4 text-blue-500" /> What will be deployed to <span className="text-blue-600">{tenantName}</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STEPS.map(s => (
            <div key={s.key} className="flex items-center gap-2 text-sm text-slate-600">
              <s.icon className="h-4 w-4 text-slate-400 shrink-0" />
              {s.label}
            </div>
          ))}
        </div>
      </div>

      {/* Configuration */}
      {!done && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Configuration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-500 uppercase">Autopilot Group Name</span>
              <input
                value={config.apGroupName}
                onChange={e => setConfig(c => ({ ...c, apGroupName: e.target.value }))}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 uppercase">Standard Group Name</span>
              <input
                value={config.stdGroupName}
                onChange={e => setConfig(c => ({ ...c, stdGroupName: e.target.value }))}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 uppercase">Autopilot Language</span>
              <input
                value={config.language}
                onChange={e => setConfig(c => ({ ...c, language: e.target.value }))}
                placeholder="e.g. en-US, de-CH"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 uppercase">User Type</span>
              <select
                value={config.userType}
                onChange={e => setConfig(c => ({ ...c, userType: e.target.value }))}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="standard">Standard User</option>
                <option value="administrator">Administrator</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {/* Deploy Button */}
      {!done && (
        <Button
          onClick={deploy}
          disabled={running}
          className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          size="lg"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          {running ? "Deploying ISK..." : "Deploy Intune Starter Kit"}
        </Button>
      )}

      {/* Live Log */}
      {running && !log && (
        <div className="space-y-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-3 text-sm text-slate-500 animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              {s.label}
            </div>
          ))}
        </div>
      )}

      {/* Result Log */}
      {log && (
        <div className="bg-slate-900 rounded-xl p-4 space-y-2">
          {log.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 text-sm font-mono">
              {entry.status === "done"
                ? <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                : <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
              <div>
                <span className="text-slate-200">{entry.step}</span>
                {entry.detail && <div className="text-emerald-400 text-xs">{entry.detail}</div>}
              </div>
            </div>
          ))}
          {done && (
            <div className="mt-3 pt-3 border-t border-slate-700 text-emerald-400 text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Intune Starter Kit deployed successfully! Your environment is ready.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div><strong>Error:</strong> {error}</div>
        </div>
      )}

      {done && (
        <Button variant="outline" onClick={() => { setDone(false); setLog(null); }}>
          Deploy Again / New Configuration
        </Button>
      )}
    </div>
  );
}