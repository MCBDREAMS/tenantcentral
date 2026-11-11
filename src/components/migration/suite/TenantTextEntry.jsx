import React, { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Free-text tenant entry: type any tenant name or domain, with the tenants already
// stored in the app offered as you type so a typed value still links up when it matches.
export default function TenantTextEntry({ id, value, onChange, tenants = [], placeholder }) {
  const [open, setOpen] = useState(false);
  const query = String(value || "").trim().toLowerCase();

  const matches = useMemo(() => {
    return tenants
      .filter(
        (tenant) =>
          !query ||
          String(tenant.name || "").toLowerCase().includes(query) ||
          String(tenant.domain || "").toLowerCase().includes(query) ||
          String(tenant.tenant_id || "").toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [tenants, query]);

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
          {matches.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(tenant.domain || tenant.name);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className="flex-1 truncate">{tenant.name}</span>
              <span className="truncate text-xs text-muted-foreground">{tenant.domain}</span>
              {tenant.status === "connected" && (
                <Badge variant="secondary" className="text-[10px]">
                  connected
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}