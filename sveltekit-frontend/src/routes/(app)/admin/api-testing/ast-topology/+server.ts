// API endpoint: /api/ast-topology
// Returns codebase topology as graph data

import { json } from '@sveltejs/kit';
import pg from 'pg';
import type { RequestHandler } from './$types';
import { getDatabaseUrl } from '$lib/config/env.server.js';

const { Pool } = pg;

export const GET: RequestHandler = async () => {
	try {
    const pool = new Pool({ connectionString: getDatabaseUrl() });
    const result = await pool.query(`
			SELECT source, line_number, raw_text, tags
			FROM raw_error_embeddings
			ORDER BY source, line_number
		`);

    await pool.end();

    // Build graph nodes and edges
    const nodes: any[] = [];
    const edges: any[] = [];
    const fileMap = new Map<string, number>();

    for (const row of result.rows) {
      const source = row.source;

      if (!fileMap.has(source)) {
        const nodeId = `file-${fileMap.size}`;
        fileMap.set(source, fileMap.size);

        const errorCount = result.rows.filter((r) => r.source === source).length;

        nodes.push({
          id: nodeId,
          label: source.split('/').pop() || source,
          type: source.includes('/routes/')
            ? 'route'
            : source.includes('/components/')
              ? 'component'
              : source.includes('/lib/')
                ? 'lib'
                : 'api',
          status: errorCount > 0 ? 'error' : 'normal',
          errorCount,
          path: source,
        });
      }

      // Create edges based on imports (simplified - would need AST parsing for real data)
      // For now, connect files in same directory
      const dir = source.substring(0, source.lastIndexOf('/'));
      for (const [otherSource, otherId] of fileMap.entries()) {
        if (otherSource !== source && otherSource.startsWith(dir)) {
          const thisId = `file-${fileMap.get(source)}`;
          const targetId = `file-${otherId}`;

          if (!edges.find((e) => e.source === thisId && e.target === targetId)) {
            edges.push({
              source: thisId,
              target: targetId,
              type: 'dependency',
            });
          }
        }
      }
    }

    // Calculate stats
    const totalErrors = result.rows.length;
    const uniqueFiles = fileMap.size;

    // Query fix history and pattern confidence from DB
    let fixedToday = 0;
    let confidence = 0;
    let inProgress = 0;
    try {
      const historyResult = await pool.query(`
				SELECT COUNT(*) AS cnt FROM error_fix_history
				WHERE created_at >= NOW() - INTERVAL '24 hours'
			`);
      fixedToday = parseInt(historyResult.rows[0]?.cnt ?? '0', 10) || 0;
    } catch {
      /* table may not exist */
    }
    try {
      const patternResult = await pool.query(`
				SELECT AVG(confidence_score) AS avg_conf,
				       COUNT(*) FILTER (WHERE status = 'in_progress') AS in_prog
				FROM learned_fix_patterns
			`);
      confidence = Math.round((parseFloat(patternResult.rows[0]?.avg_conf ?? '0') || 0) * 100);
      inProgress = parseInt(patternResult.rows[0]?.in_prog ?? '0', 10) || 0;
    } catch {
      /* table may not exist */
    }

    return json({
      nodes,
      edges,
      stats: {
        totalErrors,
        fixedToday,
        inProgress,
        confidence,
        errorChange: 0,
        uniqueFiles,
      },
    });
  } catch (error: any) {
		console.error('Failed to load topology:', error);
		return json({ error: 'Failed to load topology' }, { status: 500 });
	}
};


