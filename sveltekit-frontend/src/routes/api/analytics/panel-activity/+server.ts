/**
 * POST /api/analytics/panel-activity
 *
 * Fire-and-forget panel tracking for the L11 HyperRAG activity prefetch.
 * §6.2 of docs/architecture/hyperrag-feature-atlas-runtime.md
 *
 * Body: { panelKey, route, filePath?, toolUsed?, dwellMs? }
 * Returns: 204 No Content on success, 400 on validation failure.
 */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { panelActivityLog } from '$lib/server/db/schema-postgres.js';

const panelActivitySchema = z.object({
  panelKey:  z.string().min(1).max(128),
  route:     z.string().min(1).max(512),
  filePath:  z.string().max(1024).optional(),
  toolUsed:  z.string().max(256).optional(),
  dwellMs:   z.number().int().min(0).max(3_600_000).optional(),
  sessionId: z.string().max(128).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user?.id) {
    // Not authenticated — silently discard rather than 401 (fire-and-forget contract)
    return new Response(null, { status: 204 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = panelActivitySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const { panelKey, route, filePath, toolUsed, dwellMs, sessionId } = parsed.data;

  try {
    await db.insert(panelActivityLog).values({
      userId:    Number(user.id),
      sessionId: sessionId ?? 'unknown',
      route,
      panelKey,
      filePath:  filePath ?? null,
      toolUsed:  toolUsed ?? null,
      dwellMs:   dwellMs  ?? null,
    });
  } catch {
    // Fire-and-forget — never fail the caller for a log write error
    // (The L11 prefetch degrades gracefully when the table has no rows)
  }

  return new Response(null, { status: 204 });
};
