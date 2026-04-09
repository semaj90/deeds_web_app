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
import { getKnowledgeSearcher } from '$lib/services/knowledge-search/KnowledgeSearcher.js';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Fetch statistics
    const searcher = getKnowledgeSearcher();
    const stats = await searcher.getStats();

    // Return stats
    return json({
      success: true,
      stats: { totalDocuments: stats.totalDocuments,
        indexedVectors: stats.indexedVectors,
        collections: { qdrant: { points: stats.collections.qdrant.points,
            status: stats.collections.qdrant.status
          },
          postgres: { rows: stats.collections.postgres.rows
          },
          minio: { objects: stats.collections.minio.objects,
            size: stats.collections.minio.size
          }
        },
        lastIndexed: stats.lastIndexed
      }
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return json({
      success: false,
      stats: {
        totalDocuments: 0,
        indexedVectors: 0,
        collections: {
          qdrant: { points: 0, status: 'unavailable' },
          postgres: { rows: 0 },
          minio: { objects: 0, size: 0 },
        },
        lastIndexed: null,
      },
    });
  }
};



