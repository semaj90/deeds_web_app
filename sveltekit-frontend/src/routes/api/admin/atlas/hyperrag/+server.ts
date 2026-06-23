import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { getRedis } from '$lib/server/redis.js';

const OLLAMA_URL   = ENV.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const EMBED_MODEL  = ENV.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const QDRANT_URL   = ENV.QDRANT_URL   ?? 'http://localhost:6333';
const COUCHDB_URL  = (ENV.COUCHDB_URL ?? 'http://admin:legal_ai_pass@127.0.0.1:5984').replace(/\/+$/, '');
const COUCHDB_DB   = process.env.COUCHDB_DB ?? 'karpathy_wiki';
const TURBOVEC_URL = process.env.TURBOVEC_URL ?? 'http://127.0.0.1:8099';
const ROTORQUANT   = process.env.ROTORQUANT_URL ?? 'http://127.0.0.1:8090';
const COLLECTION   = 'codebase_chunks_768';
const RRF_K        = 60;

const hyperragBodySchema = z.object({
	query: z.string().min(1, 'query is required').max(500),
	topK: z.number().int().min(1).max(100).optional().default(10),
	topClusters: z.number().int().min(1).max(50).optional().default(5),
	noInference: z.boolean().optional().default(false)
});

function sourceRef(p: Record<string, unknown> | null): string | null {
	if (!p) return null;
	return (p.path ??
    p.source_ref ??
    p.relativePath ??
    p.relative_path ??
    p.file_path ??
    p.filePath ??
    p.source_path ??
    p.sourcePath ??
    null) as string | null;
}

async function embedQuery(query: string): Promise<number[]> {
	const r = await fetch(`${OLLAMA_URL}/api/embed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: EMBED_MODEL, input: query }),
		signal: AbortSignal.timeout(15_000),
	});
	if (!r.ok) throw new Error(`Embed failed: ${r.status}`);
	const d = await r.json() as Record<string, unknown>;
	const vec = (d.embeddings as number[][])?.[0] ?? (d.embedding as number[]);
	if (!Array.isArray(vec)) throw new Error('No embedding returned');
	return vec;
}

async function getClusterIds(vector: number[], topClusters: number) {
	try {
		const r = await fetch(`${TURBOVEC_URL}/prefilter`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ vector, topClusters }),
			signal: AbortSignal.timeout(3_000),
		});
		if (r.ok) {
			const d = await r.json() as { clusterIds: number[]; centroidScores: Record<string, number> };
			if (Array.isArray(d.clusterIds) && d.clusterIds.length) return { ...d, backend: 'prefilter' };
		}
	} catch { /* fall through */ }

	// Fallback: /search on existing Python sidecar
	try {
		const r = await fetch(`${TURBOVEC_URL}/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ vector, k: topClusters * 20 }),
			signal: AbortSignal.timeout(5_000),
		});
		if (r.ok) {
			const d = await r.json() as { candidates?: Array<{ cluster?: number; cluster_id?: number; score?: number }> };
			const seen = new Set<number>();
			const clusterIds: number[] = [];
			const centroidScores: Record<string, number> = {};
			for (const c of d.candidates ?? []) {
				const cid = c.cluster ?? c.cluster_id;
				if (cid != null && !seen.has(cid)) {
					seen.add(cid);
					clusterIds.push(Number(cid));
					centroidScores[cid] = c.score ?? 0;
					if (clusterIds.length >= topClusters) break;
				}
			}
			if (clusterIds.length) return { clusterIds, centroidScores, backend: 'search-derived' };
		}
	} catch { /* sidecar offline */ }

	return { clusterIds: [] as number[], centroidScores: {} as Record<string, number>, backend: 'offline' };
}

async function qdrantSearch(vector: number[], filter: unknown, limit: number) {
	const body: Record<string, unknown> = {
		vector: { name: 'content', vector },
		limit,
		with_payload: true,
		with_vector: false,
	};
	if (filter) body.filter = filter;
	const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10_000),
	});
	if (!r.ok) return [];
	const d = await r.json() as { result: Array<{ id: string | number; score: number; payload: Record<string, unknown> }> };
	return d.result ?? [];
}

