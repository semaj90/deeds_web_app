/**
 * GET /api/codebase-index/export/bundle
 *
 * Unified export bundle — returns every indexing artifact in one JSON payload
 * so downstream tools (Colab, LangGraph, MCP agents, glyph renderer) can grab
 * the full graph state in one call.
 *
 * Response shape (all fields optional — degrades gracefully if sources are down):
 *   {
 *     graph:    { nodes: [{id, path, gpuCluster, somCluster, pageRank, tags}],
 *                 edges: [{src, dst, relation, weight}] }
 *     clusters: [{id, purpose, patterns, warnings, tags, memberCount, summaryEmbedding?}]
 *     wikiNotes: [{id, type, domain, body, generatedAt}]  // Karpathy feedback loop
 *     manifold4: [{id, som_x, som_y, semantic_z, grpo_w}] // 4D topology coords
 *     tileAtlas: { tileCount, centroids?, payloadVersion }
 *     cacheStats: { turbo, summary, research, wiki, embed }
 *     meta:     { runId, exportedAt, counts, sources }
 *   }
 *
 * Query params:
 *   ?format=json           (default)
 *   ?format=ipynb          → redirects to /api/graph/colab-export
 *   ?include=graph,clusters,wikiNotes,manifold4,tileAtlas,cacheStats
 *       (default: all; comma-separated subset if you want fewer)
 *   ?limit=N               (caps graph.nodes and graph.edges; default 2000)
 *   ?repoId=default        (cluster_summaries.repo_id filter)
 *
 * Called by: admin dashboard, Colab notebook, FastMCP tools, agentic ACE context.
 */

import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import IORedis from 'ioredis';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

interface GraphNode {
	id: string;
	path?: string;
	gpuCluster?: number | null;
	somCluster?: number | null;
	pageRank?: number | null;
	tags?: string[];
}

interface GraphEdge {
	src: string;
	dst: string;
	relation: string;
	weight?: number;
}

interface ClusterSummary {
	id: number;
	purpose: string | null;
	patterns: string[];
	warnings: string[];
	tags: string[];
	memberCount: number;
	hasSummaryEmbedding: boolean;
}

interface WikiNote {
	id: string;
	type: string;
	body: Record<string, unknown>;
}

interface BundleMeta {
	exportedAt: string;
	counts: Record<string, number>;
	sources: Record<string, boolean>;
	errors?: Record<string, string>;
}

const DEFAULT_LIMIT = 2000;
const PARTS = ['graph', 'clusters', 'wikiNotes', 'manifold4', 'tileAtlas', 'cacheStats'] as const;
type Part = (typeof PARTS)[number];

// ── Redis helper with retry on stale pool ──────────────────────────────────

function getRedisFresh(): IORedis {
	return new IORedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
		maxRetriesPerRequest: 1,
		connectTimeout: 3000,
		lazyConnect: false
	});
}

async function scanKeys(redis: IORedis, pattern: string, limit = 5000): Promise<string[]> {
	const keys: string[] = [];
	let cursor = '0';
	do {
		const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
		cursor = next;
		keys.push(...batch);
		if (keys.length >= limit) break;
	} while (cursor !== '0');
	return keys.slice(0, limit);
}

// ── Part builders (each degrades gracefully on error) ──────────────────────

