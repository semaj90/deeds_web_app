import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { pool } from '$lib/server/db/client';
import { getRedis } from '$lib/server/redis.js';

export interface FileHealthReport {
	filePath: string;
	pageRank: number;
	complexity: number;
	hitCount: number;
	avgRerank: number;
	healthScore: number;     // 0-1 (1 is perfect health, 0 is high risk/blind spot)
	isCanonical: boolean;    // Is in top 5% of pagerank?
	guardingPriority: 'high' | 'medium' | 'low';
}

/**
 * Calculates the architectural health of a file.
 * Logic: (High PageRank + High Complexity + Low Rerank Score) = LOW HEALTH / HIGH PRIORITY.
 */
export async function getFileHealth(filePath: string): Promise<FileHealthReport> {
	const driver = getNeo4jDriver();
	const session = driver.session({ database: 'neo4j' });

	try {
		// 1. Fetch graph metrics from Neo4j
		// AssumingfilePath is stored as relative path in Neo4j f.filePath
		const cleanPath = filePath.startsWith('src/') ? filePath : 'src/' + filePath;
		const graphRes = await session.run(
			`MATCH (f:CodebaseFile {filePath: $filePath})
			 RETURN f.pageRankScore AS pageRank, f.complexity AS complexity, f.gpuCluster AS cluster
			 LIMIT 1`,
			{ filePath: cleanPath }
		);

		const node = graphRes.records[0];
		const pageRank = node?.get('pageRank') ?? 0;
		const complexity = node?.get('complexity') ?? 0;

		// 2. Fetch retrieval health from Postgres
		// Look back 7 days for search hits on any chunks belonging to this file
		const retrievalRes = await pool.query(
			`SELECT COUNT(*)::int AS hits,
			        AVG(COALESCE(rerank_score, score))::real AS avg_score
			 FROM   chunk_hit_log
			 WHERE  relative_path = $1
			   AND  hit_at > NOW() - INTERVAL '7 days'`,
			[filePath.replace(/^src\//, '')]
		);

		const hitCount = retrievalRes.rows[0]?.hits ?? 0;
		const avgRerank = retrievalRes.rows[0]?.avg_score ?? 0;

		// 3. Calculate Health Score
		// Thresholds: PageRank top 5% is usually > 0.05. Complexity > 50 is high.
		const isCanonical = pageRank > 0.05;
		
		// Penalty: High importance without good understanding
		let healthScore = 1.0;
		
		if (isCanonical) {
			if (hitCount === 0) healthScore -= 0.4;
			else if (avgRerank < 0.4) healthScore -= 0.3;
		}
		
		if (complexity > 50) healthScore -= 0.2;
		if (complexity > 100) healthScore -= 0.1;

		healthScore = Math.max(0, healthScore);

		let priority: 'high' | 'medium' | 'low' = 'low';
		if (healthScore < 0.5) priority = 'high';
		else if (healthScore < 0.8) priority = 'medium';

		return {
			filePath,
			pageRank,
			complexity,
			hitCount,
			avgRerank,
			healthScore,
			isCanonical,
			guardingPriority: priority
		};
	} finally {
		await session.close();
	}
}

/**
 * Triggers a proactive grounding cycle if a file is high priority.
 */
export async function triggerProactiveGuarding(filePath: string): Promise<boolean> {
	const health = await getFileHealth(filePath);
	if (health.guardingPriority === 'low') return false;

	const redis = getRedis();
	const lockKey = `guarding:lock:${filePath}`;
	
	// Rate limit: One proactive task per file per hour
	const locked = await redis.set(lockKey, 'active', 'EX', 3600, 'NX');
	if (!locked) return false;

	console.log(`[Sentinel] Proactive Guarding triggered for: ${filePath} (Score: ${health.healthScore})`);

	// In a real environment, we'd dispatch to a worker. 
	// For now, we'll return true to signal the caller to start background work.
	return true;
}
