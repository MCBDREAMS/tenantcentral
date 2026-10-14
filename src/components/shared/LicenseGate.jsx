import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import LicenseActivation from "@/pages/LicenseActivation";
import { Loader2 } from "lucide-react";

export default function LicenseGate({ children }) {
  const [state, setState] = useState("loading");

  useEffect(() => {
    (async () => {
      try {
        const key = localStorage.getItem("tc_license_key");
        if (!key) { setState("invalid"); return; }
        const res = await base44.functions.invoke("licenseManager", { action: "validate", license_key: key });
        setState(res.data?.valid ? "valid" : "invalid");
      } catch {
        setState("invalid");
      }
    })();
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
      </div>
    );
  }
  if (state === "invalid") {
    return <LicenseActivation onActivated={() => setState("valid")} />;
  }
  return <>{children}</>;
}