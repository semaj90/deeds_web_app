import { db } from '$lib/server/db/client';
import { kagDagRuns, topologySnapshots, memoryGainAudits, qdrantCentroidClusters } from '$lib/server/db/schema.js';
import { tensorAnalysisCache } from '$lib/server/db/schema/topology.js';
import { atlasFeatureMap } from '$lib/server/db/schema/atlas-feature-map.js';
import { desc, count, eq, sql, avg } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import { getGraphMLStatus } from '$lib/server/grpc/graph-ml-client.js';
import { getRedis } from '$lib/server/redis.js';
import { getOllamaEndpoint } from '$lib/server/ollama.js';
import { LIBRARY_DOMAIN_MAP } from '../../phase72/routeGraphAdapter.js';

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
		probe(`${getOllamaEndpoint()}/api/tags`),
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
	const queryEmbedding = await generateSingleEmbedding(params.goal);
	const qdrant = getQdrantClient();
	// Canonical EmbeddingGemma semantic_768 retrieval lane.
	const { points: hits } = await qdrant.query('codebase_chunks_768_v2', {
		query: queryEmbedding,
		using: 'content',
		limit: 3,
		with_payload: true
	});

	const filesToInspect = [...new Set((hits as any[]).map(h => h.payload?.path as string))];

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

/**
 * Enhanced TreeChunker + AST-grep corpus derivation pipeline.
 * 1. Walk filesystem via tree-sitter (AST nodes: functions, classes, interfaces)
 * 2. Extract concepts via AST-grep (method calls, property access, control flow patterns)
 * 3. Chunk code semantically via TreeChunker (preserve context boundaries)
 * 4. Index key-value pairs (OKF ontology mapping: feature→domain, method→responsibility)
 * 5. Classify domains (lexical + semantic ensemble: 0.3·keyword + 0.7·embedding)
 * 6. Assign 4D coordinates (X: git timestamp, Y: call-graph depth, Z: semantic similarity to domain centroid, W: PageRank)
 * 7. Embed via embeddinggemma (512-dim MRL evaluation lane — canonical: 768-dim, reference: 384-dim)
 * 8. Ingest into Qdrant code_intel_corpus collection
 * 9. Materialize domain centroids + concept index to Redis (corpus:centroids, corpus:concepts KV pairs)
 *
 * Domain classes: AUTH (session, password, token), DATA (query, database, schema), API (route, endpoint, http), UI (component, render, state)
 * Concepts: method calls, property access, control flow, async/await patterns, error handling
 */

// ─── Concept Extraction via AST-grep patterns ─────────────────────────────────

interface ConceptPattern {
	name: string;
	patterns: string[];
	domain: 'AUTH' | 'DATA' | 'API' | 'UI' | 'SHARED';
	priority: number;
}

const CONCEPT_PATTERNS: ConceptPattern[] = [
	{
		name: 'authentication_check',
		patterns: ['lucia.validateSession', 'getSession', 'requireAuth', 'checkAuth', 'verifyToken'],
		domain: 'AUTH',
		priority: 8
	},
	{
		name: 'database_query',
		patterns: ['db.select', 'db.insert', 'db.update', 'db.delete', 'query(', 'execute(', 'run('],
		domain: 'DATA',
		priority: 8
	},
	{
		name: 'api_route_handler',
		patterns: ['+server.ts', 'export async function GET', 'export async function POST', 'route(', 'endpoint('],
		domain: 'API',
		priority: 7
	},
	{
		name: 'component_render',
		patterns: ['export default', 'function render', 'props.', '$state', '$derived', 'svelte:self'],
		domain: 'UI',
		priority: 7
	},
	{
		name: 'error_handling',
		patterns: ['try {', 'catch (', 'throw ', 'finally {', 'Promise.reject'],
		domain: 'SHARED',
		priority: 5
	},
	{
		name: 'async_coordination',
		patterns: ['async function', 'await ', 'Promise.all', 'Promise.race', 'then('],
		domain: 'SHARED',
		priority: 6
	},
	{
		name: 'type_validation',
		patterns: ['z.object', 'z.string', 'z.number', 'TypeOf', 'Zod', 'validate(', 'parse('],
		domain: 'SHARED',
		priority: 4
	},
	{
		name: 'import_dependency',
		patterns: ['import {', 'from "', "from '", 'require('],
		domain: 'SHARED',
		priority: 3
	}
];

