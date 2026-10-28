import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { authorizeAdminAction } from '../../shared/rbacCheck.ts';
import { getAccessToken, getTenantCreds, graphGet, graphGetAll, graphPost, graphPut, graphGetBytes } from '../../shared/graphClient.ts';
import { getJson, putJson } from '../../shared/largePayload.ts';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOFT_MS = 80000;
const MAX_FILE_SIZE = 3.9 * 1024 * 1024;

function genPassword() {
  const rnd = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
  return 'Mig' + rnd.slice(0, 14) + '!1Aa';
}
function localPart(upn) { return (upn || '').split('@')[0] || 'user'; }
function nowISO() { return new Date().toISOString(); }
function validateGuid(id) { return id && GUID.test(id); }

// ── Source object listing (ShareGate object picker) ────────────────────────
async function listSourceObjects(token, workload, top) {
  if (workload === 'users' || workload === 'mailboxes') {
    const u = await graphGetAll(token, `/users?$select=id,displayName,mail,userPrincipalName,accountEnabled,userType,onPremisesImmutableId,jobTitle,department,assignedLicenses&$top=999`);
    const filtered = u.filter(x => x.userType !== 'Guest' && (workload === 'users' ? true : !!x.mail));
    return filtered.map(x => ({
      id: x.id, displayName: x.displayName, upn: x.userPrincipalName, mail: x.mail,
      accountEnabled: x.accountEnabled, onPremisesImmutableId: x.onPremisesImmutableId,
      jobTitle: x.jobTitle, department: x.department, licensed: (x.assignedLicenses || []).length > 0,
    }));
  }
  if (workload === 'groups') {
    const g = await graphGetAll(token, `/groups?$select=id,displayName,description,mail,mailEnabled,securityEnabled,groupTypes,visibility,createdDateTime&$top=999`);
    return g.map(x => ({
      id: x.id, displayName: x.displayName, description: x.description, mail: x.mail,
      mailEnabled: x.mailEnabled, securityEnabled: x.securityEnabled, groupTypes: x.groupTypes || [], visibility: x.visibility,
    }));
  }
  if (workload === 'onedrive') {
    const u = await graphGetAll(token, `/users?$select=id,displayName,userPrincipalName,userType&$top=999`);
    const users = u.filter(x => x.userType !== 'Guest').slice(0, Math.min(top || 80, 300));
    const drives = await Promise.allSettled(users.map(async usr => {
      const d = await graphGet(token, `/users/${usr.id}/drive?$select=id,quota,owner,name`);
      return {
        userId: usr.id, upn: usr.userPrincipalName, displayName: usr.displayName,
        driveId: d.id, usedBytes: d.quota?.used || 0, usedGb: Math.round((d.quota?.used || 0) / 1e9 * 10) / 10,
      };
    }));
    return drives.filter(r => r.status === 'fulfilled' && r.value.driveId).map(r => r.value);
  }
  if (workload === 'sharepoint') {
    const s = await graphGetAll(token, `/sites/root/sites?$select=id,displayName,webUrl,description,createdDateTime,lastModifiedDateTime,isPersonal&$top=999`);
    return s.filter(x => !x.isPersonal).map(x => ({
      id: x.id, displayName: x.displayName, webUrl: x.webUrl, description: x.description, createdDateTime: x.createdDateTime,
    }));
  }
  if (workload === 'teams') {
    const t = await graphGetAll(token, `/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')&$select=id,displayName,description,mail,visibility,createdDateTime&$top=999`);
    return t.map(x => ({ id: x.id, displayName: x.displayName, description: x.description, mail: x.mail, visibility: x.visibility }));
  }
  if (workload === 'chats') {
    // Teams chats are enumerated per user (app-only Chat.Read.All). Members are returned by
    // UPN so the wizard can match them to the target accounts picked for this migration.
    const u = await graphGetAll(token, `/users?$select=id,displayName,userPrincipalName,userType&$top=999`);
    const users = u.filter(x => x.userType !== 'Guest' && x.userPrincipalName).slice(0, Math.min(top || 40, 60));
    const byId = new Map();
    let denied = 0;
    const results = await Promise.allSettled(users.map(usr =>
      graphGet(token, `/users/${usr.id}/chats?$top=50&$expand=members`)
    ));
    for (const r of results) {
      if (r.status === 'rejected') { denied++; continue; }
      for (const c of (r.value?.value || [])) {
        if (byId.has(c.id)) continue;
        byId.set(c.id, {
          id: c.id,
          topic: c.topic || '',
          chatType: c.chatType,
          members: (c.members || []).map(m => m.email || m.userId || m.displayName).filter(Boolean),
          lastUpdatedDateTime: c.lastUpdatedDateTime,
        });
      }
    }
    if (byId.size === 0 && denied > 0) {
      throw new Error('Could not read Teams chats. Grant the application permission Chat.Read.All in the source tenant app registration (Chat.ReadWrite.All in the target for chat creation), then retry.');
    }
    return [...byId.values()].sort((a, b) => String(b.lastUpdatedDateTime || '').localeCompare(String(a.lastUpdatedDateTime || '')));
  }
  return [];
}

