import React, { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { exportMarkdown, DOC_FORMATS } from "@/utils/markdownExport";

export default function MessageExportButtons({ content, tenantName }) {
  const [busy, setBusy] = useState("");
  if (!content) return null;

  const run = async (format) => {
    if (busy) return;
    setBusy(format);
    try {
      await exportMarkdown(content, {
        format,
        title: "Intune AI Assistant Report",
        subtitle: tenantName || "",
        prefix: "Intune_Report",
      });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex items-center gap-1.5 mt-1.5 pl-1">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">Export</span>
      {DOC_FORMATS.map((f) => {
        const Icon = busy === f.value ? Loader2 : f.value === "pdf" ? Download : FileText;
        return (
          <button
            key={f.value}
            onClick={() => run(f.value)}
            disabled={!!busy}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700 disabled:opacity-60 transition-colors"
          >
            <Icon className={`h-3 w-3 ${busy === f.value ? "animate-spin" : ""}`} />
            {f.value === "pdf" ? "PDF" : "Word"}
          </button>
        );
      })}
    </div>
  );
}