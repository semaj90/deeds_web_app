// @vitest-environment node
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';
import { ENV } from '$lib/server/env.server.js';
import { AdminAiChatService } from '$lib/server/admin/ai-chat-service.js';

/**
 * POST /api/admin/ai-chat/summarize-panel
 *
 * On-demand AI analysis of a single admin panel. Triggered by the
 * `<SummarizeButton>` / `<AiAnalysisPopup>` components — the panel
 * passes its own title + structured snapshot, the route runs Gemma4
 * with a strict summarization prompt, and returns a compact briefing
 * the popup can render.
 *
 * Optionally persists into an existing session as an `assistant` log
 * entry tagged `panel_summary` so the operator can scroll back through
 * "what did the model say about the indexing panel earlier today".
 *
 * Hard rules (mirror the chat route):
 *   - Auth required (or DEV_BYPASS_AUTH).
 *   - Read-only — no DB writes apart from the optional chat log row.
 *   - No tool calls, no MCP fan-out, no agent loop. One Gemma4 call.
 *   - 200 with `{ ok: false, error }` on inference failure (degraded).
 *   - 401 / 400 on auth / Zod errors.
 */

const PanelSummarySchema = z.object({
  /** Stable id of the panel (e.g. 'transport-reranker', 'cluster-table'). */
  panelId:    z.string().min(1).max(120),
  /** Human-readable title to show at the top of the popup. */
  panelTitle: z.string().min(1).max(250),
  /** Free-form panel state the model should summarize. JSON-serializable —
   *  pass tables, charts-as-data, key/value indicators, etc. */
  content:    z.unknown(),
  /** Optional metadata (current route, highlighted element, etc.). */
  metadata:   z.record(z.string(), z.unknown()).optional(),
  /** When set, the assistant reply is logged into this chat session. */
  sessionId:  z.string().uuid().optional(),
  /** Style hint: 'brief' (3 bullets), 'detailed' (full paragraph + bullets),
   *  'risk' (focus on warnings/anomalies), 'next-step' (what to do). */
  style:      z.enum(['brief', 'detailed', 'risk', 'next-step']).default('brief'),
});

const STYLE_INSTRUCTIONS: Record<z.infer<typeof PanelSummarySchema>['style'], string> = {
  brief:       'Respond in 3 short bullets. No preamble.',
  detailed:    'Respond with one paragraph (max 4 sentences) followed by 3-5 supporting bullets.',
  risk:        'Identify warnings, anomalies, or red flags first. List up to 5, each with a one-line explanation. If nothing is concerning, say "No risks detected" exactly.',
  'next-step': 'List 3 prioritized next actions the operator should take. Each action: 1 sentence + the relevant MCP tool / npm script if any. Do NOT attempt to perform actions.',
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user && !ENV.DEV_BYPASS_AUTH) throw error(401, 'Unauthorized');

  let body: unknown;
  try { body = await request.json(); }
  catch { throw error(400, 'Invalid JSON'); }

  const parsed = PanelSummarySchema.safeParse(body);
  if (!parsed.success) throw error(400, parsed.error.message);

  const { panelId, panelTitle, content, metadata, sessionId, style } = parsed.data;
  const t0 = Date.now();

  const prompt = `
You are the TRACE Copilot, a read-only administrative assistant.
Analyze the following admin panel state and respond with a compact briefing.

PANEL: ${panelTitle}  (id: ${panelId})

${metadata ? `METADATA:\n${JSON.stringify(metadata, null, 2)}\n` : ''}
PANEL STATE:
${JSON.stringify(content, null, 2)}

INSTRUCTIONS:
${STYLE_INSTRUCTIONS[style]}

Do NOT invent data. If a value is missing or "unknown", say so. Cite specific
fields from the panel state where possible. Do NOT propose database writes,
schema changes, or destructive actions.
  `.trim();

  try {
    const res = await fetch(`${ENV.BIFROST_URL}/v1/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:    ENV.GEMMA4_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream:   false,
      }),
    });
    if (!res.ok) {
      return json({
        ok: false, panelId, style, durationMs: Date.now() - t0,
        summary: '', error: `Bifrost HTTP ${res.status}`,
      });
    }
    const data    = await res.json();
    const summary = data.choices?.[0]?.message?.content ?? '';

    // Optional persistence — only if the panel was opened from an active chat.
    if (sessionId) {
      await AdminAiChatService.logMessage(sessionId, 'assistant', summary, {
        kind:        'panel_summary',
        panel_id:    panelId,
        panel_title: panelTitle,
        style,
        duration_ms: Date.now() - t0,
      }).catch(() => { /* logging failure must not fail the user-facing call */ });
    }

    return json({
      ok:         true,
      panelId,
      panelTitle,
      style,
      summary,
      durationMs: Date.now() - t0,
      model:      ENV.GEMMA4_MODEL,
      sessionId:  sessionId ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({
      ok: false, panelId, style, durationMs: Date.now() - t0,
      summary: '', error: msg,
    });
  }
};