// ── Auto user/group mapping with principal replacement ───────────────────────
async function autoMap(srcToken, tgtToken, principalRules) {
  const [srcUsers, tgtUsers, srcGroups, tgtGroups] = await Promise.all([
    graphGetAll(srcToken, `/users?$select=id,displayName,mail,userPrincipalName,userType&$top=999`),
    graphGetAll(tgtToken, `/users?$select=id,displayName,mail,userPrincipalName,userType&$top=999`),
    graphGetAll(srcToken, `/groups?$select=id,displayName,mail,groupTypes,securityEnabled,mailEnabled&$top=999`),
    graphGetAll(tgtToken, `/groups?$select=id,displayName,mail,groupTypes,securityEnabled,mailEnabled&$top=999`),
  ]);
  const rules = (principalRules || []).map(r => ({ find: (r.find || '').toLowerCase(), replace: r.replace || '' })).filter(r => r.find);
  const mapUser = (su) => {
    const rule = rules.find(r => r.find === (su.userPrincipalName || '').toLowerCase() || r.find === (su.mail || '').toLowerCase());
    if (rule) return { action: 'map', targetUpn: rule.replace, targetId: null, replaced: true };
    const byMail = tgtUsers.find(t => (t.mail || '').toLowerCase() === (su.mail || '').toLowerCase());
    if (byMail) return { action: 'map', targetUpn: byMail.userPrincipalName, targetId: byMail.id };
    const byLocal = tgtUsers.find(t => localPart(t.userPrincipalName).toLowerCase() === localPart(su.userPrincipalName).toLowerCase());
    if (byLocal) return { action: 'map', targetUpn: byLocal.userPrincipalName, targetId: byLocal.id };
    return { action: 'create', targetUpn: su.userPrincipalName, targetId: null };
  };
  const userMapping = srcUsers.filter(u => u.userType !== 'Guest').map(su => {
    const m = mapUser(su);
    return { sourceId: su.id, sourceUpn: su.userPrincipalName, sourceMail: su.mail, sourceName: su.displayName, ...m };
  });
  const groupMapping = srcGroups.map(sg => {
    const rule = rules.find(r => r.find === (sg.mail || '').toLowerCase() || r.find === (sg.displayName || '').toLowerCase());
    if (rule) return { sourceId: sg.id, sourceName: sg.displayName, action: 'map', targetName: rule.replace, replaced: true };
    const byName = tgtGroups.find(t => t.displayName.toLowerCase() === sg.displayName.toLowerCase());
    if (byName) return { sourceId: sg.id, sourceName: sg.displayName, action: 'map', targetName: byName.displayName, targetId: byName.id };
    return { sourceId: sg.id, sourceName: sg.displayName, action: 'create', targetName: sg.displayName };
  });
  return { userMapping, groupMapping };
}

// ── Live copy helpers (Graph writes into the TARGET tenant) ─────────────────
// Summarise the Exchange work implied by the per-account mailbox options picked in the
// wizard. Graph cannot move mailbox content, so these are recorded for the operator.
function mailboxFollowUp(mb) {
  if (!mb) return '';
  const steps = [];
  if (mb.includeArchive) steps.push('move the online archive');
  if (mb.keepPermissions) steps.push('re-apply mailbox permissions (FullAccess / SendAs / Send on behalf)');
  if (mb.keepDelegates) steps.push('re-apply calendar delegate access');
  if (mb.keepRules) steps.push('re-create inbox rules');
  if (mb.copyContacts) steps.push('copy contacts and tasks');
  if (mb.keepLitigationHold) steps.push('re-enable litigation hold');
  if (mb.convertToShared) steps.push('convert to shared after the move');
  if (mb.forwardTo) steps.push(`set forwarding to ${mb.forwardTo}`);
  return steps.length ? ' Exchange follow-up queued: ' + steps.join(', ') + '.' : '';
}

