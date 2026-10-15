import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, ShieldCheck, Star, Globe } from "lucide-react";

// Every DNS name (custom domain) registered on the tenant, with the Entra ID
// ownership actions available for the selected name.
export default function DomainList({ domains = [], selected, onSelect, canEdit, onVerify, onSetDefault, busy }) {
  if (!domains.length) {
    return <div className="p-6 text-center text-sm text-muted-foreground">No DNS names found for this tenant.</div>;
  }

  return (
    <div className="divide-y divide-border">
      {domains.map((d) => {
        const active = d.id === selected;
        return (
          <div key={d.id} className={`px-3 py-3 transition-colors ${active ? "bg-primary/5" : "hover:bg-muted/50"}`}>
            <button type="button" onClick={() => onSelect(d.id)} className="w-full text-left">
              <div className="flex items-center gap-2">
                <Globe className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-sm font-medium truncate ${active ? "text-primary" : "text-foreground"}`}>
                  {d.name}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pl-5">
                {d.isVerified ? (
                  <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </Badge>
                ) : (
                  <Badge className="gap-1 bg-rose-100 text-rose-700 border-rose-200">
                    <XCircle className="h-3 w-3" /> Unverified
                  </Badge>
                )}
                {d.isDefault && <Badge className="bg-blue-100 text-blue-700 border-blue-200">Default</Badge>}
                {d.isInitial && <Badge className="bg-slate-100 text-slate-600">Initial</Badge>}
                {d.authenticationType === "Federated" && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200">Federated</Badge>
                )}
              </div>
            </button>

            {(canEdit && (!d.isVerified || !d.isDefault)) && (
              <div className="flex items-center gap-1.5 mt-2 pl-5">
                {!d.isVerified && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    disabled={busy === `verify:${d.id}`}
                    onClick={() => onVerify(d.id)}
                  >
                    {busy === `verify:${d.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                    Verify
                  </Button>
                )}
                {d.isVerified && !d.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    disabled={busy === `default:${d.id}`}
                    onClick={() => onSetDefault(d.id)}
                  >
                    {busy === `default:${d.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                    Set default
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}