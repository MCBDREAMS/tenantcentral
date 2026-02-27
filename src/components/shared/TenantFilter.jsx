import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";

export default function TenantFilter({ tenants, selectedTenantId, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-slate-400" />
      <Select value={selectedTenantId || "all"} onValueChange={onChange}>
        <SelectTrigger className="w-48 h-9 text-sm">
          <SelectValue placeholder="Filter by tenant" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Tenants</SelectItem>
          {tenants?.map(t => (
            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}