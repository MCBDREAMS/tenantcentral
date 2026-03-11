import React from "react";
import { Mail } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import ExchangeMailboxes from "@/components/exchange/ExchangeMailboxes";
import ExchangeGroups from "@/components/exchange/ExchangeGroups";
import ExchangeMailboxRules from "@/components/exchange/ExchangeMailboxRules";
import ExchangeSecurityReport from "@/components/exchange/ExchangeSecurityReport";

export default function PortalExchange({ selectedTenant }) {
  const tenantId = selectedTenant?.tenant_id;

  if (!tenantId) return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Exchange" subtitle="Email management & security" icon={Mail} />
      <div className="text-sm text-slate-500 mt-4 p-6 border border-dashed border-slate-200 rounded-xl text-center">
        Select a tenant from the sidebar to view Exchange data.
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Exchange"
        subtitle={`Email management & security for ${selectedTenant?.name}`}
        icon={Mail}
      />
      <Tabs defaultValue="mailboxes">
        <TabsList className="mb-6">
          <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="rules">Mailbox Rules</TabsTrigger>
          <TabsTrigger value="security">Security Report</TabsTrigger>
        </TabsList>
        <TabsContent value="mailboxes"><ExchangeMailboxes tenantId={tenantId} /></TabsContent>
        <TabsContent value="groups"><ExchangeGroups tenantId={tenantId} /></TabsContent>
        <TabsContent value="rules"><ExchangeMailboxRules tenantId={tenantId} /></TabsContent>
        <TabsContent value="security"><ExchangeSecurityReport tenantId={tenantId} /></TabsContent>
      </Tabs>
    </div>
  );
}