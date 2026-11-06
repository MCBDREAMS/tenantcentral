import React from "react";
import { Server, ShieldCheck, Fingerprint, Info } from "lucide-react";

// Step 1 for an on-premises source: confirms what the agent reported and how the run works.
export default function OnPremSourceStep({ scan }) {
  if (!scan) {
    return (
      <div className="bg-card border rounded-xl p-5 text-sm text-muted-foreground">
        Select an on-premises agent in the Scope step first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Server className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium">{scan.domain}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Agent host {scan.hostname}
              {scan.forest && scan.forest !== scan.domain ? ` · forest ${scan.forest}` : ""}
              {scan.scan_time ? ` · last scan ${new Date(scan.scan_time).toLocaleString()}` : ""}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-center">
          {[
            { label: "AD users", value: scan.user_count || 0 },
            { label: "AD groups", value: scan.group_count || 0 },
            { label: "Status", value: scan.status || "active" },
            { label: "Source type", value: "On-premises" },
          ].map((s) => (
            <div key={s.label} className="border rounded-lg px-2 py-2">
              <div className="text-lg font-semibold capitalize">{s.value}</div>
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border rounded-xl p-5 space-y-3">
        <h3 className="font-medium flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          How an on-premises migration runs
        </h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <Fingerprint className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
            <span>
              Each account is created in the target tenant with its AD <span className="font-medium text-foreground">ObjectGUID
              as the ImmutableID</span>, so the identity stays matched to the on-premises account through cutover.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Accounts and groups are chosen in the next step — pick them one by one or in bulk, and point each at a
              verified target domain. Mailbox and file-share content stays on-prem until that data is moved.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}