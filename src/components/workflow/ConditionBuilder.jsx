import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const FIELDS = [
  { value: "complianceState", label: "Compliance State" },
  { value: "operatingSystem", label: "Operating System" },
  { value: "osVersion", label: "OS Version" },
  { value: "managedDeviceOwnerType", label: "Ownership" },
  { value: "isEncrypted", label: "Is Encrypted" },
  { value: "jailBroken", label: "Jailbroken" },
  { value: "lastSyncDateTime", label: "Last Sync Date" },
  { value: "enrolledDateTime", label: "Enrolled Date" },
  { value: "managementAgent", label: "Management Agent" },
  { value: "model", label: "Device Model" },
  { value: "manufacturer", label: "Manufacturer" },
];

const OPERATORS_BY_FIELD = {
  complianceState: [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "does not equal" },
  ],
  operatingSystem: [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "does not equal" },
    { value: "contains", label: "contains" },
  ],
  osVersion: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
  ],
  managedDeviceOwnerType: [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "does not equal" },
  ],
  isEncrypted: [
    { value: "is_true", label: "is true" },
    { value: "is_false", label: "is false" },
  ],
  jailBroken: [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "does not equal" },
  ],
  lastSyncDateTime: [
    { value: "older_than_days", label: "older than (days)" },
    { value: "within_days", label: "within last (days)" },
  ],
  enrolledDateTime: [
    { value: "older_than_days", label: "older than (days)" },
    { value: "within_days", label: "within last (days)" },
  ],
  default: [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "does not equal" },
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
  ],
};

const VALUE_HINTS = {
  complianceState: ["noncompliant", "compliant", "inGracePeriod", "unknown"],
  operatingSystem: ["Windows", "macOS", "iOS", "Android"],
  managedDeviceOwnerType: ["company", "personal"],
  jailBroken: ["True", "False"],
};

const isNoValueOperator = (op) => ["is_true", "is_false"].includes(op);
const isNumericOperator = (op) => ["older_than_days", "within_days", "gt", "lt"].includes(op);

export default function ConditionBuilder({ conditions, onChange, logic, onLogicChange }) {
  const addCondition = () => {
    onChange([...conditions, { field: "complianceState", operator: "equals", value: "noncompliant" }]);
  };

  const updateCondition = (i, patch) => {
    const updated = conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c);
    // Reset operator/value when field changes
    if (patch.field) {
      const ops = OPERATORS_BY_FIELD[patch.field] || OPERATORS_BY_FIELD.default;
      updated[i] = { ...updated[i], operator: ops[0].value, value: VALUE_HINTS[patch.field]?.[0] || "" };
    }
    onChange(updated);
  };

  const removeCondition = (i) => onChange(conditions.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {conditions.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Match</span>
          {["all", "any"].map(l => (
            <button
              key={l}
              onClick={() => onLogicChange(l)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${logic === l ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
            >
              {l === "all" ? "ALL conditions (AND)" : "ANY condition (OR)"}
            </button>
          ))}
        </div>
      )}

      {conditions.map((cond, i) => {
        const ops = OPERATORS_BY_FIELD[cond.field] || OPERATORS_BY_FIELD.default;
        const hints = VALUE_HINTS[cond.field] || [];
        const noVal = isNoValueOperator(cond.operator);
        const numeric = isNumericOperator(cond.operator);

        return (
          <div key={i} className="flex items-center gap-2 flex-wrap">
            {conditions.length > 1 && (
              <span className="text-xs font-mono text-slate-400 w-8 text-right shrink-0">
                {i === 0 ? "IF" : logic === "all" ? "AND" : "OR"}
              </span>
            )}
            {i === 0 && conditions.length === 1 && (
              <span className="text-xs font-mono text-slate-400 shrink-0">IF</span>
            )}

            {/* Field */}
            <select
              value={cond.field}
              onChange={e => updateCondition(i, { field: e.target.value })}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white min-w-[160px]"
            >
              {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>

            {/* Operator */}
            <select
              value={cond.operator}
              onChange={e => updateCondition(i, { operator: e.target.value })}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white min-w-[140px]"
            >
              {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Value */}
            {!noVal && (
              hints.length > 0 && !numeric ? (
                <select
                  value={cond.value || ""}
                  onChange={e => updateCondition(i, { value: e.target.value })}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white min-w-[130px]"
                >
                  {hints.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              ) : (
                <input
                  type={numeric ? "number" : "text"}
                  value={cond.value || ""}
                  onChange={e => updateCondition(i, { value: e.target.value })}
                  placeholder={numeric ? "days" : "value"}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-28"
                />
              )
            )}

            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => removeCondition(i)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}

      <Button variant="outline" size="sm" className="gap-1.5" onClick={addCondition}>
        <Plus className="h-3.5 w-3.5" /> Add Condition
      </Button>
    </div>
  );
}