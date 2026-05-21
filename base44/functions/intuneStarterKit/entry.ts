import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function getToken(tenantId, clientId, clientSecret) {
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function graphGet(token, url) {
  let results = [];
  let nextLink = url;
  while (nextLink) {
    const res = await fetch(nextLink, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Graph GET ${url} failed ${res.status}: ${err}`);
    }
    const data = await res.json();
    if (Array.isArray(data.value)) results = results.concat(data.value);
    else return data;
    nextLink = data["@odata.nextLink"] || null;
  }
  return results;
}

async function graphPost(token, url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Graph POST ${url} failed ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { ok: true }; }
}

async function graphDelete(token, url) {
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    throw new Error(`Graph DELETE ${url} failed ${res.status}: ${err}`);
  }
  return true;
}

// ── Helper: Assign a policy to a group (merging existing assignments) ──────────
async function assignPolicy(token, assignUrl, assignmentsUrl, targetGroupId, assignmentType) {
  let existing = [];
  try {
    existing = await graphGet(token, `https://graph.microsoft.com/beta/${assignmentsUrl}`);
    if (!Array.isArray(existing)) existing = [];
  } catch { existing = []; }

  const alreadyAssigned = existing.some(a => a.target?.groupId === targetGroupId);
  if (alreadyAssigned) return { skipped: true, reason: "Already assigned" };

  const assignments = existing.map(a => ({ target: a.target }));
  assignments.push({
    target: {
      "@odata.type": assignmentType === "Excluded"
        ? "#microsoft.graph.exclusionGroupAssignmentTarget"
        : "#microsoft.graph.groupAssignmentTarget",
      groupId: targetGroupId,
    }
  });

  await graphPost(token, `https://graph.microsoft.com/beta/${assignUrl}`, { assignments });
  return { assigned: true };
}

// ── Create Autopilot Profile ───────────────────────────────────────────────────
async function addAutopilotProfile(token, { name, language, assignToGroupId, userType, description }) {
  const profileName = name || "Default ISK Profile";
  const profileBody = {
    "@odata.type": "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile",
    displayName: profileName,
    description: description || "Profile created with the IntuneStarterKit",
    language: language || "en-US",
    extractHardwareHash: true,
    deviceNameTemplate: "%SERIAL%",
    deviceType: "windowsPc",
    enableWhiteGlove: true,
    outOfBoxExperienceSettings: {
      hidePrivacySettings: true,
      hideEULA: true,
      userType: userType || "standard",
      deviceUsageType: "singleUser",
      skipKeyboardSelectionPage: false,
      hideEscapeLink: true,
    },
    enrollmentStatusScreenSettings: {
      "@odata.type": "microsoft.graph.windowsEnrollmentStatusScreenSettings",
      hideInstallationProgress: false,
      allowDeviceUseBeforeProfileAndAppInstallComplete: true,
      blockDeviceSetupRetryByUser: true,
      allowLogCollectionOnInstallFailure: true,
      installProgressTimeoutInMinutes: 120,
      allowDeviceUseOnInstallFailure: true,
    },
  };

  const created = await graphPost(token, "https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeploymentProfiles", profileBody);

  if (assignToGroupId) {
    await graphPost(token, `https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeploymentProfiles/${created.id}/assignments`, {
      target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: assignToGroupId }
    });
  }

  return { id: created.id, name: profileName };
}

// ── Create ESP Profile ─────────────────────────────────────────────────────────
async function addESP(token, { name, description, assignToGroupId, timeoutMinutes }) {
  const espName = name || "Autopilot ESP";
  const espBody = {
    "@odata.type": "#microsoft.graph.windows10EnrollmentCompletionPageConfiguration",
    displayName: espName,
    description: description || "Custom Enrollment Status Page by ISK",
    showInstallationProgress: true,
    blockDeviceSetupRetryByUser: false,
    allowDeviceResetOnInstallFailure: false,
    allowLogCollectionOnInstallFailure: true,
    customErrorMessage: "There was an error, please press CONTINUE. We will fix the issue after the setup.",
    installProgressTimeoutInMinutes: timeoutMinutes || 30,
    allowDeviceUseOnInstallFailure: true,
  };

  const created = await graphPost(token, "https://graph.microsoft.com/beta/deviceManagement/deviceEnrollmentConfigurations", espBody);

  if (assignToGroupId) {
    await graphPost(token, `https://graph.microsoft.com/beta/deviceManagement/deviceEnrollmentConfigurations/${created.id}/assign`, {
      enrollmentConfigurationAssignments: [{
        target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: assignToGroupId }
      }]
    });
  }

  return { id: created.id, name: espName };
}

