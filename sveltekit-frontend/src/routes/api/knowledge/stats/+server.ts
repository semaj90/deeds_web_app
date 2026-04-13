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
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { getKnowledgeSearcher } from '$lib/services/knowledge-search/KnowledgeSearcher.js';

export const GET: RequestHandler = async ({ locals, request }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Fetch statistics
    const searcher = getKnowledgeSearcher();
    const stats = await searcher.getStats();

    // Return stats
    const responseData = {
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
    };

    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);

    return json(responseData, {
      headers: { ...cacheControl.short, ETag: etag }
    });
  } catch (error) {
    console.error('Stats API error:', error);
    const fallbackData = {
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
    };
    return json(fallbackData, {
      headers: cacheControl.short
    });
  }
};



