import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { authorizeAdminAction } from '../../shared/rbacCheck.ts';
import { getAccessToken, getTenantCreds } from '../../shared/graphClient.ts';
import { buildInventory } from '../../shared/tenantInventory.ts';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Build a phased migration plan that follows Microsoft Learn's
// "Cross-tenant mailbox migration" and "Microsoft 365 tenant-to-tenant migration"
// guidance. PowerShell snippets use placeholders — they document the required
// cmdlets and must be reviewed against the current Microsoft docs before running.
function buildMigrationPlan(srcName, tgtName, src, tgt, workloads) {
  const srcUsers = src?.users?.total ?? 0;
  const tgtUsers = tgt?.users?.total ?? 0;
  const srcMailboxes = src?.exchange?.mailboxes?.length ?? 0;
  const srcTeams = src?.teams?.teamCount ?? 0;
  const srcSites = src?.sharepoint?.siteCount ?? 0;
  const srcLicenses = src?.subscribedSkus?.length ?? 0;
  const tgtLicenses = tgt?.subscribedSkus?.length ?? 0;

  const phases = [
    {
      id: "assess",
      name: "Phase 1 — Assess & Plan",
      description: "Inventory both tenants, confirm source verified domains, validate target has enough licenses, and map users to their target identities.",
      tasks: [
        "Run a full inventory of the source and target tenants (completed in this step).",
        `Source: ${srcUsers} users, ${srcMailboxes} mail-enabled mailboxes, ${srcTeams} teams, ${srcSites} SharePoint sites, ${srcLicenses} subscribed SKUs.`,
        `Target: ${tgtUsers} users, ${tgtLicenses} subscribed SKUs — ensure target has sufficient licenses for every migrating user.`,
        "Build a user-mapping table: source UPN -> target UPN, preserving primary SMTP and proxy addresses.",
        "Identify shared mailboxes, resource mailboxes, distribution lists and groups to migrate separately.",
        "Decide cutover window and communicate to users.",
      ],
    },
    {
      id: "prepare_source",
      name: "Phase 2 — Prepare Source Tenant (Exchange cross-tenant)",
      description: "Per Microsoft Learn 'Set up your tenants for cross-tenant mailbox migration': enable the source tenant for mailbox migration and publish the migration scope.",
      tasks: [
        "Connect to Exchange Online PowerShell in the SOURCE tenant.",
        "Create the org relationship to the target tenant with MailboxMigrationCapable enabled.",
        "Create a mail-enabled security group containing the mailboxes in scope and publish it as the migration scope.",
        "Confirm ApplicationImpersonation / MailboxMigration capability is available on the service principal.",
      ],
      powershell: `# Run in SOURCE tenant (${srcName}) — Exchange Online PowerShell
Connect-ExchangeOnline

# 1. Enable cross-tenant mailbox migration to the target tenant
New-OrganizationRelationship `
        + `-Name "MigrationTo_${tgtName.replace(/\\s+/g, "_")}" `
        + `-TargetTenantId "<TARGET_TENANT_GUID>" `
        + `-Enabled $true -MailboxMigrationCapable $true

# 2. Create a security group of mailboxes allowed to migrate
New-DistributionGroup -Name "MigrationScope_<TARGET>" -Type "Security"
# Add migrating mailboxes:
Add-DistributionGroupMember -Identity "MigrationScope_<TARGET>" -Member "user@${"<source_domain>"}"

# 3. Publish the migration scope on the relationship
Set-OrganizationRelationship -Identity "MigrationTo_${tgtName.replace(/\\s+/g, "_")}" `
        + `-MailboxMovePublishedScopes "MigrationScope_<TARGET>"

# Reference: https://learn.microsoft.com/en-us/exchange/cross-tenant-migration`,
    },
    {
      id: "prepare_target",
      name: "Phase 3 — Prepare Target Tenant (Exchange cross-tenant)",
      description: "Per Microsoft Learn: create the org relationship to the source, create the cross-tenant migration endpoint, and create MailUser objects for each migrating mailbox.",
      tasks: [
        "Connect to Exchange Online PowerShell in the TARGET tenant.",
        "Create the org relationship to the source tenant (OAuth-enabled, MailboxMigrationCapable).",
        "Create a migration endpoint of type ExchangeRemoteMove pointing at the source tenant.",
        "Create a MailUser in the target for every source mailbox (ExternalEmailAddress = source primary SMTP, target UPN = target identity).",
        "Assign the target licenses to each MailUser so the mailbox provisions on move completion.",
      ],
      powershell: `# Run in TARGET tenant (${tgtName}) — Exchange Online PowerShell
Connect-ExchangeOnline

# 1. Org relationship back to the source tenant
New-OrganizationRelationship `
        + `-Name "MigrationFrom_${srcName.replace(/\\s+/g, "_")}" `
        + `-DomainNames "<SOURCE_VERIFIED_DOMAIN>" `
        + `-Enabled $true -MailboxMigrationCapable $true `
        + `-OauthEnabled $true -TargetApplicationId "<SOURCE_MIGRATION_APP_ID>"

# 2. Cross-tenant migration endpoint
New-MigrationEndpoint -Name "CrossTenant" `
        + `-ExchangeRemoteMove -RemoteServer "outlook.office.com" `
        + `-RemoteTenant "<SOURCE_TENANT_GUID>"

# 3. Create a target MailUser for each migrating mailbox (loop)
New-MailUser -Name "John Doe" `
        + `-ExternalEmailAddress "john@<source_domain>" `
        + `-MicrosoftOnlineServicesID "john@<target_domain>" `
        + `-PrimarySmtpAddress "john@<target_domain>"

# 4. License the MailUser so the mailbox is provisioned after the move completes
Set-MailUser -Identity "john@<target_domain>" -ExchangeGuid "<SOURCE_EXCHANGE_GUID>"`,
    },
    {
      id: "migrate",
      name: "Phase 4 — Migrate Workloads",
      description: "Run the per-workload migrations: Exchange move requests, OneDrive & SharePoint via Migration Manager / SPMT, Teams via a Microsoft-supported migration tool.",
      tasks: workloads.includes("exchange") ? [
        "In the TARGET tenant, create a New-MoveRequest for each MailUser targeting the migration endpoint.",
        "Monitor move batch status until Complete; batch large orgs in waves.",
      ] : ["Exchange not selected — skip."],
      powershell: workloads.includes("exchange") ? `# TARGET tenant — start the migration batch
New-MigrationBatch -Name "CrossTenantBatch" `
        + `-SourceEndpoint "CrossTenant" `
        + `-TargetEndpoint "CrossTenant" `
        + `-CSVData (Get-Content "MigrationUsers.csv" -Encoding Byte) `
        + `-AutoStart -AutoComplete

# Monitor
Get-MigrationBatch -Identity "CrossTenantBatch" | fl
Get-MoveRequest | Get-MoveRequestStatistics` : "",
    },
    {
      id: "workloads_od_sp",
      name: "Phase 4b — OneDrive & SharePoint",
      description: "Microsoft Migration Manager / SharePoint Migration Tool (SPMT) for OneDrive and SharePoint content.",
      tasks: workloads.includes("onedrive") || workloads.includes("sharepoint") ? [
        "Provision target OneDrive drives (trigger each user's OneDrive via Graph / admin center).",
        "Run Microsoft Migration Manager: map source OneDrive / SharePoint sites to target.",
        "Re-apply SharePoint site permissions and external sharing settings on the target.",
        "Verify all ${srcSites} source SharePoint sites are mapped.",
      ] : ["OneDrive/SharePoint not selected — skip."],
    },
    {
      id: "workloads_teams",
      name: "Phase 4c — Microsoft Teams",
      description: "Teams channels/files move with SharePoint; 1:1 and group chats require a Microsoft-supported migration solution or ISV tool.",
      tasks: workloads.includes("teams") ? [
        "Recreate the ${srcTeams} source Teams in the target tenant.",
        "Migrate Teams files (stored in SharePoint) via Migration Manager.",
        "Migrate Teams chat history via a supported ISV / Microsoft migration partner (not native to Graph).",
        "Verify channel structure and membership in the target.",
      ] : ["Teams not selected — skip."],
    },
    {
      id: "complete",
      name: "Phase 5 — Complete & Cutover",
      description: "Finalize moves, repoint DNS/MX and autodiscover to the target tenant, decommission source mailboxes.",
      tasks: [
        "Complete all move requests (New-MoveRequest with -CompleteAfter).",
        "Update MX, autodiscover CNAME and SPF/DKIM/DMARC DNS records to the target tenant.",
        "Verify mail flow inbound to the target; run mail flow tests.",
        "Convert source mailboxes to shared/deleted per the retention policy.",
      ],
    },
    {
      id: "post",
      name: "Phase 6 — Post-Migration Validation",
      description: "Validate the target tenant and revoke source access.",
      tasks: [
        "Validate each user can sign in, mail flows, OneDrive and Teams work, and licenses are correct.",
        "Run the target tenant inventory again and compare to the source inventory.",
        "Revoke Global Admin / delegated access in the source tenant and disable source accounts after the agreed grace period.",
        "Archive the migration job and audit log for compliance.",
      ],
    },
  ];

  return {
    sourceTenant: srcName,
    targetTenant: tgtName,
    workloads,
    generatedAt: new Date().toISOString(),
    summary: {
      source: { users: srcUsers, mailboxes: srcMailboxes, teams: srcTeams, sharepointSites: srcSites, subscribedSkus: srcLicenses },
      target: { users: tgtUsers, subscribedSkus: tgtLicenses },
    },
    prerequisites: [
      "Global Admin / Exchange Admin in BOTH the source and target tenants.",
      "The Azure App Registration (used by this console) granted Directory.Read.All, Organization.Read.All, Sites.Read.All, Team.ReadBasic.All, User.Read.All and MailboxSettings.Read in each tenant.",
      "Source tenant verified domain(s) and target tenant verified domain(s) configured.",
      "Sufficient licenses provisioned in the target for every migrating user.",
      "Microsoft Learn: 'Set up your tenants for cross-tenant mailbox migration' reviewed and signed off.",
    ],
    phases,
    disclaimer: "This plan follows Microsoft Learn's cross-tenant migration guidance. The PowerShell snippets are templates with placeholders — review them against the current Microsoft documentation and test in a pilot before production. Actual OneDrive/SharePoint/Teams content migration uses Microsoft Migration Manager or an approved ISV tool.",
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // ── Inventory both source and target tenants ────────────────────────────
    if (action === "inventory_both") {
      const { source_azure_tenant_id, target_azure_tenant_id, top = 50 } = body;
      const denied = await authorizeAdminAction(base44, user, [source_azure_tenant_id, target_azure_tenant_id]);
      if (denied) return denied;
      for (const id of [source_azure_tenant_id, target_azure_tenant_id]) {
        if (!id || !GUID.test(id)) return Response.json({ error: "Invalid tenant id (must be a GUID): " + id }, { status: 400 });
      }
      const [srcCreds, tgtCreds] = await Promise.all([
        getTenantCreds(base44, source_azure_tenant_id),
        getTenantCreds(base44, target_azure_tenant_id),
      ]);
      const [srcToken, tgtToken] = await Promise.all([
        getAccessToken(source_azure_tenant_id, srcCreds.clientId, srcCreds.clientSecret),
        getAccessToken(target_azure_tenant_id, tgtCreds.clientId, tgtCreds.clientSecret),
      ]);
      const [source, target] = await Promise.all([
        buildInventory(srcToken, top),
        buildInventory(tgtToken, top),
      ]);
      return Response.json({ success: true, source, target });
    }

    // ── Generate the Microsoft-aligned migration plan ────────────────────────
    if (action === "generate_plan") {
      const {
        source_azure_tenant_id, target_azure_tenant_id,
        source_name, target_name,
        workloads = ["exchange", "onedrive", "sharepoint", "teams"],
        inventory_source, inventory_target,
      } = body;

      const denied = await authorizeAdminAction(base44, user, [source_azure_tenant_id, target_azure_tenant_id]);
      if (denied) return denied;

      let source = inventory_source;
      let target = inventory_target;
      if (!source || !target) {
        for (const id of [source_azure_tenant_id, target_azure_tenant_id]) {
          if (!id || !GUID.test(id)) return Response.json({ error: "Invalid tenant id (must be a GUID): " + id }, { status: 400 });
        }
        const [srcCreds, tgtCreds] = await Promise.all([
          getTenantCreds(base44, source_azure_tenant_id),
          getTenantCreds(base44, target_azure_tenant_id),
        ]);
        const [srcToken, tgtToken] = await Promise.all([
          getAccessToken(source_azure_tenant_id, srcCreds.clientId, srcCreds.clientSecret),
          getAccessToken(target_azure_tenant_id, tgtCreds.clientId, tgtCreds.clientSecret),
        ]);
        [source, target] = await Promise.all([buildInventory(srcToken, 50), buildInventory(tgtToken, 50)]);
      }

      const plan = buildMigrationPlan(
        source_name || source?.organization?.displayName || source_azure_tenant_id,
        target_name || target?.organization?.displayName || target_azure_tenant_id,
        source, target, workloads,
      );
      return Response.json({ success: true, plan, source, target });
    }

    return Response.json({ error: "Unknown action: " + action }, { status: 400 });
  } catch (err) {
    console.error("[tenantMigration]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}