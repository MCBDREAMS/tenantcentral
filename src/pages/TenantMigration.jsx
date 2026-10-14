import React from "react";
import { ArrowRightLeft } from "lucide-react";
import ShareGateConsole from "@/components/migration/ShareGateConsole";

export default function TenantMigration({ selectedTenant, tenants }) {
  return <ShareGateConsole tenants={tenants} />;
}