async function buildGraphPart(
	limit: number,
	errors: Record<string, string>
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] } | null> {
	try {
		const nodeRows = await db.execute(sql`
			SELECT qdrant_id AS id,
			       relative_path AS path,
			       gpu_cluster,
			       som_cluster,
			       page_rank_score,
			       semantic_tags
			FROM codebase_chunk_index
			WHERE gpu_cluster IS NOT NULL
			ORDER BY page_rank_score DESC NULLS LAST, indexed_at DESC
			LIMIT ${sql.raw(String(limit))}
		`);
		const nodes: GraphNode[] = (
			Array.isArray((nodeRows as unknown as { rows?: unknown[] }).rows)
				? (nodeRows as unknown as { rows: Record<string, unknown>[] }).rows
				: (nodeRows as unknown as Record<string, unknown>[])
		).map((r) => ({
			id: String(r.id),
			path: r.path ? String(r.path) : undefined,
			gpuCluster: r.gpu_cluster != null ? Number(r.gpu_cluster) : null,
			somCluster: r.som_cluster != null ? Number(r.som_cluster) : null,
			pageRank: r.page_rank_score != null ? Number(r.page_rank_score) : null,
			tags: Array.isArray(r.semantic_tags) ? (r.semantic_tags as string[]) : []
		}));

		// Edges: same-som_cluster + same-gpu_cluster (topology proxies when SOM BMU
		// grid coords aren't stored on the chunk row). Capped per cluster bucket so a
		// popular cluster doesn't explode to O(n²).
		const edges: GraphEdge[] = [];
		const byGpu = new Map<number, GraphNode[]>();
		const bySom = new Map<number, GraphNode[]>();
		for (const n of nodes) {
			if (n.gpuCluster != null) {
				const b = byGpu.get(n.gpuCluster) ?? [];
				b.push(n);
				byGpu.set(n.gpuCluster, b);
			}
			if (n.somCluster != null) {
				const b = bySom.get(n.somCluster) ?? [];
				b.push(n);
				bySom.set(n.somCluster, b);
			}
		}
		const MAX_PAIRS_PER_BUCKET = 5;
		for (const bucket of bySom.values()) {
			for (let i = 0; i < bucket.length; i++) {
				for (let j = i + 1; j < Math.min(bucket.length, i + 1 + MAX_PAIRS_PER_BUCKET); j++) {
					edges.push({
						src: bucket[i].id,
						dst: bucket[j].id,
						relation: 'SOM_SAME_CLUSTER',
						weight: 1
					});
				}
			}
		}
		for (const bucket of byGpu.values()) {
			for (let i = 0; i < bucket.length; i++) {
				for (let j = i + 1; j < Math.min(bucket.length, i + 1 + MAX_PAIRS_PER_BUCKET); j++) {
					edges.push({
						src: bucket[i].id,
						dst: bucket[j].id,
						relation: 'GPU_SAME_CLUSTER',
						weight: 0.5
					});
				}
			}
		}
		return { nodes, edges };
	} catch (err) {
		errors.graph = (err as Error).message;
		return null;
	}
}

async function buildClustersPart(
	repoId: string,
	errors: Record<string, string>
): Promise<ClusterSummary[] | null> {
	try {
		const rows = await db.execute(sql`
			SELECT gpu_cluster, purpose, patterns, warnings, tags, member_count,
			       summary_embedding IS NOT NULL AS has_embedding
			FROM cluster_summaries
			WHERE repo_id = ${repoId}
			ORDER BY gpu_cluster
		`);
		const data = Array.isArray((rows as unknown as { rows?: unknown[] }).rows)
			? (rows as unknown as { rows: Record<string, unknown>[] }).rows
			: (rows as unknown as Record<string, unknown>[]);
		return data.map((r) => ({
			id: Number(r.gpu_cluster),
			purpose: r.purpose ? String(r.purpose) : null,
			patterns: Array.isArray(r.patterns) ? (r.patterns as string[]) : [],
			warnings: Array.isArray(r.warnings) ? (r.warnings as string[]) : [],
			tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
			memberCount: Number(r.member_count ?? 0),
			hasSummaryEmbedding: Boolean(r.has_embedding)
		}));
	} catch (err) {
		errors.clusters = (err as Error).message;
		return null;
	}
}

async function buildWikiNotesPart(
	errors: Record<string, string>,
	limit: number
): Promise<WikiNote[] | null> {
	const redis = getRedisFresh();
	try {
		const keys = await scanKeys(redis, 'wiki:note:*', limit);
		if (keys.length === 0) return [];
		const values = await redis.mget(...keys);
		const notes: WikiNote[] = [];
		for (let i = 0; i < keys.length; i++) {
			const raw = values[i];
			if (!raw) continue;
			try {
				const parsed = JSON.parse(raw) as Record<string, unknown>;
				notes.push({
					id: keys[i],
					type: String(parsed.type ?? keys[i].split(':')[2] ?? 'unknown'),
					body: parsed
				});
			} catch {
				/* skip malformed */
			}
		}
		return notes;
	} catch (err) {
		errors.wikiNotes = (err as Error).message;
		return null;
	} finally {
		redis.disconnect();
	}
}

async function buildManifold4Part(
	limit: number,
	errors: Record<string, string>
): Promise<Array<{ id: string; manifold: number[] }> | null> {
	try {
		// Synthesize a 4D manifold coord per chunk from available signals:
		//   [som_cluster, gpu_cluster, page_rank_score, community_id]
		// Real manifold4 columns exist on research_summaries; chunks use clusters
		// as a coarser topology proxy until BMU coords are migrated onto the row.
		const rows = await db.execute(sql`
			SELECT qdrant_id AS id, som_cluster, gpu_cluster, page_rank_score, community_id
			FROM codebase_chunk_index
			WHERE gpu_cluster IS NOT NULL
			LIMIT ${sql.raw(String(limit))}
		`);
		const data = Array.isArray((rows as unknown as { rows?: unknown[] }).rows)
			? (rows as unknown as { rows: Record<string, unknown>[] }).rows
			: (rows as unknown as Record<string, unknown>[]);
		return data.map((r) => ({
			id: String(r.id),
			manifold: [
				Number(r.som_cluster ?? 0),
				Number(r.gpu_cluster ?? 0),
				Number(r.page_rank_score ?? 0),
				Number(r.community_id ?? 0)
			]
		}));
	} catch (err) {
		errors.manifold4 = (err as Error).message;
		return null;
	}
}