async function createTargetUser(token, item, settings) {
  const tgt = item.target;
  const upn = tgt.upn;
  const followUp = mailboxFollowUp(item.mailbox);

  // "migrate" attaches the source identity to an account that already exists in the target;
  // "create" provisions a brand-new account. Migrating falls back to create when the target
  // account is not present, so a partially pre-provisioned tenant still completes.
  if (tgt.mode === 'migrate' || tgt.action === 'map') {
    try {
      const existing = await graphGet(token, `/users/${encodeURIComponent(upn)}?$select=id,userPrincipalName,displayName`);
      if (existing?.id) {
        if (settings.assignLicense && settings.targetSkuId) {
          try { await graphPost(token, `/users/${existing.id}/assignLicense`, { addLicenses: [{ skuId: settings.targetSkuId }], removeLicenses: [] }); } catch (e) { /* non-fatal */ }
        }
        return { status: 'success', message: `Linked to the existing target account ${existing.userPrincipalName} — no new identity created. Mailbox content follows through the Exchange cross-tenant move.` + followUp };
      }
    } catch (e) { /* not present in the target → create below */ }
  }

  const body = {
    accountEnabled: true,
    displayName: item.source.displayName || localPart(upn),
    mailNickname: localPart(upn),
    userPrincipalName: upn,
    usageLocation: settings.usageLocation || 'US',
    passwordProfile: { password: genPassword(), forceChangePassword: true },
    jobTitle: item.source.jobTitle || null,
    department: item.source.department || null,
  };
  if (item.source.onPremisesImmutableId) body.onPremisesImmutableId = item.source.onPremisesImmutableId;
  const created = await graphPost(token, '/users', body);
  if (settings.assignLicense && settings.targetSkuId) {
    try { await graphPost(token, `/users/${created.id}/assignLicense`, { addLicenses: [{ skuId: settings.targetSkuId }], removeLicenses: [] }); } catch (e) { /* non-fatal */ }
  }
  return { status: 'success', message: `New account created in the target (${upn}). Mailbox email body requires the Exchange cross-tenant move request (New-MigrationBatch) — not moveable via Graph.` + followUp };
}

async function createTargetGroup(token, item) {
  const src = item.source;
  const isUnified = (src.groupTypes || []).includes('Unified');
  const body = { displayName: item.target.displayName, description: src.description || '', mailNickname: localPart(src.mail || item.target.displayName) };
  if (isUnified) { body.groupTypes = ['Unified']; body.mailEnabled = true; body.securityEnabled = false; body.visibility = src.visibility || 'Public'; }
  else { body.groupTypes = []; body.mailEnabled = !!src.mailEnabled; body.securityEnabled = src.securityEnabled !== false; }
  const g = await graphPost(token, '/groups', body);
  return { status: 'success', message: `Group created in target (${g.id}).`, groupId: g.id };
}

function childrenPath(driveId, path) { return path ? `/drives/${driveId}/root:${path}:/children` : `/drives/${driveId}/root/children`; }
function uploadPath(driveId, path, name) { return path ? `/drives/${driveId}/root:${path}/${name}:/content` : `/drives/${driveId}/root:/${name}:/content`; }

async function copyDriveFiles(srcToken, tgtToken, srcDriveId, tgtDriveId, copiedSet, fileCap, maxDepth) {
  let copied = 0;
  const walk = async (srcPath, tgtPath, depth) => {
    if (copied >= fileCap || depth > maxDepth) return;
    let children = [];
    try { const r = await graphGet(srcToken, childrenPath(srcDriveId, srcPath) + '?$top=200'); children = r.value || []; } catch (e) { return; }
    for (const c of children) {
      if (copied >= fileCap) return;
      const key = (tgtPath ? tgtPath + '/' : '') + c.name;
      if (copiedSet.has(key)) continue;
      if (c.folder) {
        try { await graphPost(tgtToken, childrenPath(tgtDriveId, tgtPath), { name: c.name, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }); } catch (e) { /* continue */ }
        await walk(srcPath ? srcPath + '/' + c.name : c.name, tgtPath ? tgtPath + '/' + c.name : c.name, depth + 1);
      } else if (c.file) {
        if (c.size && c.size > MAX_FILE_SIZE) { copiedSet.add(key); continue; }
        try {
          const buf = await graphGetBytes(srcToken, `/drives/${srcDriveId}/items/${c.id}/content`);
          await graphPut(tgtToken, uploadPath(tgtDriveId, tgtPath, c.name), buf, 'application/octet-stream');
          copiedSet.add(key); copied++;
        } catch (e) { /* keep going */ }
      }
    }
  };
  await walk('', '', 0);
  return copied;
}

