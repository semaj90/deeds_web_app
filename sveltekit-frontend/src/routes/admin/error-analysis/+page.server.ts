/**
 * Phase 89: Error Analysis Page - Server Load Function
 *
 * SSR data from Qdrant + PostgreSQL for RAG+KAG powered error analysis
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { getDatabaseUrl, getQdrantUrl } from '$lib/config/env.server.js';
import pg from 'pg';
import type { PageServerLoad } from './$types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const { Pool } = pg;


export const load: PageServerLoad = async () => {
	const qdrant = new QdrantClient({ url: getQdrantUrl() });

	const aiPool = new Pool({ connectionString: getDatabaseUrl() });

	try {
		// Fetch error clusters with embeddings
		const clusters = await qdrant.scroll('phase89_error_clusters', {
			limit: 50,
			with_payload: true,
			with_vector: false
		});

		const enrichedClusters = await Promise.all(
			clusters.points.map(async (point) => {
				const payload = point.payload as any;
				const result = await aiPool.query(
					`SELECT
						c.cluster_id,
						COUNT(*) as error_count,
						STRING_AGG(DISTINCT i.source, ', ') as files
					FROM phase89_error_clusters c
					JOIN phase89_error_instances i ON c.error_instance_id = i.id
					WHERE c.cluster_id = $1
					GROUP BY c.cluster_id`,
					[payload.cluster_id]
				);

				const data = result.rows[0] || {};

				return {
					id: point.id,
					cluster_id: payload.cluster_id,
					pattern: payload?.pattern ?? 'Unknown',
					error_count: Number.parseInt(String(data.error_count ?? '0'), 10) || 0,
					files: data?.files ?? '',
					tags: payload?.tags ?? []
				};
			})
		);

		await aiPool.end();

		return {
			clusters: enrichedClusters,
			total: clusters.points.length
		};

	} catch (err: any) {
		console.error('SSR load failed:', err);
		await aiPool.end();

		return {
			clusters: [],
			total: 0,
			error: err.message
		};
	}
};


