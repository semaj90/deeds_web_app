// @vitest-environment node
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { runHermesPlanner, buildFallbackPlan } from '$lib/server/ai/hermes-planner.js';
import { executeHermesPlan } from '$lib/server/ai/hermes-executor.js';
import { assembleContext, synthesize } from '$lib/server/ai/hermes-synth.js';

// ── Input schema ──────────────────────────────────────────────────────────────

const RunRequestSchema = z.object({
  userQuery:        z.string().min(1).max(4000),
  aceMode:          z.enum(['search', 'debug', 'repair', 'analyze']).default('search'),
  availableSignals: z.object({
    hasEncoded64:        z.boolean(),
    hasClusterSummaries: z.boolean(),
    hasNeo4j:            z.boolean(),
    hasCouchViews:       z.boolean(),
  }).optional(),
  caseId: z.string().uuid().optional(),
});

// ── POST /api/ai/hermes-run ───────────────────────────────────────────────────
//
// Plan → Execute in one shot.
// Returns the resolved plan AND the execution results so callers can render
// both the retrieval trace and the assembled context.

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = RunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { userQuery, aceMode, availableSignals, caseId } = parsed.data;

  // Signals default to "nothing available" if caller omits them — planner will
  // choose the minimal safe tool set (Qdrant + Redis only).
  const signals = availableSignals ?? {
    hasEncoded64:        false,
    hasClusterSummaries: false,
    hasNeo4j:            false,
    hasCouchViews:       false,
  };

  // ── 1. Plan ────────────────────────────────────────────────────────────────
  let plan;
  let source: 'hermes' | 'fallback';

  try {
    plan   = await runHermesPlanner({ userQuery, aceMode, availableSignals: signals });
    source = 'hermes';
  } catch {
    plan   = buildFallbackPlan(aceMode, userQuery, signals);
    source = 'fallback';
  }

  // ── 2. Execute ────────────────────────────────────────────────────────────
  const execution = await executeHermesPlan(plan, { userQuery, caseId });

  // ── 3. Synthesize (optional — skipped when finalComposer === 'none') ──────
  const context = assembleContext(userQuery, execution);
  const synthesis = await synthesize(plan.finalComposer, userQuery, context).catch((err) => ({
    answer:     '',
    cacheHit:   false,
    durationMs: 0,
    composer:   plan.finalComposer,
    error:      err instanceof Error ? err.message : String(err),
  }));

  return json({
    ok:        true,
    source,
    plan,
    execution,
    context,
    synthesis,
  });
};
