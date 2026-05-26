/**
 * POST /api/ai/intent-dispatch
 *
 * Phase B endpoint for the regex-tool-router design
 * (next_steps/active/2026-05-10_service-worker-regex-tool-router.md §2.3).
 *
 * NOTE on naming: design doc called this `/api/ai/contextual-chat` but that
 * path is already taken by a RAG-augmented chat endpoint. Renamed to
 * `intent-dispatch` to avoid collision; semantics unchanged.
 *
 * Flow:
 *   1. Zod-validate body
 *   2. Re-run inferIntent server-side (don't trust the client — design §2 defense-in-depth)
 *   3. routeIntent() → chain
 *   4. executeChain() over TRACE MCP :8788
 *   5. Write a `chat.intent` row to context_timeline (fire-and-forget)
 *   6. Return chain result + trace
 *
 * G26 baseline cases the route test covers:
 *   401  — no locals.user
 *   400  — Zod rejects (missing text, wrong shape)
 *   200  — happy path with mocked MCP
 *   200  — MCP unreachable: partial-trace returned, still 200 (UX promise)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { contextTimeline } from '$lib/server/db/schema-postgres';
import { rankIntent } from '$lib/intent/regex-intent';
import { routeIntent, executeChain } from '$lib/server/ai/intent-router';

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  sessionId: z.string().min(1).max(120).optional(),
  caseId: z.string().uuid().optional(),
  filePath: z.string().max(512).optional(),
  parentTaskId: z.string().uuid().optional(),
  runId: z.string().max(64).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let parsed;
  try {
    const raw = await request.json();
    parsed = bodySchema.safeParse(raw);
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }

  const { text, sessionId, caseId, filePath, parentTaskId, runId } = parsed.data;
  const userId = Number(locals.user.id) || 0;
  const ctx = { userId, sessionId: sessionId ?? '', caseId, filePath, parentTaskId, runId };

  // Defense-in-depth: re-run rankIntent on the server. The client may have
  // hinted intent but the server's classification is source of truth.
  const intent = rankIntent(text);
  const decision = routeIntent(intent, text, ctx);
  const execution = await executeChain(decision, ctx, { parentTaskId, runId });

  // Fire-and-forget context_timeline write. Don't await — UX latency matters.
  db.insert(contextTimeline)
    .values({
      userId: userId > 0 ? userId : undefined,
      sessionId: sessionId ?? '',
      eventType: 'chat.intent',
      pipeline: 'ace',
      payload: {
        label: decision.intent.label,
        confidence: decision.intent.confidence,
        keywords: decision.intent.keywords,
        alternates: decision.intent.alternates,
        fallback: decision.fallback,
        reason: decision.reason,
        chain: decision.chain.map((s) => s.tool),
        trace: execution.trace,
        route: filePath ?? null,
        parentTaskId,
        runId,
      },
    })
    .catch((err: unknown) => {
      console.error('[intent-dispatch] context_timeline write failed:', err);
    });

  return json({
    ok: true,
    intent: decision.intent,
    chain: decision.chain.map((s) => s.tool),
    fallback: decision.fallback,
    reason: decision.reason,
    result: execution.result,
    trace: execution.trace,
  });
};
