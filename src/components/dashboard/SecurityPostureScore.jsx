import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import { ShieldCheck, TrendingUp, TrendingDown, Minus, Save, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, subDays } from "date-fns";

// ── Scoring weights (must sum to 100) ────────────────────────────────────────
const WEIGHTS = {
  mfa:        25,   // % of users with MFA enabled/enforced
  policy:     25,   // CA policies: enabled count vs disabled+report-only
  compliance: 25,   // device compliance %
  baseline:   15,   // security baselines deployed vs total
  patch:      10,   // devices checked in within last 30 days (proxy for patch freshness)
};

export function calcPostureScore({ users, policies, devices, baselines }) {
  // MFA score — % of enabled users that have MFA on
  const enabledUsers = users.filter(u => u.account_enabled !== false);
  const mfaOn = enabledUsers.filter(u => u.mfa_status === "enabled" || u.mfa_status === "enforced");
  const mfaScore = enabledUsers.length > 0 ? Math.round((mfaOn.length / enabledUsers.length) * 100) : 0;

  // Policy score — enabled policies vs total (disabled hurts)
  const totalPolicies = policies.length;
  const enabledPolicies = policies.filter(p => p.state === "enabled").length;
  const policyScore = totalPolicies > 0 ? Math.round((enabledPolicies / totalPolicies) * 100) : 50; // 50 if no data

  // Compliance score — compliant devices %
  const compliant = devices.filter(d => d.compliance_state === "compliant").length;
  const complianceScore = devices.length > 0 ? Math.round((compliant / devices.length) * 100) : 50;

  // Baseline score — deployed baselines %
  const deployed = baselines.filter(b => b.state === "deployed").length;
  const baselineScore = baselines.length > 0 ? Math.round((deployed / baselines.length) * 100) : 0;

  // Patch score — devices checked in within 30 days
  const thirtyDaysAgo = subDays(new Date(), 30).toISOString().split("T")[0];
  const recentCheckIn = devices.filter(d => d.last_check_in && d.last_check_in >= thirtyDaysAgo).length;
  const patchScore = devices.length > 0 ? Math.round((recentCheckIn / devices.length) * 100) : 50;

  const aggregate = Math.round(
    (mfaScore * WEIGHTS.mfa +
     policyScore * WEIGHTS.policy +
     complianceScore * WEIGHTS.compliance +
     baselineScore * WEIGHTS.baseline +
     patchScore * WEIGHTS.patch) / 100
  );

  return { score: aggregate, mfaScore, policyScore, complianceScore, baselineScore, patchScore };
}

function scoreColor(score) {
  if (score >= 80) return { text: "text-emerald-600", bg: "bg-emerald-500", ring: "ring-emerald-200", label: "Good", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (score >= 60) return { text: "text-amber-600", bg: "bg-amber-500", ring: "ring-amber-200", label: "Fair", badge: "bg-amber-100 text-amber-700 border-amber-200" };
  return { text: "text-red-600", bg: "bg-red-500", ring: "ring-red-200", label: "Poor", badge: "bg-red-100 text-red-700 border-red-200" };
}

const FACTOR_LABELS = {
  mfaScore:        { label: "MFA Coverage",      weight: WEIGHTS.mfa },
  policyScore:     { label: "CA Policies",        weight: WEIGHTS.policy },
  complianceScore: { label: "Device Compliance",  weight: WEIGHTS.compliance },
  baselineScore:   { label: "Security Baselines", weight: WEIGHTS.baseline },
  patchScore:      { label: "Patch Freshness",    weight: WEIGHTS.patch },
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <p className="text-slate-600">Score: <span className="font-bold text-slate-900">{payload[0]?.value}</span></p>
    </div>
  );
};

