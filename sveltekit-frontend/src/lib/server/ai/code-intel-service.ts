import { db } from '$lib/server/db/client';
import { kagDagRuns, topologySnapshots, memoryGainAudits, qdrantCentroidClusters } from '$lib/server/db/schema.js';
import { tensorAnalysisCache } from '$lib/server/db/schema/topology.js';
import { atlasFeatureMap } from '$lib/server/db/schema/atlas-feature-map.js';
import { desc, count, eq, sql, avg } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { getGraphMLStatus } from '$lib/server/grpc/graph-ml-client.js';
import { getRedis } from '$lib/server/redis.js';

/**
 * Code Intel Service: Aggregates statistics and health metrics for the
 * TRACE KAG-DAG pipeline and Karpathy Indexer.
 */
export async function getCodeIntelHealth() {
	const [latestRun, memoryStats, clusterCount, traceRuns, checks, graphMl] = await Promise.all([
		db.select().from(topologySnapshots).orderBy(desc(topologySnapshots.createdAt)).limit(1),
		db.select({
			total: count(),
			accepted: sql<number>`count(*) filter (where decision = 'accepted')`,
			avgGain: avg(memoryGainAudits.gainScore)
		}).from(memoryGainAudits),
		db.select({ value: count() }).from(qdrantCentroidClusters),
		db.select({ value: count() }).from(kagDagRuns),
		checkSystemHealth(),
		getGraphMLStatus(),
	]);

	const allOk = Object.values(checks.checks).every(s => s === 'ok');

	return {
		latestIndexAt: latestRun[0]?.createdAt || null,
		latestRunId: latestRun[0]?.runId || null,
		memoryGain: {
			totalDecisions: memoryStats[0]?.total || 0,
			acceptedCount: Number(memoryStats[0]?.accepted || 0),
			averageGainScore: Number(memoryStats[0]?.avgGain || 0).toFixed(2)
		},
		clusters: clusterCount[0]?.value || 0,
		totalTraceRuns: traceRuns[0]?.value || 0,
		checks: checks.checks,
		graphMl,
		status: (allOk && graphMl.cuda) ? 'healthy' : 'degraded',
	};
}

export async function getLatestIndexStats() {
	const latest = await db.select().from(topologySnapshots).orderBy(desc(topologySnapshots.createdAt)).limit(1);
	if (!latest[0]) return null;

	// In a real implementation, we would store more detailed stats per run
	// For now, we return the metadata from the snapshot
	return {
		id: latest[0].id,
		runId: latest[0].runId,
		createdAt: latest[0].createdAt,
		metadata: latest[0].metadata
	};
}

export async function getMemoryGainStats(limit = 20) {
	return await db.select()
		.from(memoryGainAudits)
		.orderBy(desc(memoryGainAudits.createdAt))
		.limit(limit);
}

export async function getTopClusters(limit = 10) {
	return await db.select()
		.from(qdrantCentroidClusters)
		.orderBy(desc(qdrantCentroidClusters.memberCount))
		.limit(limit);
}

export async function getResearchMemoryStats(limit = 20) {
	// Query CouchDB research notes (simplified for now, using memory audits)
	const audits = await db.select()
		.from(memoryGainAudits)
		.where(sql`${memoryGainAudits.metadata}->>'source' IS NOT NULL`) // Heuristic for research
		.orderBy(desc(memoryGainAudits.createdAt))
		.limit(limit);
	
	return audits;
}

export async function getResearchProvenance(id: string) {
	// Query Neo4j for provenance links
	const { getNeo4jDriver } = await import('../neo4j-driver.js');
	const driver = getNeo4jDriver();
	const session = driver.session();
	try {
		const result = await session.run(`
			MATCH (rn:ResearchNote {id: $id})
			OPTIONAL MATCH (rn)-[:REFERENCES]->(f:File)
			OPTIONAL MATCH (rn)-[:EVIDENCE_FOR]->(c:Cluster)
			RETURN rn, collect(DISTINCT f.path) as files, collect(DISTINCT c.id) as clusters
		`, { id });
		
		if (result.records.length === 0) return null;
		
		const record = result.records[0];
		return {
			note: record.get('rn').properties,
			files: record.get('files'),
			clusters: record.get('clusters')
		};
	} finally {
		await session.close();
	}
}

