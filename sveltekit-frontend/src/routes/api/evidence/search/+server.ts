/**
 * POST /api/evidence/search
 *
 * RAG + KAG + DAG pipeline — graph-hop semantic evidence retrieval:
 *
 *   RAG (Retrieval-Augmented Generation):
 *     1. Check Redis/memory cache by query hash
 *     2. On miss: embed query (gRPC → Ollama fallback) → dual search (pgvector + Qdrant ANN)
 *     3. Legal-aware rerank: cosine 75% + shared citations 15% + jurisdiction/section 10%
 *     4. Section graph-hop: pull sibling chunks from same section
 *
 *   KAG (Knowledge-Augmented Generation):
 *     5. Traverse yorha_evidence_connections graph to find related evidence nodes
 *     6. Score graph neighbors by connection strength + AI confidence
 *
 *   DAG (Document-Augmented Generation):
 *     7. For top hits, retrieve full document context from MinIO/evidence table
 *     8. Resolve citation cross-references across documents
 *
 *   Cache final ContextBundle[] in Redis (30min TTL)
 *   Return coherent context bundles (not isolated snippets)
 */
import { createHash } from 'node:crypto';
import { json, type RequestEvent } from '@sveltejs/kit';
import db from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { embedText } from '$lib/server/embedding/embed.js';
import { getVectorCache, setVectorCache } from '$lib/server/vector-cache.js';
import { ENV } from '$lib/server/env.server.js';
import { searchEvidenceViaGrpc } from '$lib/server/grpc/retrieval-client.js';
import type { VectorSearchResult, VectorSearchOptions } from '$lib/server/db/pgvector-utils.js';
import { productionLogger } from '$lib/server/production-logger.js';
import { legalPageRank } from '$lib/server/retrieval/legal-pagerank.js';
import { CitationGraph } from '$lib/server/retrieval/citation-graph.js';
import { z } from 'zod';

const evidenceSearchSchema = z.object({
	query: z.string().min(1, 'query is required').max(5000),
	caseId: z.string().uuid().optional(),
	limit: z.number().int().min(1).max(100).optional().default(10),
	expandSections: z.boolean().optional().default(true),
	jurisdiction: z.string().max(200).optional(),
	useLegalPageRank: z.boolean().optional().default(false)
});

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

