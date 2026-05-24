import React, { useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Check } from "lucide-react";

/**
 * MobileSelect — renders as a Radix Select on desktop and a bottom-sheet Drawer on mobile.
 *
 * Props:
 *   value, onValueChange, placeholder, triggerClassName, label
 *   options: Array<{ value: string, label: string }>
 *   children: if provided, used as SelectItems on desktop (ignored on mobile — use options array)
 */
export default function MobileSelect({ value, onValueChange, placeholder, triggerClassName, label, options = [], children }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder ?? "Select…";

  if (!isMobile) {
    return (
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {children ?? options.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center justify-between w-full px-3 py-2 rounded-md border border-input bg-background text-sm shadow-sm min-h-[44px] ${triggerClassName ?? ""}`}
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>{selectedLabel}</span>
        <svg className="h-4 w-4 opacity-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4M8 15l4 4 4-4" />
        </svg>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          {label && (
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-sm">{label}</DrawerTitle>
            </DrawerHeader>
          )}
          <div className="px-4 pb-8 max-h-[60vh] overflow-y-auto">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                className="flex items-center justify-between w-full px-3 py-3.5 rounded-lg text-sm text-left hover:bg-slate-100 active:bg-slate-200 transition-colors border-b border-slate-100 last:border-0 min-h-[44px]"
                onClick={() => { onValueChange(o.value); setOpen(false); }}
              >
                <span className="font-medium">{o.label}</span>
                {o.value === value && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}