function rrfMerge(sets: Array<Array<{ id: string | number; score: number; payload: Record<string, unknown> }>>) {
	const map = new Map<string, { rrf: number; qdrantScore: number; payload: Record<string, unknown> }>();
	for (const results of sets) {
		results.forEach((hit, rank) => {
			const key = String(hit.id);
			const prev = map.get(key) ?? { rrf: 0, qdrantScore: 0, payload: hit.payload };
			map.set(key, { rrf: prev.rrf + 1 / (RRF_K + rank + 1), qdrantScore: Math.max(prev.qdrantScore, hit.score), payload: hit.payload });
		});
	}
	return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.rrf - a.rrf);
}

async function enrichWithCouchDB(hits: ReturnType<typeof rrfMerge>) {
	let wikiDocs: Array<Record<string, unknown>> = [];
	try {
		const r = await fetch(
			`${COUCHDB_URL}/${COUCHDB_DB}/_all_docs?include_docs=true&limit=200&startkey=%22agents%3A%22&endkey=%22agents%3A%EF%BF%B0%22`,
			{ headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) }
		);
		if (r.ok) {
			const d = await r.json() as { rows: Array<{ id: string; doc: Record<string, unknown> }> };
			wikiDocs = d.rows.filter(row => row.doc && !row.id.startsWith('_design/')).map(row => row.doc);
		}
	} catch { /* CouchDB offline */ }

	const byId = new Map(wikiDocs.map(d => [d._id as string, d]));

	return hits.map(hit => {
		const ref = sourceRef(hit.payload);
		const dirParts = ref?.split('/').slice(0, -1) ?? [];
		const slug = dirParts.join(':').replace(/sveltekit-frontend:/, '');
		const exact = slug ? byId.get(`agents:dir:${slug}`) : undefined;
		const wikiEnrichment: Array<{ id: string; matchType: string; title: string; summary: string | null }> = [];
		if (exact) wikiEnrichment.push({ id: exact._id as string, matchType: 'exact-dir', title: (exact.title ?? exact._id) as string, summary: (exact.summary as string | null)?.slice(0, 200) ?? null });
		return { ...hit, wikiEnrichment };
	});
}

