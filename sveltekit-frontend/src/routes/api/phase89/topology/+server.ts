/**
 * Phase 89: Topology API Endpoint
 * Returns file-error topology for visualization
 */

import { json } from '@sveltejs/kit';
import pg from 'pg';
import type { RequestHandler } from './$types';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new Pool({ connectionString: DATABASE_URL });

export const GET: RequestHandler = async () => {
  try {
    // Get errors grouped by file
    const errorsResult = await pool.query(`
      SELECT
        COALESCE(
          SUBSTRING(raw_text FROM '^([^:(]+)'),
          'unknown'
        ) as file_path,
        source,
        COUNT(*) as error_count,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as embedded_count
      FROM raw_error_embeddings
      GROUP BY file_path, source
      ORDER BY error_count DESC
      LIMIT 500
    `);

    // Build topology nodes
    const nodes = errorsResult.rows.map((row, i) => ({
      id: row.file_path || `unknown_${i}`,
      label: (row.file_path || 'unknown').split('/').pop() || 'unknown',
      type: 'file' as const,
      errorCount: parseInt(row.error_count),
      embeddedCount: parseInt(row.embedded_count),
      source: row.source,
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
      const dir = node.id.split('/').slice(0, -1).join('/') || 'root';
      if (!dirGroups.has(dir)) {
        dirGroups.set(dir, []);
      }
      dirGroups.get(dir)!.push(node.id);
    }

    // Create edges within directories
    for (const [dir, files] of dirGroups.entries()) {
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
  } catch (error: any) {
    console.error('Topology error:', error);
    return json({
      topology: {
        nodes: [],
        edges: [],
        summary: { totalFiles: 0, totalErrors: 0, totalEmbedded: 0 }
      },
      error: error.message
    });
  }
};