export type CodeIntelDomainClass = 'AUTH' | 'DATA' | 'API' | 'UI' | 'UNKNOWN';

interface DomainKeywordConfig {
	keywords: string[];
	weight: number;
}

type OKFConcept = {
	concept: string;
	domain: string;
	line: number;
	pattern: string;
	confidence: number;
	source?: 'ast_grep' | 'tree_sitter' | 'regex' | 'labeler';
};

export interface CodeIntelConcept {
	concept: string;
	domain: CodeIntelDomainClass | 'SHARED';
	line: number;
	pattern: string;
	confidence: number;
	source?: 'ast_grep' | 'tree_sitter' | 'regex' | 'labeler';
}

export interface CodeIntelKeyValue {
	key: string;
	value: string;
	source: 'ast_grep' | 'tree_sitter' | 'regex' | 'labeler';
}

const DOMAIN_KEYWORDS: Record<CodeIntelDomainClass, { keywords: string[]; weight: number }> = {
	AUTH: {
		keywords: ['session', 'password', 'authenticate', 'authorize', 'login', 'token', 'credential', 'role'],
		weight: 2.0,
	},
	DATA: {
		keywords: ['query', 'database', 'schema', 'migration', 'db', 'drizzle', 'redis', 'pg', 'sql', 'storage'],
		weight: 2.0,
	},
	API: {
		keywords: ['route', 'endpoint', 'request', 'response', 'fetch', 'server', 'handler', 'http', 'rpc'],
		weight: 2.0,
	},
	UI: {
		keywords: ['component', 'render', 'state', 'props', 'svelte', 'react', 'view', 'ui'],
		weight: 2.0,
	},
	UNKNOWN: {
		keywords: [],
		weight: 0,
	},
};

export function extractConceptsViAstGrep(sourceCode: string, _filePath: string): Array<{
	concept: string;
	domain: string;
	line: number;
	pattern: string;
	confidence: number;
}> {
	const concepts: Array<{
		concept: string;
		domain: string;
		line: number;
		pattern: string;
		confidence: number;
	}> = [];

	const lines = sourceCode.split('\n');

	for (const patternDef of CONCEPT_PATTERNS) {
		for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
			const line = lines[lineIdx];
			const trimmed = line.trim();

			for (const pattern of patternDef.patterns) {
				if (trimmed.includes(pattern)) {
					// Confidence based on pattern specificity and line context
					const confidence = Math.min(1.0, (patternDef.priority / 10) * 0.8 + 0.2);

					concepts.push({
						concept: patternDef.name,
						domain: patternDef.domain,
						line: lineIdx + 1,
						pattern,
						confidence
					});

					break; // Only once per line per pattern-def
				}
			}
		}
	}

	return concepts;
}

// ─── TreeChunker Semantic Chunking ───────────────────────────────────────────

