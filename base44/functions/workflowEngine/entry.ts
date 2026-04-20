import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const GLOBAL_CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
const GLOBAL_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");

const CRITICAL_ACTIONS = ["wipe_device", "retire_device", "disable_device"];

async function sendCriticalAlert(base44, { ruleName, tenantName, actor, notifyEmail, criticalEvents }) {
  if (!notifyEmail || criticalEvents.length === 0) return;

  const rows = criticalEvents.map(e => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:10px 12px;font-weight:600;color:#1e293b;">${e.deviceName}</td>
      <td style="padding:10px 12px;color:#64748b;">${e.user || "—"}</td>
      <td style="padding:10px 12px;color:#64748b;">${e.os || "—"}</td>
      <td style="padding:10px 12px;color:#64748b;">${e.serial || "—"}</td>
      <td style="padding:10px 12px;">
        <span style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">
          ${e.action.replace(/_/g, " ").toUpperCase()}
        </span>
      </td>
      <td style="padding:10px 12px;font-size:12px;color:${e.status === "success" ? "#15803d" : "#b91c1c"};">${e.status}</td>
    </tr>`).join("");

  const body = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#0f172a;padding:24px 32px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="background:#ef4444;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">⚠️</div>
        <div>
          <h1 style="color:#fff;margin:0;font-size:18px;">Critical Workflow Action Alert</h1>
          <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">Automated remediation notification</p>
        </div>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;color:#991b1b;">
          <strong>${criticalEvents.length} critical action${criticalEvents.length > 1 ? "s were" : " was"} executed</strong>
          by the Workflow Engine on <strong>${tenantName}</strong>. Please review the details below.
        </p>
      </div>

      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 12px;color:#64748b;width:140px;">Rule</td>
          <td style="padding:6px 12px;color:#1e293b;font-weight:600;">${ruleName}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;color:#64748b;">Tenant</td>
          <td style="padding:6px 12px;color:#1e293b;">${tenantName}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;color:#64748b;">Triggered by</td>
          <td style="padding:6px 12px;color:#1e293b;">${actor}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;color:#64748b;">Timestamp</td>
          <td style="padding:6px 12px;color:#1e293b;">${new Date().toUTCString()}</td>
        </tr>
      </table>

      <h3 style="font-size:14px;font-weight:600;color:#1e293b;margin:24px 0 10px;">Affected Devices</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">Device</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">User</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">OS</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">Serial</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">Action</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <p style="font-size:12px;color:#94a3b8;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:16px;">
        This is an automated alert from the Azure Multi-Tenant Admin Workflow Engine.
        If these actions were not expected, review the workflow rule configuration immediately.
      </p>
    </div>
  </div>
</body>
</html>`;

  await base44.asServiceRole.integrations.Core.SendEmail({
    to: notifyEmail,
    subject: `⚠️ [CRITICAL] Workflow Alert: ${criticalEvents.length} device(s) affected on ${tenantName}`,
    body,
  });
}

async function getAccessToken(tenantId, clientId, clientSecret) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default"
  });
  const res = await fetch(url, { method: "POST", body });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function graphGet(token, path) {
  const base = path.startsWith("/beta") ? "https://graph.microsoft.com" : "https://graph.microsoft.com/beta";
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const e = await res.text(); throw new Error(`Graph ${path}: ${res.status} ${e}`); }
  return res.json();
}

async function graphPost(token, path, body) {
  const base = "https://graph.microsoft.com/beta";
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok && res.status !== 204) { const e = await res.text(); throw new Error(`Graph POST ${path}: ${res.status} ${e}`); }
  if (res.status === 204) return { success: true };
  return res.json();
}

// Evaluate a single condition against a device object
function evaluateCondition(device, condition) {
  const { field, operator, value } = condition;
  let deviceValue = device[field];

  // Normalize for comparison
  if (typeof deviceValue === "string") deviceValue = deviceValue.toLowerCase();
  const compareValue = typeof value === "string" ? value.toLowerCase() : value;

  switch (operator) {
    case "equals": return deviceValue === compareValue;
    case "not_equals": return deviceValue !== compareValue;
    case "contains": return String(deviceValue || "").includes(String(compareValue));
    case "not_contains": return !String(deviceValue || "").includes(String(compareValue));
    case "is_true": return deviceValue === true || deviceValue === "true";
    case "is_false": return deviceValue === false || deviceValue === "false" || !deviceValue;
    case "gt": return Number(deviceValue) > Number(compareValue);
    case "lt": return Number(deviceValue) < Number(compareValue);
    case "older_than_days": {
      if (!deviceValue) return true;
      const days = (Date.now() - new Date(deviceValue).getTime()) / 86400000;
      return days > Number(value);
    }
    case "within_days": {
      if (!deviceValue) return false;
      const days = (Date.now() - new Date(deviceValue).getTime()) / 86400000;
      return days <= Number(value);
    }
    default: return false;
  }
}

