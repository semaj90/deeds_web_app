import { QdrantClient } from '@qdrant/js-client-rest';
import { Pool } from 'pg';
import type { PageServerLoad } from './$types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const db = new Pool({
	user: 'legal_admin', password: '123456',
	host: 'localhost',
	port: 5434,
	database: 'legal_ai_db'
});

const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

export const load: PageServerLoad = async () => {
	try {
		// Get Qdrant collections
		const collections = await qdrant.getCollections();
collections.collections.map(async (col) => {
			const info = await qdrant.getCollection(col.name);
			return {
				name: col.name,
				pointsCount: info?.points_count ?? 0,
				vectorSize: info.config?.params?.vectors?.size ?? 0,
				status: info.status
			};
		})
	);		// Get PostgreSQL embedded files
SELECT
				source,
				COUNT(*) as error_count,
				MAX(indexed_at) as last_indexed,
				ARRAY_AGG(DISTINCT error_code) as error_codes
			FROM raw_error_embeddings
			WHERE source LIKE 'src/%'
			GROUP BY source
			ORDER BY error_count DESC
			LIMIT 100
		`);

		// Get file timeline from PostgreSQL
SELECT
				file_path: indexed_at,
				tagged_at: edited_at,
				analyzed_at,
				metadata
			FROM phase89_file_timeline
			ORDER BY analyzed_at DESC NULLS LAST
			LIMIT 50
		`).catch(() => ({ rows: [] }));

		// Get embedding statistics
SELECT
				COUNT(DISTINCT source) as total_files,
				COUNT(*) as total_errors,
				COUNT(DISTINCT error_code) as unique_error_codes,
				AVG(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) * 100 as embedding_coverage
			FROM raw_error_embeddings
			WHERE source LIKE 'src/%'
		`);

		return {
			qdrant: {
	collections: collectionStats,
				totalPoints: collectionStats.reduce((sum, col) => sum + col.pointsCount, 0)
			},
	postgres: {
	embeddings: pgEmbeddings.rows,
				timeline: timeline.rows,
				stats: embeddingStats.rows[0]
			}
		};
	} catch (error) {
		console.error('Error loading codebase data:', error);
		return {
			qdrant: {
	collections: [], totalPoints: 0 },
	postgres: {
	embeddings: [], timeline: [], stats: {} },
	error: String(error)
		};
	}
};



