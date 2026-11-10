import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import LicenseActivation from "@/pages/LicenseActivation";
import { Loader2 } from "lucide-react";

// The activation key lives in this browser only, so a fresh browser, cleared
// storage or a private window used to show the activation screen even though the
// application already holds an active License record. Fall back to that record
// before asking for a key again.
async function entitleApp() {
  const key = localStorage.getItem("tc_license_key");
  if (key) {
    try {
      const res = await base44.functions.invoke("licenseManager", { action: "validate", license_key: key });
      if (res.data?.valid) return true;
    } catch {
      // fall through to the server-side licence record
    }
  }
  try {
    const res = await base44.functions.invoke("licenseManager", { action: "status" });
    if (res.data?.valid) {
      if (res.data.expiryDate) localStorage.setItem("tc_license_expiry", res.data.expiryDate);
      if (res.data.clientName) localStorage.setItem("tc_license_client", res.data.clientName);
      return true;
    }
  } catch {
    // a licence status read failure must not lock the app
    return false;
  }
  return false;
}

export default function LicenseGate({ children }) {
  const [state, setState] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await entitleApp();
      if (!cancelled) setState(ok ? "valid" : "invalid");
    })();
    return () => {
      cancelled = true;
    };
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