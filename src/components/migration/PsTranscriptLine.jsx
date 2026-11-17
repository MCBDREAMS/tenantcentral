import React, { useState } from "react";
import { Copy, Check, Download, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** One line of the PowerShell transcript. */
export default function PsTranscriptLine({ line }) {
  const [copied, setCopied] = useState(false);

  if (line.kind === "command") {
    return (
      <div className="whitespace-pre-wrap break-words py-0.5">
        <span className="text-emerald-400">{line.prompt}</span>{" "}
        <span className="text-white font-semibold">{line.text}</span>
      </div>
    );
  }

  if (line.kind === "error") {
    return <pre className="whitespace-pre-wrap break-words text-red-400 py-0.5">{line.text}</pre>;
  }

  if (line.kind === "info") {
    return <pre className="whitespace-pre-wrap break-words text-sky-300/90 py-0.5">{line.text}</pre>;
  }

  if (line.kind === "script") {
    const copy = async () => {
      await navigator.clipboard.writeText(line.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };
    return (
      <div className="my-2 rounded-lg border border-slate-700 bg-slate-900/80">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
          <FileCode2 className="h-3.5 w-3.5 text-amber-300" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">{line.label}</span>
          <span className="text-[11px] text-slate-500">• run locally</span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={copy}
              className="h-6 px-2 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadText(line.text, line.filename || "cloudcommand.ps1")}
              className="h-6 px-2 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <Download className="h-3 w-3" />
              .ps1
            </Button>
          </div>
        </div>
        <pre className="max-h-72 overflow-auto px-3 py-2 whitespace-pre text-[11.5px] leading-relaxed text-slate-200">
          {line.text}
        </pre>
      </div>
    );
  }

  return <pre className="whitespace-pre-wrap break-words text-slate-300 py-1">{line.text}</pre>;
}