/** SHA-256 hex digest (truncated to 16 chars for cache key brevity). */
function sha256(input: string): string {
	return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Build a session-scoped cache key that prevents cross-user leakage
 * and distinguishes different filter combinations.
 */
function buildEvidenceSearchCacheKey(args: {
	userId: string | null;
	query: string;
	filters: Record<string, unknown>;
	limit: number;
	version?: string;
}): string {
	const payload = JSON.stringify({
		v: args.version ?? 'v1',
		u: args.userId ?? 'anon',
		q: args.query,
		f: args.filters,
		n: args.limit,
	});
	return `evidence:search:${sha256(payload)}`;
}

interface SearchResult {
	evidenceId: string;
	chunkIndex: number;
	content: string;
	score: number;
	metadata: Record<string, unknown>;
	rerank?: {
		cosine: number;
		sharedCitations: number;
		jurisdictionMatch: number;
		sectionProximity: number;
		finalScore: number;
	};
}

interface GraphNeighbor {
	nodeId: string;
	title: string;
	evidenceType: string;
	connectionType: string;
	strength: number;
	confidence: number;
	aiReasoning?: string;
}

interface DocumentContext {
	evidenceId: string;
	fileName: string;
	fileType: string;
	description: string;
	aiSummary?: string;
	aiTags?: unknown;
	keyEntities?: unknown;
}

interface ContextBundle {
	hit: SearchResult;
	siblings: SearchResult[];
	sectionPath: string[];
	heading: string;
	citations: string[];
	graphNeighbors: GraphNeighbor[];
	documentContext?: DocumentContext;
}

export async function POST({ request, locals }: RequestEvent) {
	try {
		const raw = await request.json();
		const parsed = evidenceSearchSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { query, caseId, limit, expandSections, jurisdiction, useLegalPageRank: useLPR } = parsed.data;

		const start = performance.now();
		const userId = (locals as any).user?.id ?? null;

		// ── gRPC fast-path: delegate to RetrievalService if available ────
		const grpcResult = await searchEvidenceViaGrpc({ query, caseId, limit, expandSections, jurisdiction });
		if (grpcResult) {
			console.log(`[Evidence Search] gRPC hit for "${query.slice(0, 40)}..." (${grpcResult.timing.totalMs}ms)`);
			return json(grpcResult);
		}
		// gRPC unavailable or disabled — fall through to inline pipeline

		// ── Cache check: session-scoped key (user + filters + query) ─────
		const cacheKey = buildEvidenceSearchCacheKey({
			userId,
			query,
			filters: { caseId, jurisdiction, expandSections },
			limit,
		});
		const cacheOpts = { limit, metric: 'cosine' };
		const { entry: cached, source: cacheSource } = await getVectorCache(cacheKey, cacheOpts);

		if (cached) {
			const totalMs = Math.round(performance.now() - start);
			console.log(`[Evidence Search] Cache ${cacheSource} hit for "${query.slice(0, 40)}..." (${totalMs}ms)`);
			return json({
				...(cached.results[0] as Record<string, unknown>),
				timing: { ...(cached.metadata as Record<string, unknown>), totalMs, cacheSource },
			});
		}

		// ── Cache miss: full pipeline ────────────────────────────────────

		// 1. Embed the query
		const queryEmbedding = await embedQuery(query);
		if (!queryEmbedding) {
			return json({ error: 'Failed to generate query embedding' }, { status: 500 });
		}
		const embedMs = performance.now() - start;

		// 2. Dual search: Qdrant ANN (fast) + pgvector (authoritative), merge + deduplicate
		const searchStart = performance.now();
		const fetchLimit = Math.min(limit * 3, 50); // over-fetch for rerank headroom
		const rawHits = await dualSearch(queryEmbedding, caseId, fetchLimit);
		const searchMs = performance.now() - searchStart;

		if (rawHits.length === 0) {
			return json({
				results: [],
				bundles: [],
				timing: { embedMs: Math.round(embedMs), searchMs: Math.round(searchMs), totalMs: Math.round(performance.now() - start) },
			});
		}

		// 3. Legal-aware rerank: cosine 75% + citations 15% + jurisdiction/section 10%
		const rerankStart = performance.now();
		let reranked = rerankEvidence(rawHits, query, jurisdiction);

		// 3b. Optional Legal PageRank: 40% vector + 30% citation + 20% court + 10% recency
		//      Now uses CitationGraph for iterative PageRank authority scoring
		if (useLPR) {
			const lprItems = reranked.map((h) => ({ id: h.evidenceId, score: h.score, metadata: h.metadata as Record<string, unknown>, content: h.content }));

			// Build citation graph + run PageRank for authority scoring
			const citationGraph = new CitationGraph();
			citationGraph.buildFromItems(lprItems);
			const iterations = citationGraph.runPageRank();

			const ranked = legalPageRank(lprItems, undefined, citationGraph);
			reranked = ranked.map((r) => {
				const orig = reranked.find((h) => h.evidenceId === r.id);
				return { ...(orig ?? reranked[0]), score: r.score, rerank: { ...((orig ?? reranked[0]).rerank!), finalScore: r.score, legalPageRank: r.legalRank } };
			}) as typeof reranked;

			if (citationGraph.size > 0) {
				console.log(`[Evidence Search] CitationGraph: ${citationGraph.size} nodes, ${citationGraph.edgeCount} edges, ${iterations} PageRank iterations`);
			}
		}

		const hits = reranked.slice(0, limit);
		const rerankMs = performance.now() - rerankStart;

		// 4. Graph-hop: expand each hit to its section siblings
		let bundles: ContextBundle[] = [];
		let hopMs = 0;
		if (expandSections) {
			const hopStart = performance.now();
			bundles = await expandToSections(hits, caseId);
			hopMs = performance.now() - hopStart;
		}

		// 5. KAG: traverse evidence graph for related nodes
		let kagMs = 0;
		if (bundles.length > 0 && caseId) {
			const kagStart = performance.now();
			await enrichWithGraphNeighbors(bundles, caseId);
			kagMs = performance.now() - kagStart;
		}

		// 6. DAG: attach parent document context
		let dagMs = 0;
		if (bundles.length > 0) {
			const dagStart = performance.now();
			await enrichWithDocumentContext(bundles);
			dagMs = performance.now() - dagStart;
		}

		const timing = {
			embedMs: Math.round(embedMs),
			searchMs: Math.round(searchMs),
			rerankMs: Math.round(rerankMs),
			hopMs: Math.round(hopMs),
			kagMs: Math.round(kagMs),
			dagMs: Math.round(dagMs),
			totalMs: Math.round(performance.now() - start),
		};

		const response = { results: hits, bundles, timing };

		// Cache the full response — fire-and-forget
		setVectorCache(
			cacheKey,
			[response],
			{ searchTime: timing.totalMs, totalResults: hits.length, model: 'embeddinggemma:latest', distanceMetric: 'cosine' },
			cacheOpts
		).catch(() => { /* non-critical */ });

		return json(response);
	} catch (err) {
		console.error('[Evidence Search] Error:', err);
		return json({ error: 'Search failed' }, { status: 500 });
	}
}

// ── Legal-aware reranking ────────────────────────────────────────────────

/**
 * Rerank evidence search results with legal-domain signals.
 * Weights: 75% cosine + 15% shared citations + 10% jurisdiction/section.
 * When jurisdiction is provided, the 10% slot favors jurisdiction matches.
 * When absent, it favors deeper section paths (more specific chunks).
 */
function rerankEvidence(
	hits: SearchResult[],
	query: string,
	jurisdiction?: string
): SearchResult[] {
	const queryCitations = extractQueryCitations(query);
	const jLower = jurisdiction?.toLowerCase();

	return hits
		.map((hit) => {
			const cosine = hit.score;

			// Citation overlap: how many of the hit's citations match query-mentioned refs
			const hitCitations: string[] = (hit.metadata?.citations as string[]) ?? [];
			let sharedCitations = 0;
			if (queryCitations.length > 0 && hitCitations.length > 0) {
				for (const hc of hitCitations) {
					const hcLower = hc.toLowerCase();
					for (const qc of queryCitations) {
						if (hcLower.includes(qc)) { sharedCitations++; break; }
					}
				}
			}

			// Section proximity: deeper sections (more specific) get a small boost
			const sectionPath: string[] = (hit.metadata?.sectionPath as string[]) ?? [];
			const sectionProximity = Math.min(sectionPath.length / 5, 1);

			// Jurisdiction match: if provided, boost chunks from same jurisdiction
			let jurisdictionMatch = 0;
			if (jLower) {
				const hitJurisdiction = String(hit.metadata?.jurisdiction ?? '').toLowerCase();
				const hitContent = hit.content.toLowerCase();
				if (hitJurisdiction && hitJurisdiction.includes(jLower)) {
					jurisdictionMatch = 1;
				} else if (hitContent.includes(jLower)) {
					jurisdictionMatch = 0.5; // partial: jurisdiction mentioned in text
				}
			}

			// 10% slot: jurisdiction match when available, else section proximity
			const contextSignal = jLower ? jurisdictionMatch : sectionProximity;
			const finalScore = 0.75 * cosine + 0.15 * Math.min(sharedCitations, 3) / 3 + 0.10 * contextSignal;

			return {
				...hit,
				score: finalScore,
				rerank: { cosine, sharedCitations, jurisdictionMatch, sectionProximity, finalScore },
			};
		})
		.sort((a, b) => b.score - a.score);
}

/**
 * Extract citation-like fragments from the query string for overlap scoring.
 */
function extractQueryCitations(query: string): string[] {
	const citations: string[] = [];
	const sectionRefs = query.match(/§\s*\d+[\w.-]*/g);
	if (sectionRefs) citations.push(...sectionRefs.map(s => s.toLowerCase()));
	const uscRefs = query.match(/\d+\s+U\.?S\.?C\.?\s*§?\s*\d+/gi);
	if (uscRefs) citations.push(...uscRefs.map(s => s.toLowerCase()));
	const artSecRefs = query.match(/(?:article|section|art\.?|sec\.?)\s+[IVXLCDM\d]+/gi);
	if (artSecRefs) citations.push(...artSecRefs.map(s => s.toLowerCase()));
	return citations;
}

// ── Embedding (uses unified facade with cache + dedup) ───────────────────

async function embedQuery(text: string): Promise<number[] | null> {
	try {
		return await embedText(text);
	} catch {
		return null;
	}
}

// ── Dual search: Qdrant ANN + pgvector ───────────────────────────────────

async function dualSearch(
	embedding: number[],
	caseId: string | undefined,
	limit: number
): Promise<SearchResult[]> {
	const [pgResults, qdrantResults] = await Promise.all([
		searchPgvector(embedding, caseId, limit),
		searchQdrant(embedding, caseId, limit).catch((err) => {
			console.warn('[Evidence Search] Qdrant unavailable, using pgvector only:', err instanceof Error ? err.message : err);
			return [] as SearchResult[];
		}),
	]);

	if (qdrantResults.length === 0) return pgResults;

	const seen = new Set(pgResults.map(r => `${r.evidenceId}:${r.chunkIndex}`));
	const extras = qdrantResults.filter(r => !seen.has(`${r.evidenceId}:${r.chunkIndex}`));

	return [...pgResults, ...extras].sort((a, b) => b.score - a.score).slice(0, limit);
}

async function searchQdrant(
	embedding: number[],
	caseId: string | undefined,
	limit: number
): Promise<SearchResult[]> {
	const { results } = await qdrant.hybridSearch({
		query: '',
		queryEmbedding: embedding,
		collection: 'evidence',
		filters: caseId ? { case_id: caseId } : undefined,
		limit,
		scoreThreshold: 0.3,
	});

	return results.map((r: any) => ({
		evidenceId: r.payload?.evidence_id ?? '',
		chunkIndex: r.payload?.chunk_index ?? 0,
		content: r.payload?.content_preview ?? '',
		score: r.score ?? 0,
		metadata: {
			sectionPath: r.payload?.section_path ?? [],
			heading: r.payload?.heading ?? '',
			citations: r.payload?.citations ?? [],
			fileName: r.payload?.file_name ?? '',
			tokenCount: r.payload?.token_count ?? 0,
			extractionMethod: r.payload?.extraction_method ?? '',
			jurisdiction: r.payload?.jurisdiction ?? '',
		},
	}));
}

// ── pgvector search ──────────────────────────────────────────────────────

async function searchPgvector(
	embedding: number[],
	caseId: string | undefined,
	limit: number
): Promise<SearchResult[]> {
	const vectorStr = `[${embedding.join(',')}]`;

	const query = caseId
		? sql`
			SELECT ev.evidence_id, ev.chunk_index, ev.content, ev.metadata,
				1 - (ev.embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}) AS score
			FROM evidence_vectors ev
			JOIN evidence e ON e.id = ev.evidence_id
			WHERE e.case_id = ${caseId}
			ORDER BY ev.embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}
			LIMIT ${limit}
		`
		: sql`
			SELECT ev.evidence_id, ev.chunk_index, ev.content, ev.metadata,
				1 - (ev.embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}) AS score
			FROM evidence_vectors ev
			ORDER BY ev.embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}
			LIMIT ${limit}
		`;

	const result = await db.execute(query);
	const rows = (result as any).rows ?? result;

	return rows.map((row: any) => ({
		evidenceId: row.evidence_id,
		chunkIndex: row.chunk_index,
		content: row.content,
		score: parseFloat(row.score) || 0,
		metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata ?? {}),
	}));
}