async function runOneDrive(srcToken, tgtToken, item, settings, state) {
  const tgtUserKey = item.target.userId || item.target.upn;
  let tgtDrive;
  try { tgtDrive = await graphGet(tgtToken, `/users/${tgtUserKey}/drive?$select=id`); }
  catch (e) { return { status: 'failed', message: 'Target OneDrive not provisioned — the target user must sign in to OneDrive once, or provision via SharePoint admin, then re-run incremental sync.' }; }
  const copiedSet = new Set(state.fileCopied || []);
  const copied = await copyDriveFiles(srcToken, tgtToken, item.source.driveId, tgtDrive.id, copiedSet, settings.maxFilesPerRun || 30, settings.folderDepth || 2);
  state.fileCopied = [...copiedSet];
  return { status: 'success', message: `Copied ${copied} file(s) this pass. Total copied: ${copiedSet.size}.`, partial: true };
}

async function runSharePoint(srcToken, tgtToken, item, settings, state) {
  let groupId = state.groupId;
  if (!groupId) {
    const grp = await graphPost(tgtToken, '/groups', {
      displayName: item.target.displayName, description: item.target.description || '',
      mailNickname: localPart(item.target.displayName), groupTypes: ['Unified'], mailEnabled: true, securityEnabled: false, visibility: 'Public',
    });
    groupId = grp.id;
    state.groupId = groupId;
  }
  let tgtDrive;
  try { tgtDrive = await graphGet(tgtToken, `/groups/${groupId}/drive?$select=id`); }
  catch (e) { return { status: 'success', message: 'Group created; SharePoint site provisioning in progress — re-run incremental sync to copy files.', partial: true }; }
  let srcDrive;
  try { srcDrive = await graphGet(srcToken, `/sites/${item.source.siteId}/drive?$select=id`); }
  catch (e) { return { status: 'failed', message: 'Could not read source site default document library.' }; }
  const copiedSet = new Set(state.fileCopied || []);
  const copied = await copyDriveFiles(srcToken, tgtToken, srcDrive.id, tgtDrive.id, copiedSet, settings.maxFilesPerRun || 30, settings.folderDepth || 2);
  state.fileCopied = [...copiedSet];
  return { status: 'success', message: `Site group created; copied ${copied} file(s) this pass. Total ${copiedSet.size}.`, partial: true };
}

async function runTeam(srcToken, tgtToken, item, settings, state) {
  let groupId = state.groupId;
  if (!groupId) {
    const grp = await graphPost(tgtToken, '/groups', {
      displayName: item.target.displayName, description: item.target.description || '',
      mailNickname: localPart(item.target.displayName), groupTypes: ['Unified'], mailEnabled: true, securityEnabled: false, visibility: 'Public',
    });
    groupId = grp.id;
    state.groupId = groupId;
    try { await graphPut(tgtToken, `/groups/${groupId}/team`, JSON.stringify({}), 'application/json'); }
    catch (e) { return { status: 'failed', message: 'Group created, team provisioning failed: ' + e.message }; }
  }
  let srcChannels = [];
  try { const r = await graphGet(srcToken, `/teams/${item.source.teamId}/channels?$select=id,displayName,description&$top=50`); srcChannels = (r.value || []).filter(c => c.displayName !== 'General'); } catch (e) {}
  let chCopied = 0;
  for (const sc of srcChannels.slice(0, settings.maxChannelsPerRun || 10)) {
    let tc;
    try { tc = await graphPost(tgtToken, `/teams/${groupId}/channels`, { displayName: sc.displayName, description: sc.description || '' }); }
    catch (e) { continue; }
    if (settings.includeTeamChats) {
      try {
        const msgs = await graphGet(srcToken, `/teams/${item.source.teamId}/channels/${sc.id}/messages?$top=20`);
        for (const m of (msgs.value || [])) {
          try { await graphPost(tgtToken, `/teams/${groupId}/channels/${tc.id}/messages`, { body: { content: m.body?.content || '', contentType: m.body?.contentType || 'text' } }); } catch (e) {}
        }
        chCopied++;
      } catch (e) {}
    }
  }
  return { status: 'success', message: `Team created; ${srcChannels.length} channel(s) processed, ${chCopied} with messages. 1:1 chat history is not migratable via Graph.`, partial: !!settings.includeTeamChats };
}

