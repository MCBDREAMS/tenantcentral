import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Rocket, CheckCircle2, XCircle, Loader2, ChevronRight,
  Users, Shield, MonitorSmartphone, Settings, Layers, ClipboardList,
  AlertTriangle, Link2
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ISKDeployWizard from "@/components/intune/ISKDeployWizard";
import ISKAssignPolicies from "@/components/intune/ISKAssignPolicies";

export default function IntuneStarterKit({ selectedTenant, tenants }) {
  const azureTenantId = selectedTenant?.tenant_id;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Intune Starter Kit"
        subtitle="Deploy a fully configured Intune baseline environment — Autopilot, ESP, Compliance, Defender, and more."
        icon={Rocket}
      />

      {!azureTenantId ? (
        <div className="mt-8 flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Please select a tenant from the sidebar to use the Intune Starter Kit.
        </div>
      ) : (
        <Tabs defaultValue="full_deploy" className="mt-6">
          <TabsList className="mb-6">
            <TabsTrigger value="full_deploy">
              <Rocket className="h-4 w-4 mr-1.5" /> Full Deployment
            </TabsTrigger>
            <TabsTrigger value="assign">
              <Link2 className="h-4 w-4 mr-1.5" /> Assign Existing Policies
            </TabsTrigger>
          </TabsList>

          <TabsContent value="full_deploy">
            <ISKDeployWizard azureTenantId={azureTenantId} tenantName={selectedTenant?.name} />
          </TabsContent>

          <TabsContent value="assign">
            <ISKAssignPolicies azureTenantId={azureTenantId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}