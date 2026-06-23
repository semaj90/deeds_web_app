import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractSignal, QueryRouter4x4 } from '$lib/server/routing/query-router-4x4.js';

const observabilityBodySchema = z.object({
	query: z.string().min(1, 'query is required').max(1000)
});

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Define potential resolving paths for monorepo monorepo-friendly access
  const obsPaths = [
    resolve('docs/reports/workstation-observability-state.json'),
    resolve('../docs/reports/workstation-observability-state.json')
  ];
  const obsPath = obsPaths.find(p => existsSync(p));

  const routingPaths = [
    resolve('docs/reports/lane-routing-eval.json'),
    resolve('../docs/reports/lane-routing-eval.json')
  ];
  const routingPath = routingPaths.find(p => existsSync(p));

  const healingPaths = [
    resolve('docs/reports/hermes-self-healing-report.json'),
    resolve('../docs/reports/hermes-self-healing-report.json')
  ];
  const healingPath = healingPaths.find(p => existsSync(p));

  try {
    if (!obsPath) {
      return json({
        success: false,
        error: 'Observability state file not generated yet. Run scripts/atlas/generate-soak-trends.mjs.'
      }, { status: 404 });
    }

    const obsData = JSON.parse(readFileSync(obsPath, 'utf8'));
    let routingData = null;
    let healingData = null;

    if (routingPath) {
      try {
        routingData = JSON.parse(readFileSync(routingPath, 'utf8'));
      } catch {
        /* skip */
      }
    }

    if (healingPath) {
      try {
        healingData = JSON.parse(readFileSync(healingPath, 'utf8'));
      } catch {
        /* skip */
      }
    }

    return json({
      success: true,
      ...obsData,
      routing: routingData,
      healing: healingData
    });
  } catch (err: any) {
    console.error('[Admin Observability API] GET error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = observabilityBodySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const { query } = parsed.data;

    const signal = extractSignal(query);
    const router = new QueryRouter4x4();
    const result = router.route(signal);

    return json({
      success: true,
      query,
      signals: signal,
      weights: result.weights,
      dispatch: result.dispatch,
      explanation: result.explanation
    });
  } catch (err: any) {
    console.error('[Admin Observability API] POST error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
