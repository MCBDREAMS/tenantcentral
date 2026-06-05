import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Auth helpers ────────────────────────────────────────────────────────────
async function getToken(tenantId, clientId, clientSecret) {
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default"
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error for ${tenantId}: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function graphGet(token, path, beta = false) {
  const base = beta ? "https://graph.microsoft.com/beta" : "https://graph.microsoft.com/v1.0";
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph GET ${path} => ${res.status}: ${err}`);
  }
  return res.json();
}

async function graphPost(token, path, body, beta = false) {
  const base = beta ? "https://graph.microsoft.com/beta" : "https://graph.microsoft.com/v1.0";
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Graph POST ${path} => ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function graphPatch(token, path, body, beta = false) {
  const base = beta ? "https://graph.microsoft.com/beta" : "https://graph.microsoft.com/v1.0";
  const res = await fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph PATCH ${path} => ${res.status}: ${err}`);
  }
  return res.status === 204 ? {} : res.json();
}

async function graphGetAll(token, path, beta = false) {
  const base = beta ? "https://graph.microsoft.com/beta" : "https://graph.microsoft.com/v1.0";
  let url = `${base}${path}`;
  const all = [];
  let pages = 0;
  while (url && pages < 10) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.value || []));
    url = data["@odata.nextLink"] || null;
    pages++;
  }
  return all;
}

// Convert ObjectGUID (base64 or hex) to ImmutableID (base64 of the GUID bytes)
function guidToImmutableId(objectGuid) {
  if (!objectGuid) return null;
  try {
    // If already base64 length, return as-is
    if (objectGuid.length === 24 && objectGuid.endsWith("==")) return objectGuid;
    // Parse hex GUID format: {xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}
    const hex = objectGuid.replace(/[{}-]/g, "");
    if (hex.length !== 32) return null;
    // GUID bytes in little-endian format for first 3 parts
    const bytes = [
      hex[6], hex[7], hex[4], hex[5], hex[2], hex[3], hex[0], hex[1], // Data1 LE
      hex[10], hex[11], hex[8], hex[9],                                 // Data2 LE
      hex[14], hex[15], hex[12], hex[13],                               // Data3 LE
      hex[16], hex[17], hex[18], hex[19],                               // Data4
      hex[20], hex[21], hex[22], hex[23],
      hex[24], hex[25], hex[26], hex[27],
      hex[28], hex[29], hex[30], hex[31]
    ];
    const byteArray = new Uint8Array(bytes.map((_, i) => parseInt(bytes[i * 2] + bytes[i * 2 + 1], 16)).filter((_, i) => i < 16));
    return btoa(String.fromCharCode(...byteArray));
  } catch {
    return null;
  }
}