// ── Create AAD Groups ──────────────────────────────────────────────────────────
async function createGroups(token, { apGroupName, stdGroupName }) {
  const apName = apGroupName || "DEV-WIN-Autopilot";
  const stdName = stdGroupName || "DEV-WIN-Standard";

  const apGroup = await graphPost(token, "https://graph.microsoft.com/v1.0/groups", {
    displayName: apName,
    description: "Group containing all Autopilot registered devices",
    mailEnabled: false,
    securityEnabled: true,
    mailNickname: apName.replace(/\s/g, ""),
    groupTypes: ["DynamicMembership"],
    membershipRule: '(device.devicePhysicalIDs -any (_ -contains "[ZTDID]"))',
    membershipRuleProcessingState: "On",
  });

  const stdGroup = await graphPost(token, "https://graph.microsoft.com/v1.0/groups", {
    displayName: stdName,
    description: "Group for standard configuration and apps",
    mailEnabled: false,
    securityEnabled: true,
    mailNickname: stdName.replace(/\s/g, ""),
  });

  // Add AP group as member of Std group
  await graphPost(token, `https://graph.microsoft.com/v1.0/groups/${stdGroup.id}/members/$ref`, {
    "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${apGroup.id}`
  });

  return { apGroupId: apGroup.id, apGroupName: apName, stdGroupId: stdGroup.id, stdGroupName: stdName };
}

// ── Deploy baseline compliance policy ─────────────────────────────────────────
async function addBaselineCompliancePolicy(token, { name, assignToGroupId }) {
  const policyName = name || "ISK - Windows 10/11 Compliance Baseline";
  const body = {
    "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
    displayName: policyName,
    description: "Basic compliance policy created by IntuneStarterKit",
    passwordRequired: true,
    passwordMinimumLength: 8,
    passwordRequiredType: "alphanumeric",
    passwordExpirationDays: 90,
    passwordPreviousPasswordBlockCount: 5,
    bitLockerEnabled: true,
    secureBootEnabled: true,
    codeIntegrityEnabled: true,
    antivirusRequired: true,
    antiSpywareRequired: true,
    defenderEnabled: true,
    firewallEnabled: true,
    scheduledActionsForRule: [{
      ruleName: "PasswordRequired",
      scheduledActionConfigurations: [{
        actionType: "block",
        gracePeriodHours: 0,
        notificationTemplateId: "",
      }],
    }],
  };

  const created = await graphPost(token, "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies", body);

  if (assignToGroupId) {
    await graphPost(token, `https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies/${created.id}/assign`, {
      assignments: [{
        target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: assignToGroupId }
      }]
    });
  }

  return { id: created.id, name: policyName };
}

// ── Deploy Defender configuration profile ─────────────────────────────────────
async function addDefenderProfile(token, { name, assignToGroupId }) {
  const profileName = name || "ISK - Defender Security Settings";
  const body = {
    "@odata.type": "#microsoft.graph.windows10EndpointProtectionConfiguration",
    displayName: profileName,
    description: "Defender settings created by IntuneStarterKit",
    defenderCloudBlockLevel: "high",
    defenderCloudExtendedTimeout: 50,
    defenderMonitorFileActivity: "monitorAllFiles",
    defenderScanType: "full",
    defenderRequireRealTimeMonitoring: true,
    defenderRequireBehaviorMonitoring: true,
    defenderRequireNetworkInspectionSystem: true,
    defenderScanDownloads: true,
    defenderScanScriptsLoadedInInternetExplorer: true,
    firewallEnabled: true,
    firewallBlockAllIncoming: false,
    firewallEnableStealthMode: true,
  };

  const created = await graphPost(token, "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations", body);

  if (assignToGroupId) {
    await assignPolicy(
      token,
      `deviceManagement/deviceConfigurations/${created.id}/assign`,
      `deviceManagement/deviceConfigurations/${created.id}/groupAssignments`,
      assignToGroupId,
      "Included"
    );
  }

  return { id: created.id, name: profileName };
}

