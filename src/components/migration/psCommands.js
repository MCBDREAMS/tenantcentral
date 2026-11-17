// CloudCommand — PowerShell session command catalog.
//
// Cloud commands are executed against Microsoft 365 through psConsole (Graph).
// Local commands cannot be driven from a web app at all (Exchange delegate
// permissions, PST export, mailbox type changes), so the session emits a complete,
// tenant-scoped script for the console operator to run on a Windows host.

const EXCHANGE_SCOPE = "https://outlook.office365.com/.default";

export const CLOUD_COMMANDS = [
  {
    name: "Connect-MgGraph",
    usage: "Connect-MgGraph [-Tenant source|target]",
    description: "Validates the app registration against the tenant and returns its identity.",
    action: "connect",
    sample: "Connect-MgGraph",
  },
  {
    name: "Get-MgUser",
    usage: "Get-MgUser -UserPrincipalName <upn> [-Tenant source|target]",
    description: "Identity snapshot for cutover: ObjectId, ImmutableId, proxy addresses, licences.",
    action: "get_user",
    required: ["userprincipalname"],
    sample: "Get-MgUser -UserPrincipalName alex@contoso.com",
  },
  {
    name: "Set-UserImmutableId",
    usage: "Set-UserImmutableId -UserPrincipalName <upn> -ImmutableId <base64-guid>",
    description: "Stamps onPremisesImmutableId so the cloud account matches its AD object.",
    action: "set_immutable_id",
    required: ["userprincipalname", "immutableid"],
    sample: "Set-UserImmutableId -UserPrincipalName alex@contoso.com -ImmutableId Xk3k0m0Q0EuUu0kUu0kUuA==",
  },
  {
    name: "Reset-UserPassword",
    usage: "Reset-UserPassword -UserPrincipalName <upn> [-Password <value>]",
    description: "Issues a temporary password that must be changed at next sign-in.",
    action: "reset_password",
    required: ["userprincipalname"],
    sample: "Reset-UserPassword -UserPrincipalName alex@contoso.com",
  },
  {
    name: "Set-UserEnabled",
    usage: "Set-UserEnabled -UserPrincipalName <upn> -Enabled $true|$false [-Tenant source|target]",
    description: "Enable or block an account on either side of the cutover.",
    action: "set_enabled",
    required: ["userprincipalname", "enabled"],
    sample: "Set-UserEnabled -UserPrincipalName alex@contoso.com -Enabled $false -Tenant source",
  },
  {
    name: "Get-MgDomain",
    usage: "Get-MgDomain [-Tenant source|target]",
    description: "Verified domains with authentication type — check before moving a domain.",
    action: "get_domains",
    sample: "Get-MgDomain -Tenant target",
  },
];

export const LOCAL_COMMANDS = [
  {
    name: "Get-MailboxPermission",
    usage: "Get-MailboxPermission -Mailbox <smtp>",
    description: "Lists delegates (FullAccess / SendAs) — Exchange only, no Graph equivalent.",
    required: ["mailbox"],
    script: (p) =>
      [
        "Get-MailboxPermission -Identity '" + p.mailbox + "' |",
        "  Where-Object { $_.User -notlike 'NT AUTHORITY\\*' -and -not $_.IsInherited } |",
        "  Select-Object User, AccessRights, IsInherited | Format-Table -AutoSize",
        "",
        "Get-RecipientPermission -Trustee '" + p.mailbox + "' | Select-Object Trustee, AccessRights",
      ].join("\n"),
  },
  {
    name: "Grant-MailboxFullAccess",
    usage: "Grant-MailboxFullAccess -Mailbox <smtp> -User <smtp>",
    description: "Grants FullAccess delegate rights to another account.",
    required: ["mailbox", "user"],
    script: (p) =>
      [
        "Add-MailboxPermission -Identity '" + p.mailbox + "' -User '" + p.user + "' `",
        "  -AccessRights FullAccess -InheritanceType All -AutoMapping $true",
        "",
        "# Verify",
        "Get-MailboxPermission -Identity '" + p.mailbox + "' -User '" + p.user + "' | Format-List",
      ].join("\n"),
  },
  {
    name: "Revoke-MailboxFullAccess",
    usage: "Revoke-MailboxFullAccess -Mailbox <smtp> -User <smtp>",
    description: "Removes FullAccess delegate rights from another account.",
    required: ["mailbox", "user"],
    script: (p) =>
      [
        "Remove-MailboxPermission -Identity '" + p.mailbox + "' -User '" + p.user + "' `",
        "  -AccessRights FullAccess -InheritanceType All -Confirm:$false",
      ].join("\n"),
  },
  {
    name: "Convert-MailboxToShared",
    usage: "Convert-MailboxToShared -Mailbox <smtp>",
    description: "Used at cutover to turn a migrated user mailbox into a shared mailbox.",
    required: ["mailbox"],
    script: (p) =>
      [
        "Set-Mailbox -Identity '" + p.mailbox + "' -Type Shared",
        "",
        "# A shared mailbox must not keep a licence: assign it to a user or the mailbox is disabled.",
        "Get-Mailbox -Identity '" + p.mailbox + "' | Select-Object Name, RecipientTypeDetails, ProhibitSendReceiveQuota",
      ].join("\n"),
  },
  {
    name: "Set-MailboxArchive",
    usage: "Set-MailboxArchive -Mailbox <smtp> [-Disable]",
    description: "Enables (or disables) the online archive ahead of a mailbox move.",
    required: ["mailbox"],
    script: (p, params) =>
      params.disable
        ? "Disable-Mailbox -Identity '" + p.mailbox + "' -Archive -Confirm:$false"
        : [
            "Enable-Mailbox -Identity '" + p.mailbox + "' -Archive",
            "Get-Mailbox -Identity '" + p.mailbox + "' | Select-Object Name, ArchiveStatus, ArchiveDatabase",
          ].join("\n"),
  },
  {
    name: "Export-MailboxToPst",
    usage: "Export-MailboxToPst -Mailbox <smtp> [-Path <unc-path>]",
    description: "PST export for mailbox content that cannot be copied through Graph.",
    required: ["mailbox"],
    script: (p, params) => {
      const alias = String(p.mailbox).split("@")[0];
      const path = params.path || "\\\\fileserver\\migration\\" + alias + ".pst";
      return [
        "# On-premises Exchange: New-MailboxExportRequest (requires the Mailbox Import Export role).",
        "New-MailboxExportRequest -Mailbox '" + p.mailbox + "' -FilePath '" + path + "'",
        "Get-MailboxExportRequest -Mailbox '" + p.mailbox + "' | Get-MailboxExportRequestStatistics |",
        "  Select-Object Status, PercentComplete, FilePath | Format-Table -AutoSize",
        "",
        "# Exchange Online has no export cmdlet — use a Purview eDiscovery search and export instead:",
        "#   New-ComplianceSearch -Name 'MIG-" + alias + "' -ExchangeLocation '" + p.mailbox + "' -ContentMatchQuery '(Received>=01/01/2020)'",
        "#   Start-ComplianceSearch -Identity 'MIG-" + alias + "'",
      ].join("\n");
    },
  },
];