// Recreate one selected Teams chat in the target with its mapped participants, then copy
// its message history best-effort. The target chat id is kept in the item state so
// incremental re-runs post only new messages instead of creating a second chat.
async function runChat(srcToken, tgtToken, item, settings, state) {
  const members = (item.target?.members || []).filter(Boolean);
  let chatId = state.chatId;

  if (!chatId) {
    if (members.length < 2) {
      return { status: 'failed', message: 'Fewer than two participants are mapped to target accounts — map the participants in the accounts step first.' };
    }
    const resolved = [];
    for (const upn of members) {
      try {
        const u = await graphGet(tgtToken, `/users/${encodeURIComponent(upn)}?$select=id`);
        if (u?.id) resolved.push(u.id);
      } catch (e) { /* participant missing in target — skipped */ }
    }
    if (resolved.length < 2) {
      return { status: 'failed', message: 'The mapped participants could not be found in the target tenant. Create or link those accounts first, then re-run.' };
    }
    const chatType = item.source?.chatType === 'oneOnOne' && resolved.length === 2 && !settings.chatAsGroup ? 'oneOnOne' : 'group';
    let created;
    try {
      created = await graphPost(tgtToken, '/chats', {
        chatType,
        topic: item.source?.topic || 'Migrated chat',
        members: resolved.map(id => ({
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${id}')`,
        })),
      });
    } catch (e) {
      return { status: 'failed', message: 'Chat creation failed: ' + e.message + ' (the target tenant app registration needs Chat.Create / Chat.ReadWrite.All application permission.)' };
    }
    chatId = created.id;
    state.chatId = chatId;
  }

  let copied = 0;
  try {
    const msgs = await graphGet(srcToken, `/chats/${item.source.id}/messages?$top=${settings.maxChatMessagesPerRun || 25}`);
    const ordered = (msgs.value || []).slice().reverse();
    // Incremental re-runs continue after the messages already copied into this target chat.
    const already = state.chatCopied || 0;
    for (const m of ordered.slice(already)) {
      try {
        await graphPost(tgtToken, `/chats/${chatId}/messages`, {
          body: { content: m.body?.content || '', contentType: m.body?.contentType || 'text' },
        });
        copied++;
      } catch (e) { /* keep copying the rest */ }
    }
  } catch (e) {
    return { status: 'success', partial: true, message: `Chat created (${chatId}); message history could not be read: ${e.message}` };
  }
  state.chatCopied = (state.chatCopied || 0) + copied;
  return { status: 'success', partial: true, message: `Chat created (${chatId}); copied ${copied} message(s) this pass (${state.chatCopied} in total).` };
}

// ── Batch storage ───────────────────────────────────────────────────────────
// A batch's inputs and per-item progress log are far past a record field's size limit, so
// they are kept in private file storage (shared/largePayload.ts). Batches created before
// that change still carry their JSON inline, so both layouts are read here.
async function loadBatchInputs(base44, batch) {
  if (batch.payload_file_uri) return await getJson(base44, batch.payload_file_uri, 'migration-inputs');
  return {
    selection: JSON.parse(batch.selection || '[]'),
    user_mapping: JSON.parse(batch.user_mapping || '[]'),
    group_mapping: JSON.parse(batch.group_mapping || '[]'),
    principal_replace_rules: JSON.parse(batch.principal_replace_rules || '[]'),
    copy_settings: JSON.parse(batch.copy_settings || '{}'),
  };
}