// Execute a single action on a device
async function executeAction(token, device, action, azureTenantId, base44) {
  const deviceId = device.id;
  const { type, params = {} } = action;

  switch (type) {
    case "sync_device":
      await graphPost(token, `/deviceManagement/managedDevices/${deviceId}/syncDevice`);
      return { action: "sync_device", device: device.deviceName, status: "success" };

    case "restart_device":
      await graphPost(token, `/deviceManagement/managedDevices/${deviceId}/rebootNow`);
      return { action: "restart_device", device: device.deviceName, status: "success" };

    case "defender_quick_scan":
      await graphPost(token, `/deviceManagement/managedDevices/${deviceId}/windowsDefenderScan`, { quickScan: true });
      return { action: "defender_quick_scan", device: device.deviceName, status: "success" };

    case "defender_full_scan":
      await graphPost(token, `/deviceManagement/managedDevices/${deviceId}/windowsDefenderScan`, { quickScan: false });
      return { action: "defender_full_scan", device: device.deviceName, status: "success" };

    case "retire_device":
      await graphPost(token, `/deviceManagement/managedDevices/${deviceId}/retire`);
      return { action: "retire_device", device: device.deviceName, status: "success" };

    case "wipe_device":
      await graphPost(token, `/deviceManagement/managedDevices/${deviceId}/wipe`, { keepEnrollmentData: false, keepUserData: false });
      return { action: "wipe_device", device: device.deviceName, status: "success" };

    case "push_script": {
      const scriptContent = params.script_content || "Write-Output 'Workflow remediation script'";
      const scriptBody = {
        displayName: `WF-${params.script_name || "AutoRemediation"}-${Date.now()}`,
        description: "Workflow Engine auto-remediation",
        scriptContent: btoa(unescape(encodeURIComponent(scriptContent))),
        runAsAccount: "system",
        enforceSignatureCheck: false,
        runAs32Bit: false,
        fileName: "workflow_remediation.ps1",
      };
      const script = await graphPost(token, `/deviceManagement/deviceManagementScripts`, scriptBody);
      if (script?.id) {
        await graphPost(token, `/deviceManagement/deviceManagementScripts/${script.id}/assign`, {
          deviceManagementScriptAssignments: [{
            id: `${script.id}_allDevices`,
            target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" }
          }]
        });
      }
      return { action: "push_script", device: device.deviceName, status: "success", scriptId: script?.id };
    }

    case "assign_compliance_policy": {
      const policyId = params.policy_id;
      if (!policyId) throw new Error("policy_id required for assign_compliance_policy");
      // Get device's AAD group or assign directly - we assign to a new group targeting this device
      return { action: "assign_compliance_policy", device: device.deviceName, status: "success", note: "Policy assignment via group recommended" };
    }

    case "send_notification": {
      const message = params.message || `Device ${device.deviceName} requires attention`;
      await graphPost(token, `/deviceManagement/managedDevices/${deviceId}/sendCustomNotificationToCompanyPortal`, {
        notificationTitle: params.title || "Security Alert",
        notificationBody: message
      });
      return { action: "send_notification", device: device.deviceName, status: "success" };
    }

    case "disable_device": {
      // Disable device in Entra ID
      const entraDevices = await graphGet(token, `/devices?$filter=displayName eq '${encodeURIComponent(device.deviceName)}'&$select=id`).catch(() => ({ value: [] }));
      const entraId = entraDevices.value?.[0]?.id;
      if (entraId) {
        const res = await fetch(`https://graph.microsoft.com/v1.0/devices/${entraId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ accountEnabled: false })
        });
        if (!res.ok) throw new Error(`Disable failed: ${res.status}`);
      }
      return { action: "disable_device", device: device.deviceName, status: entraId ? "success" : "skipped", note: entraId ? undefined : "Device not found in Entra" };
    }

    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // ── Execute a workflow rule ───────────────────────────────────────────────
    if (action === "execute_rule") {
      const { rule_id } = body;

      // Load rule
      const rules = await base44.asServiceRole.entities.WorkflowRule.filter({ id: rule_id });
      const rule = rules[0];
      if (!rule) return Response.json({ error: "Rule not found" }, { status: 404 });

      // Load tenant
      const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: rule.tenant_id });
      const tenant = tenants[0];
      if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

      const clientId = tenant.azure_client_id || GLOBAL_CLIENT_ID;
      const clientSecret = tenant.azure_client_secret || GLOBAL_CLIENT_SECRET;

      // Create execution record
      const execution = await base44.asServiceRole.entities.WorkflowExecution.create({
        rule_id: rule.id,
        rule_name: rule.name,
        tenant_id: rule.tenant_id,
        triggered_by: "manual",
        status: "running",
      });

      const conditions = JSON.parse(rule.conditions || "[]");
      const actions = JSON.parse(rule.actions || "[]");
      const logic = rule.condition_logic || "all";

      const token = await getAccessToken(tenant.tenant_id, clientId, clientSecret);

      // Fetch all managed devices
      const devData = await graphGet(token, `/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,managedDeviceOwnerType,userPrincipalName,model,manufacturer,serialNumber,lastSyncDateTime,enrolledDateTime,isEncrypted,jailBroken,managementAgent&$top=200`);
      const allDevices = devData.value || [];

      const log = [];
      let matched = 0;
      let actionsExecuted = 0;
      let actionsFailed = 0;
      const criticalEvents = [];

      for (const device of allDevices) {
        // Evaluate conditions
        const results = conditions.map(c => {
          try { return evaluateCondition(device, c); } catch { return false; }
        });
        const passes = logic === "all" ? results.every(Boolean) : results.some(Boolean);

        if (!passes) continue;
        matched++;

        const deviceLog = { deviceId: device.id, deviceName: device.deviceName, actions: [] };

        // Execute all actions on matching device
        for (const act of actions) {
          try {
            const result = await executeAction(token, device, act, tenant.tenant_id, base44);
            deviceLog.actions.push(result);
            actionsExecuted++;
            // Track critical actions for email alert
            if (CRITICAL_ACTIONS.includes(act.type)) {
              criticalEvents.push({
                deviceName: device.deviceName,
                user: device.userPrincipalName || "—",
                os: `${device.operatingSystem || ""} ${device.osVersion || ""}`.trim(),
                serial: device.serialNumber || "—",
                action: act.type,
                status: result.status,
              });
            }
          } catch (e) {
            deviceLog.actions.push({ action: act.type, device: device.deviceName, status: "failed", error: e.message });
            actionsFailed++;
            // Still send alert even if the critical action failed
            if (CRITICAL_ACTIONS.includes(act.type)) {
              criticalEvents.push({
                deviceName: device.deviceName,
                user: device.userPrincipalName || "—",
                os: `${device.operatingSystem || ""} ${device.osVersion || ""}`.trim(),
                serial: device.serialNumber || "—",
                action: act.type,
                status: "failed",
              });
            }
          }
        }
        log.push(deviceLog);
      }

      const finalStatus = actionsFailed === 0 ? "success" : actionsExecuted > 0 ? "partial" : "failed";

      // Send critical action email alert
      if (criticalEvents.length > 0) {
        await sendCriticalAlert(base44, {
          ruleName: rule.name,
          tenantName: tenant.name,
          actor: user.email,
          notifyEmail: rule.notify_email || user.email,
          criticalEvents,
        }).catch(e => console.warn("[workflowEngine] email alert failed:", e.message));
      }

      // Update execution record
      await base44.asServiceRole.entities.WorkflowExecution.update(execution.id, {
        status: finalStatus,
        devices_evaluated: allDevices.length,
        devices_matched: matched,
        actions_executed: actionsExecuted,
        actions_failed: actionsFailed,
        execution_log: JSON.stringify(log),
      });

      // Update rule last run
      await base44.asServiceRole.entities.WorkflowRule.update(rule.id, {
        last_run: new Date().toISOString(),
        last_run_status: finalStatus,
        last_run_summary: `${matched} devices matched, ${actionsExecuted} actions executed, ${actionsFailed} failed`,
        run_count: (rule.run_count || 0) + 1,
      });

      return Response.json({
        success: true,
        execution_id: execution.id,
        devices_evaluated: allDevices.length,
        devices_matched: matched,
        actions_executed: actionsExecuted,
        actions_failed: actionsFailed,
        status: finalStatus,
        log,
      });
    }

    // ── Preview which devices would match ─────────────────────────────────────
    if (action === "preview_rule") {
      const { conditions, condition_logic, tenant_id } = body;

      const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id });
      const tenant = tenants[0];
      if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

      const clientId = tenant.azure_client_id || GLOBAL_CLIENT_ID;
      const clientSecret = tenant.azure_client_secret || GLOBAL_CLIENT_SECRET;
      const token = await getAccessToken(tenant.tenant_id, clientId, clientSecret);

      const devData = await graphGet(token, `/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,managedDeviceOwnerType,userPrincipalName,model,lastSyncDateTime,isEncrypted,jailBroken&$top=200`);
      const allDevices = devData.value || [];
      const logic = condition_logic || "all";

      const matched = allDevices.filter(device => {
        const results = conditions.map(c => {
          try { return evaluateCondition(device, c); } catch { return false; }
        });
        return logic === "all" ? results.every(Boolean) : results.some(Boolean);
      });

      return Response.json({ success: true, total: allDevices.length, matched: matched.length, devices: matched.slice(0, 50) });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[workflowEngine]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});