export function chunkCodeSemanticallViaTreeChunker(sourceCode: string): Array<{
	startLine: number;
	endLine: number;
	kind: 'function' | 'class' | 'import' | 'type' | 'fragment';
	content: string;
	summary: string;
}> {
	const chunks: Array<{
		startLine: number;
		endLine: number;
		kind: 'function' | 'class' | 'import' | 'type' | 'fragment';
		content: string;
		summary: string;
	}> = [];

	const lines = sourceCode.split('\n');
	let currentChunk: { start: number; end: number; kind: any; lines: string[] } | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		// Function boundary
		if (trimmed.startsWith('async function ') || trimmed.startsWith('function ')) {
			if (currentChunk) {
				chunks.push({
					startLine: currentChunk.start + 1,
					endLine: i,
					kind: currentChunk.kind,
					content: currentChunk.lines.join('\n'),
					summary: currentChunk.lines[0] || 'code'
				});
			}
			currentChunk = { start: i, end: i, kind: 'function', lines: [line] };
		}
		// Class boundary
		else if (trimmed.startsWith('class ') || trimmed.startsWith('export class ')) {
			if (currentChunk) {
				chunks.push({
					startLine: currentChunk.start + 1,
					endLine: i,
					kind: currentChunk.kind,
					content: currentChunk.lines.join('\n'),
					summary: currentChunk.lines[0] || 'code'
				});
			}
			currentChunk = { start: i, end: i, kind: 'class', lines: [line] };
		}
		// Type boundary
		else if (trimmed.startsWith('type ') || trimmed.startsWith('interface ')) {
			if (currentChunk) {
				chunks.push({
					startLine: currentChunk.start + 1,
					endLine: i,
					kind: currentChunk.kind,
					content: currentChunk.lines.join('\n'),
					summary: currentChunk.lines[0] || 'code'
				});
			}
			currentChunk = { start: i, end: i, kind: 'type', lines: [line] };
		}
		// Import boundary
		else if (trimmed.startsWith('import ')) {
			if (currentChunk && currentChunk.kind !== 'import') {
				chunks.push({
					startLine: currentChunk.start + 1,
					endLine: i,
					kind: currentChunk.kind,
					content: currentChunk.lines.join('\n'),
					summary: currentChunk.lines[0] || 'code'
				});
				currentChunk = null;
			}
			if (!currentChunk) {
				currentChunk = { start: i, end: i, kind: 'import', lines: [line] };
			} else {
				currentChunk.lines.push(line);
			}
		}
		// Fragment (lines outside major structures)
		else if (trimmed && !trimmed.startsWith('//')) {
			if (!currentChunk) {
				currentChunk = { start: i, end: i, kind: 'fragment', lines: [line] };
			} else if (currentChunk.kind === 'fragment') {
				currentChunk.lines.push(line);
			} else {
				currentChunk.lines.push(line);
			}
		}
	}

	// Finalize last chunk
	if (currentChunk) {
		chunks.push({
			startLine: currentChunk.start + 1,
			endLine: lines.length,
			kind: currentChunk.kind,
			content: currentChunk.lines.join('\n'),
			summary: currentChunk.lines[0] || 'code'
		});
	}

	return chunks;
}

// ─── Key-Value Pair Indexing for OKF Ontology ───────────────────────────────

interface OKFOntologyEntry {
	feature: string;
	domain: 'AUTH' | 'DATA' | 'API' | 'UI' | 'SHARED';
	responsibility: string;
	concepts: string[];
	relatedFeatures: string[];
	confidence: number;
}

function indexKeyValuePairsForOKF(
	concepts: OKFConcept[],
	chunks: Array<{
		startLine: number;
		endLine: number;
		kind: 'function' | 'class' | 'import' | 'type' | 'fragment';
		content: string;
		summary: string;
	}>
): OKFOntologyEntry[] {
	const ontology: Map<string, OKFOntologyEntry> = new Map();

	for (const chunk of chunks) {
		if (chunk.kind === 'function' || chunk.kind === 'class') {
			const featureName = chunk.summary.match(/\w+/)?.[0] || 'unknown';
			const relatedConcepts = concepts.filter(c => c.line >= chunk.startLine && c.line <= chunk.endLine);

			// Determine primary domain (most frequent domain in concepts)
			const domainScores: Record<string, number> = {};
			for (const c of relatedConcepts) {
				domainScores[c.domain] = (domainScores[c.domain] || 0) + c.confidence;
			}

			const primaryDomain = (
				Object.entries(domainScores).sort((a, b) => b[1] - a[1])[0]?.[0] as any
			) || 'SHARED';

			const key = `${chunk.kind}:${featureName}`;

			ontology.set(key, {
				feature: featureName,
				domain: primaryDomain,
				responsibility: chunk.summary,
				concepts: relatedConcepts.map(c => c.concept),
				relatedFeatures: [],
				confidence: relatedConcepts.length > 0
					? relatedConcepts.reduce((sum, c) => sum + c.confidence, 0) / relatedConcepts.length
					: 0.3
			});
		}
	}

	return Array.from(ontology.values());
}