// ── Graph hop expansion ──────────────────────────────────────────────────

async function expandToSections(
	hits: SearchResult[],
	caseId: string | undefined
): Promise<ContextBundle[]> {
	const bundles: ContextBundle[] = [];
	const seenSections = new Set<string>();

	for (const hit of hits) {
		const sectionPath: string[] = (hit.metadata?.sectionPath as string[]) ?? [];
		const heading: string = (hit.metadata?.heading as string) ?? '';
		const sectionKey = sectionPath.join(' > ') || `chunk-${hit.chunkIndex}`;

		if (seenSections.has(sectionKey)) continue;
		seenSections.add(sectionKey);

		let siblings: SearchResult[] = [];

		if (sectionPath.length > 0) {
			const sectionPathJson = JSON.stringify(sectionPath);
			const siblingQuery = caseId
				? sql`
					SELECT ev.evidence_id, ev.chunk_index, ev.content, ev.metadata
					FROM evidence_vectors ev
					JOIN evidence e ON e.id = ev.evidence_id
					WHERE ev.evidence_id = ${hit.evidenceId}
					AND e.case_id = ${caseId}
					AND ev.metadata->>'sectionPath' IS NOT NULL
					AND ev.metadata @> ${sql.raw(`'{"sectionPath":${sectionPathJson}}'::jsonb`)}
					AND ev.chunk_index != ${hit.chunkIndex}
					ORDER BY ev.chunk_index
					LIMIT 10
				`
				: sql`
					SELECT evidence_id, chunk_index, content, metadata
					FROM evidence_vectors
					WHERE evidence_id = ${hit.evidenceId}
					AND metadata->>'sectionPath' IS NOT NULL
					AND metadata @> ${sql.raw(`'{"sectionPath":${sectionPathJson}}'::jsonb`)}
					AND chunk_index != ${hit.chunkIndex}
					ORDER BY chunk_index
					LIMIT 10
				`;
			const siblingResult = await db.execute(siblingQuery);

			const sibRows = (siblingResult as any).rows ?? siblingResult;
			siblings = sibRows.map((row: any) => ({
				evidenceId: row.evidence_id,
				chunkIndex: row.chunk_index,
				content: row.content,
				score: 0,
				metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata ?? {}),
			}));
		}

		const allCitations = [
			...((hit.metadata?.citations as string[]) ?? []),
			...siblings.flatMap(s => (s.metadata?.citations as string[]) ?? []),
		];
		const uniqueCitations = [...new Set(allCitations)];

		bundles.push({
			hit,
			siblings,
			sectionPath,
			heading,
			citations: uniqueCitations,
			graphNeighbors: [],
		});
	}

	return bundles;
}

