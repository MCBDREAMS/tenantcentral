import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// Copies a DNS record (or a whole record set) to the clipboard so it can be pasted
// straight into the DNS host's zone editor.
export default function CopyButton({ value, label = "Copy", className = "" }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={copy}
      title={label}
      className={`gap-1.5 text-xs h-7 px-2 ${className}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{copied ? "Copied" : label}</span>
    </Button>
  );
}