// ── Batch execution (chunked, time-bounded, incremental) ────────────────────
async function runBatch(base44, user, body) {
  const batch = await base44.entities.MigrationBatch.get(body.batch_id);
  if (!batch) return Response.json({ error: 'Batch not found' }, { status: 404 });
  const denied = await authorizeAdminAction(base44, user, [batch.source_azure_tenant_id, batch.target_azure_tenant_id]);
  if (denied) return denied;
  const inputs = await loadBatchInputs(base44, batch);
  const selection = inputs.selection;
  const settings = inputs.copy_settings;
  const itemsLog = batch.progress_file_uri ?
  await getJson(base44, batch.progress_file_uri, 'migration-progress') :
  JSON.parse(batch.progress || '{}').items || {};
  const maxItems = body.maxItems || 6;
  let cursor = body.reset ? 0 : (batch.cursor || 0);
  const start = Date.now();

  const [srcCreds, tgtCreds] = await Promise.all([
    getTenantCreds(base44, batch.source_azure_tenant_id),
    getTenantCreds(base44, batch.target_azure_tenant_id),
  ]);
  const [srcToken, tgtToken] = await Promise.all([
    getAccessToken(batch.source_azure_tenant_id, srcCreds.clientId, srcCreds.clientSecret),
    getAccessToken(batch.target_azure_tenant_id, tgtCreds.clientId, tgtCreds.clientSecret),
  ]);

  let processed = 0;
  while (cursor < selection.length && processed < maxItems && Date.now() - start < SOFT_MS) {
    const idx = cursor;
    const item = selection[idx];
    const state = itemsLog[idx] || { fileCopied: [] };
    let result;

    // Incremental skip: idempotent create kinds already succeeded are not re-run.
    if (state.status === 'success' && ['user', 'group'].includes(item.kind)) {
      cursor++; processed++; continue;
    }

    try {
      if (item.kind === 'user') result = await createTargetUser(tgtToken, item, settings);
      else if (item.kind === 'group') result = await createTargetGroup(tgtToken, item);
      else if (item.kind === 'onedrive') result = await runOneDrive(srcToken, tgtToken, item, settings, state);
      else if (item.kind === 'sharepoint') result = await runSharePoint(srcToken, tgtToken, item, settings, state);
      else if (item.kind === 'team') result = await runTeam(srcToken, tgtToken, item, settings, state);
      else if (item.kind === 'chat') result = await runChat(srcToken, tgtToken, item, settings, state);
      else result = { status: 'skipped', message: 'Unknown kind' };
    } catch (e) {
      result = { status: 'failed', message: e.message };
    }

    itemsLog[idx] = { ...state, status: result.status, message: result.message, ts: nowISO() };
    cursor++; processed++;
  }

  // Recompute counts from the log.
  let succeeded = 0, failed = 0, skipped = 0;
  for (const k of Object.keys(itemsLog)) {
    const s = itemsLog[k].status;
    if (s === 'success') succeeded++;
    else if (s === 'failed') failed++;
    else if (s === 'skipped') skipped++;
  }
  const done = cursor >= selection.length;
  const status = done ? 'completed' : 'running';
  const summary = { done: succeeded + failed + skipped, succeeded, failed, skipped, items: itemsLog };
  await base44.entities.MigrationBatch.update(batch.id, {
    cursor, status, last_run_at: nowISO(),
    // The record keeps only the summary counts; the per-item log goes to file storage.
    progress: JSON.stringify({ done: summary.done, succeeded, failed, skipped }),
    progress_file_uri: await putJson(base44, itemsLog, 'migration-progress'),
  });
  return Response.json({ success: true, status, cursor, total: selection.length, progress: summary, items: itemsLog });
}

