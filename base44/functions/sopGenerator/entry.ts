import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Narrow, app-scoped wrapper around Core.InvokeLLM so the SOP Generator page
// (which assembles the prompt client-side from tenant inventory) can run the
// LLM call server-side through the service-role API, as the platform requires.
const ALLOWED_MODELS = new Set([
  "automatic", "claude-sonnet-5", "claude_sonnet_4_6", "gemini_3_flash", "gemini_3_1_pro"
]);

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { prompt, model } = body || {};

    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return Response.json({ error: "Missing 'prompt'." }, { status: 400 });
    }
    if (prompt.length > 120000) {
      return Response.json({ error: "Prompt too large." }, { status: 413 });
    }
    const useModel = model && ALLOWED_MODELS.has(model) ? model : "claude-sonnet-5";

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: useModel,
    });

    const text = typeof result === "string"
      ? result
      : (result?.text || result?.output || (typeof result?.content === "string" ? result.content : JSON.stringify(result)));

    return Response.json({ text, model: useModel });
  } catch (error) {
    return Response.json({ error: error.message || "SOP generation failed." }, { status: 500 });
  }
}