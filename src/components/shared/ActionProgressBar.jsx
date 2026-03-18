import React, { useEffect } from "react";
import { CheckCircle2, XCircle, Loader2, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";

/**
 * ActionProgressBar — sticky top bar showing action status.
 * Props:
 *   status: "loading" | "success" | "error" | null
 *   message: string
 *   detail: string (optional subtitle)
 *   progress: number 0-100 (optional, shows indeterminate if null)
 *   onDismiss: () => void
 *   autoDismissMs: number (default 4000ms for success/error)
 */
export default function ActionProgressBar({ status, message, detail, progress, onDismiss, autoDismissMs = 4000 }) {
  useEffect(() => {
    if ((status === "success" || status === "error") && onDismiss) {
      const t = setTimeout(onDismiss, autoDismissMs);
      return () => clearTimeout(t);
    }
  }, [status, onDismiss, autoDismissMs]);

  if (!status) return null;

  const configs = {
    loading: { bg: "bg-blue-600", text: "text-white", border: "border-blue-700", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
    success: { bg: "bg-emerald-600", text: "text-white", border: "border-emerald-700", icon: <CheckCircle2 className="h-4 w-4" /> },
    error:   { bg: "bg-red-600",     text: "text-white", border: "border-red-700",     icon: <XCircle className="h-4 w-4" /> },
  };
  const cfg = configs[status] || configs.loading;

  return (
    <div className={`${cfg.bg} ${cfg.text} ${cfg.border} border-b px-4 py-2.5 flex items-center gap-3 shadow-lg`}>
      {cfg.icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{message}</p>
        {detail && <p className="text-xs opacity-80 mt-0.5 truncate">{detail}</p>}
        {status === "loading" && (
          <div className="mt-1.5">
            {progress != null
              ? <Progress value={progress} className="h-1 bg-white/30 [&>div]:bg-white" />
              : <div className="h-1 w-full bg-white/30 rounded-full overflow-hidden"><div className="h-full w-1/3 bg-white rounded-full animate-pulse" /></div>
            }
          </div>
        )}
      </div>
      {onDismiss && status !== "loading" && (
        <button onClick={onDismiss} className="p-1 rounded hover:bg-white/20 transition-colors shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}