export default function SecurityPostureScore({ selectedTenant, users, policies, devices, baselines }) {
  const qc = useQueryClient();
  const tenantId = selectedTenant?.id;
  const tenantName = selectedTenant?.name || "All Tenants";

  const scores = useMemo(
    () => calcPostureScore({ users, policies, devices, baselines }),
    [users, policies, devices, baselines]
  );

  const colors = scoreColor(scores.score);

  // Load historical snapshots
  const { data: snapshots = [] } = useQuery({
    queryKey: ["posture-snapshots", tenantId],
    queryFn: () => tenantId
      ? base44.entities.SecurityPostureSnapshot.filter({ tenant_id: tenantId }, "-snapshot_date", 30)
      : base44.entities.SecurityPostureSnapshot.list("-snapshot_date", 30),
  });

  // Prepare chart data — historical + today
  const chartData = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const historical = [...snapshots]
      .sort((a, b) => a.snapshot_date?.localeCompare(b.snapshot_date))
      .map(s => ({ date: s.snapshot_date?.slice(5), score: s.score })); // MM-DD

    // Replace today's entry if it exists, else append
    const hasTodayInHistory = historical.some(h => snapshots.find(s => s.snapshot_date === today));
    if (!hasTodayInHistory) {
      historical.push({ date: today.slice(5), score: scores.score, isToday: true });
    }
    return historical.slice(-30);
  }, [snapshots, scores.score]);

  // Trend vs last snapshot
  const lastSnapshot = snapshots[0];
  const trend = lastSnapshot ? scores.score - lastSnapshot.score : null;

  const saveMutation = useMutation({
    mutationFn: () => base44.entities.SecurityPostureSnapshot.create({
      tenant_id: tenantId || "all",
      tenant_name: tenantName,
      score: scores.score,
      mfa_score: scores.mfaScore,
      policy_score: scores.policyScore,
      compliance_score: scores.complianceScore,
      baseline_score: scores.baselineScore,
      patch_score: scores.patchScore,
      snapshot_date: format(new Date(), "yyyy-MM-dd"),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posture-snapshots", tenantId] }),
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-600" />
          <h3 className="font-semibold text-slate-900 text-sm">Security Posture Score</h3>
          {tenantId && <span className="text-xs text-slate-400">— {tenantName}</span>}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-xs gap-1.5"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          <Save className="h-3 w-3" />
          {saveMutation.isPending ? "Saving…" : "Save Snapshot"}
        </Button>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score gauge + factors */}
        <div>
          {/* Big score */}
          <div className="flex items-center gap-5 mb-5">
            <div className={`relative h-20 w-20 rounded-full ring-4 ${colors.ring} flex items-center justify-center shrink-0`}>
              <div className={`absolute inset-1 rounded-full ${colors.bg} opacity-10`} />
              <span className={`text-3xl font-bold ${colors.text}`}>{scores.score}</span>
            </div>
            <div>
              <Badge variant="outline" className={`text-xs border mb-1 ${colors.badge}`}>{colors.label}</Badge>
              <p className="text-xs text-slate-500 leading-relaxed">
                Aggregate score across MFA, policies, compliance, baselines &amp; patch freshness.
              </p>
              {trend !== null && (
                <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-500" : "text-slate-400"}`}>
                  {trend > 0 ? <TrendingUp className="h-3 w-3" /> : trend < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                  {trend > 0 ? `+${trend}` : trend} since last snapshot
                </div>
              )}
            </div>
          </div>

          {/* Factor breakdown */}
          <div className="space-y-2.5">
            {Object.entries(FACTOR_LABELS).map(([key, meta]) => {
              const val = scores[key];
              const fc = scoreColor(val);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-600">{meta.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">weight {meta.weight}%</span>
                      <span className={`text-xs font-semibold ${fc.text}`}>{val}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${fc.bg}`}
                      style={{ width: `${val}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1">
            <Info className="h-3 w-3" />
            Based on locally synced data — run a Graph sync for latest accuracy.
          </p>
        </div>

        {/* Trend chart */}
        <div>
          <p className="text-xs font-medium text-slate-600 mb-3">Historical Trend (last 30 snapshots)</p>
          {chartData.length < 2 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
              <TrendingUp className="h-6 w-6 mb-2 text-slate-300" />
              <p>No trend data yet.</p>
              <p className="mt-1">Click <strong>Save Snapshot</strong> periodically to build a history.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <RechartsTooltip content={<CustomTooltip />} />
                <ReferenceLine y={80} stroke="#10b981" strokeDasharray="3 3" strokeWidth={1} label={{ value: "80", position: "right", fontSize: 9, fill: "#10b981" }} />
                <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} label={{ value: "60", position: "right", fontSize: 9, fill: "#f59e0b" }} />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Legend */}
          <div className="flex gap-4 mt-2 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="h-px w-4 bg-emerald-400 inline-block" /> Good ≥80</span>
            <span className="flex items-center gap-1"><span className="h-px w-4 bg-amber-400 inline-block" /> Fair ≥60</span>
            <span className="flex items-center gap-1"><span className="h-px w-4 bg-red-400 inline-block" /> Poor &lt;60</span>
          </div>
        </div>
      </div>
    </div>
  );
}