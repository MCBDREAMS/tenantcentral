import React from "react";
import { Monitor, Wifi, Bot, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function RemoteAssistTab({ device, automateAgentFound }) {
  const deviceName = device?.device_name || device?.deviceName || "";

  const handleRdp = () => {
    const rdpContent = `full address:s:${deviceName}\nauthentication level:i:2\nprompt for credentials:i:1`;
    const blob = new Blob([rdpContent], { type: "application/rdp" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deviceName}.rdp`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Remote connection options for this device.</p>

      {/* RDP */}
      <div className="border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center">
            <Monitor className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Remote Desktop (RDP)</p>
            <p className="text-xs text-slate-400">Download and launch an RDP session to this device</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={handleRdp}>
          <ExternalLink className="h-3.5 w-3.5" /> Connect
        </Button>
      </div>

      {/* Automate / KLive */}
      <div className="border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center">
            <Bot className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">ConnectWise Automate (KLive)</p>
            <p className="text-xs text-slate-400">Launch a KLive view session via Automate agent</p>
            {automateAgentFound === false && (
              <Badge className="bg-red-100 text-red-700 border-0 text-xs mt-1">Agent not detected</Badge>
            )}
            {automateAgentFound === true && (
              <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs mt-1">Agent installed</Badge>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0"
          disabled={automateAgentFound === false}
          onClick={() => window.open(`https://your-automate-server/klive?device=${encodeURIComponent(deviceName)}`, "_blank")}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Launch
        </Button>
      </div>

      {/* Windows Quick Assist */}
      <div className="border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Wifi className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Windows Quick Assist</p>
            <p className="text-xs text-slate-400">Open Microsoft Quick Assist for remote support</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0"
          onClick={() => window.open("ms-quick-assist:", "_blank")}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </Button>
      </div>
    </div>
  );
}