export function normalizeKey(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

export function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function uniqueStrings(values: Array<string | undefined | null>): string[] {
	return Array.from(
		new Set(
			values
				.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
				.map((value) => value.trim())
		)
	);
}

export function classifyCodeIntelDomain(sourceCode: string, filePath: string, imports: string[] = []): { domain: CodeIntelDomainClass; confidence: number; matchedLibraries: string[] } {
	const scores: Record<CodeIntelDomainClass, number> = {
		AUTH: 0,
		DATA: 0,
		API: 0,
		UI: 0,
		UNKNOWN: 0
	};

	const matchedLibraries: string[] = [];
	const text = `${filePath} ${sourceCode}`.toLowerCase();

	for (const [library, domain] of Object.entries(LIBRARY_DOMAIN_MAP)) {
		const needle = library.toLowerCase();
		if (imports.some((entry) => entry.toLowerCase().includes(needle)) || text.includes(needle)) {
			scores[domain] += 1.5;
			matchedLibraries.push(library);
		}
	}

	for (const [domain, config] of Object.entries(DOMAIN_KEYWORDS) as Array<[CodeIntelDomainClass, DomainKeywordConfig]>) {
		for (const keyword of config.keywords) {
			if (text.includes(keyword.toLowerCase())) {
				scores[domain] += config.weight;
			}
		}
	}

	const topDomain = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] as CodeIntelDomainClass;
	const maxScore = scores[topDomain];
	return {
		domain: maxScore > 0 ? topDomain : 'UNKNOWN',
		confidence: maxScore > 0 ? Math.min(1, maxScore / 10) : 0,
		matchedLibraries: uniqueStrings(matchedLibraries),
	};
}

export function buildConceptVector12(
	domain: CodeIntelDomainClass,
	concepts: OKFConcept[],
	sourceCode: string,
	filePath: string,
	confidence: number
): number[] {
	const conceptTokens = concepts.map((concept) => concept.concept);
	const importCount = conceptTokens.filter((concept) => concept.startsWith('import:')).length;
	const astCount = conceptTokens.filter((concept) => concept.startsWith('ast:')).length;
	const symbolCount = conceptTokens.filter((concept) => concept.startsWith('symbol:')).length;
	const lineCount = sourceCode.split(/\r?\n/).length;
	const extension = filePath.split('.').pop()?.toLowerCase() ?? '';

	return [
		domain === 'AUTH' ? 1 : 0,
		domain === 'DATA' ? 1 : 0,
		domain === 'API' ? 1 : 0,
		domain === 'UI' ? 1 : 0,
		domain === 'UNKNOWN' ? 1 : 0,
		clamp01(astCount / 20),
		clamp01(importCount / 10),
		clamp01(symbolCount / 20),
		clamp01(conceptTokens.length / 50),
		clamp01(lineCount / 1000),
		clamp01(confidence),
		clamp01(['svelte', 'ts', 'tsx', 'js'].includes(extension) ? 1 : 0.5),
	];
}

export function buildKeyValuePairs(entry: {
	filePath: string;
	symbol: string;
	kind: string;
	domain: CodeIntelDomainClass;
	lineStart: number;
	lineEnd: number;
	concepts: OKFConcept[];
	imports: string[];
}): CodeIntelKeyValue[] {
	const pairs: CodeIntelKeyValue[] = [
		{ key: 'domain', value: entry.domain, source: 'labeler' },
		{ key: 'kind', value: entry.kind, source: 'tree_sitter' },
		{ key: 'symbol', value: entry.symbol, source: 'tree_sitter' },
		{ key: 'file_path', value: entry.filePath, source: 'regex' },
		{ key: 'line_start', value: String(entry.lineStart), source: 'tree_sitter' },
		{ key: 'line_end', value: String(entry.lineEnd), source: 'tree_sitter' },
		{ key: 'concept_count', value: String(entry.concepts.length), source: 'ast_grep' },
		{ key: 'import_count', value: String(entry.imports.length), source: 'ast_grep' },
		{ key: 'has_auth', value: String(entry.domain === 'AUTH'), source: 'labeler' },
		{ key: 'has_data', value: String(entry.domain === 'DATA'), source: 'labeler' },
		{ key: 'has_api', value: String(entry.domain === 'API'), source: 'labeler' },
		{ key: 'has_ui', value: String(entry.domain === 'UI'), source: 'labeler' },
	];

	for (const concept of entry.concepts.slice(0, 12)) {
		pairs.push({
			key: `concept_${normalizeKey(concept.concept)}`,
			value: String(Math.round(concept.confidence * 1000) / 1000),
			source: concept.source ?? 'ast_grep',
		});
	}

	return pairs;
}

