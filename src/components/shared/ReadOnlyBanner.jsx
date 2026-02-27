import React from "react";
import { Lock } from "lucide-react";

export default function ReadOnlyBanner() {
  return (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg px-4 py-2 mb-4">
      <Lock className="h-3.5 w-3.5 shrink-0" />
      <span><strong>Read-Only Mode</strong> — Your role does not permit changes in this section.</span>
    </div>
  );
}