import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Shared secret to authenticate incoming agent payloads
// The agent includes this in the Authorization header: Bearer <AGENT_SECRET>
const AGENT_SECRET = Deno.env.get("LICENSE_SECRET") || "ad-agent-secret";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Token verification ────────────────────────────────────────────────────
    // Agent sends: Authorization: Bearer <AGENT_SECRET>
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();

    const body = await req.json();
    const { action } = body;

    // ── Download agent token (called by authenticated console user) ──────────
    // Returns the agent secret so the UI can embed it in the download script
    if (action === "get_agent_token") {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
      return Response.json({ success: true, agentToken: AGENT_SECRET });
    }

    // ── Agent scan upload ─────────────────────────────────────────────────────
    // Called by the on-prem agent — validate with shared secret
    if (action === "upload_scan") {
      if (token !== AGENT_SECRET) {
        return Response.json({ error: "Invalid agent token" }, { status: 403 });
      }

      const {
        agent_id, hostname, domain, domain_netbios, forest,
        agent_version, users, groups, ous, stats, os_info
      } = body;

      if (!agent_id || !hostname || !domain) {
        return Response.json({ error: "Missing required fields: agent_id, hostname, domain" }, { status: 400 });
      }

      // Find existing scan record for this agent or create new
      const existing = await base44.asServiceRole.entities.AdAgentScan.filter({ agent_id });

      const payload = {
        agent_id,
        hostname,
        domain,
        domain_netbios: domain_netbios || "",
        forest: forest || domain,
        scan_time: new Date().toISOString(),
        agent_version: agent_version || "1.0.0",
        status: "active",
        user_count: (users || []).length,
        group_count: (groups || []).length,
        ou_count: (ous || []).length,
        users_payload: JSON.stringify(users || []),
        stats_payload: JSON.stringify(stats || {}),
        os_info: os_info || "",
        error_message: "",
      };

      let record;
      if (existing.length > 0) {
        record = await base44.asServiceRole.entities.AdAgentScan.update(existing[0].id, payload);
      } else {
        record = await base44.asServiceRole.entities.AdAgentScan.create(payload);
      }

      console.log(`[adAgentReceiver] Scan received from ${hostname} (${domain}): ${(users || []).length} users`);

      return Response.json({
        success: true,
        scanId: record.id,
        usersReceived: (users || []).length,
        message: `Scan stored — ${(users || []).length} users from ${domain}`
      });
    }

    // ── List available scans (called by authenticated console user) ──────────
    if (action === "list_scans") {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const scans = await base44.asServiceRole.entities.AdAgentScan.list("-scan_time", 20);
      return Response.json({ success: true, scans });
    }

    // ── Get full scan users for a specific agent ──────────────────────────────
    if (action === "get_scan_users") {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const { scan_id } = body;
      const scans = await base44.asServiceRole.entities.AdAgentScan.filter({ id: scan_id });
      if (!scans.length) return Response.json({ error: "Scan not found" }, { status: 404 });
      const scan = scans[0];
      const users = JSON.parse(scan.users_payload || "[]");
      return Response.json({ success: true, users, scan });
    }

    // ── Agent heartbeat ───────────────────────────────────────────────────────
    if (action === "heartbeat") {
      if (token !== AGENT_SECRET) {
        return Response.json({ error: "Invalid agent token" }, { status: 403 });
      }
      const { agent_id, hostname } = body;
      const existing = await base44.asServiceRole.entities.AdAgentScan.filter({ agent_id });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.AdAgentScan.update(existing[0].id, {
          scan_time: new Date().toISOString(),
          status: "active",
        });
      }
      return Response.json({ success: true, message: "Heartbeat acknowledged" });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[adAgentReceiver]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});