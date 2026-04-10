import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import LicenseActivation from "@/pages/LicenseActivation";
import { Loader2 } from "lucide-react";

export default function LicenseGate({ children }) {
  const [status, setStatus] = useState("checking"); // checking | valid | invalid

  const checkLicense = async () => {
    const storedKey = localStorage.getItem("tc_license_key");
    if (!storedKey) { setStatus("invalid"); return; }

    // Quick expiry pre-check from localStorage
    const storedExpiry = localStorage.getItem("tc_license_expiry");
    if (storedExpiry && new Date(storedExpiry) < new Date()) {
      localStorage.removeItem("tc_license_key");
      localStorage.removeItem("tc_license_expiry");
      setStatus("invalid");
      return;
    }

    // Server-side validation
    const res = await base44.functions.invoke("licenseManager", {
      action: "validate",
      license_key: storedKey,
    });
    if (res.data?.valid) {
      setStatus("valid");
    } else {
      localStorage.removeItem("tc_license_key");
      localStorage.removeItem("tc_license_expiry");
      setStatus("invalid");
    }
  };

  useEffect(() => {
    checkLicense();
  }, []);

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (status === "invalid") {
    return <LicenseActivation onActivated={() => setStatus("valid")} />;
  }

  return <>{children}</>;
}