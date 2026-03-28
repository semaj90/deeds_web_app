import { QdrantClient } from '@qdrant/js-client-rest';
import { json } from '@sveltejs/kit';
import pg from 'pg';
import { getQdrantUrl, getDatabaseUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types';

const { Pool } = pg;

const qdrant = new QdrantClient({
	url: getQdrantUrl()
});

const aiPool = new Pool({
	connectionString: getDatabaseUrl()
});

function isMissingRelationError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '42P01'
  );
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		// Fetch clusters with the new interface fields
		const result = await aiPool
      .query(
        `
			SELECT
				c.cluster_id, c.pattern as title, c.summary as description, c.tags,
				c.avg_similarity,
				COUNT(e.id) as error_count,
				MIN(e.created_at) as first_seen,
				MAX(e.created_at) as last_seen,
				(ARRAY_AGG(e.raw_text ORDER BY e.id))[1] as sample_message,
				(ARRAY_AGG(e.source ORDER BY e.id))[1] as sample_source
			FROM phase89_error_clusters c
			LEFT JOIN raw_error_embeddings e ON e.cluster_id = c.cluster_id
			GROUP BY c.cluster_id, c.pattern, c.summary, c.tags, c.avg_similarity
			ORDER BY error_count DESC
			LIMIT 100
		`
      )
      .catch(async (error) => {
        // Fallback: query raw_error_embeddings directly
        if (isMissingRelationError(error)) {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        return aiPool
          .query(
            `
				SELECT
					cluster_id,
					COUNT(*) as error_count,
					MIN(created_at) as first_seen,
					MAX(created_at) as last_seen,
					(ARRAY_AGG(raw_text ORDER BY id))[1] as sample_message,
					(ARRAY_AGG(source ORDER BY id))[1] as sample_source
				FROM raw_error_embeddings
				WHERE cluster_id IS NOT NULL
				GROUP BY cluster_id
				ORDER BY error_count DESC
				LIMIT 100
			`
          )
          .catch((fallbackError) => {
            if (isMissingRelationError(fallbackError)) {
              return {
                rows: [],
                rowCount: 0,
              };
            }

            throw fallbackError;
          });
      });

		const clusters = result.rows.map((row: Record<string, any>) => ({
			cluster_id: row.cluster_id,
			error_count: parseInt(row.error_count) ?? 0,
			first_seen: row.first_seen ? String(row.first_seen) : new Date().toISOString(),
			last_seen: row.last_seen ? String(row.last_seen) : new Date().toISOString(),
			sample_message: row?.sample_message ?? '',
			sample_source: row?.sample_source ?? 'unknown',
			title: row?.title || `Cluster ${row.cluster_id}`,
			description: row?.description ?? '',
			tags: row?.tags || []
		}));

		return json({
			success: true,
			clusters,
			total: clusters.length
		});
	} catch (error) {
		console.error('Error fetching clusters:', error);
		return json(
      {
        success: true,
        error: 'Cluster analysis failed',
        clusters: [],
      },
      { status: 200 }
    );
	}
};
