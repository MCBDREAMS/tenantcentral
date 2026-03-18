import React, { useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, X, Info } from "lucide-react";
import { Progress } from "@/components/ui/progress";

/**
 * ActionProgressBar — fixed sticky bar at bottom of screen showing task progress
 * Props: task, status ("loading"|"success"|"error"|"info"), message, progress (0-100), onDismiss
 */
export default function ActionProgressBar({ task, status, message, progress = 0, onDismiss }) {
  useEffect(() => {
    if (status === "success" || status === "info") {
      const t = setTimeout(() => onDismiss && onDismiss(), 4000);
      return () => clearTimeout(t);
    }
  }, [status]);

  if (!task) return null;

  const configs = {
    loading: {
      bar: "bg-blue-700 border-blue-600",
      icon: <Loader2 className="h-4 w-4 animate-spin text-white shrink-0" />,
      sub: "text-blue-200",
    },
    success: {
      bar: "bg-emerald-700 border-emerald-600",
      icon: <CheckCircle2 className="h-4 w-4 text-white shrink-0" />,
      sub: "text-emerald-200",
    },
    error: {
      bar: "bg-red-700 border-red-600",
      icon: <XCircle className="h-4 w-4 text-white shrink-0" />,
      sub: "text-red-200",
    },
    info: {
      bar: "bg-slate-800 border-slate-700",
      icon: <Info className="h-4 w-4 text-white shrink-0" />,
      sub: "text-slate-300",
    },
  };

  const cfg = configs[status] || configs.info;

  return (
    <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] ${cfg.bar} border text-white rounded-xl shadow-2xl px-5 py-3 min-w-[340px] max-w-xl backdrop-blur`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{cfg.icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{task}</p>
          {message && <p className={`text-xs mt-0.5 ${cfg.sub}`}>{message}</p>}
          {status === "loading" && (
            <Progress value={progress} className="h-1 mt-2 bg-white/20 [&>div]:bg-white" />
          )}
        </div>
        {(status === "success" || status === "error" || status === "info") && onDismiss && (
          <button onClick={onDismiss} className="shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}