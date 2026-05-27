import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const RISK_COLORS = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high:     "bg-orange-100 text-orange-800 border-orange-200",
  medium:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  low:      "bg-slate-100 text-slate-700 border-slate-200",
};

const STATUS_COLORS = {
  pending:          "bg-amber-100 text-amber-800",
  approved:         "bg-green-100 text-green-800",
  rejected:         "bg-red-100 text-red-800",
  expired:          "bg-slate-100 text-slate-500",
  executed:         "bg-blue-100 text-blue-800",
  execution_failed: "bg-red-200 text-red-900",
};

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function expiresIn(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h left`;
}

function RequestCard({ req, onApprove, onReject, currentUserEmail }) {
  const [expanded, setExpanded] = useState(false);
  const isSelf = req.requested_by === currentUserEmail;

  let payload = {};
  try { payload = JSON.parse(req.action_payload || "{}"); } catch {}

  let affectedDevices = [];
  try { affectedDevices = JSON.parse(req.affected_devices || "[]"); } catch {}

  const expiry = expiresIn(req.expires_at);

  return (
    <div className={`border rounded-xl overflow-hidden ${req.risk_level === "critical" ? "border-red-300" : "border-slate-200"}`}>
      <div className="flex items-start gap-4 p-4 bg-white">
        <div className={`mt-1 px-2 py-0.5 rounded-md border text-xs font-bold uppercase ${RISK_COLORS[req.risk_level] || RISK_COLORS.medium}`}>
          {req.risk_level}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 text-sm">{req.action_type?.replace(/_/g, " ").toUpperCase()}</span>
            {req.tenant_name && <span className="text-xs text-slate-500">· {req.tenant_name}</span>}
            {expiry && <span className={`text-xs font-medium ${expiry === "Expired" ? "text-red-600" : "text-amber-600"}`}><Clock className="inline h-3 w-3 mr-0.5" />{expiry}</span>}
          </div>
          <p className="text-xs text-slate-600 mt-0.5">{req.description}</p>
          <p className="text-xs text-slate-400 mt-1">Requested by <strong>{req.requested_by}</strong> · {timeAgo(req.requested_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {req.status === "pending" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-green-700 border-green-300 hover:bg-green-50"
                disabled={isSelf}
                title={isSelf ? "Cannot approve your own request" : "Approve"}
                onClick={() => onApprove(req)}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-700 border-red-300 hover:bg-red-50"
                onClick={() => onReject(req)}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
            </>
          )}
          {req.status !== "pending" && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[req.status] || ""}`}>
              {req.status}
            </span>
          )}
          <button onClick={() => setExpanded(v => !v)} className="p-1 text-slate-400 hover:text-slate-700">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-0 bg-slate-50 border-t border-slate-100 text-xs space-y-2">
          {affectedDevices.length > 0 && (
            <div>
              <p className="font-semibold text-slate-600 mb-1">Affected Devices ({affectedDevices.length})</p>
              <div className="flex flex-wrap gap-1">
                {affectedDevices.map((d, i) => (
                  <span key={i} className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700">{d.deviceName || d.deviceId}</span>
                ))}
              </div>
            </div>
          )}
          {req.action_payload && (
            <div>
              <p className="font-semibold text-slate-600 mb-1">Payload</p>
              <pre className="bg-white border border-slate-200 rounded p-2 text-slate-700 overflow-auto max-h-32 whitespace-pre-wrap">{JSON.stringify(payload, null, 2)}</pre>
            </div>
          )}
          {req.rejection_reason && (
            <div className="text-red-700"><strong>Rejection reason:</strong> {req.rejection_reason}</div>
          )}
          {req.execution_result && (
            <div>
              <p className="font-semibold text-slate-600 mb-1">Execution Result</p>
              <pre className="bg-white border border-slate-200 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap">{req.execution_result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApprovalQueue({ selectedTenant }) {
  const qc = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  React.useEffect(() => {
    base44.auth.me().then(u => setCurrentUser(u)).catch(() => {});
  }, []);

  // Approval requests may have empty tenant_id (created by automated remediations),
  // so always fetch ALL pending/history and filter client-side if a tenant is selected.
  const { data: pending = [], isLoading: loadingPending, refetch } = useQuery({
    queryKey: ["approvals-pending"],
    queryFn: () => base44.entities.ApprovalRequest.filter({ status: "pending" }, "-requested_at", 50),
    refetchInterval: 30000,
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ["approvals-history"],
    queryFn: () => base44.entities.ApprovalRequest.list("-requested_at", 100),
  });

  const approveMutation = useMutation({
    mutationFn: (req) => base44.functions.invoke("approvalEngine", {
      action: "approve",
      request_id: req.id,
      approver_email: currentUser?.email,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ req, reason }) => base44.functions.invoke("approvalEngine", {
      action: "reject",
      request_id: req.id,
      approver_email: currentUser?.email,
      rejection_reason: reason,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      setRejectTarget(null);
      setRejectReason("");
    },
  });

  const criticalCount = pending.filter(r => r.risk_level === "critical").length;
  const highCount = pending.filter(r => r.risk_level === "high").length;

  const historyItems = history.filter(r => r.status !== "pending");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Approval Queue"
        subtitle="Review and act on pending high-risk actions"
        icon={Shield}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        }
      />

      {/* Summary Row */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          <Clock className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-800">{pending.length} Pending</span>
        </div>
        {criticalCount > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-semibold text-red-800">{criticalCount} Critical</span>
          </div>
        )}
        {highCount > 0 && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-semibold text-orange-800">{highCount} High Risk</span>
          </div>
        )}
        {currentUser && (
          <div className="ml-auto text-xs text-slate-400 flex items-center gap-1">
            <Shield className="h-3 w-3" /> Approving as <strong className="text-slate-600">{currentUser.email}</strong>
          </div>
        )}
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="mb-4">
          <TabsTrigger value="pending">Pending {pending.length > 0 && <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 rounded-full">{pending.length}</span>}</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {loadingPending && <p className="text-sm text-slate-400">Loading...</p>}
          {!loadingPending && pending.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">No pending approvals</p>
              <p className="text-xs text-slate-400 mt-1">All actions have been reviewed</p>
            </div>
          )}
          <div className="space-y-3">
            {/* Critical first */}
            {[...pending].sort((a, b) => {
              const order = { critical: 0, high: 1, medium: 2, low: 3 };
              return (order[a.risk_level] ?? 4) - (order[b.risk_level] ?? 4);
            }).map(req => (
              <RequestCard
                key={req.id}
                req={req}
                currentUserEmail={currentUser?.email}
                onApprove={(r) => approveMutation.mutate(r)}
                onReject={(r) => { setRejectTarget(r); setRejectReason(""); }}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history">
          {loadingHistory && <p className="text-sm text-slate-400">Loading...</p>}
          {!loadingHistory && historyItems.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No history yet</p>
          )}
          <div className="space-y-3">
            {historyItems.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                currentUserEmail={currentUser?.email}
                onApprove={() => {}}
                onReject={() => {}}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={() => setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Action</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 mb-2">
            Rejecting: <strong>{rejectTarget?.action_type?.replace(/_/g, " ").toUpperCase()}</strong>
            {rejectTarget?.tenant_name && ` for ${rejectTarget.tenant_name}`}
          </p>
          <Textarea
            placeholder="Reason for rejection (required)..."
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => rejectMutation.mutate({ req: rejectTarget, reason: rejectReason })}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}