// ── KAG: Knowledge Graph traversal ───────────────────────────────────────

async function enrichWithGraphNeighbors(
	bundles: ContextBundle[],
	caseId: string
): Promise<void> {
	const evidenceIds = [...new Set(bundles.map(b => b.hit.evidenceId))];
	if (evidenceIds.length === 0) return;

	try {
		const idList = evidenceIds.map(id => `'${id}'`).join(',');

		// Split OR into two queries for sargability — avoids BitmapOr / Seq Scan.
		// id::text cast prevents PK index usage, so we query file_path and id separately.
		const [byPath, byId] = await Promise.all([
			db.execute(sql`
				SELECT n.id AS node_id, n.title, n.evidence_type, n.file_path
				FROM yorha_evidence_nodes n
				WHERE n.case_id = ${caseId}
				AND n.status = 'active'
				AND n.file_path IN ${sql.raw(`(${idList})`)}
			`),
			db.execute(sql`
				SELECT n.id AS node_id, n.title, n.evidence_type, n.file_path
				FROM yorha_evidence_nodes n
				WHERE n.case_id = ${caseId}
				AND n.status = 'active'
				AND n.id IN ${sql.raw(`(${idList})`)}
			`),
		]);

		const pathRows = (byPath as any).rows ?? byPath;
		const idRows = (byId as any).rows ?? byId;
		// Deduplicate by node_id
		const nodeMap = new Map<string, any>();
		for (const row of [...pathRows, ...idRows]) {
			nodeMap.set(row.node_id, row);
		}
		const nodeRows = [...nodeMap.values()];
		if (nodeRows.length === 0) return;

		const nodeIds = nodeRows.map((r: any) => r.node_id);
		const nodeIdStr = nodeIds.map((id: string) => `'${id}'`).join(',');

		// 1-hop graph traversal — UNION ALL pattern for sargable index joins.
		// Each branch hits its composite index directly instead of CASE expression.
		const connResult = await db.execute(sql`
			(
				SELECT c.source_node_id, c.target_node_id, c.connection_type,
					c.strength, c.confidence_score, c.ai_reasoning,
					tn.id AS neighbor_id, tn.title AS neighbor_title,
					tn.evidence_type AS neighbor_type
				FROM yorha_evidence_connections c
				JOIN yorha_evidence_nodes tn ON tn.id = c.target_node_id
				WHERE c.case_id = ${caseId}
				AND c.source_node_id IN ${sql.raw(`(${nodeIdStr})`)}
			)
			UNION ALL
			(
				SELECT c.source_node_id, c.target_node_id, c.connection_type,
					c.strength, c.confidence_score, c.ai_reasoning,
					tn.id AS neighbor_id, tn.title AS neighbor_title,
					tn.evidence_type AS neighbor_type
				FROM yorha_evidence_connections c
				JOIN yorha_evidence_nodes tn ON tn.id = c.source_node_id
				WHERE c.case_id = ${caseId}
				AND c.target_node_id IN ${sql.raw(`(${nodeIdStr})`)}
			)
			ORDER BY strength DESC, confidence_score DESC
			LIMIT 20
		`);
		const connRows = (connResult as any).rows ?? connResult;

		const neighborMap = new Map<string, GraphNeighbor[]>();
		for (const row of connRows) {
			const sourceIsOurs = nodeIds.includes(row.source_node_id);
			const ourNodeId = sourceIsOurs ? row.source_node_id : row.target_node_id;

			const neighbors = neighborMap.get(ourNodeId) ?? [];
			neighbors.push({
				nodeId: row.neighbor_id,
				title: row.neighbor_title ?? '',
				evidenceType: row.neighbor_type ?? '',
				connectionType: row.connection_type,
				strength: row.strength ?? 50,
				confidence: row.confidence_score ?? 0,
				aiReasoning: row.ai_reasoning ?? undefined,
			});
			neighborMap.set(ourNodeId, neighbors);
		}

		for (const bundle of bundles) {
			const matchingNode = nodeRows.find((n: any) =>
				n.file_path === bundle.hit.evidenceId || n.node_id === bundle.hit.evidenceId
			);
			if (matchingNode) {
				bundle.graphNeighbors = neighborMap.get(matchingNode.node_id) ?? [];
			}
		}
	} catch (err) {
		console.warn('[Evidence Search] KAG graph traversal failed (non-fatal):', err);
	}
}