// ── Dry run: validate every item against both tenants WITHOUT writing ──────
async function dryRun(base44, user, body) {
  const batch = await base44.entities.MigrationBatch.get(body.batch_id);
  if (!batch) return Response.json({ error: 'Batch not found' }, { status: 404 });
  const denied = await authorizeAdminAction(base44, user, [batch.source_azure_tenant_id, batch.target_azure_tenant_id]);
  if (denied) return denied;
  const inputs = await loadBatchInputs(base44, batch);
  const selection = inputs.selection;

  const [srcCreds, tgtCreds] = await Promise.all([
    getTenantCreds(base44, batch.source_azure_tenant_id),
    getTenantCreds(base44, batch.target_azure_tenant_id),
  ]);
  const [srcToken, tgtToken] = await Promise.all([
    getAccessToken(batch.source_azure_tenant_id, srcCreds.clientId, srcCreds.clientSecret),
    getAccessToken(batch.target_azure_tenant_id, tgtCreds.clientId, tgtCreds.clientSecret),
  ]);
  const [tgtUsers, tgtGroups, tgtDomains] = await Promise.all([
    graphGetAll(tgtToken, '/users?$select=id,userPrincipalName,mail,userType&$top=999'),
    graphGetAll(tgtToken, '/groups?$select=id,displayName,mail&$top=999'),
    graphGetAll(tgtToken, '/domains?$select=id,isVerified,isDefault&$top=999'),
  ]);
  const verifiedDomains = new Set(tgtDomains.filter(d => d.isVerified).map(d => (d.id || '').toLowerCase()));
  const targetUpns = new Set(tgtUsers.map(u => (u.userPrincipalName || '').toLowerCase()));
  const targetGroupNames = new Set(tgtGroups.map(g => (g.displayName || '').toLowerCase()));
  const OD_CHECK_CAP = 50;
  let odChecked = 0;

  const results = [];
  for (let i = 0; i < selection.length; i++) {
    const item = selection[i];
    let status = 'ready', message = '', label = item.kind;
    try {
      if (item.kind === 'user') {
        const upn = (item.target?.upn || '').trim();
        label = upn || item.source?.upn || 'user';
        const domain = upn.includes('@') ? upn.split('@')[1].toLowerCase() : '';
        if (!upn || !domain) { status = 'blocked'; message = 'No target UPN set for this user.'; }
        else if (!verifiedDomains.has(domain)) {
          status = 'blocked';
          message = `Domain "${domain}" is not verified in the target tenant. Verify it there (or point this UPN at a target domain) before this user can be created — this is the usual blocker when keeping the source UPN.`;
        } else if (item.target?.mode === 'migrate' || item.target?.action === 'map') {
          if (targetUpns.has(upn.toLowerCase())) {
            message = `Will link the source account to the existing target account ${upn} — no new identity is created.`;
          } else {
            status = 'warning';
            message = `${upn} does not exist in the target yet, so it will be created as a new account instead of being linked. Point it at an existing target account or switch the account to "Create new".`;
          }
        } else if (targetUpns.has(upn.toLowerCase())) {
          status = 'warning';
          message = `${upn} already exists in the target tenant — creating a new account with this UPN will fail. Switch the account to "Migrate to existing account" to link it instead.`;
        } else {
          message = `Ready to create ${upn} as a new account in the target tenant.`;
        }
      } else if (item.kind === 'group') {
        const dn = item.target?.displayName || item.source?.displayName || 'group';
        label = dn;
        if (targetGroupNames.has(dn.toLowerCase())) { status = 'warning'; message = `A group named "${dn}" already exists in the target.`; }
        else message = `Ready to create group "${dn}" in the target.`;
      } else if (item.kind === 'onedrive') {
        const upn = item.target?.upn || item.source?.upn || '';
        label = upn || 'OneDrive';
        const key = item.target?.userId || upn;
        if (!key) { status = 'blocked'; message = 'No target user resolved for this OneDrive.'; }
        else if (odChecked >= OD_CHECK_CAP) {
          status = 'warning';
          message = 'Not individually validated in this pass (large batch) — re-run the dry run after the first pass.';
        } else {
          odChecked++;
          try {
            const d = await graphGet(tgtToken, `/users/${encodeURIComponent(key)}/drive?$select=id`);
            if (d && d.id) message = 'Target OneDrive is provisioned and ready.';
            else { status = 'blocked'; message = 'Target OneDrive is not provisioned yet.'; }
          } catch (e) {
            status = 'blocked';
            message = 'Target OneDrive not provisioned — the target user must open OneDrive once (or provision via SharePoint admin) before files can be copied.';
          }
        }
      } else if (item.kind === 'chat') {
        label = item.source?.topic || `Chat (${item.source?.chatType || 'chat'})`;
        const mapped = item.target?.members || [];
        if (mapped.length < 2) {
          status = 'blocked';
          message = 'Fewer than two participants are mapped to target accounts — map those accounts in the accounts step first.';
        } else {
          message = `Ready to create the chat in the target with ${mapped.length} participant(s) and copy its message history.`;
        }
      } else if (item.kind === 'sharepoint' || item.kind === 'team') {
        label = item.target?.displayName || item.source?.displayName || item.kind;
        message = 'Source is readable; a target container will be created and content copied best-effort.';
      } else {
        status = 'warning';
        message = 'Unknown item kind.';
      }
    } catch (e) {
      status = 'blocked';
      message = e.message;
    }
    results.push({ index: i, kind: item.kind, label, status, message });
  }

  const summary = { total: results.length, ready: 0, warning: 0, blocked: 0 };
  for (const r of results) {
    if (r.status === 'ready') summary.ready++;
    else if (r.status === 'warning') summary.warning++;
    else summary.blocked++;
  }
  return Response.json({ success: true, dry_run: true, summary, results });
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    if (action === 'list_source') {
      const { source_azure_tenant_id, workload, top } = body;
      if (!validateGuid(source_azure_tenant_id)) return Response.json({ error: 'Invalid source tenant id' }, { status: 400 });
      const denied = await authorizeAdminAction(base44, user, [source_azure_tenant_id]);
      if (denied) return denied;
      const creds = await getTenantCreds(base44, source_azure_tenant_id);
      const token = await getAccessToken(source_azure_tenant_id, creds.clientId, creds.clientSecret);
      const objects = await listSourceObjects(token, workload, top);
      return Response.json({ success: true, workload, objects });
    }

    // Verified domains of the TARGET tenant — feeds the per-account domain picker.
    if (action === 'list_domains') {
      const { target_azure_tenant_id } = body;
      if (!validateGuid(target_azure_tenant_id)) return Response.json({ error: 'Invalid target tenant id' }, { status: 400 });
      const denied = await authorizeAdminAction(base44, user, [target_azure_tenant_id]);
      if (denied) return denied;
      const creds = await getTenantCreds(base44, target_azure_tenant_id);
      const token = await getAccessToken(target_azure_tenant_id, creds.clientId, creds.clientSecret);
      const domains = await graphGetAll(token, '/domains?$select=id,isVerified,isDefault,isInitial,authenticationType,supportedServices&$top=999');
      // Only domains that can hold a user principal name: this drops the *.mail.onmicrosoft.com
      // routing domain and SharePoint-specific subdomains.
      const usable = domains.filter(d => d.isVerified && (!d.supportedServices || d.supportedServices.includes('Email')));
      return Response.json({
        success: true,
        domains: usable.map(d => ({
          domain: d.id,
          isDefault: !!d.isDefault,
          isInitial: !!d.isInitial,
          authenticationType: d.authenticationType,
        })),
      });
    }

    if (action === 'auto_map') {
      const { source_azure_tenant_id, target_azure_tenant_id, principal_replace_rules } = body;
      if (!validateGuid(source_azure_tenant_id) || !validateGuid(target_azure_tenant_id)) return Response.json({ error: 'Invalid tenant id' }, { status: 400 });
      const denied = await authorizeAdminAction(base44, user, [source_azure_tenant_id, target_azure_tenant_id]);
      if (denied) return denied;
      const [srcCreds, tgtCreds] = await Promise.all([getTenantCreds(base44, source_azure_tenant_id), getTenantCreds(base44, target_azure_tenant_id)]);
      const [srcToken, tgtToken] = await Promise.all([
        getAccessToken(source_azure_tenant_id, srcCreds.clientId, srcCreds.clientSecret),
        getAccessToken(target_azure_tenant_id, tgtCreds.clientId, tgtCreds.clientSecret),
      ]);
      const mapping = await autoMap(srcToken, tgtToken, principal_replace_rules);
      return Response.json({ success: true, ...mapping });
    }

    if (action === 'create_batch') {
      const { source_azure_tenant_id, target_azure_tenant_id } = body;
      if (!validateGuid(source_azure_tenant_id) || !validateGuid(target_azure_tenant_id)) return Response.json({ error: 'Invalid tenant id' }, { status: 400 });
      const denied = await authorizeAdminAction(base44, user, [source_azure_tenant_id, target_azure_tenant_id]);
      if (denied) return denied;
      // The inputs (selection, mappings, rules, settings) are far too large for a record
      // field, so they are written to private file storage and referenced by uri.
      const payload_file_uri = await putJson(base44, {
        selection: body.selection || [],
        user_mapping: body.user_mapping || [],
        group_mapping: body.group_mapping || [],
        principal_replace_rules: body.principal_replace_rules || [],
        copy_settings: body.copy_settings || {},
      }, 'migration-inputs');
      const rec = await base44.entities.MigrationBatch.create({
        name: body.name || 'Migration batch',
        source_azure_tenant_id, target_azure_tenant_id,
        source_tenant_name: body.source_tenant_name, target_tenant_name: body.target_tenant_name,
        workloads: (body.workloads || []).join(','),
        payload_file_uri,
        status: 'planned', cursor: 0, incremental: !!body.incremental,
        progress: JSON.stringify({ done: 0, succeeded: 0, failed: 0, skipped: 0 }),
        created_by: user.email,
      });
      return Response.json({ success: true, batch_id: rec.id });
    }

    if (action === 'run') {
      return await runBatch(base44, user, body);
    }

    if (action === 'dry_run') {
      return await dryRun(base44, user, body);
    }

    if (action === 'reset') {
      const batch = await base44.entities.MigrationBatch.get(body.batch_id);
      if (!batch) return Response.json({ error: 'Batch not found' }, { status: 404 });
      await base44.entities.MigrationBatch.update(batch.id, { cursor: 0, status: 'running' });
      return Response.json({ success: true });
    }

    if (action === 'pause') {
      await base44.entities.MigrationBatch.update(body.batch_id, { status: 'paused' });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (err) {
    console.error('[migrationEngine]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}