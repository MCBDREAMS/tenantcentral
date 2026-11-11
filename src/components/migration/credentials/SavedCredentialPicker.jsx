import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KeyRound } from "lucide-react";
import { authFromCredential, matchesRole, methodLabel } from "./credentialMeta";

export default function SavedCredentialPicker({ role, onApply }) {
  const [credentials, setCredentials] = useState([]);
  const [value, setValue] = useState("");

  useEffect(() => {
    base44.entities.TenantCredential
      .list({ sort: "-updated_date", limit: 200 })
      .then((page) => setCredentials(page.items || []))
      .catch(() => setCredentials([]));
  }, []);

  const options = credentials.filter((c) => matchesRole(c, role));
  if (options.length === 0) return null;

  const apply = (id) => {
    setValue(id);
    const credential = credentials.find((c) => c.id === id);
    if (!credential) return;
    onApply(authFromCredential(credential));
    base44.entities.TenantCredential
      .update(id, { last_used_at: new Date().toISOString() })
      .catch(() => {});
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <KeyRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <Select value={value} onValueChange={apply}>
        <SelectTrigger className="h-9 w-full sm:w-72">
          <SelectValue placeholder="Fill from a saved credential" />
        </SelectTrigger>
        <SelectContent>
          {options.map((credential) => (
            <SelectItem key={credential.id} value={credential.id}>
              {credential.label} · {methodLabel(credential.auth_method)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}