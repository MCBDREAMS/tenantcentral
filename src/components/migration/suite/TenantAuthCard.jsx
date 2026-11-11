import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { AUTH_METHODS, authMethod } from "./authMethods";

export default function TenantAuthCard({ title, subtitle, value, onChange, icon: Icon = KeyRound }) {
  const [reveal, setReveal] = useState(false);
  const meta = authMethod(value.method);
  const set = (key, val) => onChange({ ...value, [key]: val });

  const secretField = (key, label, placeholder) => (
    <div className="space-y-2">
      <Label htmlFor={`${title}-${key}`}>{label}</Label>
      <div className="relative">
        <Input
          id={`${title}-${key}`}
          type={reveal ? "text" : "password"}
          value={value[key] || ""}
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          {title}
        </CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Sign-in method</Label>
          <Select value={value.method} onValueChange={(method) => set("method", method)}>
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
            <Label htmlFor={`${title}-username`}>Username (UPN)</Label>
            <Input
              id={`${title}-username`}
              value={value.username || ""}
              onChange={(e) => set("username", e.target.value)}
              placeholder="svc-migration@contoso.com"
              autoComplete="off"
            />
          </div>
        )}

        {meta.fields.includes("password") && secretField("password", "Password", "••••••••")}

        {meta.fields.includes("client_id") && (
          <div className="space-y-2">
            <Label htmlFor={`${title}-client-id`}>Application (client) ID</Label>
            <Input
              id={`${title}-client-id`}
              value={value.client_id || ""}
              onChange={(e) => set("client_id", e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              autoComplete="off"
            />
          </div>
        )}

        {meta.fields.includes("client_secret") &&
          secretField("client_secret", "Client secret", "Application secret value")}

        {value.method === "interactive" && (
          <p className="rounded-md bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
            No credential is saved. The generated script asks the operator to sign in once per session.
          </p>
        )}
      </CardContent>
    </Card>
  );
}