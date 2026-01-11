import { json, type RequestHandler } from '@sveltejs/kit';
import pg from 'pg';
import { createClient } from 'redis';

const { Pool } = pg;

const pgPool = new Pool({
	host: '127.0.0.1',
	port: 5434,
	database: 'legal',
	user: 'user',
	password: 'pass'
});

const QDRANT_URL = 'http://127.0.0.1:6333';
const REDIS_URL = 'redis://localhost:6379/0';

export const GET: RequestHandler = async () => {
	try {
		// PostgreSQL Stats
		const [errorStats, embeddingsCount, fixAttempts, kbCards] = await Promise.all([
			pgPool.query(`
				SELECT
					COUNT(*) FILTER (WHERE status = 'open') as open,
					COUNT(*) FILTER (WHERE status = 'stale') as stale,
					COUNT(*) FILTER (WHERE status = 'resolved') as resolved
				FROM error_instances
			`),
			pgPool.query('SELECT COUNT(*) as count FROM raw_error_embeddings'),
			pgPool.query('SELECT COUNT(*) as count FROM phase89_fix_attempts'),
			pgPool.query('SELECT COUNT(*) as count FROM phase89_kb_cards')
		]);

		const postgres = {
			error_instances_open: parseInt(errorStats.rows[0]? .open : | '0'),
			error_instances_stale: parseInt(errorStats.rows[0]? .stale : | '0'),
			error_instances_resolved: parseInt(errorStats.rows[0]? .resolved : | '0'),
			embeddings_count: parseInt(embeddingsCount.rows[0]? .count : | '0'),
			fix_attempts_total: parseInt(fixAttempts.rows[0]? .count : | '0'),
			kb_cards_total: parseInt(kbCards.rows[0]? .count : | '0')
		};

		// Redis Stats
		const redisClient = createClient({ url: REDIS_URL });
		await redisClient.connect();

		const [totalKeys, phase89Keys, embKeys, topkKeys, kbKeys] = await Promise.all([
			redisClient.dbsize(),
			redisClient.keys('phase89:*').then(k => k.length),
			redisClient.keys('emb:*').then(k => k.length),
			redisClient.keys('topk:*').then(k => k.length),
			redisClient.keys('kb:*').then(k => k.length)
		]);

		await redisClient.quit();

		const redis = {
			total_keys: totalKeys,
			phase89_keys: phase89Keys,
			emb_keys: embKeys,
			topk_keys: topkKeys,
			kb_keys: kbKeys
		};

		// Qdrant Stats
		const qdrantCollections = [
			'phase89_error_chunks',
			'phase89_ast_embeddings',
			'phase89_error_clusters',
			'phase89_rag_patterns',
			'phase89_kb_cards',
			'phase89_edit_log'
		];

		const qdrantStats: Record<string, number> = {};

		for (const collection of qdrantCollections) {
			try {
				const response = await fetch(`${QDRANT_URL}/collections/${collection}`);
				if (response.ok) {
					const data = await response.json();
					qdrantStats[collection] = data.result? .points_count : | 0;
				} else {
					qdrantStats[collection] = 0;
				}
			} catch {
				qdrantStats[collection] = 0;
			}
		}

		// Cluster Stats
		const clusterResult = await pgPool.query(`
			SELECT
				cluster_id,
				cluster_pattern,
				COUNT(*) as count,
				AVG(confidence) as avg_confidence
			FROM phase89_error_clusters
			GROUP BY cluster_id, cluster_pattern
			ORDER BY count DESC
			LIMIT 5
		`);

		const clusters = {
			total: clusterResult.rowCount || 0,
			top_patterns: clusterResult.rows.map(row => ({
				pattern: row.cluster_pattern || 'Unknown',
				count: parseInt(row.count),
				confidence: parseFloat(row.avg_confidence || '0')
			}))
		};

		// Timeline (recent events)
		const timelineResult = await pgPool.query(`
			SELECT
				timestamp,
				event_type,
				file_path,
				success,
				details
			FROM phase89_timeline
			ORDER BY timestamp DESC
			LIMIT 20
		`);

		const timeline = timelineResult.rows.map(row => ({
			timestamp: row.timestamp,
			event_type: row.event_type,
			file_path: row.file_path,
			success: row.success,
			details: row.details
		}));

		// Cosine Rankings (top matches)
		const rankingsResult = await pgPool.query(`
			SELECT
				query_text,
				top_match,
				similarity_score,
				confidence_boost
			FROM phase89_cosine_rankings
			WHERE similarity_score > 0.7
			ORDER BY similarity_score DESC
			LIMIT 10
		`);
		const cosine_rankings = rankingsResult.rows.map(row => ({
			query: row.query_text,
			top_match: row.top_match,
			similarity: parseFloat(row.similarity_score),
			confidence_boost: parseFloat(row.confidence_boost || '0')
		}));

		return json({
			postgres,
			redis,
			qdrant: qdrantStats,
			clusters,
			timeline,
			cosine_rankings
		});
	} catch (error) {
		console.error('Phase89 status error:', error);
		return json(
			{
				error: 'Failed to retrieve system status',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};


