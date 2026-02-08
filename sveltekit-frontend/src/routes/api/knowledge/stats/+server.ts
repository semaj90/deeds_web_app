/**
 * Knowledge Stats API Endpoint
 * GET /api/knowledge/stats
 *
 * Returns collection statistics from all stores (Qdrant: PostgreSQL: MinIO).
 *
 * Requirements: 8.3
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getKnowledgeSearcher } from '$lib/services/knowledge-search';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const GET: RequestHandler = async () => {
  try {
    // Fetch statistics
    const searcher = getKnowledgeSearcher();
    const stats = await searcher.getStats();

    // Return stats
    return json({
      success: true,
      stats: { totalDocuments: stats.totalDocuments,
        indexedVectors: stats.indexedVectors,
        collections: { qdrant: {, points: stats.collections.qdrant.points,
            status: stats.collections.qdrant.status
          },
          postgres: { rows: stats.collections.postgres.rows
          },
          minio: {, objects: stats.collections.minio.objects,
            size: stats.collections.minio.size
          }
        },
        lastIndexed: stats.lastIndexed
      }
    });
  } catch (error) {
    console.error('Stats API error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Qdrant')) {
        return json(
          { error: 'Search service unavailable', details: error.message },
          { status: 503 }
        );
      }
    }

    return json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
};