async function synthesise(hits: Awaited<ReturnType<typeof enrichWithCouchDB>>, query: string) {
	const budget = 4000;
	let ctx = `Query: ${query}\n\n`;
	for (const h of hits) {
		const ref = sourceRef(h.payload);
		const text = (h.payload?.content ?? h.payload?.text) as string | undefined;
		const line = `[${ref ?? h.id}] ${text?.slice(0, 300) ?? ''}`.trim();
		if ((ctx + line).length > budget) break;
		ctx += line + '\n';
	}
	const r = await fetch(`${ROTORQUANT}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			messages: [
				{ role: 'system', content: 'You are a code intelligence assistant. Answer the developer question precisely based on the codebase context provided.' },
				{ role: 'user', content: `${ctx}\n\nQuestion: ${query}` },
			],
			max_tokens: 800,
			temperature: 0.2,
			stream: false,
		}),
		signal: AbortSignal.timeout(90_000),
	});
	if (!r.ok) throw new Error(`RotorQuant ${r.status}`);
	const d = await r.json() as { choices: Array<{ message: { content: string } }> };
	return d.choices?.[0]?.message?.content ?? '';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => ({}));
	const parsed = hyperragBodySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { query } = parsed.data;

	const topK        = Math.min(parsed.data.topK, 50);
	const topClusters = Math.min(parsed.data.topClusters, 20);
	const noInference = parsed.data.noInference;

	const t0 = Date.now();

	// Phase B — embed + cluster prefilter
	const tEmbed0 = Date.now();
	const embedding = await embedQuery(query);
	const embedMs = Date.now() - tEmbed0;

	const tCluster0 = Date.now();
	const { clusterIds, centroidScores, backend: sidecarBackend } = await getClusterIds(embedding, topClusters);
	const clusterMs = Date.now() - tCluster0;

	const clusterFilter = clusterIds.length ? { must: [{ key: 'som_cluster', match: { any: clusterIds } }] } : null;

	const tQdrant0 = Date.now();
	const [filteredHits, unfilteredHits] = await Promise.all([
		clusterFilter ? qdrantSearch(embedding, clusterFilter, topK * 2) : Promise.resolve([]),
		qdrantSearch(embedding, null, topK * 2),
	]);
	const qdrantMs = Date.now() - tQdrant0;

	const merged = rrfMerge(clusterFilter ? [filteredHits, unfilteredHits] : [unfilteredHits]).slice(0, topK);

	// Karpathy enrichment
	let redis; try { redis = getRedis(); } catch { /* no redis */ }
	const enriched = await (async () => {
		if (!redis) return merged;
		try {
			const refs = merged.map(h => sourceRef(h.payload)).filter(Boolean) as string[];
			const pipeline = redis.pipeline();
			refs.forEach(ref => pipeline.hget('gpu:karpathy:scores', ref));
			const results = await pipeline.exec().catch(() => []);
			const km = new Map<string, Record<string, number>>();
			refs.forEach((ref, i) => {
				const raw = results?.[i]?.[1] as string | null;
				if (raw) try { km.set(ref, JSON.parse(raw)); } catch { /* skip */ }
			});
			return merged.map(h => ({ ...h, karpathy: km.get(sourceRef(h.payload) ?? '') ?? null }));
		} catch { return merged; }
	})();

	// Phase C — CouchDB wiki enrichment
	const tCouchdb0 = Date.now();
	const withWiki = await enrichWithCouchDB(enriched as typeof merged);
	const couchdbMs = Date.now() - tCouchdb0;
	const wikiEnriched = withWiki.filter(h => h.wikiEnrichment.length > 0).length;

	// Phase D — RotorQuant synthesis
	let synthesis: string | null = null;
	let inferLatencyMs = 0;
	let inferError: string | null = null;
	if (!noInference) {
		const t1 = Date.now();
		try { synthesis = await synthesise(withWiki, query); } catch (e) { inferError = String(e); }
		inferLatencyMs = Date.now() - t1;
	}

	// Phase E — final sort by blend
	const sorted = [...withWiki].sort((a, b) => {
		const aBlend = (a as { karpathy?: { blend?: number } }).karpathy?.blend ?? 0;
		const bBlend = (b as { karpathy?: { blend?: number } }).karpathy?.blend ?? 0;
		return (bBlend * 0.5 + b.rrf * 10 * 0.3) - (aBlend * 0.5 + a.rrf * 10 * 0.3);
	});

	return json({
		query,
		clusterIds,
		centroidScores,
		sidecarBackend,
		latencyMs: Date.now() - t0,
		phaseLatency: { embed: embedMs, cluster: clusterMs, qdrant: qdrantMs, couchdb: couchdbMs },
		resultCount: sorted.length,
		phaseC: { wikiDocsFetched: 0, hitsEnriched: wikiEnriched },
		phaseD: { cudaBackend: 'server-side', centroidCount: 0, synthesis, inferLatencyMs, inferError },
		phaseE: { sortedHitCount: sorted.length, clusterSidecarCount: 0, auditLogWritten: false },
		results: sorted.map((h, i) => ({
			rank: i + 1,
			id: h.id,
			rrfScore: parseFloat(h.rrf.toFixed(6)),
			qdrantScore: parseFloat(h.qdrantScore.toFixed(4)),
			karpathyBlend: (h as { karpathy?: { blend?: number } }).karpathy?.blend ?? null,
			source_ref: sourceRef(h.payload),
			cluster: (h.payload?.som_cluster ?? h.payload?.cluster_id) as number | null,
			text: ((h.payload?.content ?? h.payload?.text) as string | undefined)?.slice(0, 240) ?? null,
			wikiEnrichment: h.wikiEnrichment,
		})),
	});
};