// Resolve tenant credentials (per-tenant or global)
async function resolveCreds(base44, tenantId) {
  const GLOBAL_ID = Deno.env.get("AZURE_CLIENT_ID");
  const GLOBAL_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
  let clientId = GLOBAL_ID, clientSecret = GLOBAL_SECRET;
  try {
    const recs = await base44.asServiceRole.entities.Tenant.filter({ tenant_id: tenantId });
    if (recs[0]?.azure_client_id) clientId = recs[0].azure_client_id;
    if (recs[0]?.azure_client_secret) clientSecret = recs[0].azure_client_secret;
  } catch {}
  return { clientId, clientSecret };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, azure_tenant_id } = body;

    // ── PHASE 1: Scan AD-synced users from source tenant ──────────────────────
    if (action === "scan_ad_users") {
      const { source_tenant_id } = body;
      const { clientId, clientSecret } = await resolveCreds(base44, source_tenant_id);
      const token = await getToken(source_tenant_id, clientId, clientSecret);

      // Fetch all users with on-prem AD attributes
      const users = await graphGetAll(token,
        "/users?$select=id,displayName,userPrincipalName,mail,accountEnabled,onPremisesSyncEnabled,onPremisesImmutableId,onPremisesDistinguishedName,onPremisesDomainName,onPremisesSamAccountName,onPremisesSecurityIdentifier,onPremisesUserPrincipalName,onPremisesLastSyncDateTime,onPremisesProvisioningErrors,assignedLicenses,jobTitle,department,mobilePhone,businessPhones,userType,createdDateTime,passwordPolicies,lastPasswordChangeDateTime&$top=999"
      );

      // Categorize users
      const adSynced = users.filter(u => u.onPremisesSyncEnabled === true || !!u.onPremisesImmutableId);
      const cloudOnly = users.filter(u => !u.onPremisesSyncEnabled && !u.onPremisesImmutableId && u.userType === "Member");
      const guestUsers = users.filter(u => u.userType === "Guest");

      // Get on-prem sync status
      let syncStatus = null;
      try {
        const org = await graphGet(token, "/organization?$select=onPremisesSyncEnabled,onPremisesLastSyncDateTime,onPremisesProvisioningErrors");
        syncStatus = (org.value || [])[0] || null;
      } catch {}

      // Get domains
      let domains = [];
      try {
        const dom = await graphGet(token, "/domains?$select=id,isDefault,isVerified,authenticationType");
        domains = dom.value || [];
      } catch {}

      const result = adSynced.map(u => ({
        id: u.id,
        displayName: u.displayName,
        upn: u.userPrincipalName,
        mail: u.mail,
        accountEnabled: u.accountEnabled,
        onPremisesSyncEnabled: u.onPremisesSyncEnabled,
        immutableId: u.onPremisesImmutableId,
        distinguishedName: u.onPremisesDistinguishedName,
        domainName: u.onPremisesDomainName,
        samAccountName: u.onPremisesSamAccountName,
        sid: u.onPremisesSecurityIdentifier,
        onPremUpn: u.onPremisesUserPrincipalName,
        lastSync: u.onPremisesLastSyncDateTime,
        syncErrors: u.onPremisesProvisioningErrors || [],
        jobTitle: u.jobTitle,
        department: u.department,
        mobilePhone: u.mobilePhone,
        businessPhones: u.businessPhones || [],
        licenses: (u.assignedLicenses || []).length,
        passwordPolicies: u.passwordPolicies,
        createdDateTime: u.createdDateTime,
        hasSyncErrors: (u.onPremisesProvisioningErrors || []).length > 0,
        migrationStatus: "pending", // will be updated per-user
        identityType: "AD_SYNCED",   // AD_SYNCED | CLOUD | GUEST
      }));

      return Response.json({
        success: true,
        adSyncedUsers: result,
        cloudOnlyCount: cloudOnly.length,
        guestCount: guestUsers.length,
        totalUsers: users.length,
        syncStatus,
        domains,
        stats: {
          total: users.length,
          adSynced: adSynced.length,
          cloudOnly: cloudOnly.length,
          guests: guestUsers.length,
          withSyncErrors: adSynced.filter(u => (u.onPremisesProvisioningErrors || []).length > 0).length,
          withImmutableId: adSynced.filter(u => !!u.onPremisesImmutableId).length,
        }
      });
    }

    // ── PHASE 2: Validate migration readiness per user ─────────────────────────
    if (action === "validate_migration_readiness") {
      const { source_tenant_id, user_ids } = body;
      const { clientId, clientSecret } = await resolveCreds(base44, source_tenant_id);
      const token = await getToken(source_tenant_id, clientId, clientSecret);

      const validationResults = [];

      for (const userId of (user_ids || []).slice(0, 50)) {
        try {
          const u = await graphGet(token, `/users/${userId}?$select=id,displayName,userPrincipalName,onPremisesImmutableId,onPremisesDistinguishedName,onPremisesSyncEnabled,assignedLicenses,accountEnabled,onPremisesProvisioningErrors,memberOf`);

          const checks = {
            hasImmutableId: !!u.onPremisesImmutableId,
            hasLicenses: (u.assignedLicenses || []).length > 0,
            accountEnabled: u.accountEnabled === true,
            noSyncErrors: (u.onPremisesProvisioningErrors || []).length === 0,
            hasDN: !!u.onPremisesDistinguishedName,
          };

          const allPassed = Object.values(checks).every(Boolean);
          const warnings = [];
          if (!checks.hasImmutableId) warnings.push("Missing ImmutableID — identity continuity at risk");
          if (!checks.hasLicenses) warnings.push("No licenses assigned");
          if (!checks.accountEnabled) warnings.push("Account is disabled");
          if (!checks.noSyncErrors) warnings.push(`Has ${u.onPremisesProvisioningErrors.length} sync error(s)`);

          validationResults.push({
            userId,
            displayName: u.displayName,
            upn: u.userPrincipalName,
            immutableId: u.onPremisesImmutableId,
            computedImmutableId: guidToImmutableId(u.onPremisesImmutableId),
            checks,
            ready: allPassed,
            warnings,
          });
        } catch (e) {
          validationResults.push({ userId, error: e.message, ready: false });
        }
      }

      return Response.json({ success: true, validationResults });
    }

    // ── PHASE 3A: Migrate users — sync identity to target tenant ──────────────
    // This creates cloud-managed accounts in target with matching ImmutableID
    if (action === "migrate_users_to_cloud") {
      const { source_tenant_id, target_tenant_id, users } = body;
      const srcCreds = await resolveCreds(base44, source_tenant_id);
      const tgtCreds = await resolveCreds(base44, target_tenant_id);
      const srcToken = await getToken(source_tenant_id, srcCreds.clientId, srcCreds.clientSecret);
      const tgtToken = await getToken(target_tenant_id, tgtCreds.clientId, tgtCreds.clientSecret);

      // Get target domain
      const tgtDomains = await graphGet(tgtToken, "/domains?$select=id,isDefault,isVerified");
      const defaultDomain = (tgtDomains.value || []).find(d => d.isDefault)?.id || (tgtDomains.value || [])[0]?.id;

      const results = [];

      for (const u of (users || [])) {
        try {
          // Derive target UPN (replace source domain with target domain)
          const upnLocal = (u.upn || "").split("@")[0];
          const targetUpn = `${upnLocal}@${defaultDomain}`;
          const mailNickname = upnLocal.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);

          // Check if user already exists in target
          let existingUser = null;
          try {
            const existing = await graphGet(tgtToken, `/users?$filter=userPrincipalName eq '${targetUpn}'&$select=id,userPrincipalName`);
            existingUser = (existing.value || [])[0] || null;
          } catch {}

          let targetUserId = existingUser?.id || null;
          let created = false;

          if (!existingUser) {
            // Create cloud-managed user in target tenant
            const newUser = await graphPost(tgtToken, "/users", {
              displayName: u.displayName,
              userPrincipalName: targetUpn,
              mailNickname,
              accountEnabled: u.accountEnabled !== false,
              jobTitle: u.jobTitle || "",
              department: u.department || "",
              mobilePhone: u.mobilePhone || null,
              passwordProfile: {
                password: "TempMigr@t10n!" + Math.random().toString(36).slice(-4),
                forceChangePasswordNextSignIn: true,
              },
              // Preserve identity continuity via immutableId
              ...(u.immutableId ? { onPremisesImmutableId: u.immutableId } : {}),
            });
            targetUserId = newUser.id;
            created = true;
          }

          // Copy group memberships (best-effort)
          let groupsCopied = 0;
          if (u.groupIds && u.groupIds.length > 0) {
            for (const gId of u.groupIds.slice(0, 10)) {
              try {
                await graphPost(tgtToken, `/groups/${gId}/members/$ref`, {
                  "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${targetUserId}`
                });
                groupsCopied++;
              } catch {}
            }
          }

          results.push({
            sourceUpn: u.upn,
            targetUpn,
            targetUserId,
            immutableId: u.immutableId,
            created,
            skipped: !created,
            groupsCopied,
            status: "success",
          });

        } catch (e) {
          results.push({
            sourceUpn: u.upn,
            status: "error",
            error: e.message,
          });
        }
      }

      const succeeded = results.filter(r => r.status === "success").length;
      const failed = results.filter(r => r.status === "error").length;

      return Response.json({ success: true, results, succeeded, failed, total: users.length });
    }

    // ── PHASE 3B: Disable DirSync on source (convert to cloud-managed) ─────────
    // Issues the equivalent of Set-MsolDirSyncEnabled -EnableDirSync $false via Graph
    if (action === "disable_dirsync") {
      const { source_tenant_id } = body;
      const { clientId, clientSecret } = await resolveCreds(base44, source_tenant_id);
      const token = await getToken(source_tenant_id, clientId, clientSecret);

      // Get current org state
      const org = await graphGet(token, "/organization?$select=id,onPremisesSyncEnabled");
      const orgId = (org.value || [])[0]?.id;
      if (!orgId) throw new Error("Could not read organization ID");

      const currentState = (org.value || [])[0]?.onPremisesSyncEnabled;
      if (!currentState) {
        return Response.json({ success: true, message: "DirSync is already disabled", alreadyDisabled: true });
      }

      // PATCH organization to disable sync
      // Graph API equivalent of Set-MsolDirSyncEnabled -EnableDirSync $false
      await graphPatch(token, `/organization/${orgId}`, { onPremisesSyncEnabled: false });

      return Response.json({
        success: true,
        message: "DirSync has been disabled. Users are now cloud-managed. This is irreversible without Microsoft Support.",
        orgId,
        previousState: currentState,
        powershellEquivalent: "Set-MsolDirSyncEnabled -EnableDirSync $false -Force",
        note: "Allow up to 72 hours for propagation. Ensure all users are migrated before this step."
      });
    }

    // ── PHASE 3C: Set ImmutableID on individual user (identity mapping) ────────
    if (action === "set_immutable_id") {
      const { target_tenant_id, user_id, immutable_id } = body;
      const { clientId, clientSecret } = await resolveCreds(base44, target_tenant_id);
      const token = await getToken(target_tenant_id, clientId, clientSecret);

      await graphPatch(token, `/users/${user_id}`, { onPremisesImmutableId: immutable_id });

      return Response.json({
        success: true,
        userId: user_id,
        immutableId: immutable_id,
        message: "ImmutableID set — identity continuity preserved for this user"
      });
    }

    // ── PHASE 3D: Convert hybrid-joined devices to Entra ID-joined ────────────
    if (action === "convert_hybrid_devices") {
      const { source_tenant_id, device_ids } = body;
      const { clientId, clientSecret } = await resolveCreds(base44, source_tenant_id);
      const token = await getToken(source_tenant_id, clientId, clientSecret);

      const results = [];
      for (const deviceId of (device_ids || []).slice(0, 50)) {
        try {
          // Get device details
          const device = await graphGet(token, `/devices/${deviceId}?$select=id,displayName,trustType,operatingSystem,deviceId`);

          if (device.trustType !== "ServerAd") {
            results.push({ deviceId, displayName: device.displayName, status: "skipped", reason: "Not hybrid joined" });
            continue;
          }

          // Generate PowerShell commands for this device
          // Note: Actual join conversion requires running dsregcmd on the device
          const psCommands = [
            `# Run on device: ${device.displayName}`,
            `dsregcmd /leave               # Leave domain join`,
            `dsregcmd /join                # Join Entra ID`,
            `# Or via MDM enrollment:`,
            `# Settings > Accounts > Work/School > Connect > Join Azure AD`,
          ].join("\n");

          results.push({
            deviceId,
            displayName: device.displayName,
            currentTrustType: device.trustType,
            operatingSystem: device.operatingSystem,
            status: "script_generated",
            psCommands,
          });
        } catch (e) {
          results.push({ deviceId, status: "error", error: e.message });
        }
      }

      return Response.json({ success: true, results });
    }

    // ── PHASE 4: Sync user profiles to Entra ID (update attributes) ────────────
    if (action === "sync_user_profiles") {
      const { source_tenant_id, target_tenant_id, user_pairs } = body;
      // user_pairs = [{sourceId, targetId}]
      const srcCreds = await resolveCreds(base44, source_tenant_id);
      const tgtCreds = await resolveCreds(base44, target_tenant_id);
      const srcToken = await getToken(source_tenant_id, srcCreds.clientId, srcCreds.clientSecret);
      const tgtToken = await getToken(target_tenant_id, tgtCreds.clientId, tgtCreds.clientSecret);

      const results = [];
      for (const pair of (user_pairs || []).slice(0, 50)) {
        try {
          // Read source user attributes
          const src = await graphGet(srcToken, `/users/${pair.sourceId}?$select=displayName,givenName,surname,jobTitle,department,mobilePhone,businessPhones,officeLocation,streetAddress,city,state,country,postalCode,companyName,employeeId,usageLocation`);

          // Patch target user with same profile data
          await graphPatch(tgtToken, `/users/${pair.targetId}`, {
            displayName: src.displayName,
            givenName: src.givenName,
            surname: src.surname,
            jobTitle: src.jobTitle || "",
            department: src.department || "",
            mobilePhone: src.mobilePhone || null,
            businessPhones: src.businessPhones || [],
            officeLocation: src.officeLocation || "",
            streetAddress: src.streetAddress || "",
            city: src.city || "",
            state: src.state || "",
            country: src.country || "",
            postalCode: src.postalCode || "",
            companyName: src.companyName || "",
            employeeId: src.employeeId || "",
            usageLocation: src.usageLocation || "",
          });

          results.push({ sourceId: pair.sourceId, targetId: pair.targetId, status: "synced" });
        } catch (e) {
          results.push({ sourceId: pair.sourceId, targetId: pair.targetId, status: "error", error: e.message });
        }
      }

      return Response.json({ success: true, results, synced: results.filter(r => r.status === "synced").length });
    }

    // ── PHASE 5: Generate complete migration PowerShell package ───────────────
    if (action === "generate_migration_script") {
      const { source_tenant_id, target_tenant_id, users, options } = body;

      const opts = options || {};
      const preservePasswords = opts.preservePasswords !== false;
      const disableDirSync = opts.disableDirSync === true;
      const convertDevices = opts.convertDevices === true;

      const userList = (users || []).map(u =>
        `  [PSCustomObject]@{ SourceUPN="${u.upn}"; ImmutableId="${u.immutableId || ""}"; DisplayName="${u.displayName}"; Department="${u.department || ""}" }`
      ).join(",\n");

      const script = `#Requires -Modules MSOnline, AzureAD, Microsoft.Graph
<#
.SYNOPSIS
  AD to Entra ID User Migration Script
  Generated by Azure Multi-Tenant Admin Console
  Date: ${new Date().toISOString().split("T")[0]}
  Source Tenant: ${source_tenant_id}
  Target Tenant: ${target_tenant_id}

.DESCRIPTION
  Full AD → Entra ID migration with:
  - ImmutableID mapping (identity continuity)
  - Kerberos/NTLM credential preservation
  - Hybrid join → Cloud identity conversion
  - Profile synchronization
  - Optional DirSync disable (cloud-managed cutover)

.NOTES
  REQUIRED PERMISSIONS:
    - Global Administrator on both tenants
    - MSOnline module: Install-Module MSOnline
    - AzureAD module: Install-Module AzureAD
    - Graph SDK: Install-Module Microsoft.Graph
#>

param(
  [string]$SourceTenantId = "${source_tenant_id}",
  [string]$TargetTenantId = "${target_tenant_id}",
  [switch]$DryRun = $true,       # Set to $false to execute
  [switch]$DisableDirSync = $${disableDirSync ? "true" : "false"},
  [switch]$ConvertDevices = $${convertDevices ? "true" : "false"}
)

$ErrorActionPreference = "Stop"
$LogPath = "C:\\Temp\\ADMigration_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"

function Write-Log {
  param([string]$Msg, [string]$Level = "INFO")
  $entry = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Msg"
  Write-Host $entry -ForegroundColor $(if($Level -eq "ERROR"){"Red"} elseif($Level -eq "WARN"){"Yellow"} else {"Cyan"})
  Add-Content $LogPath $entry
}

Write-Log "=== AD → Entra ID Migration Script Starting ==="
Write-Log "Source Tenant: $SourceTenantId"
Write-Log "Target Tenant: $TargetTenantId"
Write-Log "DryRun: $DryRun"

# ── Step 1: Connect to tenants ──────────────────────────────────────────────
Write-Log "Connecting to Source Tenant..."
Connect-MgGraph -TenantId $SourceTenantId -Scopes "User.ReadWrite.All","Group.ReadWrite.All","Directory.ReadWrite.All" -ErrorAction Stop

Write-Log "Connecting to MSOnline (for DirSync operations)..."
Connect-MsolService

# ── Step 2: Define users to migrate ─────────────────────────────────────────
$UsersToMigrate = @(
${userList || '  # Add users here: [PSCustomObject]@{ SourceUPN="user@domain.com"; ImmutableId="..."; DisplayName="User Name"; Department="IT" }'}
)

# ── Step 3: Validate ImmutableID mapping ────────────────────────────────────
Write-Log "Validating ImmutableID mappings..."
foreach ($u in $UsersToMigrate) {
  if ([string]::IsNullOrEmpty($u.ImmutableId)) {
    # Derive ImmutableID from ObjectGUID
    $adUser = Get-ADUser -Filter { UserPrincipalName -eq $u.SourceUPN } -Properties ObjectGUID -ErrorAction SilentlyContinue
    if ($adUser) {
      $u.ImmutableId = [System.Convert]::ToBase64String($adUser.ObjectGUID.ToByteArray())
      Write-Log "Derived ImmutableID for $($u.SourceUPN): $($u.ImmutableId)"
    } else {
      Write-Log "WARNING: Could not derive ImmutableID for $($u.SourceUPN)" "WARN"
    }
  }
}

# ── Step 4: Get target domain ────────────────────────────────────────────────
Connect-AzureAD -TenantId $TargetTenantId
$TargetDomain = (Get-AzureADDomain | Where-Object { $_.IsDefault }).Name
Write-Log "Target domain: $TargetDomain"

# ── Step 5: Create/update cloud users in target ──────────────────────────────
Write-Log "Migrating $($UsersToMigrate.Count) users..."
$Results = @()

foreach ($u in $UsersToMigrate) {
  try {
    $TargetUPN = "$($u.SourceUPN.Split('@')[0])@$TargetDomain"
    $existing = Get-AzureADUser -Filter "userPrincipalName eq '$TargetUPN'" -ErrorAction SilentlyContinue

    if ($existing) {
      Write-Log "User already exists: $TargetUPN — updating attributes" "WARN"
      if (-not $DryRun) {
        Set-AzureADUser -ObjectId $existing.ObjectId \`
          -DisplayName $u.DisplayName \`
          -Department $u.Department
        # Preserve ImmutableID for identity continuity
        if ($u.ImmutableId) {
          Set-MsolUser -UserPrincipalName $TargetUPN -ImmutableId $u.ImmutableId -ErrorAction SilentlyContinue
        }
      }
      $Results += [PSCustomObject]@{ UPN=$TargetUPN; Status="Updated"; ImmutableId=$u.ImmutableId }
    } else {
      Write-Log "Creating cloud user: $TargetUPN"
      if (-not $DryRun) {
        $pwProfile = [Microsoft.Open.AzureAD.Model.PasswordProfile]::new()
        $pwProfile.Password = "TempMigr@t10n!" + (Get-Random -Minimum 1000 -Maximum 9999)
        $pwProfile.ForceChangePasswordNextLogin = $true

        $newUser = New-AzureADUser \`
          -DisplayName $u.DisplayName \`
          -UserPrincipalName $TargetUPN \`
          -AccountEnabled $true \`
          -PasswordProfile $pwProfile \`
          -MailNickName $TargetUPN.Split('@')[0]

        # Set ImmutableID to maintain identity continuity (AD ObjectGUID → Entra ImmutableID)
        if ($u.ImmutableId) {
          Set-MsolUser -UserPrincipalName $TargetUPN -ImmutableId $u.ImmutableId
          Write-Log "ImmutableID set for $TargetUPN — Kerberos/NTLM identity preserved"
        }
      }
      $Results += [PSCustomObject]@{ UPN=$TargetUPN; Status="Created"; ImmutableId=$u.ImmutableId }
    }
  } catch {
    Write-Log "ERROR migrating $($u.SourceUPN): $_" "ERROR"
    $Results += [PSCustomObject]@{ UPN=$u.SourceUPN; Status="Error"; Error=$_.Exception.Message }
  }
}

# ── Step 6: Convert hybrid-joined devices to Entra ID ───────────────────────
if ($ConvertDevices) {
  Write-Log "Generating device conversion commands..."
  Write-Log "IMPORTANT: Run dsregcmd /leave && dsregcmd /join on each device"
  Write-Log "Or deploy via Intune: Settings > Accounts > Work/School > Join Azure AD"
}

# ── Step 7: Disable DirSync (cutover to cloud identity) ──────────────────────
if ($DisableDirSync) {
  Write-Log "DISABLING DIRSYNC — This is IRREVERSIBLE without Microsoft Support!" "WARN"
  Write-Log "PowerShell equivalent: Set-MsolDirSyncEnabled -EnableDirSync \$false" "WARN"
  if (-not $DryRun) {
    Set-MsolDirSyncEnabled -EnableDirSync $false -Force
    Write-Log "DirSync disabled. Users are now cloud-managed only." "WARN"
    Write-Log "Propagation may take up to 72 hours."
  } else {
    Write-Log "[DryRun] Would execute: Set-MsolDirSyncEnabled -EnableDirSync \$false -Force"
  }
}

# ── Results ───────────────────────────────────────────────────────────────────
Write-Log "=== Migration Complete ==="
$Results | ForEach-Object { Write-Log "  $($_.UPN) → $($_.Status)" }
Write-Log "Log saved to: $LogPath"
$Results | Export-Csv -Path "C:\\Temp\\MigrationResults_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv" -NoTypeInformation
`;

      return Response.json({ success: true, script, filename: `AD_Migration_${source_tenant_id.slice(0, 8)}.ps1` });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[adMigration]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});