// ── Deploy OneDrive / Edge / Outlook Configuration Profile ────────────────────
async function addWindowsSettingsProfile(token, { name, assignToGroupId }) {
  const profileName = name || "ISK - Windows Basic Settings";
  const body = {
    "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
    displayName: profileName,
    description: "Basic Windows settings (OneDrive KFM, Edge, etc.) created by IntuneStarterKit",
    omaSettings: [
      {
        "@odata.type": "#microsoft.graph.omaSettingString",
        displayName: "OneDrive KFM Silent Enrollment",
        omaUri: "./Device/Vendor/MSFT/Policy/Config/OneDriveNGSC~Policy~OneDriveNGSC/KFMSilentOptIn",
        value: "<enabled/><data id=\"KFMSilentOptInWithNotification\" value=\"1\"/>",
      },
      {
        "@odata.type": "#microsoft.graph.omaSettingInteger",
        displayName: "Edge - Set New Tab Page to Company Portal",
        omaUri: "./Device/Vendor/MSFT/Policy/Config/Browser/AllowBrowser",
        value: 1,
      },
    ],
  };

  const created = await graphPost(token, "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations", body);

  if (assignToGroupId) {
    await assignPolicy(
      token,
      `deviceManagement/deviceConfigurations/${created.id}/assign`,
      `deviceManagement/deviceConfigurations/${created.id}/groupAssignments`,
      assignToGroupId,
      "Included"
    );
  }

  return { id: created.id, name: profileName };
}

// ── Assign existing policy to group ───────────────────────────────────────────
async function assignExistingPolicy(token, { policyType, policyId, targetGroupId, assignmentType }) {
  const routes = {
    configuration_policy: {
      assign: `deviceManagement/configurationPolicies/${policyId}/assign`,
      assignments: `deviceManagement/configurationPolicies/${policyId}/assignments`,
    },
    device_configuration: {
      assign: `deviceManagement/deviceConfigurations/${policyId}/assign`,
      assignments: `deviceManagement/deviceConfigurations/${policyId}/groupAssignments`,
    },
    compliance_policy: {
      assignDirect: true,
      assign: `deviceManagement/deviceCompliancePolicies/${policyId}/assign`,
    },
    script: {
      assignDirect: true,
      assign: `deviceManagement/deviceManagementScripts/${policyId}/assign`,
      scriptBody: true,
    },
  };

  const route = routes[policyType];
  if (!route) throw new Error(`Unknown policy type: ${policyType}`);

  if (route.assignDirect && route.scriptBody) {
    await graphPost(token, `https://graph.microsoft.com/beta/${route.assign}`, {
      deviceManagementScriptGroupAssignments: [{
        "@odata.type": "#microsoft.graph.deviceManagementScriptGroupAssignment",
        targetGroupId,
        id: policyId,
      }]
    });
    return { assigned: true };
  }

  if (route.assignDirect) {
    await graphPost(token, `https://graph.microsoft.com/v1.0/${route.assign}`, {
      assignments: [{
        target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: targetGroupId }
      }]
    });
    return { assigned: true };
  }

  return await assignPolicy(token, route.assign, route.assignments, targetGroupId, assignmentType || "Included");
}

