import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Eye, EyeOff, Loader2, Save } from "lucide-react";
import { AUTH_METHODS, authMethod } from "@/components/migration/suite/authMethods";
import { CREDENTIAL_ROLES, emptyCredential } from "./credentialMeta";

export default function CredentialFormDialog({ open, onOpenChange, credential, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(emptyCredential());
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(credential ? { ...emptyCredential(), ...credential } : emptyCredential());
    setReveal(false);
  }, [open, credential]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const meta = authMethod(form.auth_method);

  const save = async () => {
    if (!form.label.trim()) {
      toast({ title: "Give this credential a label", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        role: form.role,
        auth_method: form.auth_method,
        azure_tenant_id: form.azure_tenant_id,
        domain: form.domain,
        client_id: form.client_id,
        client_secret: form.client_secret,
        username: form.username,
        password: form.password,
        notes: form.notes,
      };
      if (credential?.id) {
        await base44.entities.TenantCredential.update(credential.id, payload);
      } else {
        await base44.entities.TenantCredential.create(payload);
      }
      toast({ title: credential?.id ? "Credential updated" : "Credential saved" });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Could not save the credential",
        description: e.response?.data?.error || e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const secretInput = (key, label, placeholder) => (
    <div className="space-y-2">
      <Label htmlFor={`cred-${key}`}>{label}</Label>
      <div className="relative">
        <Input
          id={`cred-${key}`}
          type={reveal ? "text" : "password"}
          value={form[key] || ""}
          onChange={(e) => set(key, e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground"
          aria-label={reveal ? "Hide value" : "Show value"}
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{credential?.id ? "Edit credential" : "New credential"}</DialogTitle>
          <DialogDescription>
            Saved accounts appear in the project sign-in form so you can pick the right tenant access in one click.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cred-label">Label</Label>
              <Input
                id="cred-label"
                value={form.label}
                onChange={(e) => set("label", e.target.value)}
                placeholder="Contoso - migration app registration"
              />
            </div>
            <div className="space-y-2">
              <Label>Used for</Label>
              <Select value={form.role} onValueChange={(v) => set("role", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREDENTIAL_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cred-tenant">Azure tenant ID</Label>
              <Input
                id="cred-tenant"
                value={form.azure_tenant_id || ""}
                onChange={(e) => set("azure_tenant_id", e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cred-domain">Domain</Label>
              <Input
                id="cred-domain"
                value={form.domain || ""}
                onChange={(e) => set("domain", e.target.value)}
                placeholder="contoso.com"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sign-in method</Label>
            <Select value={form.auth_method} onValueChange={(v) => set("auth_method", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTH_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{meta.hint}</p>
          </div>

          {meta.fields.includes("username") && (
            <div className="space-y-2">
              <Label htmlFor="cred-username">Username (UPN)</Label>
              <Input
                id="cred-username"
                value={form.username || ""}
                onChange={(e) => set("username", e.target.value)}
                placeholder="svc-migration@contoso.com"
                autoComplete="off"
              />
            </div>
          )}

          {meta.fields.includes("password") && secretInput("password", "Password", "••••••••")}

          {meta.fields.includes("client_id") && (
            <div className="space-y-2">
              <Label htmlFor="cred-client-id">Application (client) ID</Label>
              <Input
                id="cred-client-id"
                value={form.client_id || ""}
                onChange={(e) => set("client_id", e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                autoComplete="off"
              />
            </div>
          )}

          {meta.fields.includes("client_secret") &&
            secretInput("client_secret", "Client secret", "Application secret value")}

          <div className="space-y-2">
            <Label htmlFor="cred-notes">Notes</Label>
            <Textarea
              id="cred-notes"
              value={form.notes || ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Graph and SharePoint permissions consented, secret expires 2027-04."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save credential
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}