async function buildTileAtlasPart(
	errors: Record<string, string>
): Promise<{ tileCount: number; payloadVersion: string | null; source: string } | null> {
	try {
		const url = `${ENV.QDRANT_URL ?? 'http://localhost:6333'}/collections/codebase_chunks_768`;
		const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) throw new Error(`Qdrant ${res.status}`);
		const data = (await res.json()) as Record<string, unknown>;
		const result = (data.result ?? {}) as Record<string, unknown>;
		return {
			tileCount: Number(result.points_count ?? 0),
			payloadVersion: null,
			source: 'qdrant:codebase_chunks_768'
		};
	} catch (err) {
		errors.tileAtlas = (err as Error).message;
		return null;
	}
}

async function buildCacheStatsPart(
	errors: Record<string, string>
): Promise<Record<string, number> | null> {
	const redis = getRedisFresh();
	try {
		const patterns = [
			'turbo:*',
			'summary:cluster:*',
			'research_bundle:*',
			'kb_bundle:*',
			'wiki:*',
			'embed:embeddinggemma:latest:*'
		];
		// Parallel SCAN — ioredis pipelines same-client commands so 6 concurrent
		// scanKeys() calls finish in roughly the time of the slowest pattern
		// instead of the sum. Safe because scanKeys itself serializes its own
		// cursor loop; Promise.all just overlaps the 6 loops.
		const keyLists = await Promise.all(patterns.map((p) => scanKeys(redis, p, 10_000)));
		const counts: Record<string, number> = {};
		for (let i = 0; i < patterns.length; i++) {
			counts[patterns[i]] = keyLists[i].length;
		}
		return counts;
	} catch (err) {
		errors.cacheStats = (err as Error).message;
		return null;
	} finally {
		redis.disconnect();
	}
}

// ── Handler ────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const format = url.searchParams.get('format') ?? 'json';
	if (format === 'ipynb') {
		throw redirect(302, '/api/graph/colab-export');
	}

	const includeParam = url.searchParams.get('include');
	const requested = new Set<Part>(
		includeParam
			? (includeParam.split(',').map((s) => s.trim()).filter((s) => (PARTS as readonly string[]).includes(s)) as Part[])
			: [...PARTS]
	);
	const limit = Math.min(10_000, Math.max(10, Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)));
	const repoId = url.searchParams.get('repoId') ?? 'default';

	const errors: Record<string, string> = {};
	const sources: Record<string, boolean> = {};

	const graphP = requested.has('graph') ? buildGraphPart(limit, errors) : Promise.resolve(null);
	const clustersP = requested.has('clusters')
		? buildClustersPart(repoId, errors)
		: Promise.resolve(null);
	const wikiP = requested.has('wikiNotes')
		? buildWikiNotesPart(errors, limit)
		: Promise.resolve(null);
	const manifoldP = requested.has('manifold4')
		? buildManifold4Part(limit, errors)
		: Promise.resolve(null);
	const atlasP = requested.has('tileAtlas')
		? buildTileAtlasPart(errors)
		: Promise.resolve(null);
	const cacheP = requested.has('cacheStats')
		? buildCacheStatsPart(errors)
		: Promise.resolve(null);

	const [graph, clusters, wikiNotes, manifold4, tileAtlas, cacheStats] = await Promise.all([
		graphP,
		clustersP,
		wikiP,
		manifoldP,
		atlasP,
		cacheP
	]);

	sources.graph = graph !== null;
	sources.clusters = clusters !== null;
	sources.wikiNotes = wikiNotes !== null;
	sources.manifold4 = manifold4 !== null;
	sources.tileAtlas = tileAtlas !== null;
	sources.cacheStats = cacheStats !== null;

	const counts: Record<string, number> = {
		nodes: graph?.nodes.length ?? 0,
		edges: graph?.edges.length ?? 0,
		clusters: clusters?.length ?? 0,
		wikiNotes: wikiNotes?.length ?? 0,
		manifold4: manifold4?.length ?? 0
	};

	const meta: BundleMeta = {
		exportedAt: new Date().toISOString(),
		counts,
		sources,
		...(Object.keys(errors).length > 0 ? { errors } : {})
	};

	return json({
		graph,
		clusters,
		wikiNotes,
		manifold4,
		tileAtlas,
		cacheStats,
		meta
	});
};
