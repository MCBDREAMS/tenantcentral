import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { authMethod } from "@/components/migration/suite/authMethods";
import { methodLabel, roleLabel } from "./credentialMeta";

export default function CredentialRow({ credential, onEdit, onDelete }) {
  const { toast } = useToast();
  const [reveal, setReveal] = useState(false);
  const meta = authMethod(credential.auth_method);
  const secret = credential.client_secret || credential.password || "";
  const identity = credential.client_id || credential.username || "";

  const copy = async (value, label) => {
    await navigator.clipboard.writeText(value);
    toast({ title: `${label} copied` });
  };

  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{credential.label}</p>
            <Badge variant="outline" className="text-[10px]">
              {roleLabel(credential.role)}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{methodLabel(credential.auth_method)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {credential.domain && <span>{credential.domain}</span>}
            {credential.azure_tenant_id && (
              <span className="font-mono text-[11px]">{credential.azure_tenant_id}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(credential)} aria-label="Edit credential">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(credential)} aria-label="Delete credential">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {identity && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-background/70 px-2 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {credential.client_id ? "Client ID" : "User"}
          </span>
          <span className="truncate font-mono text-[11px] text-foreground">{identity}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => copy(identity, credential.client_id ? "Client ID" : "Username")}
            aria-label="Copy identity"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      )}

      {secret && meta.fields.some((f) => f === "client_secret" || f === "password") && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 px-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {credential.client_secret ? "Secret" : "Password"}
          </span>
          <span className="truncate font-mono text-[11px] text-foreground">
            {reveal ? secret : "••••••••••••"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide secret" : "Show secret"}
          >
            {reveal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => copy(secret, credential.client_secret ? "Client secret" : "Password")}
            aria-label="Copy secret"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      )}

      {credential.notes && (
        <p className="mt-1.5 px-2 text-[11px] text-muted-foreground">{credential.notes}</p>
      )}
    </div>
  );
}