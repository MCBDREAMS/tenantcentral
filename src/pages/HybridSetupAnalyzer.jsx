import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck, Loader2, RefreshCw, Zap, ClipboardList, MonitorSmartphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import HybridAnalysisReport from "@/components/hybrid/HybridAnalysisReport";
import HybridWizard from "@/components/hybrid/HybridWizard";
import HybridDeviceScanner from "@/components/hybrid/HybridDeviceScanner";

export default function HybridSetupAnalyzer({ selectedTenant }) {
  const [tab, setTab] = useState("analyze");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  const azureTenantId = selectedTenant?.tenant_id;

  const runAnalysis = async () => {
    if (!azureTenantId) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await base44.functions.invoke("hybridAnalyzer", {
        action: "analyze_hybrid",
        azure_tenant_id: azureTenantId,
      });
      setAnalysisResult(res.data);
    } catch (e) {
      setAnalysisError(e.message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  if (!azureTenantId) {
    return (
      <div className="p-6">
        <PageHeader title="Hybrid Setup Analyzer" subtitle="Analyze and configure Hybrid Azure AD Join + Intune" icon={ShieldCheck} />
        <div className="text-center py-20 text-slate-400 text-sm">Please select a tenant from the sidebar to begin.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Hybrid Setup Analyzer"
        subtitle={`Hybrid AD Join & Intune readiness — ${selectedTenant?.name}`}
        icon={ShieldCheck}
        actions={
          tab === "analyze" && (
            <Button onClick={runAnalysis} disabled={analyzing} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {analyzing ? "Analysing…" : analysisResult ? "Re-analyse" : "Run Analysis"}
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="analyze" className="gap-2">
            <ClipboardList className="h-4 w-4" />Readiness Analysis
          </TabsTrigger>
          <TabsTrigger value="wizard" className="gap-2">
            <Zap className="h-4 w-4" />Setup Wizard
          </TabsTrigger>
          <TabsTrigger value="scan" className="gap-2">
            <MonitorSmartphone className="h-4 w-4" />Device Scanner
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analyze">
          <HybridAnalysisReport
            result={analysisResult}
            error={analysisError}
            analyzing={analyzing}
            onRun={runAnalysis}
          />
        </TabsContent>

        <TabsContent value="wizard">
          <HybridWizard selectedTenant={selectedTenant} analysisResult={analysisResult} />
        </TabsContent>

        <TabsContent value="scan">
          <HybridDeviceScanner selectedTenant={selectedTenant} />
        </TabsContent>
      </Tabs>
    </div>
  );
}