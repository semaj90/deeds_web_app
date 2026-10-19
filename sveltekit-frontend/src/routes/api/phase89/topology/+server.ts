/**
 * Phase 89: Topology API Endpoint
 * Returns file-error topology for visualization
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Get errors grouped by file
    const errorsResult = await pool.query(`
      SELECT
        COALESCE(NULLIF(i.file_path, ''), 'unknown') as file_path,
        COUNT(DISTINCT i.id)::integer as error_count,
        COUNT(DISTINCT i.id) FILTER (WHERE e.embedding IS NOT NULL)::integer as embedded_count
      FROM phase89_error_instances i
      LEFT JOIN raw_error_embeddings e ON e.error_hash = i.error_hash
      GROUP BY COALESCE(NULLIF(i.file_path, ''), 'unknown')
      ORDER BY error_count DESC
      LIMIT 500
    `);

    // Build topology nodes
    const nodes = errorsResult.rows.map((row: Record<string, string>, i: number) => ({
      id: row?.file_path || `unknown_${i}`,
      label: (row?.file_path ?? 'unknown').split('/').pop() ?? 'unknown',
      type: 'file' as const,
      errorCount: parseInt(row.error_count),
      embeddedCount: parseInt(row.embedded_count),
      status: parseInt(row.embedded_count) === parseInt(row.error_count)
        ? 'clean' as const
        : parseInt(row.error_count) > 10
          ? 'error' as const
          : 'warning' as const
    }));

    // Build edges based on file paths (same directory = connected)
    const edges: Array<{ from: string; to: string; type: string }> = [];
    const dirGroups = new Map<string, string[]>();

    for (const node of nodes) {
      const dir = node.id.split('/').slice(0, -1).join('/') ?? 'root';
      if (!dirGroups.has(dir)) {
        dirGroups.set(dir, []);
      }
      dirGroups.get(dir)!.push(node.id);
    }

    // Create edges within directories
    for (const [_dir, files] of dirGroups.entries()) {
      if (files.length > 1 && files.length < 20) {
        for (let i = 0; i < files.length - 1; i++) {
          edges.push({
            from: files[i],
            to: files[i + 1],
            type: 'same_directory'
          });
        }
      }
    }

    return json({
      topology: {
        nodes,
        edges,
        summary: {
          totalFiles: nodes.length,
          totalErrors: nodes.reduce((sum, n) => sum + n.errorCount, 0),
          totalEmbedded: nodes.reduce((sum, n) => sum + n.embeddedCount, 0)
        }
      }
    });
  } catch (error) {
    console.error('Topology error:', error);
    return json({
      topology: {
        nodes: [],
        edges: [],
        summary: { totalFiles: 0, totalErrors: 0, totalEmbedded: 0 }
      },
      error: 'Failed to load topology data'
    });
  }
};
