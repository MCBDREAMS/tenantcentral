import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  AlertTriangle, CheckCircle2, ShieldAlert, Loader2,
  ExternalLink, Info, ShieldCheck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SEVERITY = {
  critical: { color: "bg-red-50 border-red-200", badge: "bg-red-100 text-red-700", icon: ShieldAlert, iconColor: "text-red-500" },
  warning:  { color: "bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-700", icon: AlertTriangle, iconColor: "text-amber-500" },
  info:     { color: "bg-blue-50 border-blue-200", badge: "bg-blue-100 text-blue-700", icon: Info, iconColor: "text-blue-500" },
};

function evaluateRisks({ d, health, compliancePolicies, protectionState, mfaMethods }) {
  const risks = [];

  // 1. Device compliance
  const state = d.complianceState;
  if (state === "noncompliant") {
    risks.push({
      id: "noncompliant_device",
      severity: "critical",
      title: "Device is Non-Compliant",
      description: "Conditional Access policies may block this device from accessing corporate resources.",
      steps: [
        "Trigger a policy sync from the Updates tab → 'Sync Policies'",
        "Check which specific compliance policy is failing in the Compliance tab",
        "Ensure Intune compliance policy requirements match the device's actual configuration",
        "If in grace period, act before expiry to avoid access loss",
      ],
      link: { label: "View in Intune Portal", url: "https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/compliance" },
    });
  } else if (state === "inGracePeriod") {
    risks.push({
      id: "grace_period",
      severity: "warning",
      title: "Device in Compliance Grace Period",
      description: "The device is currently non-compliant but within the grace period. Access may be blocked after grace period expires.",
      steps: [
        "Investigate and resolve compliance failures before grace period expires",
        `Grace period expiry: ${d.complianceGracePeriodExpirationDateTime || "check Intune"}`,
      ],
    });
  }

  // 2. MFA registration
  if (mfaMethods !== null) {
    const strongMethods = (mfaMethods || []).filter(m =>
      ["microsoftAuthenticatorAuthenticationMethod", "phoneAuthenticationMethod",
       "fido2AuthenticationMethod", "windowsHelloForBusinessAuthenticationMethod",
       "softwareOathAuthenticationMethod"].includes(m["@odata.type"]?.replace("#microsoft.graph.", ""))
    );
    if (mfaMethods && mfaMethods.length === 0) {
      risks.push({
        id: "no_mfa",
        severity: "critical",
        title: "No MFA Methods Registered",
        description: "The primary user has no authentication methods registered. They will be unable to satisfy MFA-required Conditional Access policies.",
        steps: [
          "Direct user to https://aka.ms/mfasetup to register MFA",
          "Ensure the Authentication methods policy allows Microsoft Authenticator",
          "Check if user is excluded from MFA CA policies (which may itself be a risk)",
          "Consider enforcing MFA registration via a CA policy targeting this user",
        ],
        link: { label: "My Sign-ins (user)", url: "https://mysignins.microsoft.com/security-info" },
      });
    } else if (mfaMethods && strongMethods.length === 0) {
      risks.push({
        id: "weak_mfa",
        severity: "warning",
        title: "No Strong MFA Method Registered",
        description: "User has authentication methods but none are considered strong (Authenticator app, FIDO2, Windows Hello). SMS or voice-only MFA is vulnerable to SIM-swap attacks.",
        steps: [
          "Encourage user to register Microsoft Authenticator at https://aka.ms/mfasetup",
          "Consider blocking legacy MFA methods via Authentication Methods policy",
          "Review CA policies to require phishing-resistant MFA for sensitive apps",
        ],
      });
    }
  }

  // 3. Encryption
  if (d.isEncrypted === false) {
    risks.push({
      id: "not_encrypted",
      severity: "critical",
      title: "Device Not Encrypted",
      description: "BitLocker is not enabled. CA device compliance policies typically require encryption.",
      steps: [
        "Enable BitLocker via Intune Endpoint Security → Disk Encryption policy",
        "Or manually: run 'manage-bde -on C:' as Administrator",
        "Verify TPM is enabled and compatible in BIOS/UEFI",
        "After enabling, trigger a compliance sync for the policy to re-evaluate",
      ],
    });
  }

  // 4. Jailbroken / rooted
  if (d.jailBroken === "True") {
    risks.push({
      id: "jailbroken",
      severity: "critical",
      title: "Device is Jailbroken / Rooted",
      description: "Jailbroken devices bypass OS security controls and should be blocked by Conditional Access compliance policies.",
      steps: [
        "Consider retiring/wiping this device from Intune",
        "Ensure compliance policy has 'Jailbroken devices' set to Block",
        "Review CA policy to confirm non-compliant devices are blocked from corporate apps",
        "Investigate how the device was jailbroken and audit user activity",
      ],
    });
  }

  // 5. Not AAD registered
  if (d.aadRegistered === false) {
    risks.push({
      id: "not_aad_registered",
      severity: "warning",
      title: "Device Not Azure AD Registered",
      description: "Conditional Access device-based controls (require compliant device, require hybrid joined) cannot apply to unregistered devices.",
      steps: [
        "Check if Autopilot or manual AAD join is appropriate for this device",
        "For personal devices, ensure the user has joined via Settings → Accounts → Access Work or School",
        "Verify the Intune enrollment profile and AAD join settings",
      ],
    });
  }

  // 6. Defender – real-time protection
  if (protectionState && protectionState.realTimeProtectionEnabled === false) {
    risks.push({
      id: "defender_rtp_off",
      severity: "critical",
      title: "Defender Real-Time Protection Disabled",
      description: "Real-time protection is off, leaving the device vulnerable. This will fail most Defender-based compliance checks.",
      steps: [
        "Re-enable via Windows Security app → Virus & threat protection",
        "Deploy an Intune Endpoint Security Antivirus policy to enforce Defender settings",
        "Run a Quick Scan from the Updates tab to check for existing threats",
      ],
    });
  }

  // 7. Defender – signature out of date
  if (protectionState && protectionState.signatureUpdateOverdue === true) {
    risks.push({
      id: "defender_sig_overdue",
      severity: "warning",
      title: "Defender Signatures Out of Date",
      description: "Antivirus definitions are overdue for an update, reducing threat detection capability.",
      steps: [
        "Trigger a signature update: Windows Security → Virus & threat protection → Check for updates",
        "Run a Quick Scan after updating signatures",
        "Ensure Windows Update is not blocked and the device has internet access",
      ],
    });
  }

  // 8. Secure boot
  if (health && health.secureBootEnabled === false) {
    risks.push({
      id: "secure_boot_off",
      severity: "warning",
      title: "Secure Boot Disabled",
      description: "Secure Boot prevents unauthorized bootloaders and OS from loading. Its absence can indicate tampering or misconfiguration.",
      steps: [
        "Enable Secure Boot in BIOS/UEFI settings",
        "Ensure the CA / compliance policy requires Secure Boot",
        "Check if the device supports Secure Boot (requires UEFI firmware)",
      ],
    });
  }

  // 9. Stale device (no sync > 14 days)
  const lastSync = d.lastSyncDateTime;
  if (lastSync) {
    const daysSinceSync = (Date.now() - new Date(lastSync).getTime()) / 86400000;
    if (daysSinceSync > 14) {
      risks.push({
        id: "stale_device",
        severity: "warning",
        title: `Device Not Synced for ${Math.round(daysSinceSync)} Days`,
        description: "A stale device may have outdated compliance state. Conditional Access may be evaluating stale data.",
        steps: [
          "Ask the user to open the Company Portal app and tap 'Sync'",
          "Or trigger remotely from the Updates tab → 'Sync Policies'",
          "If device is unreachable, consider retiring it from Intune",
        ],
      });
    }
  }

  return risks;
}

