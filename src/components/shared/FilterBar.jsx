import React, { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ListFilter, X } from "lucide-react";

export const ALL = "all";
export const NONE = "__none__";

export const ENABLED_OPTIONS = [
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
];

export const ARCH_OPTIONS = [
  { value: "64", label: "64-bit" },
  { value: "32", label: "32-bit" },
  { value: "unknown", label: "Not determined" },
];

export const COMPLIANCE_OPTIONS = [
  { value: "compliant", label: "Compliant" },
  { value: "noncompliant", label: "Non-compliant" },
  { value: "inGracePeriod", label: "Grace period" },
  { value: "unknown", label: "Unknown" },
  { value: "error", label: "Error" },
];

export const DEVICE_LIVE_OPTIONS = [
  { value: "1h", label: "Under 1 hour ago" },
  { value: "24h", label: "1-24 hours ago" },
  { value: "7d", label: "1-7 days ago" },
  { value: "30d", label: "7-30 days ago" },
  { value: "old", label: "Over 30 days ago" },
  { value: "never", label: "Never reported" },
];

export const USER_LIVE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "8-30 days ago" },
  { value: "old", label: "Over 30 days ago" },
  { value: "never", label: "Never / unknown" },
];

export function norm(value) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text && text !== "-" ? text : NONE;
}

// Age of a timestamp as a labelled bucket, so a single dropdown can express
// "live now" through to "stale / never reported".
export function liveBucket(value) {
  if (!value) return "never";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "never";
  const age = Date.now() - time;
  if (age < 3600000) return "1h";
  if (age < 86400000) return "24h";
  if (age < 604800000) return "7d";
  if (age < 2592000000) return "30d";
  return "old";
}

// "x64" / "AMD64" / "ARM64" are 64-bit; "x86" / "i386" / plain "ARM" are 32-bit.
// A reported value always wins; otherwise an OS that only ships 64-bit settles it.
export function archInfo(device) {
  const reported = norm(device.processorArchitecture).toLowerCase();
  if (reported !== NONE && reported !== "unknown") {
    const bit = reported.includes("64") || reported.includes("amd64") ? "64" : "32";
    return { value: bit, label: `${bit}-bit`, note: `Reported as ${device.processorArchitecture}` };
  }
  const os = String(device.operatingSystem || "").toLowerCase();
  const version = String(device.osVersion || device.operatingSystemVersion || "");
  if (os === "windows" && Number(version.split(".")[2] || 0) >= 22000) {
    return { value: "64", label: "64-bit", note: "Windows 11 is 64-bit only (architecture not reported)" };
  }
  if (os === "macos") {
    const [major, minor] = version.split(".").map(Number);
    if (major > 10 || (major === 10 && minor >= 15)) {
      return { value: "64", label: "64-bit", note: "macOS 10.15 and later are 64-bit only" };
    }
  }
  if ((os === "ios" || os === "ipados") && Number(version.split(".")[0]) >= 11) {
    return { value: "64", label: "64-bit", note: "iOS 11 and later are 64-bit only" };
  }
  return { value: "unknown", label: "Not determined", note: "Architecture not reported" };
}

export function distinctOptions(records, getter, limit = 40) {
  const counts = new Map();
  (records || []).forEach((record) => {
    const value = getter(record);
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  const options = [...counts.entries()]
    .filter(([value]) => value !== NONE)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([value]) => ({ value, label: value }));
  if (counts.get(NONE)) options.push({ value: NONE, label: "Not reported" });
  return options;
}

export function applyFilters(records, values, getters) {
  const active = Object.entries(values || {}).filter(([, value]) => value && value !== ALL);
  if (active.length === 0) return records;
  return records.filter((record) =>
    active.every(([key, value]) => (getters[key] ? getters[key](record) === value : true))
  );
}

export function activeFilterCount(values) {
  return Object.values(values || {}).filter((value) => value && value !== ALL).length;
}

export function useFilters() {
  const [values, setValues] = useState({});
  const setFilter = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));
  const clear = () => setValues({});
  return { values, setFilter, clear, count: activeFilterCount(values) };
}

// filters: [{ key, label, anyLabel, options: [{ value, label }], width }]
export default function FilterBar({ filters, values, onChange, onClear, right }) {
  const count = activeFilterCount(values);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 shrink-0">
        <ListFilter className="h-3.5 w-3.5" />
        Filters
      </span>
      {(filters || [])
        .filter((filter) => filter.options && filter.options.length > 0)
        .map((filter) => (
          <Select
            key={filter.key}
            value={values[filter.key] || ALL}
            onValueChange={(value) => onChange(filter.key, value)}
          >
            <SelectTrigger className={`h-9 text-sm ${filter.width || "w-40"}`}>
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{filter.anyLabel || `All ${filter.label}`}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      {count > 0 && (
        <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-slate-500" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
      {right && <span className="text-xs text-slate-400 ml-auto shrink-0">{right}</span>}
    </div>
  );
}