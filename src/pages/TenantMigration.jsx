import React from "react";
import { ArrowRightLeft } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import MigrationWizard from "@/components/migration/MigrationWizard";

export default function TenantMigration({ selectedTenant, tenants }) {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Tenant-to-Tenant Migration"
        subtitle="Plan a Microsoft 365 cross-tenant migration following Microsoft Learn guidance"
        icon={ArrowRightLeft}
      />
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        This tool runs a feasibility assessment against both the source and target tenants first, producing a gap
        report (users, mailboxes, teams, sites, licensing). Only once the gap report passes does it unlock the phased
        migration plan (Exchange cross-tenant mailbox migration, OneDrive, SharePoint, Teams) following Microsoft
        Learn's cross-tenant migration guidance. Actual content moves use Microsoft Migration Manager or an approved
        ISV tool.
      </div>
      <MigrationWizard tenants={tenants} />
    </div>
  );
}