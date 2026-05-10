import { json } from '@sveltejs/kit';
import { pool } from '$lib/server/db/client';

/**
 * GET /api/admin/raptor-atlas
 * Returns recent hierarchical abstracts for the monitoring dashboard.
 */
export async function GET({ locals }) {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const res = await pool.query(
      `SELECT id, level, summary, created_at 
       FROM admin_raptor_summaries 
       ORDER BY created_at DESC 
       LIMIT 20`
    );
    return json({ summaries: res.rows });
  } catch (err) {
    console.error('[RaptorAtlasAPI] Error:', err);
    return json({ summaries: [], error: 'Database error' });
  }
}
