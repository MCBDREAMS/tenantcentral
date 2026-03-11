import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * QuickSyncButton — triggers a graphSync action for the selected tenant
 * and invalidates react-query cache on success.
 *
 * Props:
 *   selectedTenant  — full Tenant record (needs .id and .tenant_id)
 *   syncAction      — e.g. "sync_users", "sync_policies"
 *   label           — button label (default "Sync")
 *   onSynced        — callback after success (e.g. invalidate query)
 */
export default function QuickSyncButton({ selectedTenant, syncAction, label = "Sync", onSynced }) {
  const [status, setStatus] = useState(null); // null | "loading" | "success" | "error"
  const [errorMsg, setErrorMsg] = useState("");

  const handleSync = async () => {
    if (!selectedTenant?.id || !selectedTenant?.tenant_id) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await base44.functions.invoke("graphSync", {
        action: syncAction,
        tenant_id: selectedTenant.id,
        azure_tenant_id: selectedTenant.tenant_id,
      });
      if (res.data?.success === false) throw new Error(res.data?.error || "Sync failed");
      setStatus("success");
      onSynced && onSynced(res.data);
      setTimeout(() => setStatus(null), 4000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Sync failed");
      setTimeout(() => setStatus(null), 6000);
    }
  };

  if (!selectedTenant?.tenant_id) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={status === "loading"}
        className="gap-1.5 h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
      >
        {status === "loading"
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <RefreshCw className="h-3.5 w-3.5" />}
        {status === "loading" ? "Syncing…" : label}
      </Button>

      {status === "success" && (
        <span className="flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> Synced
        </span>
      )}
      {status === "error" && (
        <span className="flex items-center gap-1 text-xs text-red-600 max-w-[200px] truncate" title={errorMsg}>
          <XCircle className="h-3.5 w-3.5" /> {errorMsg}
        </span>
      )}
    </div>
  );
}