/**
 * Migration suite engine: pre-migration scans, post-migration drift audits and
 * generation of the PowerShell/CSV script packs that actually move the data.
 *
 * The app never touches the customer's source systems directly for these
 * sources (on-prem SharePoint, file shares, Google Workspace, Box). The scripts
 * generated here run on the customer's host, emit CSV inventories, and those
 * CSVs are analysed here.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { authorizeAdminAction } from "../../shared/rbacCheck.ts";

const ILLEGAL_CHARS = ['"', "*", ":", "<", ">", "?", "/", "\\", "|", "#", "%"];
const BLOCKED_EXT = [
  "exe", "dll", "com", "bat", "cmd", "ps1", "ashx", "asmx", "aspx", "config",
  "mdf", "ldf", "msi", "jar", "vbs", "scr", "cpl", "hta", "psd1", "psm1",
];
const NATIVE_CONVERT = /(google\s+(docs?|sheets?|slides?)|gdoc|gsheet|gslide|boxnote|box note)/i;
const UNSUPPORTED_FEATURE = /(infopath|workflow|master\s*page|web\s*part|webpart|content\s*type\s*hub|publishing\s*page)/i;
const MAX_ROWS = 20000;
const MAX_FINDINGS = 400;

function toNumber(v) {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

function lowerKeys(row) {
  const out = {};
  if (!row || typeof row !== "object") return out;
  for (const k of Object.keys(row)) out[String(k).trim().toLowerCase()] = row[k];
  return out;
}

function normalizeRows(rows) {
  const list = Array.isArray(rows) ? rows.slice(0, MAX_ROWS) : [];
  return list.map((raw) => {
    const r = lowerKeys(raw);
    return {
      item_type: String(r.itemtype || r["item type"] || r.type || "File"),
      path: String(r.path || r.sourcepath || r.source_path || r.filepath || "").trim(),
      name: String(r.name || r.filename || r.file || "").trim(),
      size: toNumber(r.sizebytes || r.size || r.filesize || r["size bytes"]),
      versions: toNumber(r.versions || r.versioncount || r["version count"]),
      unique_permissions:
        toBool(r.uniqueroleassignments) ||
        toBool(r.uniquepermissions) ||
        toBool(r["unique permissions"]),
      modified: String(r.modified || r.modifieddate || ""),
      author: String(r.author || r.editor || r.createdby || ""),
    };
  });
}

function extensionOf(name) {
  const i = String(name).lastIndexOf(".");
  return i > -1 ? String(name).slice(i + 1).toLowerCase() : "";
}

function normalizedKey(row) {
  const joined = `${row.path.replace(/\\/g, "/")}/${row.name}`.replace(/\/+/g, "/");
  return joined.toLowerCase();
}

function scanSource(rows) {
  const findings = [];
  const byCode = {};
  const seen = new Map();

  const add = (severity, code, item, detail, recommendation) => {
    if (findings.length >= MAX_FINDINGS) return;
    byCode[code] = (byCode[code] || 0) + 1;
    findings.push({ severity, code, item, detail, recommendation });
  };

  for (const row of rows) {
    const label = row.path ? `${row.path}/${row.name}` : row.name || "(unnamed item)";
    const name = row.name || "";

    const badChar = ILLEGAL_CHARS.find((c) => name.includes(c));
    if (badChar) {
      add(
        "critical",
        "illegal_characters",
        label,
        `Name contains the SharePoint-illegal character "${badChar}"`,
        "Rename the item in the source, or map it in the project mapping sheet before rerunning discovery",
      );
      continue;
    }
    if (/[ .]$/.test(name)) {
      add(
        "critical",
        "illegal_characters",
        label,
        "Name ends with a space or a period, which SharePoint strips and then cannot resolve",
        "Rename the item so it ends with a letter or number",
      );
    }

    if (label.length > 400) {
      add(
        "critical",
        "path_too_long",
        label,
        `Full path is ${label.length} characters, over the 400 character limit`,
        "Shorten the folder tree or map the item to a shorter destination path",
      );
    } else if (label.length > 260) {
      add(
        "warning",
        "path_too_long",
        label,
        `Full path is ${label.length} characters and may hit desktop/Office path limits`,
        "Shorten the destination folder structure",
      );
    }

    const key = normalizedKey(row);
    if (seen.has(key)) {
      add(
        "warning",
        "duplicate_target",
        label,
        "Another item resolves to the same destination path",
        "Decide which item wins; the second copy will otherwise overwrite the first",
      );
    } else {
      seen.set(key, true);
    }

    if (row.unique_permissions) {
      add(
        "warning",
        "unique_permissions",
        label,
        "Item breaks permission inheritance",
        "Map each principal to the target tenant and confirm the destination is ready for item-level permissions",
      );
    }

    if (row.versions > 100) {
      add(
        "info",
        "high_versions",
        label,
        `${row.versions} versions will be copied`,
        "Limit versions to the last 10 in the migration run settings to cut transfer time",
      );
    }

    if (row.size > 100 * 1024 * 1024 * 1024) {
      add(
        "critical",
        "large_file",
        label,
        "File is larger than 100 GB",
        "Split the file or move it with AzCopy directly against SharePoint",
      );
    } else if (row.size > 15 * 1024 * 1024 * 1024) {
      add(
        "warning",
        "large_file",
        label,
        "File is larger than 15 GB and will be slow over the standard path",
        "Use Insane mode so the transfer stages through Azure storage",
      );
    }

    if (row.size === 0) {
      add("info", "empty_file", label, "File is zero bytes", "Confirm whether an empty placeholder should be migrated");
    }

    const ext = extensionOf(name);
    if (ext && BLOCKED_EXT.includes(ext)) {
      add(
        "critical",
        "blocked_file_type",
        label,
        `".${ext}" is a blocked file type in SharePoint Online`,
        "Exclude the file or agree a supported replacement with the business",
      );
    }

    if (NATIVE_CONVERT.test(row.item_type) || NATIVE_CONVERT.test(name)) {
      add(
        "warning",
        "native_format_conversion",
        label,
        "Native cloud document has no direct Microsoft 365 equivalent",
        "Enable conversion (Google Docs to Word, Sheets to Excel, Slides to PowerPoint) in the script settings",
      );
    }

    if (UNSUPPORTED_FEATURE.test(row.item_type) || UNSUPPORTED_FEATURE.test(name)) {
      add(
        "warning",
        "unsupported_destination_feature",
        label,
        `Item type "${row.item_type}" is not available in the destination as-is`,
        "Rebuild it as a modern SharePoint page, Power Automate flow or list, and exclude it from the copy run",
      );
    }
  }

  const severity = { critical: 0, warning: 0, info: 0 };
  findings.forEach((f) => {
    severity[f.severity] = (severity[f.severity] || 0) + 1;
  });

  return {
    total_rows: rows.length,
    severity,
    by_code: byCode,
    ready: severity.critical === 0,
    findings,
  };
}

function compareRuns(sourceRows, targetRows) {
  const targetMap = new Map();
  targetRows.forEach((row) => targetMap.set(normalizedKey(row), row));

  const findings = [];
  const byCode = {};
  const add = (severity, code, item, detail, recommendation) => {
    if (findings.length >= MAX_FINDINGS) return;
    byCode[code] = (byCode[code] || 0) + 1;
    findings.push({ severity, code, item, detail, recommendation });
  };

  let matched = 0;
  let missing = 0;

  for (const src of sourceRows) {
    const label = `${src.path}/${src.name}`.replace(/\/+/g, "/");
    const tgt = targetMap.get(normalizedKey(src));

    if (!tgt) {
      missing += 1;
      add("critical", "not_migrated", label, "No matching item in the destination scan", "Requeue the item and check the run log for the failure reason");
      continue;
    }

    matched += 1;

    if (src.size > 0 && tgt.size > 0) {
      const delta = Math.abs(src.size - tgt.size);
      if (delta > Math.max(1024, src.size * 0.01)) {
        add(
          "warning",
          "size_mismatch",
          label,
          `Source ${src.size} bytes, destination ${tgt.size} bytes`,
          "Re-copy the item; a truncated transfer usually means throttling or a dropped session",
        );
      }
    }

    if (src.versions > 0 && tgt.versions < src.versions) {
      add(
        "warning",
        "version_loss",
        label,
        `${src.versions} versions at source, ${tgt.versions} in destination`,
        "Rerun the copy with version history enabled",
      );
    }

    if (src.unique_permissions && !tgt.unique_permissions) {
      add(
        "warning",
        "permission_drift",
        label,
        "Item had unique permissions at source and inherits in the destination",
        "Reapply the mapped principals, then re-verify with the permission report",
      );
    }
  }

  const sourceKeys = new Set(sourceRows.map(normalizedKey));
  let extra = 0;
  for (const tgt of targetRows) {
    if (!sourceKeys.has(normalizedKey(tgt))) {
      extra += 1;
      add(
        "info",
        "extra_in_target",
        `${tgt.path}/${tgt.name}`.replace(/\/+/g, "/"),
        "Exists in the destination but not in the source scan",
        "Confirm it is expected; it may be pre-existing content or a duplicate run",
      );
    }
  }

  const severity = { critical: 0, warning: 0, info: 0 };
  findings.forEach((f) => {
    severity[f.severity] = (severity[f.severity] || 0) + 1;
  });

  return {
    source_count: sourceRows.length,
    target_count: targetRows.length,
    matched,
    missing,
    extra,
    severity,
    by_code: byCode,
    findings,
  };
}

function isInsane(project) {
  return project.mode === "insane";
}

function sharePointUrl(project) {
  const domain = String(project.target_domain || "").trim().toLowerCase();
  if (domain.endsWith(".sharepoint.com")) return `https://${domain}`;
  const label = domain.split(".")[0] || "contoso";
  return `https://${label}.sharepoint.com`;
}

function scriptDiscovery(project) {
  const source = project.source_endpoint || "https://sps2019.contoso.local";
  return [
    "<#",
    "  CloudCommand migration - discovery scan",
    `  Project : ${project.name}`,
    `  Source  : ${source}`,
    "  Output  : CSV inventory consumed by the pre-migration scan in CloudCommand.",
    "  Sites   : when sharepoint-sites.csv is present (from cloudcommand-sharepoint-sites.ps1)",
    "            every site collection in that file is scanned, not just -SourceUrl.",
    "  Requires: PnP.PowerShell 2.x  (Install-Module PnP.PowerShell -Scope CurrentUser)",
    "#>",
    "[CmdletBinding()]",
    "param(",
    `  [string]$SourceUrl = "${source}",`,
    '  [string]$SitesCsv = ".\\sharepoint-sites.csv",',
    '  [string]$OutputCsv = ".\\inventory-source.csv",',
    "  [int]$ThrottleMs = 250,",
    "  [switch]$IncludeSubsites",
    ")",
    "",
    '$ErrorActionPreference = "Stop"',
    "",
    "if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {",
    '  throw "PnP.PowerShell is required. Run: Install-Module PnP.PowerShell -Scope CurrentUser -Force"',
    "}",
    "Import-Module PnP.PowerShell",
    "",
    "$siteUrls = @()",
    "if (Test-Path $SitesCsv) {",
    "  $siteUrls = @(Import-Csv -Path $SitesCsv | Select-Object -ExpandProperty Url | Where-Object { $_ })",
    '  Write-Host ("Loaded {0} site collections from {1}" -f $siteUrls.Count, $SitesCsv)',
    "}",
    "if ($siteUrls.Count -eq 0) {",
    "  $siteUrls = @($SourceUrl)",
    '  Write-Host "No sites CSV found - scanning the single source URL only."',
    "}",
    "",
    "$rows = New-Object System.Collections.Generic.List[object]",
    "",
    "foreach ($site in $siteUrls) {",
    '  Write-Host "Connecting to $site"',
    "  Connect-PnPOnline -Url $site -Interactive",
    "",
    "  $webUrls = @($site)",
    "  if ($IncludeSubsites) { $webUrls += (Get-PnPSubWeb -Recurse | Select-Object -ExpandProperty Url) }",
    "",
    "  foreach ($web in $webUrls) {",
    '    Write-Host "Scanning $web"',
    "    $libraries = Get-PnPList -Web $web | Where-Object { $_.BaseType -eq 'DocumentLibrary' -and -not $_.Hidden }",
    "",
    "    foreach ($library in $libraries) {",
    "      $items = Get-PnPListItem -List $library -PageSize 500 -Fields FileLeafRef,FileRef,FileSize,Modified,Editor,HasUniqueRoleAssignments",
    "",
    "      foreach ($item in $items) {",
    "        $serverRelative = [string]$item['FileRef']",
    "        if (-not $serverRelative) { continue }",
    "        $fileName = [string]$item['FileLeafRef']",
    "        $versions = 0",
    "        try { $versions = @(Get-PnPFileVersion -Url $serverRelative -ErrorAction Stop).Count } catch { $versions = 0 }",
    "",
    "        $rows.Add([pscustomobject]@{",
    "          ItemType            = 'File'",
    "          Path                = $serverRelative.Substring(0, [Math]::Max(0, $serverRelative.LastIndexOf('/')))",
    "          Name                = $fileName",
    "          SizeBytes           = [int64]$item['FileSize']",
    "          Versions            = $versions",
    "          UniquePermissions   = [bool]$item['HasUniqueRoleAssignments']",
    "          Modified            = $item['Modified']",
    "          Author              = $item['Editor'].LookupValue",
    "        })",
    "        Start-Sleep -Milliseconds $ThrottleMs",
    "      }",
    "    }",
    "  }",
    "}",
    "",
    '$rows | Export-Csv -Path $OutputCsv -NoTypeInformation -Encoding UTF8',
    'Write-Host ("Discovered {0} items across {1} site collections. Upload {2} in the project Pre-Migration Scan tab." -f $rows.Count, $siteUrls.Count, $OutputCsv)',
    "",
  ].join("\n");
}

function scriptSites(project) {
  const source = project.source_endpoint || "https://contoso.sharepoint.com";
  return [
    "<#",
    "  CloudCommand migration - SharePoint site collection inventory",
    `  Project : ${project.name}`,
    `  Source  : ${source}`,
    "  Output  : sharepoint-sites.csv - every site collection in the source tenant.",
    "  Next    : run cloudcommand-discover.ps1 -SitesCsv .\\sharepoint-sites.csv to",
    "            inventory every site in that list instead of a single URL.",
    "",
    "  Online  : needs PnP.PowerShell 2.x and SharePoint Administrator on the source tenant.",
    "  On-prem : run this on a SharePoint server in the farm (uses Get-SPSite).",
    "#>",
    "[CmdletBinding()]",
    "param(",
    `  [string]$SourceUrl = "${source}",`,
    '  [string]$AdminUrl = "",',
    '  [string]$OutputCsv = ".\\sharepoint-sites.csv",',
    "  [switch]$IncludePersonal,",
    "  [switch]$OnPrem",
    ")",
    "",
    '$ErrorActionPreference = "Stop"',
    "",
    '# Accept a bare domain such as "contoso.com" as well as a full URL.',
    "if ($SourceUrl -notmatch '^[a-z]+://') { $SourceUrl = \"https://$SourceUrl\" }",
    "$siteHost = ([uri]$SourceUrl).Host",
    "if (-not $siteHost) { throw \"Cannot read a host name from '$SourceUrl'. Pass -SourceUrl https://contoso.sharepoint.com\" }",
    "$isOnPrem = $OnPrem -or $siteHost -like '*.local' -or $siteHost -match '^\\d+\\.\\d+\\.\\d+\\.\\d+$'",
    "",
    "if (-not $isOnPrem) {",
    "  if (-not $AdminUrl) {",
    "    $label = ($siteHost -split '\\.')[0]",
    "    $AdminUrl = \"https://$label-admin.sharepoint.com\"",
    "  }",
    "  Import-Module PnP.PowerShell",
    '  Write-Host "Connecting to $AdminUrl ..."',
    "  Connect-PnPOnline -Url $AdminUrl -Interactive",
    "  $sites = Get-PnPTenantSite -Detailed",
    "  if (-not $IncludePersonal) {",
    '    $sites = $sites | Where-Object { $_.Url -notlike "*-my.sharepoint.com*" }',
    "  }",
    "  $rows = foreach ($s in $sites) {",
    "    [pscustomobject]@{",
    "      Title         = $s.Title",
    "      Url           = $s.Url",
    "      Template      = $s.Template",
    "      Owner         = $s.Owner",
    "      StorageUsedMB = [math]::Round([double]$s.StorageUsageCurrent, 1)",
    "      LastModified  = $s.LastContentModifiedDate",
    "      LockState     = $s.LockState",
    "    }",
    "  }",
    "}",
    "else {",
    "  if (-not (Get-PSSnapin -Name Microsoft.SharePoint.PowerShell -ErrorAction SilentlyContinue)) {",
    "    Add-PSSnapin Microsoft.SharePoint.PowerShell",
    "  }",
    "  Write-Host \"Enumerating site collections on $siteHost ...\"",
    "  $rows = foreach ($site in (Get-SPSite -Limit All)) {",
    "    [pscustomobject]@{",
    "      Title         = $site.RootWeb.Title",
    "      Url           = $site.Url",
    "      Template      = $site.RootWeb.WebTemplate",
    "      Owner         = $site.Owner.LoginName",
    "      StorageUsedMB = [math]::Round([double]$site.Usage.Storage / 1MB, 1)",
    "      LastModified  = $site.LastContentModifiedDate",
    "      LockState     = ''",
    "    }",
    "  }",
    "}",
    "",
    "$rows = @($rows | Sort-Object Url)",
    "$rows | Export-Csv -Path $OutputCsv -NoTypeInformation -Encoding UTF8",
    '$rows | Select-Object Title, Url | Format-Table -AutoSize',
    'Write-Host ("Discovered {0} site collections. Saved to {1}." -f $rows.Count, $OutputCsv)',
    'Write-Host ("Next: .\\cloudcommand-discover.ps1 -SitesCsv {0}" -f $OutputCsv)',
    "",
  ].join("\n");
}

function scriptMigration(project) {
  const insane = isInsane(project);
  const target = sharePointUrl(project).replace(/^https:\/\//, "");
  return [
    "<#",
    "  CloudCommand migration - copy run",
    `  Project : ${project.name}`,
    `  Target  : https://${target}`,
    `  Mode    : ${insane ? "Insane (Azure storage staging)" : "Standard (direct copy)"}`,
    `  Workloads: ${project.workloads || "sharepoint"}`,
    "  Requires: PnP.PowerShell 2.x on both sides, app-only or interactive credentials.",
    "  Resume  : the progress CSV is rewritten after every item, so the run can be restarted.",
    "#>",
    "[CmdletBinding()]",
    "param(",
    '  [Parameter(Mandatory=$true)][string]$SourceUrl,',
    `  [string]$TargetUrl = "https://${target}",`,
    '  [string]$MappingCsv = ".\\inventory-source.csv",',
    '  [string]$ProgressCsv = ".\\progress.csv",',
    "  [int]$MaxVersions = 10,",
    "  [switch]$PreservePermissions,",
    "  [int]$RetryCount = 4",
    ")",
    "",
    '$ErrorActionPreference = "Stop"',
    "Import-Module PnP.PowerShell",
    "",
    "if (-not (Test-Path $MappingCsv)) { throw \"Inventory not found: $MappingCsv\" }",
    "$rows = Import-Csv -Path $MappingCsv",
    "",
    "$done = @{}",
    "if (Test-Path $ProgressCsv) {",
    "  Import-Csv -Path $ProgressCsv | ForEach-Object { $done[$_.Key] = $_.Status }",
    '  Write-Host ("Resuming: {0} items already processed" -f $done.Count)',
    "}",
    "",
    "Connect-PnPOnline -Url $SourceUrl -Interactive",
    "Connect-PnPOnline -Url $TargetUrl -Interactive -ReturnConnection",
    "$targetConn = Get-PnPConnection",
    "",
    "foreach ($row in $rows) {",
    "  $key = ($row.Path + '/' + $row.Name).ToLower()",
    "  if ($done[$key] -eq 'done') { continue }",
    "  if ($done[$key] -eq 'blocked') { continue }",
    "",
    "  $sourceFile = ($SourceUrl.TrimEnd('/')) + $row.Path + '/' + $row.Name",
    "  $targetFolder = ($row.Path -replace '^/sites/[^/]+', '') + '/' + $row.Name",
    "",
    "  try {",
    "    $attempt = 0",
    "    while ($true) {",
    "      try {",
    "        $targetFileUrl = ($TargetUrl.TrimEnd('/')) + $targetFolder",
    "        Copy-PnPFile -SourceUrl $sourceFile -TargetUrl $targetFileUrl -OverwriteIfAlreadyExists -Connection $targetConn",
    "        break",
    "      }",
    "      catch {",
    "        $attempt++",
    "        if ($attempt -ge $RetryCount) { throw }",
    "        $wait = [Math]::Min(60, [Math]::Pow(2, $attempt))",
    '        Write-Warning ("Retry {0}/{1} in {2}s: {3}" -f $attempt, $RetryCount, $wait, $_.Exception.Message)',
    "        Start-Sleep -Seconds $wait",
    "      }",
    "    }",
    "",
    "    $item = Get-PnPFile -Url $targetFileUrl -AsListItem -ErrorAction SilentlyContinue",
    "    if ($item) {",
    "      $values = @{ Modified = [datetime]$row.Modified }",
    "      Set-PnPListItem -List $item.ParentList -Identity $item.Id -Values $values | Out-Null",
    "    }",
    "",
    `    $status = "done"`,
    "  }",
    "  catch {",
    `    $status = "failed"`,
    '    Write-Error ("FAILED {0}: {1}" -f $sourceFile, $_.Exception.Message)',
    "  }",
    "",
    "  [pscustomobject]@{ Key = $key; Source = $sourceFile; Status = $status; At = (Get-Date).ToString('s') } |",
    "    Export-Csv -Path $ProgressCsv -Append -NoTypeInformation -Encoding UTF8",
    "  $done[$key] = $status",
    "}",
    "",
    'Write-Host "Copy run complete. Re-run the same command to pick up any failures."',
    "",
  ].join("\n");
}

function scriptStaging(project) {
  const account = project.staging_account || "stgmigration";
  const container = project.staging_container || "migration-staging";
  return [
    "<#",
    "  CloudCommand migration - Insane mode staging run",
    `  Project : ${project.name}`,
    `  Staging : ${account} / ${container}`,
    "",
    "  Two hops, no local workstation storage:",
    "    1. source  -> Azure blob container (SAS or azcopy login)",
    "    2. blob    -> destination SharePoint / OneDrive",
    "",
    "  Throttling is per-tenant; going through storage means the destination only",
    "  ever receives one steady stream instead of thousands of small requests.",
    "  Requires: azcopy 10.22+ (azcopy login, or a container SAS with write access).",
    "#>",
    "[CmdletBinding()]",
    "param(",
    '  [Parameter(Mandatory=$true)][string]$SourceUrl,',
    `  [string]$TargetUrl = "${sharePointUrl(project)}",`,
    `  [string]$StorageAccount = "${account}",`,
    `  [string]$Container = "${container}",`,
    "  [Parameter(Mandatory=$true)][string]$SasToken,",
    '  [string]$InventoryCsv = ".\\inventory-source.csv"',
    ")",
    "",
    '$ErrorActionPreference = "Stop"',
    '$AzCopy = (Get-Command azcopy -ErrorAction SilentlyContinue).Source',
    'if (-not $AzCopy) { throw "azcopy.exe not found on PATH. Download it from https://aka.ms/downloadazcopy" }',
    "",
    "$stagingRoot = \"https://$StorageAccount.blob.core.windows.net/$Container$SasToken\"",
    '$stage = ".\\stage"',
    "New-Item -ItemType Directory -Force -Path $stage | Out-Null",
    "",
    "Write-Host 'Hop 1: pulling the inventory into Azure storage'",
    "& $AzCopy copy $InventoryCsv \"$stagingRoot/inventory-source.csv\" --overwrite=true --log-level=WARNING",
    "",
    "Write-Host 'Hop 2: source to staging (server side where supported)'",
    "& $AzCopy copy $SourceUrl \"$stagingRoot/content\" --recursive=true --log-level=WARNING",
    "",
    "Write-Host 'Hop 3: staging to destination'",
    "& $AzCopy copy \"$stagingRoot/content\" $TargetUrl --recursive=true --put-md5 --log-level=WARNING",
    "",
    "Write-Host 'Hop 4: metadata and permissions pass'",
    "Import-Module PnP.PowerShell",
    "Connect-PnPOnline -Url $TargetUrl -Interactive",
    "if (Test-Path $InventoryCsv) {",
    "  Import-Csv -Path $InventoryCsv | ForEach-Object {",
    "    $target = ($TargetUrl.TrimEnd('/')) + ($_.Path -replace '^/sites/[^/]+', '') + '/' + $_.Name",
    "    try {",
    "      Set-PnPFileCheckedIn -Url $target -CheckInType MajorCheckIn -Comment 'cloudcommand migration'",
    "    } catch { }",
    "  }",
    "}",
    "",
    "Write-Host 'Staging run finished. Run Post-Migration Audit to verify counts and permissions.'",
    "",
  ].join("\n");
}

function appendAudit(project, event) {
  let log = [];
  try {
    log = JSON.parse(project.audit_log || "[]");
    if (!Array.isArray(log)) log = [];
  } catch {
    log = [];
  }
  log.push(event);
  return JSON.stringify(log.slice(-60));
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth
      .me()
      .catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (!action) return Response.json({ error: "action is required" }, { status: 400 });

    const project = body.project_id
      ? await base44.asServiceRole.entities.MigrationProject
          .get(body.project_id)
          .catch((e) => (e.status === 404 ? null : Promise.reject(e)))
      : null;
    if (body.project_id && !project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const denied = await authorizeAdminAction(base44, user, [
      project ? project.target_azure_tenant_id : null,
    ]);
    if (denied) return denied;

    if (action === "prescan") {
      const rows = normalizeRows(body.rows);
      if (rows.length === 0) {
        return Response.json({ error: "No inventory rows supplied" }, { status: 400 });
      }
      const result = scanSource(rows);
      if (project) {
        await base44.asServiceRole.entities.MigrationProject.update(project.id, {
          item_count: result.total_rows,
          prescan_summary: JSON.stringify({
            total_rows: result.total_rows,
            severity: result.severity,
            by_code: result.by_code,
            ready: result.ready,
          }),
          prescan_findings: JSON.stringify(result.findings),
          status: project.status === "draft" ? "ready" : project.status,
          audit_log: appendAudit(project, {
            at: new Date().toISOString(),
            actor: user.email,
            action: "Pre-migration scan",
            detail: `${result.total_rows} items scanned, ${result.severity.critical} blocking findings`,
          }),
        });
      }
      return Response.json({ success: true, ...result });
    }

    if (action === "postaudit") {
      const sourceRows = normalizeRows(body.source_rows);
      const targetRows = normalizeRows(body.target_rows);
      if (sourceRows.length === 0 || targetRows.length === 0) {
        return Response.json(
          { error: "Both the source and the destination inventories are required" },
          { status: 400 },
        );
      }
      const result = compareRuns(sourceRows, targetRows);
      if (project) {
        await base44.asServiceRole.entities.MigrationProject.update(project.id, {
          postcheck_summary: JSON.stringify({
            source_count: result.source_count,
            target_count: result.target_count,
            matched: result.matched,
            missing: result.missing,
            extra: result.extra,
            severity: result.severity,
          }),
          postcheck_findings: JSON.stringify(result.findings),
          audit_log: appendAudit(project, {
            at: new Date().toISOString(),
            actor: user.email,
            action: "Post-migration audit",
            detail: `${result.matched} verified, ${result.missing} missing of ${result.source_count} source items`,
          }),
        });
      }
      return Response.json({ success: true, ...result });
    }

    if (action === "script") {
      if (!project) return Response.json({ error: "project_id is required" }, { status: 400 });
      const kind = String(body.kind || "discovery");
      let content = "";
      let filename = "";

      if (kind === "sites") {
        content = scriptSites(project);
        filename = "cloudcommand-sharepoint-sites.ps1";
      } else if (kind === "discovery") {
        content = scriptDiscovery(project);
        filename = "cloudcommand-discover.ps1";
      } else if (kind === "migration") {
        content = scriptMigration(project);
        filename = "cloudcommand-migrate.ps1";
      } else if (kind === "staging") {
        content = scriptStaging(project);
        filename = "cloudcommand-insane-mode.ps1";
      } else {
        return Response.json({ error: "Unknown script kind" }, { status: 400 });
      }

      await base44.asServiceRole.entities.MigrationProject.update(project.id, {
        audit_log: appendAudit(project, {
          at: new Date().toISOString(),
          actor: user.email,
          action: "Script generated",
          detail: filename,
        }),
      });

      return Response.json({
        success: true,
        filename,
        content,
        csv_columns:
          kind === "sites"
            ? ["Title", "Url", "Template", "Owner", "StorageUsedMB", "LastModified", "LockState"]
            : [
                "ItemType",
                "Path",
                "Name",
                "SizeBytes",
                "Versions",
                "UniquePermissions",
                "Modified",
                "Author",
              ],
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}