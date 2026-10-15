import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Plus, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CopyButton from "@/components/dns/CopyButton";

// Registers a new custom domain (DNS name) on the tenant and hands back the ownership
// record to publish at the DNS host before the domain can be verified.
export default function AddDomainDialog({ open, onOpenChange, azureTenantId, onAdded }) {
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const register = async () => {
    const value = domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!value) {
      setError("Enter the domain to register, for example contoso.com");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await base44.functions.invoke("dnsManager", {
        action: "add_domain",
        azure_tenant_id: azureTenantId,
        domain: value,
      });
      setResult(res.data);
      onAdded?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (next) => {
    if (saving) return;
    if (!next) {
      setDomain("");
      setResult(null);
      setError("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register a DNS name</DialogTitle>
          <DialogDescription>
            Adds the custom domain to the tenant in Entra ID. Publish its ownership record at your DNS host, then
            verify the domain.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{result.domain} was added to the tenant and now needs verifying.</span>
            </div>

            {result.verification_records?.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Ownership record
                </div>
                <ul className="divide-y divide-border">
                  {result.verification_records.map((r) => (
                    <li key={`${r.type}-${r.host}-${r.value}`} className="p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-foreground">
                          {r.type} · {r.host}
                        </span>
                        <CopyButton value={`${r.type}\t${r.host}\t${r.value}`} label="" />
                      </div>
                      <p className="font-mono text-xs text-muted-foreground break-all">{r.value}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{result.note}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="new-domain" className="text-sm">
                Domain
              </Label>
              <Input
                id="new-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && register()}
                placeholder="contoso.com"
                className="mt-1.5 font-mono text-sm"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Use the root domain (contoso.com), not a subdomain of it.
              </p>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="break-all">{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={register} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Register domain
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}