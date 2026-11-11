import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Tenant dropdown used for both sides of a migration — only connected tenants
// are offered so a project can never point at an unreachable tenant.
export default function ConnectedTenantSelect({ value, onChange, tenants = [], placeholder = "Select a tenant" }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {tenants.map((tenant) => (
          <SelectItem key={tenant.id} value={tenant.id}>
            {tenant.name} {tenant.domain ? `(${tenant.domain})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}