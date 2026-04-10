import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import LicenseActivation from "@/pages/LicenseActivation";
import { Loader2 } from "lucide-react";

export default function LicenseGate({ children }) {
  return <>{children}</>;
}