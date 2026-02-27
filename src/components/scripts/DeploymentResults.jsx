import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import StatusBadge from "@/components/shared/StatusBadge";
import { CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";

export default function DeploymentResults({ scriptId }) {
  const { data: deployments = [], isLoading } = useQuery({
    queryKey: ["deployments", scriptId],
    queryFn: () => base44.entities.ScriptDeployment.filter({ script_id: scriptId }),
    enabled: !!scriptId,
  });

  const counts = {
    success: deployments.filter(d => d.status === "success").length,
    failed: deployments.filter(d => d.status === "failed").length,
    pending: deployments.filter(d => d.status === "pending" || d.status === "running").length,
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  if (!deployments.length) return <p className="text-sm text-slate-400 text-center py-8">No deployments yet</p>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="flex items-center gap-2 bg-emerald-50 rounded-lg px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <div>
            <p className="text-lg font-bold text-emerald-700">{counts.success}</p>
            <p className="text-xs text-emerald-600">Success</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2">
          <XCircle className="h-4 w-4 text-red-500" />
          <div>
            <p className="text-lg font-bold text-red-700">{counts.failed}</p>
            <p className="text-xs text-red-600">Failed</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-2">
          <Clock className="h-4 w-4 text-amber-500" />
          <div>
            <p className="text-lg font-bold text-amber-700">{counts.pending}</p>
            <p className="text-xs text-amber-600">Pending</p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
        {deployments.map(d => (
          <div key={d.id} className="flex items-center justify-between px-4 py-2.5 bg-white">
            <div>
              <p className="text-sm font-medium text-slate-800">{d.device_name}</p>
              {d.result_message && <p className="text-xs text-slate-400 mt-0.5">{d.result_message}</p>}
            </div>
            <div className="flex items-center gap-3">
              {d.deployed_date && <span className="text-xs text-slate-400">{d.deployed_date}</span>}
              <StatusBadge status={d.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}