export const QUICK_COMMANDS = [
  "Connect-MgGraph",
  "Get-MgUser -UserPrincipalName ",
  "Get-MgDomain -Tenant target",
  "Get-MailboxPermission -Mailbox ",
  "Grant-MailboxFullAccess -Mailbox  -User ",
  "Convert-MailboxToShared -Mailbox ",
];

/** Splits a PowerShell-style line into a verb and its -Parameter values. */
export function parseCommandLine(raw) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    tokens.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  }
  if (!tokens.length) return null;
  const params = {};
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("-") && t.length > 1) {
      const key = t.replace(/^-+/, "").toLowerCase();
      const next = tokens[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        params[key] = next;
        i += 1;
      } else {
        params[key] = true;
      }
    }
  }
  return { verb: tokens[0], params };
}

export function findCloudCommand(verb) {
  return CLOUD_COMMANDS.find((c) => c.name.toLowerCase() === String(verb).toLowerCase()) || null;
}

export function findLocalCommand(verb) {
  return LOCAL_COMMANDS.find((c) => c.name.toLowerCase() === String(verb).toLowerCase()) || null;
}

export function isPowerShellStatement(line) {
  return /^\s*(Get|Set|New|Remove|Add|Enable|Disable|Connect|Disconnect|Start|Stop|Test|Export|Import|Update|Grant|Revoke|Convert|Resolve|Invoke|Move|Suspend|Resume)-[A-Za-z]+/.test(
    line,
  );
}

export function missingParams(command, params) {
  return (command.required || []).filter((key) => {
    const value = params[key];
    return value === undefined || value === true || String(value).trim() === "";
  });
}

/** Exchange Online connection preamble shared by every generated script. */
export function exchangePreamble(ctx) {
  const tenant = ctx.side === "target" ? ctx.targetTenant : ctx.sourceTenant;
  const name = tenant?.name || "tenant not selected";
  const sideLabel = ctx.side === "target" ? "TARGET" : "SOURCE";
  const tenantId = tenant?.tenant_id || "<azure-tenant-id>";
  const appId = tenant?.azure_client_id || "<app-client-id>";
  const organization = tenant?.domain || "<tenant>.onmicrosoft.com";

  return [
    "# ============================================================",
    "# CloudCommand — " + sideLabel + ": " + name,
    "# Run on a host with the ExchangeOnlineManagement module installed.",
    "# ============================================================",
    "$tenantId     = '" + tenantId + "'",
    "$appId        = '" + appId + "'",
    "$clientSecret = Get-Content '<path-to-secret>'   # never stored in the web app",
    "$organization = '" + organization + "'",
    "",
    "$body = @{",
    "  grant_type    = 'client_credentials'",
    "  client_id     = $appId",
    "  client_secret = $clientSecret",
    "  scope         = '" + EXCHANGE_SCOPE + "'",
    "}",
    "$token = (Invoke-RestMethod -Method Post `",
    "  -Uri \"https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token\" -Body $body).access_token",
    "",
    "Connect-ExchangeOnline -AccessToken $token -Organization $organization -ShowBanner:$false",
    "",
    "",
  ].join("\n");
}

export function buildLocalScript(command, params, ctx) {
  return exchangePreamble(ctx) + command.script(params, ctx);
}

export function buildAdHocScript(line, ctx) {
  return [
    exchangePreamble(ctx),
    "# Ad-hoc statement from the migration session",
    line,
    "",
  ].join("\n");
}

export function helpLines() {
  return [
    "CloudCommand migration session",
    "",
    "Executed in the cloud (Microsoft 365 Graph):",
    ...CLOUD_COMMANDS.map((c) => "  " + c.usage + "\n      " + c.description),
    "",
    "Generated as a local Exchange script (no cloud equivalent):",
    ...LOCAL_COMMANDS.map((c) => "  " + c.usage + "\n      " + c.description),
    "",
    "Any other verb-noun statement is wrapped in the same connection preamble and returned as a script.",
    "Session commands:  Get-Command   help   Clear-Host",
    "Use -Tenant source|target on any cloud cmdlet to run it against the other side.",
    "Arrow Up / Down recalls history.",
  ];
}