export async function getRejectedMemoryNearMisses(limit = 25) {
	return await db.select()
		.from(memoryGainAudits)
		.where(eq(memoryGainAudits.decision, 'rejected'))
		.orderBy(desc(memoryGainAudits.gainScore))
		.limit(limit);
}

export async function getMemoryGainStatsByType() {
	return await db.select({
		memoryType: sql<string>`metadata->>'memory_type'`,
		count: count(),
		avgGain: avg(memoryGainAudits.gainScore)
	})
	.from(memoryGainAudits)
	.where(eq(memoryGainAudits.decision, 'accepted'))
	.groupBy(sql`metadata->>'memory_type'`)
	.orderBy(desc(avg(memoryGainAudits.gainScore)));
}

export async function getTopologySnapshot(snapshotId?: string) {
	const query = db.select().from(topologySnapshots);
	const snapshot = snapshotId
		? await query.where(eq(topologySnapshots.id, snapshotId)).limit(1)
		: await query.orderBy(desc(topologySnapshots.createdAt)).limit(1);

	if (!snapshot[0]) return null;

	const { topologyPositions } = await import('$lib/server/db/schema.js');

	// LEFT JOIN tensorAnalysisCache to enrich nodes with authority + SOM data
	const rows = await db
		.select({
			stable_key:           topologyPositions.stableKey,
			x:                    topologyPositions.x,
			y:                    topologyPositions.y,
			z:                    topologyPositions.z,
			t:                    topologyPositions.t,
			cluster_key:          topologyPositions.clusterKey,
			topo_byte:            topologyPositions.topoByte,
			source_kind:          topologyPositions.sourceKind,
			metadata:             topologyPositions.metadata,
			// tensorAnalysisCache enrichment (null when no analysis yet)
			graph_authority_score: tensorAnalysisCache.graphAuthorityScore,
			tensor_affinity_score: tensorAnalysisCache.tensorAffinityScore,
			som_cluster:          tensorAnalysisCache.somCluster,
			manifold4_x:          tensorAnalysisCache.manifold4X,
			manifold4_y:          tensorAnalysisCache.manifold4Y,
			manifold4_z:          tensorAnalysisCache.manifold4Z,
			manifold4_w:          tensorAnalysisCache.manifold4W,
			topo_class:           tensorAnalysisCache.topoClass,
			qdrant_payload:       tensorAnalysisCache.qdrantPayload,
			// atlasFeatureMap enrichment — SOM cluster + centroid from the lineage table
			afm_som_cluster:      atlasFeatureMap.somCluster,
			afm_centroid_id:      atlasFeatureMap.centroidId,
			afm_cluster_id:       atlasFeatureMap.clusterId,
			afm_feature_id:       atlasFeatureMap.featureId,
		})
		.from(topologyPositions)
		.leftJoin(tensorAnalysisCache, eq(topologyPositions.stableKey, tensorAnalysisCache.stableKey))
		.leftJoin(atlasFeatureMap, eq(topologyPositions.stableKey, atlasFeatureMap.sourceRef))
		.where(eq(topologyPositions.snapshotId, snapshot[0].id));

	return {
		snapshot: snapshot[0],
		nodes: rows,
	};
}

export async function getTopologyNode(stableKey: string) {
	const { topologyPositions } = await import('$lib/server/db/schema.js');
	return await db.select().from(topologyPositions).where(eq(topologyPositions.stableKey, stableKey)).limit(1);
}

export async function getClusterDetails(clusterKey: string) {
	const cluster = await db.select().from(qdrantCentroidClusters).where(eq(qdrantCentroidClusters.clusterKey, clusterKey)).limit(1);
	if (!cluster[0]) return null;

	const { qdrantClusterMembers } = await import('$lib/server/db/schema.js');
	const members = await db.select().from(qdrantClusterMembers).where(eq(qdrantClusterMembers.clusterKey, clusterKey)).limit(20);

	return {
		cluster: cluster[0],
		members
	};
}

