// @vitest-environment node
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import {
  runHermesPlanner,
  validateAceContextPacket,
  inferPipelineGaps,
  buildFallbackPlan,
} from '$lib/server/ai/hermes-planner';

// ── Signals shape — shared by both input formats ──────────────────────────────

const SignalsSchema = z.object({
  hasEncoded64:        z.boolean(),
  hasClusterSummaries: z.boolean(),
  hasNeo4j:            z.boolean(),
  hasCouchViews:       z.boolean(),
});

// ── Accept both {action, userQuery, aceMode, availableSignals}  (internal)
//        and  {query, mode, signals}                             (curl / external)
// ─────────────────────────────────────────────────────────────────────────────

const PlanRequestSchema = z.union([
  // Canonical multi-action shape
  z.object({
    action:           z.enum(['plan', 'validate', 'gaps']),
    userQuery:        z.string().max(4000).optional(),
    aceMode:          z.enum(['search', 'debug', 'repair', 'analyze']).optional(),
    availableSignals: SignalsSchema.optional(),
    contextPacket:    z.string().max(16000).optional(),
    stateSnapshot:    z
      .object({
        qdrantChunkCount:          z.number(),
        redisClusterSummaryCount:  z.number(),
        neo4jEdgeCount:            z.number(),
        couchdbPageRankNodeCount:  z.number(),
        postgresAceRunCount:       z.number(),
      })
      .optional(),
  }),
  // Simplified shape — always treated as action: 'plan'
  z.object({
    query:   z.string().max(4000),
    mode:    z.enum(['search', 'debug', 'repair', 'analyze']),
    signals: SignalsSchema,
  }),
]);

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

  const parsed = PlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Normalize simplified shape → action: 'plan'
  const action = 'action' in data ? data.action : 'plan';
  const userQuery = 'query' in data ? data.query : data.userQuery;
  const aceMode = 'mode' in data ? data.mode : data.aceMode;
  const availableSignals = 'signals' in data ? data.signals : data.availableSignals;

  try {
    if (action === 'plan') {
      if (!userQuery || !aceMode || !availableSignals) {
        return json(
          { error: 'plan requires userQuery/query, aceMode/mode, availableSignals/signals' },
          { status: 400 }
        );
      }

      let plan;
      let source: 'hermes' | 'fallback';

      try {
        plan = await runHermesPlanner({ userQuery, aceMode, availableSignals });
        source = 'hermes';
      } catch {
        // Hermes offline or returned invalid JSON — use deterministic local plan
        plan = buildFallbackPlan(aceMode, userQuery, availableSignals);
        source = 'fallback';
      }

      return json({ ok: true, source, plan });
    }

    if (action === 'validate') {
      const contextPacket = 'contextPacket' in data ? data.contextPacket : undefined;
      if (!contextPacket) {
        return json({ error: 'validate requires contextPacket' }, { status: 400 });
      }
      const validation = await validateAceContextPacket(contextPacket);
      return json({ ok: true, source: 'hermes', validation });
    }

    if (action === 'gaps') {
      const stateSnapshot = 'stateSnapshot' in data ? data.stateSnapshot : undefined;
      if (!stateSnapshot) {
        return json({ error: 'gaps requires stateSnapshot' }, { status: 400 });
      }
      const repairPlan = await inferPipelineGaps(stateSnapshot);
      return json({ ok: true, source: 'hermes', repairPlan });
    }

    return json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, { status: 502 });
  }
};
