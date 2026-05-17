import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Path to pre-audited and compiled observability trend report
const OBSERVABILITY_JSON_PATH = resolve('docs/reports/workstation-observability-state.json');

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!existsSync(OBSERVABILITY_JSON_PATH)) {
      return json({
        success: false,
        error: 'Observability state file not generated yet. Run scripts/atlas/generate-soak-trends.mjs.'
      }, { status: 404 });
    }

    const rawData = readFileSync(OBSERVABILITY_JSON_PATH, 'utf8');
    const data = JSON.parse(rawData);

    return json({
      success: true,
      ...data
    });
  } catch (err: any) {
    console.error('[Admin Observability API] GET error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