export default function CaRisksTab({ device, azureTenantId, detail, health, compliancePolicies, protectionState }) {
  const d = detail?.detail || {};
  const userUpn = d.userPrincipalName || device.primary_user;

  const { data: mfaData, isLoading: loadingMfa } = useQuery({
    queryKey: ["user_mfa_methods", userUpn, azureTenantId],
    enabled: !!(userUpn && azureTenantId),
    queryFn: () =>
      base44.functions.invoke("portalData", {
        action: "get_user_mfa_methods",
        azure_tenant_id: azureTenantId,
        user_upn: userUpn,
      }).then(r => r.data),
  });

  const mfaMethods = mfaData?.methods ?? null;

  const isLoadingDetail = !detail;

  const risks = isLoadingDetail ? [] : evaluateRisks({
    d,
    health,
    compliancePolicies,
    protectionState,
    mfaMethods: loadingMfa ? null : mfaMethods,
  });

  if (isLoadingDetail || loadingMfa) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Evaluating Conditional Access risks…</p>
      </div>
    );
  }

  if (risks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        <p className="text-sm font-medium text-emerald-700">No Conditional Access risks detected</p>
        <p className="text-xs text-center max-w-xs">
          Device is compliant, MFA is registered, Defender is healthy, and encryption is enabled.
        </p>
      </div>
    );
  }

  const criticalCount = risks.filter(r => r.severity === "critical").length;
  const warningCount = risks.filter(r => r.severity === "warning").length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <ShieldAlert className="h-5 w-5 text-slate-500 shrink-0" />
        <div className="flex-1 text-sm text-slate-600">
          <span className="font-semibold">{risks.length} risk{risks.length !== 1 ? "s" : ""} identified</span>
          {" — "}
          {criticalCount > 0 && <span className="text-red-600 font-medium">{criticalCount} critical</span>}
          {criticalCount > 0 && warningCount > 0 && ", "}
          {warningCount > 0 && <span className="text-amber-600 font-medium">{warningCount} warning</span>}
        </div>
      </div>

      {risks.map(risk => {
        const s = SEVERITY[risk.severity] || SEVERITY.info;
        const Icon = s.icon;
        return (
          <div key={risk.id} className={`border rounded-xl p-4 ${s.color}`}>
            <div className="flex items-start gap-3 mb-3">
              <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${s.iconColor}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800">{risk.title}</p>
                  <Badge className={`text-[10px] px-1.5 py-0 border-0 ${s.badge}`}>
                    {risk.severity}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 mt-1">{risk.description}</p>
              </div>
            </div>

            <div className="ml-8 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Recommended Remediation
              </p>
              {risk.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] font-bold text-slate-400 mt-0.5 shrink-0">{i + 1}.</span>
                  <p className="text-xs text-slate-700">{step}</p>
                </div>
              ))}
              {risk.link && (
                <a
                  href={risk.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {risk.link.label}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}