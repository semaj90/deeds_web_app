import { json } from '@sveltejs/kit';
import { AdminAiChatService, formatBrowserContextForPrompt } from '$lib/server/admin/ai-chat-service.js';
import { gatherAdminContext } from '$lib/server/admin/ai-chat-context.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

const AdminAiChatSchema = z.object({
  sessionId: z.string().optional(),
  query: z.string().min(1),
  contextTag: z.string().optional(),
  uiSnapshot: z.array(z.record(z.any())).optional(),
});

/**
 * Main AI Chat endpoint for Admin Copilot.
 * Handles context injection and cascades to Bifrost/Ollama.
 */
export async function POST({ request, locals }) {
  if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await request.json();
  const parsed = AdminAiChatSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid payload: ' + parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { sessionId, query, contextTag, uiSnapshot } = parsed.data;

  // 1. Resolve or Create Session
  const userId = locals.user?.id || 'dev-admin';
  const session = sessionId 
    ? { id: sessionId } 
    : await AdminAiChatService.getOrCreateSession(userId, contextTag);

  // 2. Gather System Context (Parallel to LLM prep)
  //    Pass userId so the Browser Context Lane can attach a sanitized
  //    snapshot from /api/browser-context/snapshot if one is stored.
  const systemContext = await gatherAdminContext(query, contextTag, userId);
  const browserSection = formatBrowserContextForPrompt(systemContext.browserContext ?? null);

  // 3. Log User Message
  await AdminAiChatService.logMessage(session.id, 'user', query);

  // 4. Construct Inference Payload (Tiered Cascade)
  // We use Bifrost Dispatch via internal fetch to keep it canonical
  const prompt = `
SYSTEM CONTEXT (authoritative — TRACE backend probes):
${JSON.stringify({ ...systemContext, browserContext: undefined }, null, 2)}

UI SNAPSHOT (What the user sees in the admin panel):
${JSON.stringify(uiSnapshot || {}, null, 2)}
${browserSection ? `

BROWSER CONTEXT:
${browserSection}` : ''}

USER QUESTION:
${query}

You are the TRACE Copilot, a read-only administrative assistant for the Deeds Legal AI platform.
Answer the user's question based on the system context and UI snapshot provided.
If you need to perform an action, suggest the appropriate MCP tool (e.g. kb.hybrid_search).
Do NOT attempt to mutate data or generate code for production use.
  `.trim();

  try {
    const bifrostRes = await fetch(`${ENV.BIFROST_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ENV.GEMMA4_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false
      })
    });

    if (!bifrostRes.ok) throw new Error(`Bifrost returned ${bifrostRes.status}`);
    const data = await bifrostRes.json();
    const assistantReply = data.choices?.[0]?.message?.content || 'No response from AI.';

    // 5. Log Assistant Reply
    await AdminAiChatService.logMessage(session.id, 'assistant', assistantReply, {
      model: ENV.GEMMA4_MODEL,
      context_used: true
    });

    return json({
      sessionId: session.id,
      reply: assistantReply,
      context: systemContext
    });
  } catch (err: any) {
    console.error('[AdminChatAPI] Error:', err);
    return json({ error: `Inference failed: ${err.message}` }, { status: 500 });
  }
}
