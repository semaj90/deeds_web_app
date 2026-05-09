import { json } from '@sveltejs/kit';
import pg from 'pg';
import { ENV } from '$lib/server/env.server.js';

const { Pool } = pg;
const pgPool = new Pool({ connectionString: ENV.DATABASE_URL });

/**
 * Guarded Topology Recompute Route.
 * Aligned with the corrected topology model (forbidding heuristic in-route writes).
 */
export async function POST({ locals }) {
  if (locals.user?.role !== 'admin') {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch current stats for the response
    const stats = await pgPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM embedded_summaries) as total_rows,
        (SELECT COUNT(*) FROM embedded_summaries WHERE som_bmu_row IS NOT NULL AND som_bmu_col IS NOT NULL) as bmu_rows,
        (SELECT COUNT(*) FROM embedded_summaries WHERE manifold4 IS NOT NULL AND array_length(manifold4, 1) = 4) as manifold4_rows
    `).then(r => r.rows[0]);

    const totalRows = Number(stats.total_rows || 0);
    const bmuRows = Number(stats.bmu_rows || 0);
    const manifold4Rows = Number(stats.manifold4_rows || 0);

    return json({
      ok: false,
      executed: false,
      readOnly: true,
      message: 'Inline topology recompute is disabled. Use the canonical offline graphify pipeline instead.',
      reason: 'The repaired topology model forbids heuristic in-route 768d->4d projection writes.',
      current: {
        totalRows,
        bmuRows,
        manifold4Rows,
        missingBmu: totalRows - bmuRows,
        missingManifold4: totalRows - manifold4Rows
      },
      recommendedSequence: [
        "npm run graphify:topology:gpu",
        "npm run qdrant:patch-topology",
        "npm run graphify:seed-llm-index"
      ],
      note: "This route now serves as a guarded admin reminder until a canonical gated recompute executor is introduced."
    }, { status: 409 });
  } catch (err: any) {
    console.error('Topology recompute guard failed:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
