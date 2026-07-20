import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin@localhost/legal_ai_db',
});

interface FileLabel {
  packet_key: string;
  source_ref: string;
  file_purpose: string;
  thoroughness: string;
  app_criticality: string;
  test_coverage_pct: number;
  file_understanding_computed_at: string | null;
  file_understanding_method: string | null;
}

interface LabelStats {
  total_packets: number;
  labeled_packets: number;
  label_coverage: number;
  distribution: {
    purpose: Record<string, number>;
    thoroughness: Record<string, number>;
    criticality: Record<string, number>;
  };
  avg_test_coverage: number;
  methods: Record<string, number>;
}

/**
 * GET /api/atlas/file-understanding
 * Retrieve file understanding labels with optional filtering and aggregation.
 *
 * Query params:
 *   - purpose: filter by file_purpose
 *   - thoroughness: filter by thoroughness level
 *   - criticality: filter by app_criticality
 *   - min_test_coverage: filter by minimum test coverage %
 *   - limit: number of results (default 100)
 *   - offset: pagination offset (default 0)
 *   - stats: if true, return aggregated statistics instead of individual labels
 */
export const GET: RequestHandler = async ({ url }) => {
  const client = await pool.connect();
  try {
    const purpose = url.searchParams.get('purpose');
    const thoroughness = url.searchParams.get('thoroughness');
    const criticality = url.searchParams.get('criticality');
    const minTestCoverage = url.searchParams.get('min_test_coverage');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const wantStats = url.searchParams.has('stats');

    // Build WHERE clause
    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let paramIndex = 1;

    if (purpose) {
      conditions.push(`file_purpose = $${paramIndex++}`);
      params.push(purpose);
    }
    if (thoroughness) {
      conditions.push(`thoroughness = $${paramIndex++}`);
      params.push(thoroughness);
    }
    if (criticality) {
      conditions.push(`app_criticality = $${paramIndex++}`);
      params.push(criticality);
    }
    if (minTestCoverage) {
      conditions.push(`test_coverage_pct >= $${paramIndex++}`);
      params.push(parseInt(minTestCoverage));
    }

    const whereClause = conditions.join(' AND ');

    if (wantStats) {
      // Return aggregated statistics
      const statsQuery = `
        SELECT
          COUNT(*) as total_packets,
          COUNT(CASE WHEN file_purpose IS NOT NULL THEN 1 END) as labeled_packets,
          ROUND(100.0 * COUNT(CASE WHEN file_purpose IS NOT NULL THEN 1 END) / COUNT(*), 2) as label_coverage,
          AVG(test_coverage_pct) as avg_test_coverage,
          json_object_agg(file_purpose, purpose_count) as purpose_dist,
          json_object_agg(thoroughness, thoroughness_count) as thoroughness_dist,
          json_object_agg(app_criticality, criticality_count) as criticality_dist,
          json_object_agg(file_understanding_method, method_count) as method_dist
        FROM (
          SELECT * FROM atlas_packets WHERE ${whereClause}
        ) base
        CROSS JOIN (
          SELECT file_purpose, COUNT(*) as purpose_count FROM atlas_packets WHERE ${whereClause} GROUP BY file_purpose
        ) purpose_stats
        CROSS JOIN (
          SELECT thoroughness, COUNT(*) as thoroughness_count FROM atlas_packets WHERE ${whereClause} GROUP BY thoroughness
        ) thoroughness_stats
        CROSS JOIN (
          SELECT app_criticality, COUNT(*) as criticality_count FROM atlas_packets WHERE ${whereClause} GROUP BY app_criticality
        ) criticality_stats
        CROSS JOIN (
          SELECT file_understanding_method, COUNT(*) as method_count FROM atlas_packets WHERE ${whereClause} GROUP BY file_understanding_method
        ) method_stats
      `;

      const result = await client.query(statsQuery, params);
      const row = result.rows[0];

      const stats: LabelStats = {
        total_packets: parseInt(row.total_packets),
        labeled_packets: parseInt(row.labeled_packets),
        label_coverage: parseFloat(row.label_coverage),
        distribution: {
          purpose: row.purpose_dist || {},
          thoroughness: row.thoroughness_dist || {},
          criticality: row.criticality_dist || {},
        },
        avg_test_coverage: row.avg_test_coverage ? parseFloat(row.avg_test_coverage) : 0,
        methods: row.method_dist || {},
      };

      return json(stats);
    } else {
      // Return individual labels
      const query = `
        SELECT
          packet_key,
          source_ref,
          file_purpose,
          thoroughness,
          app_criticality,
          test_coverage_pct,
          file_understanding_computed_at,
          file_understanding_method
        FROM atlas_packets
        WHERE ${whereClause}
        ORDER BY file_understanding_computed_at DESC NULLS LAST
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit);
      params.push(offset);

      const result = await client.query(query, params);
      const labels: FileLabel[] = result.rows;

      return json({
        labels,
        total: result.rows.length,
        limit,
        offset,
      });
    }
  } catch (err) {
    console.error('File understanding query error:', err);
    return json(
      { error: 'Failed to retrieve file understanding labels' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
};

/**
 * POST /api/atlas/file-understanding
 * Manually set file understanding labels for a packet (human feedback).
 *
 * Body:
 *   {
 *     packet_key: string,
 *     file_purpose: enum,
 *     thoroughness: enum,
 *     app_criticality: enum,
 *     test_coverage_pct: 0-100,
 *     reasoning?: string
 *   }
 */
export const POST: RequestHandler = async ({ request }) => {
  const client = await pool.connect();
  try {
    const body = await request.json();
    const {
      packet_key,
      file_purpose,
      thoroughness,
      app_criticality,
      test_coverage_pct,
      reasoning,
    } = body;

    if (!packet_key) {
      return json({ error: 'packet_key required' }, { status: 400 });
    }

    // Update packet with human-labeled values
    await client.query(
      `UPDATE atlas_packets
       SET file_purpose = $1,
           thoroughness = $2,
           app_criticality = $3,
           test_coverage_pct = $4,
           file_understanding_computed_at = NOW(),
           file_understanding_method = 'human'
       WHERE packet_key = $5`,
      [
        file_purpose || 'other',
        thoroughness || 'stub',
        app_criticality || 'optional',
        test_coverage_pct || 0,
        packet_key,
      ]
    );

    // Log to audit trail if reasoning provided
    if (reasoning) {
      await client.query(
        `INSERT INTO file_understanding_audit (packet_key, labeled_at, labeling_method, new_purpose, new_thoroughness, new_criticality, new_test_coverage, confidence_score, notes)
         VALUES ($1, NOW(), 'human', $2, $3, $4, $5, 1.0, $6)`,
        [
          packet_key,
          file_purpose || 'other',
          thoroughness || 'stub',
          app_criticality || 'optional',
          test_coverage_pct || 0,
          reasoning,
        ]
      );
    }

    return json({ success: true, packet_key });
  } catch (err) {
    console.error('File understanding update error:', err);
    return json({ error: 'Failed to update labels' }, { status: 500 });
  } finally {
    client.release();
  }
};
