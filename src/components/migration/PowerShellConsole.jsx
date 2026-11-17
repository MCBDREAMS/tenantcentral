import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Terminal, Trash2, Download, ArrowRightLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import PsTranscriptLine from "./PsTranscriptLine";
import PsPromptBar from "./PsPromptBar";
import {
  CLOUD_COMMANDS,
  LOCAL_COMMANDS,
  QUICK_COMMANDS,
  parseCommandLine,
  findCloudCommand,
  findLocalCommand,
  missingParams,
  isPowerShellStatement,
  buildLocalScript,
  buildAdHocScript,
  helpLines,
} from "./psCommands";

const WELCOME = [
  { kind: "info", text: "CloudCommand PowerShell session — migration cmdlets bound to your source and target tenants." },
  { kind: "info", text: "Type Get-Command for every cmdlet, or help for the full reference. Exchange-only tasks return a .ps1 script." },
];

export default function PowerShellConsole({ sourceTenant, targetTenant }) {
  const [side, setSide] = useState("source");
  const [lines, setLines] = useState(WELCOME);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines, busy]);

  const prompt = "PS MIGRATION:" + (side === "target" ? "TARGET" : "SOURCE") + ">";
  const tenantFor = (s) => (s === "target" ? targetTenant : sourceTenant);
  const push = (...entries) => setLines((prev) => [...prev, ...entries]);
  const scriptName = (label) => "cloudcommand-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".ps1";

  const run = async (raw) => {
    const line = String(raw || "").trim();
    if (!line) return;
    setInput("");
    setHistory((h) => [...h, line]);

    const lower = line.toLowerCase();
    if (["clear-host", "cls", "clear"].includes(lower)) {
      setLines([]);
      return;
    }

    push({ kind: "command", prompt, text: line });

    if (["help", "get-help", "get-command"].includes(lower)) {
      push({ kind: "output", text: helpLines().join("\n") });
      return;
    }

    const parsed = parseCommandLine(line);
    if (!parsed) return;

    // -Tenant source|target moves the session to that side, like Connect-MgGraph does.
    const requestedSide = String(parsed.params.tenant || "").toLowerCase();
    const nextSide = requestedSide === "target" || requestedSide === "source" ? requestedSide : side;
    if (nextSide !== side) setSide(nextSide);
    const tenant = tenantFor(nextSide);

    const cloud = findCloudCommand(parsed.verb);
    if (cloud) {
      const missing = missingParams(cloud, parsed.params);
      if (missing.length) {
        push({ kind: "error", text: "Missing required parameter(s): " + missing.map((m) => "-" + m).join(", ") + "\nUsage: " + cloud.usage });
        return;
      }
      if (!tenant?.tenant_id) {
        push({ kind: "error", text: "No " + nextSide + " tenant is bound to this session. Choose both tenants in the Scope step first." });
        return;
      }
      setBusy(true);
      try {
        const res = await base44.functions.invoke("psConsole", {
          action: cloud.action,
          azure_tenant_id: tenant.tenant_id,
          params: parsed.params,
        });
        if (res.data?.error) throw new Error(res.data.error);
        push({ kind: "output", text: (res.data?.lines || []).join("\n") });
      } catch (e) {
        push({ kind: "error", text: e?.response?.data?.error || e.message || "Command failed" });
      } finally {
        setBusy(false);
      }
      return;
    }

    const local = findLocalCommand(parsed.verb);
    if (local) {
      const missing = missingParams(local, parsed.params);
      if (missing.length) {
        push({ kind: "error", text: "Missing required parameter(s): " + missing.map((m) => "-" + m).join(", ") + "\nUsage: " + local.usage });
        return;
      }
      push(
        {
          kind: "info",
          text: local.name + " has no Microsoft 365 cloud equivalent, so the session built a ready-to-run script for " + (tenant?.name || nextSide.toUpperCase()) + ".",
        },
        {
          kind: "script",
          label: local.name,
          filename: scriptName(local.name),
          text: buildLocalScript(local, parsed.params, { side: nextSide, sourceTenant, targetTenant }),
        },
      );
      return;
    }

    if (isPowerShellStatement(line)) {
      push(
        { kind: "info", text: "Not a session cmdlet — wrapped in the tenant connection preamble so it runs unchanged on a Windows host." },
        {
          kind: "script",
          label: "Ad-hoc script",
          filename: "cloudcommand-adhoc.ps1",
          text: buildAdHocScript(line, { side: nextSide, sourceTenant, targetTenant }),
        },
      );
      return;
    }

    push({ kind: "error", text: "'" + parsed.verb + "' is not recognized as a session cmdlet. Type Get-Command to list them." });
  };

  const downloadTranscript = () => {
    const text = lines
      .map((l) => (l.kind === "command" ? l.prompt + " " + l.text : l.text))
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cloudcommand-session.log";
    a.click();
    URL.revokeObjectURL(url);
  };

  const missingTenants = !sourceTenant?.tenant_id || !targetTenant?.tenant_id;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-slate-950 overflow-hidden shadow-sm">
        {/* Session header */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <Terminal className="h-3.5 w-3.5 text-slate-400 ml-1" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">PowerShell session</span>
          <div className="flex items-center gap-1.5 ml-2 text-[11px]">
            <span className={"px-1.5 py-0.5 rounded " + (side === "source" ? "bg-blue-500/20 text-blue-300" : "bg-slate-800 text-slate-400")}>
              {sourceTenant?.name || "source not set"}
            </span>
            <ArrowRightLeft className="h-3 w-3 text-slate-600" />
            <span className={"px-1.5 py-0.5 rounded " + (side === "target" ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400")}>
              {targetTenant?.name || "target not set"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={downloadTranscript}
              className="h-7 px-2 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <Download className="h-3 w-3" /> Transcript
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLines([])}
              className="h-7 px-2 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <Trash2 className="h-3 w-3" /> Clear
            </Button>
          </div>
        </div>

        {/* Transcript */}
        <div className="h-[440px] overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed">
          {lines.map((line, i) => (
            <PsTranscriptLine key={i} line={line} />
          ))}
          {busy && <div className="py-1 text-slate-500">Running…</div>}
          <div ref={endRef} />
        </div>

        <PsPromptBar
          prompt={prompt}
          value={input}
          setValue={setInput}
          onSubmit={run}
          history={history}
          busy={busy}
        />
      </div>

      {missingTenants && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Pick a source and target tenant on the <span className="font-semibold">Scope</span> step — cloud cmdlets run
            against whichever side the session is on.
          </span>
        </div>
      )}

      {/* Quick commands */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd}
            onClick={() => setInput(cmd)}
            className="rounded-md border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            {cmd.trim()}
          </button>
        ))}
        <button
          onClick={() => setInput("Get-Command")}
          className="rounded-md border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          Get-Command
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
        <div className="rounded-lg border bg-card p-3">
          <p className="font-semibold text-foreground mb-1">Runs in the cloud ({CLOUD_COMMANDS.length})</p>
          <p className="font-mono text-[11px] leading-relaxed">{CLOUD_COMMANDS.map((c) => c.name).join(", ")}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="font-semibold text-foreground mb-1">Returns a local script ({LOCAL_COMMANDS.length})</p>
          <p className="font-mono text-[11px] leading-relaxed">{LOCAL_COMMANDS.map((c) => c.name).join(", ")}</p>
        </div>
      </div>
    </div>
  );
}