// ── DAG: Document-level context ──────────────────────────────────────────

async function enrichWithDocumentContext(bundles: ContextBundle[]): Promise<void> {
	const evidenceIds = [...new Set(bundles.map(b => b.hit.evidenceId))];
	if (evidenceIds.length === 0) return;

	try {
		const idList = evidenceIds.map(id => `'${id}'`).join(',');
		const result = await db.execute(sql`
			SELECT id, title, kind, ai_summary, description
			FROM evidence
			WHERE id IN ${sql.raw(`(${idList})`)}
		`);
		const rows = (result as any).rows ?? result;

		const docMap = new Map<string, DocumentContext>();
		for (const row of rows) {
			docMap.set(row.id, {
				evidenceId: row.id,
				fileName: row.title ?? '',
				fileType: row.kind ?? '',
				description: row.description ?? row.ai_summary ?? '',
			});
		}

		// Enrich with yorha node data (has ai_summary, ai_tags, key_entities)
		const yorhaResult = await db.execute(sql`
			SELECT n.file_path, n.ai_summary, n.ai_tags, n.key_entities, n.file_type
			FROM yorha_evidence_nodes n
			WHERE n.file_path IN ${sql.raw(`(${idList})`)}
			OR n.id::text IN ${sql.raw(`(${idList})`)}
		`);
		const yorhaRows = (yorhaResult as any).rows ?? yorhaResult;
		for (const row of yorhaRows) {
			const evId = row.file_path ?? row.id;
			const existing = docMap.get(evId);
			if (existing) {
				existing.aiSummary = row.ai_summary ?? undefined;
				existing.aiTags = row.ai_tags ?? undefined;
				existing.keyEntities = row.key_entities ?? undefined;
				if (!existing.fileType && row.file_type) existing.fileType = row.file_type;
			}
		}

		for (const bundle of bundles) {
			bundle.documentContext = docMap.get(bundle.hit.evidenceId);
		}
	} catch (err) {
		console.warn('[Evidence Search] DAG document context failed (non-fatal):', err);
	}
}