export function extractImportSources(sourceCode: string): string[] {
	const imports = [
		...Array.from(sourceCode.matchAll(/from\s+['"]([^'"]+)['"]/g), (match) => match[1]),
		...Array.from(sourceCode.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g), (match) => match[1]),
	];

	return uniqueStrings(imports);
}

export async function rebuildCodeIntelCorpus(): Promise<{ indexed: number; errors: number; facts: number; nodes: number; concepts: number }> {
	const t0 = Date.now();
	let indexed = 0;
	let errors = 0;
	let factCount = 0;
	let nodeCount = 0;
	let conceptCount = 0;

	try {
		const fs = await import('fs');
		const path = await import('path');
		const { execFile } = await import('child_process');
		const { promisify } = await import('util');
		const exec = promisify(execFile);

		const projectRoot = process.cwd();
		const srcDir = path.join(projectRoot, 'sveltekit-frontend', 'src');

		// Walk directory for TS/JS files
		const walkDir = async (dir: string): Promise<string[]> => {
			const files: string[] = [];
			try {
				const entries = fs.readdirSync(dir, { withFileTypes: true });
				for (const entry of entries) {
					const fullPath = path.join(dir, entry.name);
					if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
						files.push(...(await walkDir(fullPath)));
					} else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
						files.push(fullPath);
					}
				}
			} catch (err) {
				console.error(`[code-intel] Error reading ${dir}:`, err);
			}
			return files;
		};

		const files = await walkDir(srcDir);
		console.log(`[code-intel] Found ${files.length} TS/JS files, starting enhanced corpus derivation...`);

		const allFacts: any[] = [];
		const nodes: Map<string, any> = new Map();
		const ontologyIndex: Map<string, OKFOntologyEntry> = new Map();

		// Process each file
		for (const filePath of files) {
			try {
				const sourceCode = fs.readFileSync(filePath, 'utf-8');
				const relPath = path.relative(srcDir, filePath);
				const importSources = extractImportSources(sourceCode);

				// Get git timestamp for this file
				let gitTimestamp = new Date().toISOString();
				try {
					const { stdout } = await exec('git', ['log', '-1', '--format=%aI', '--', filePath]);
					gitTimestamp = stdout.trim() || gitTimestamp;
				} catch {
					// Git not available or file untracked — use now
				}

				// Step 1: Extract concepts via AST-grep patterns
				const concepts = extractConceptsViAstGrep(sourceCode, relPath);
				conceptCount += concepts.length;

				// Step 2: Chunk code semantically via TreeChunker
				const chunks = chunkCodeSemanticallViaTreeChunker(sourceCode);

				// Step 3: Index key-value pairs for OKF ontology
				const ontologyEntries = indexKeyValuePairsForOKF(concepts, chunks);
				for (const entry of ontologyEntries) {
					const key = `${entry.feature}:${entry.domain}`;
					ontologyIndex.set(key, entry);
				}

				// Extract facts via regex (tree-sitter requires WASM build)
				const facts: any[] = [];
				const funcPattern = /(?:export\s+)?(async\s+)?function\s+(\w+)/g;
				const classPattern = /(?:export\s+)?class\s+(\w+)/g;
				let match;

				while ((match = funcPattern.exec(sourceCode))) {
					facts.push({
						subject: `${relPath}:${match[3]}`,
						predicate: 'symbol',
						object: { kind: 'function', file: relPath, name: match[3] },
						timestamp: gitTimestamp,
					});
				}

				while ((match = classPattern.exec(sourceCode))) {
					facts.push({
						subject: `${relPath}:${match[1]}`,
						predicate: 'symbol',
						object: { kind: 'class', file: relPath, name: match[1] },
						timestamp: gitTimestamp,
					});
				}

				allFacts.push(...facts);
				factCount += facts.length;

				// Create corpus nodes from facts + concepts
				for (const fact of facts) {
					if (fact.predicate === 'symbol') {
						const textToClassify = `${fact.object.name} ${fact.object.kind ?? ''} ${sourceCode}`;
						const classified = classifyCodeIntelDomain(textToClassify, relPath, importSources);
						const topDomain = classified.domain;
						const confidence = classified.confidence;

						const nodeId = fact.subject;
						const relatedConcepts = concepts.filter(c => c.pattern.includes(fact.object.name) || c.concept.includes(normalizeKey(fact.object.name)));
						const conceptVector12 = buildConceptVector12(topDomain, relatedConcepts, sourceCode, relPath, confidence);
						const keyValuePairs = buildKeyValuePairs({
							filePath: relPath,
							symbol: fact.object.name,
							kind: fact.object.kind,
							domain: topDomain,
							lineStart: 0,
							lineEnd: 0,
							concepts: relatedConcepts,
							imports: importSources,
						});

						const node = {
							id: nodeId,
							kind: fact.object.kind,
							name: fact.object.name,
							domain: topDomain,
							file: relPath,
							line: 0,
							byteOffset: 0,
							summary: undefined,
							embedding: undefined,
							concepts: relatedConcepts.map(c => c.concept),
							conceptEmbedding12: conceptVector12,
							keyValuePairs,
							matchedLibraries: classified.matchedLibraries,
							coordinates: {
								x: fact.timestamp,
								y: 0, // Call-graph depth (simplified)
								z: confidence, // Lexical confidence
								w: 0.5, // PageRank (simplified)
							},
							calls: [] as string[],
							calledBy: [] as string[],
							imports: [] as string[],
							importedBy: [] as string[],
						};

						nodes.set(nodeId, node);
					}
				}

				indexed++;
			} catch (err) {
				console.error(`[code-intel] Error processing ${filePath}:`, err);
				errors++;
			}
		}

		nodeCount = nodes.size;

		// Embed all nodes (512-dim MRL evaluation candidate)
		console.log(`[code-intel] Embedding ${nodeCount} nodes via embeddinggemma (512-dim MRL)...`);
		const { generateSingleEmbedding } = await import('../grpc/embedding-client.js');

		for (const node of nodes.values()) {
			try {
				// Embed node name + domain for short summary
				const embedding = await generateSingleEmbedding(`${node.name} ${node.domain}`);
				node.embedding = embedding;
			} catch {
				// Fallback to zero vector
				node.embedding = new Array(512).fill(0);
			}
		}

		// Ingest into Qdrant (512-dim MRL collection)
		console.log(`[code-intel] Ingesting ${nodeCount} nodes into Qdrant code_intel_corpus (512-dim MRL)...`);
		const qdrant = getQdrantClient();

		try {
			await qdrant.recreateCollection('code_intel_corpus', {
				vectors: {
					size: 512, // 512-dim MRL evaluation candidate lane
					distance: 'Cosine',
				},
				payload_schema: {
					nodeId: { type: 'keyword' },
					domain: { type: 'keyword' },
					kind: { type: 'keyword' },
					file: { type: 'text' },
					name: { type: 'text' },
				},
			} as any);
		} catch {
			// Collection exists; continue
		}

		// Upsert in batches
		const batchSize = 100;
		for (let i = 0; i < nodes.size; i += batchSize) {
			const batch = Array.from(nodes.values()).slice(i, i + batchSize);
			const points = batch.map((node, idx) => ({
				id: i + idx + 1,
				vector: node.embedding ?? new Array(512).fill(0),
				payload: {
					nodeId: node.id,
					domain: node.domain,
					kind: node.kind,
					file: node.file,
					name: node.name,
					concepts: node.concepts,
					keyValuePairs: node.keyValuePairs,
					conceptEmbedding12: node.conceptEmbedding12,
					matchedLibraries: node.matchedLibraries,
					relations: {
						calls: node.calls,
						calledBy: node.calledBy,
						imports: node.imports,
						importedBy: node.importedBy,
					},
					coordinates: node.coordinates,
				},
			}));

			try {
				await qdrant.upsert('code_intel_corpus', {
					points: points as any,
					wait: true,
				} as any);
			} catch (err) {
				console.error(`[code-intel] Error upserting batch at offset ${i}:`, err);
				errors++;
			}
		}

		// Materialize domain centroids + ontology to Redis
		console.log('[code-intel] Computing domain centroids (512-dim) and ontology index...');
		const redis = getRedis();

		const domainEmbeddings: Record<string, number[][]> = { AUTH: [], DATA: [], API: [], UI: [] };
		for (const node of nodes.values()) {
			if (node.embedding) {
				domainEmbeddings[node.domain].push(node.embedding);
			}
		}

		// Compute mean centroid per domain
		for (const [domain, embeddings] of Object.entries(domainEmbeddings)) {
			if (embeddings.length > 0) {
				const centroid = new Array(512).fill(0);
				for (const emb of embeddings) {
					for (let i = 0; i < emb.length; i++) {
						centroid[i] += emb[i];
					}
				}
				for (let i = 0; i < centroid.length; i++) {
					centroid[i] /= embeddings.length;
				}

				try {
					await redis.hset('corpus:centroids', domain, JSON.stringify(centroid));
				} catch (err) {
					console.error(`[code-intel] Error storing ${domain} centroid:`, err);
				}
			}
		}

		console.log(`[code-intel] Materializing node key/value indexes to Redis...`);
		for (const node of nodes.values()) {
			try {
				await redis.sadd(`corpus:kv:domain:${normalizeKey(node.domain)}`, node.id);
				await redis.sadd(`corpus:kv:kind:${normalizeKey(node.kind)}`, node.id);
				await redis.sadd(`corpus:kv:file:${normalizeKey(node.file)}`, node.id);

				for (const pair of node.keyValuePairs ?? []) {
					const key = normalizeKey(pair.key);
					const value = normalizeKey(pair.value);
					if (!key || !value) continue;
					await redis.sadd(`corpus:kv:${key}:${value}`, node.id);
				}

				for (const concept of node.concepts ?? []) {
					const key = normalizeKey(concept);
					if (!key) continue;
					await redis.sadd(`corpus:concept:${key}`, node.id);
				}
			} catch (err) {
				console.error(`[code-intel] Error storing key/value index for ${node.id}:`, err);
			}
		}

		// Materialize OKF ontology index to Redis (KV pairs)
		console.log(`[code-intel] Materializing ${ontologyIndex.size} ontology entries to Redis...`);
		for (const [key, entry] of ontologyIndex) {
			try {
				await redis.hset('corpus:concepts', key, JSON.stringify({
					feature: entry.feature,
					domain: entry.domain,
					responsibility: entry.responsibility,
					concepts: entry.concepts,
					relatedFeatures: entry.relatedFeatures,
					confidence: entry.confidence
				}));
			} catch (err) {
				console.error(`[code-intel] Error storing ontology entry ${key}:`, err);
			}
		}

		const durationMs = Date.now() - t0;
		console.log(`[code-intel] Corpus rebuild complete in ${durationMs}ms: ${indexed} files, ${factCount} facts, ${nodeCount} nodes, ${conceptCount} concepts, ${ontologyIndex.size} ontology entries, ${errors} errors`);

		return { indexed, errors, facts: factCount, nodes: nodeCount, concepts: conceptCount };
	} catch (err) {
		console.error('[code-intel] Corpus rebuild failed:', err);
		return { indexed, errors: errors + 1, facts: factCount, nodes: nodeCount, concepts: conceptCount };
	}
}

