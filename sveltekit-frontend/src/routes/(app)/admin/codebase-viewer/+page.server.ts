import type { PageServerLoad } from './$types';

import { getQdrantUrl, getDatabaseUrl } from '$lib/config/env.server.js';
const EMPTY_DATA = {
	qdrant: { collections: [], totalPoints: 0 },
	postgres: { embeddings: [], timeline: [], stats: { total_files: 0, total_errors: 0, embedding_coverage: 0, unique_error_codes: 0 } },
	error: null as string | null,
};

export const load: PageServerLoad = async () => {
	// 8s overall timeout to prevent SSR hangs under concurrent load
	const loadData = async () => {
		let qdrantData = { collections: [] as any[], totalPoints: 0 };
		let pgEmbeddings: any[] = [];
		let pgTimeline: any[] = [];
		let pgStats: any = { total_files: 0, total_errors: 0, embedding_coverage: 0 };
		const errors: string[] = [];

		// Try Qdrant (may not be running)
		try {
			const { getQdrantClient } = await import('$lib/server/vector/qdrant-singleton.js');
			const qdrant = getQdrantClient();

			const collections = await qdrant.getCollections();
			const collectionStats = await Promise.all(
				collections.collections.map(async (col) => {
					const info = await qdrant.getCollection(col.name);
					return {
						name: col.name,
						pointsCount: info?.points_count ?? 0,
						vectorSize: (info.config?.params?.vectors as any)?.size ?? 0,
						status: info.status
					};
				})
			);

			qdrantData = {
				collections: collectionStats,
				totalPoints: collectionStats.reduce((sum: number, col: any) => sum + col.pointsCount, 0)
			};
		} catch (e) {
			errors.push(`Qdrant: ${e instanceof Error ? e.message : String(e)}`);
		}

		// Try PostgreSQL (may not be running)
		try {
			const { Pool } = await import('pg');
			const db = new Pool({
				connectionString: getDatabaseUrl(),
				connectionTimeoutMillis: 3000,
			});

			const [embedResult, timelineResult, statsResult] = await Promise.all([
				db.query(`
					SELECT source, COUNT(*) as error_count,
						MAX(indexed_at) as last_indexed,
						ARRAY_AGG(DISTINCT error_code) as error_codes
					FROM raw_error_embeddings
					WHERE source LIKE 'src/%'
					GROUP BY source
					ORDER BY error_count DESC
					LIMIT 100
				`).catch(() => ({ rows: [] })),

				db.query(`
					SELECT file_path, indexed_at, tagged_at, edited_at, analyzed_at, metadata
					FROM phase89_file_timeline
					ORDER BY analyzed_at DESC NULLS LAST
					LIMIT 50
				`).catch(() => ({ rows: [] })),

				db.query(`
					SELECT
						COUNT(DISTINCT source) as total_files,
						COUNT(*) as total_errors,
						COUNT(DISTINCT error_code) as unique_error_codes,
						AVG(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) * 100 as embedding_coverage
					FROM raw_error_embeddings
					WHERE source LIKE 'src/%'
				`).catch(() => ({ rows: [{ total_files: 0, total_errors: 0, embedding_coverage: 0 }] })),
			]);

			pgEmbeddings = embedResult.rows;
			pgTimeline = timelineResult.rows;
			pgStats = statsResult.rows[0] ?? { total_files: 0, total_errors: 0, embedding_coverage: 0 };

			await db.end();
		} catch (e) {
			errors.push(`PostgreSQL: ${e instanceof Error ? e.message : String(e)}`);
		}

		return {
			qdrant: qdrantData,
			postgres: { embeddings: pgEmbeddings, timeline: pgTimeline, stats: pgStats },
			error: errors.length > 0 ? errors.join('; ') : null,
		};
	};

	const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
	const result = await Promise.race([loadData(), timeoutPromise]);

	if (!result) {
		return { ...EMPTY_DATA, error: 'Codebase viewer data loading timed out (8s)' };
	}

	return result;
};