export async function getClusterSummaryLenses(clusterKey: string) {
	const { llmSummaryCache } = await import('$lib/server/db/schema.js');
	return await db.select()
		.from(llmSummaryCache)
		.where(eq(llmSummaryCache.stableKey, 'cluster:' + clusterKey))
		.orderBy(desc(llmSummaryCache.createdAt));
}

export async function getRetrievalRuns(limit = 20) {
	return await db.select()
		.from(kagDagRuns)
		.orderBy(desc(kagDagRuns.createdAt))
		.limit(limit);
}

export async function getRetrievalRunDetail(runId: string) {
	const run = await db.select().from(kagDagRuns).where(eq(kagDagRuns.id, runId)).limit(1);
	if (!run[0]) return null;
	
	// Also get memory gain decisions linked to this run
	const audits = await db.select()
		.from(memoryGainAudits)
		.where(sql`metadata->>'run_id' = ${runId}`)
		.limit(10);
	
	return {
		run: run[0],
		audits
	};
}

export async function checkSystemHealth() {
	const t0 = Date.now();
	const TIMEOUT = 3_000;

	async function probe(url: string): Promise<boolean> {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
			return res.ok;
		} catch {
			return false;
		}
	}

  async function postgresOk(): Promise<boolean> {
		try {
			await db.execute(sql`SELECT 1`);
			return true;
		} catch {
			return false;
		}
	}

	async function redisOk(): Promise<boolean> {
		try {
			return (await getRedis().ping()) === 'PONG';
		} catch {
			return false;
		}
	}

	async function mediaOk(): Promise<{ ytdlp: boolean; whisper: boolean; ffmpeg: boolean }> {
		const { existsSync } = await import('node:fs');
		const { spawnSync } = await import('node:child_process');
		
		const ytdlp = existsSync('../.venv/Scripts/yt-dlp.exe');
		const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
		const whisper = spawnSync('../.venv/Scripts/python.exe', ['-c', 'import faster_whisper; print("ok")']).status === 0;
		
		return { ytdlp, whisper, ffmpeg };
	}

	const [qdrant, ollama, pg, redis, media] = await Promise.all([
		probe(`${ENV.QDRANT_URL}/collections`),
		probe(`${ENV.OLLAMA_BASE_URL}/api/tags`),
		postgresOk(),
		redisOk(),
		mediaOk(),
	]);

	const mediaStatus = media.ytdlp && media.whisper && media.ffmpeg;

	return {
		ok: qdrant && ollama && pg && redis && mediaStatus,
		durationMs: Date.now() - t0,
		checks: {
			qdrant:   qdrant   ? 'ok' : 'failed',
			ollama:   ollama   ? 'ok' : 'failed',
			postgres: pg       ? 'ok' : 'failed',
			redis:    redis    ? 'ok' : 'failed',
			media:    mediaStatus ? 'ok' : (media.ytdlp ? (media.whisper ? 'ffmpeg_missing' : 'whisper_missing') : 'ytdlp_missing'),
		},
	};
}

export async function generateClaudePlan(params: { goal: string; scope: string }) {
	const { generateSingleEmbedding } = await import('../grpc/embedding-client.js');
	const { QdrantManager } = await import('../vector/qdrant-manager.js');
	const qdrant = new QdrantManager();
	const queryEmbedding = await generateSingleEmbedding(params.goal);
	const hits = await qdrant.hybridSearch({
		collection: 'codebase_chunks_768',
		query: params.goal,
		queryEmbedding,
		limit: 3
	});

	const filesToInspect = [...new Set(hits.results.map(h => h.payload?.path as string))];

	return {
		task: `Implement: ${params.goal}`,
		filesToInspect,
		evidence: [
			{ source: 'semantic_search', reason: 'Matches goal query' },
			{ source: 'codebase_index', reason: 'High-relevance chunks found' }
		],
		commands: [
			'npm run check',
			'npx vitest run'
		],
		patchPolicy: 'propose_only'
	};
}