// ── List existing policies for assignment ─────────────────────────────────────
async function listPoliciesForAssignment(token) {
  const [configPolicies, deviceConfigs, compliancePolicies, scripts, groups] = await Promise.all([
    graphGet(token, "https://graph.microsoft.com/beta/deviceManagement/configurationPolicies?$select=id,name&$top=50"),
    graphGet(token, "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations?$select=id,displayName&$top=50"),
    graphGet(token, "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies?$select=id,displayName&$top=50"),
    graphGet(token, "https://graph.microsoft.com/beta/deviceManagement/deviceManagementScripts?$select=id,displayName&$top=50"),
    graphGet(token, "https://graph.microsoft.com/v1.0/groups?$select=id,displayName&$top=100"),
  ]);

  return {
    configurationPolicies: (Array.isArray(configPolicies) ? configPolicies : []).map(p => ({ id: p.id, name: p.name || p.displayName })),
    deviceConfigurations: (Array.isArray(deviceConfigs) ? deviceConfigs : []).map(p => ({ id: p.id, name: p.displayName })),
    compliancePolicies: (Array.isArray(compliancePolicies) ? compliancePolicies : []).map(p => ({ id: p.id, name: p.displayName })),
    scripts: (Array.isArray(scripts) ? scripts : []).map(p => ({ id: p.id, name: p.displayName })),
    groups: (Array.isArray(groups) ? groups : []).map(g => ({ id: g.id, name: g.displayName })),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!["global_admin", "intune_admin"].includes(user.role)) {
      return Response.json({ error: "Forbidden: Intune Admin or Global Admin required" }, { status: 403 });
    }

    const body = await req.json();
    const { action, azure_tenant_id } = body;

    if (!azure_tenant_id) return Response.json({ error: "azure_tenant_id required" }, { status: 400 });

    // Fetch tenant credentials
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ tenant_id: azure_tenant_id });
    const tenant = tenants[0];
    if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

    const clientId = tenant.azure_client_id || Deno.env.get("AZURE_CLIENT_ID");
    const clientSecret = tenant.azure_client_secret || Deno.env.get("AZURE_CLIENT_SECRET");
    const token = await getToken(azure_tenant_id, clientId, clientSecret);

    // ── Actions ────────────────────────────────────────────────────────────────

    if (action === "list_policies") {
      const data = await listPoliciesForAssignment(token);
      return Response.json({ success: true, ...data });
    }

    if (action === "create_groups") {
      const result = await createGroups(token, body);
      return Response.json({ success: true, ...result });
    }

    if (action === "add_autopilot_profile") {
      const result = await addAutopilotProfile(token, body);
      return Response.json({ success: true, ...result });
    }

    if (action === "add_esp") {
      const result = await addESP(token, body);
      return Response.json({ success: true, ...result });
    }

    if (action === "add_compliance_policy") {
      const result = await addBaselineCompliancePolicy(token, body);
      return Response.json({ success: true, ...result });
    }

    if (action === "add_defender_profile") {
      const result = await addDefenderProfile(token, body);
      return Response.json({ success: true, ...result });
    }

    if (action === "add_windows_settings") {
      const result = await addWindowsSettingsProfile(token, body);
      return Response.json({ success: true, ...result });
    }

    if (action === "assign_policy") {
      const result = await assignExistingPolicy(token, body);
      return Response.json({ success: true, ...result });
    }

    if (action === "deploy_full_isk") {
      const log = [];
      const { apGroupName, stdGroupName, language, userType } = body;

      // 1. Groups
      log.push({ step: "Creating AAD Groups", status: "running" });
      const groups = await createGroups(token, { apGroupName, stdGroupName });
      log[0].status = "done";
      log[0].detail = `Created: ${groups.apGroupName} (dynamic AP) + ${groups.stdGroupName}`;

      // 2. Autopilot Profile
      log.push({ step: "Creating Autopilot Profile", status: "running" });
      const ap = await addAutopilotProfile(token, { language, userType, assignToGroupId: groups.apGroupId });
      log[1].status = "done";
      log[1].detail = `Created: ${ap.name}`;

      // 3. ESP
      log.push({ step: "Creating Enrollment Status Page (ESP)", status: "running" });
      const esp = await addESP(token, { assignToGroupId: groups.apGroupId });
      log[2].status = "done";
      log[2].detail = `Created: ${esp.name}`;

      // 4. Compliance Policy
      log.push({ step: "Creating Compliance Policy", status: "running" });
      const comp = await addBaselineCompliancePolicy(token, { assignToGroupId: groups.stdGroupId });
      log[3].status = "done";
      log[3].detail = `Created: ${comp.name}`;

      // 5. Defender Profile
      log.push({ step: "Creating Defender Security Profile", status: "running" });
      const defender = await addDefenderProfile(token, { assignToGroupId: groups.stdGroupId });
      log[4].status = "done";
      log[4].detail = `Created: ${defender.name}`;

      // 6. Windows Basic Settings
      log.push({ step: "Creating Windows Basic Settings Profile (OneDrive KFM)", status: "running" });
      const winSettings = await addWindowsSettingsProfile(token, { assignToGroupId: groups.stdGroupId });
      log[5].status = "done";
      log[5].detail = `Created: ${winSettings.name}`;

      return Response.json({ success: true, log, groups, ap, esp, comp, defender, winSettings });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});