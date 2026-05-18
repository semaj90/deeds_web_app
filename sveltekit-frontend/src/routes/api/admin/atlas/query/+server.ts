import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHash } from 'node:crypto';
import type { AtlasNode, AtlasEdge, AtlasChunk, TraceStep, AtlasRoutingSignals, AtlasWeightProfile } from '$lib/types/atlas.js';
import { runRgAsync } from '../../../../../../scripts/rg-atlas/run-rg.mjs';

const CODEBASE_COLLECTION = 'codebase_chunks_768';
const WIKI_COLLECTION = 'llm_wiki_chunks';
const CACHE_PREFIX = 'ace:cartridge:';
const CACHE_TTL = 1800;
const BLEND = { cosine: 0.45, pagerank: 0.20, topology: 0.15 };

const WIKI_TOPICS: Record<string, string> = {
	'backpropagation': 'Backpropagation & Gradient Descent',
	'tokenization': 'Tokenization in LLMs',
	'attention-mechanism': 'Self-Attention & Transformer Architecture',
	'embedding-vectors': 'Embedding Vectors & Semantic Search',
	'retrieval-augmented-generation': 'Retrieval-Augmented Generation (RAG)',
	'quantization': 'Model Quantization (GGUF/GGML)',
	'fine-tuning': 'Fine-Tuning & RLHF',
	'kv-cache': 'KV Cache & Inference Optimization',
	'som-clustering': 'Self-Organizing Maps & Neural Clustering',
	'graph-rag': 'Graph-Enhanced Retrieval (GraphRAG)',
};

type QHit = { id: string | number; score: number; payload?: Record<string, unknown> | null };

type WeightVector = {
	cosine: number;
	pagerank: number;
	topology: number;
};

function normalizeWeightVector(weights: WeightVector, total = BLEND.cosine + BLEND.pagerank + BLEND.topology): WeightVector {
	const sum = weights.cosine + weights.pagerank + weights.topology;
	if (!Number.isFinite(sum) || sum <= 0) return { ...BLEND };
	const scale = total / sum;
	return {
		cosine: Number((weights.cosine * scale).toFixed(4)),
		pagerank: Number((weights.pagerank * scale).toFixed(4)),
		topology: Number((weights.topology * scale).toFixed(4)),
	};
}

function buildRoutingSignals(query: string): AtlasRoutingSignals {
	const lower = query.toLowerCase();
	return {
		queryLength: query.length,
		shortQuery: query.length < 30,
		codeAnchors: /(?:\bfile\b|\bpath\b|\.ts\b|\.svelte\b|\bapi\b|\broute\b|\bserver\b|\bcomponent\b)/.test(lower),
		procedural: /(?:\bhow\b|\bwhy\b|\bworkflow\b|\bpipeline\b|\bsystem\b|\bdesign\b|\barchitecture\b)/.test(lower),
		debugging: /(?:\berror\b|\bbug\b|\bfix\b|\bworker\b|\btest\b|\bfail\b|\bcrash\b|\bexception\b|\bhandler\b)/.test(lower),
		architecture: /(?:\barchitecture\b|\bdesign\b|\bpattern\b|\bservice\b|\bmanager\b|\bmodule\b)/.test(lower),
		lexicalHint: /(?:\brg\b|\bripgrep\b|\bgrep\b|\bsearch\b)/.test(lower),
	};
}

function buildAdaptiveWeightProfile(query: string, signals = buildRoutingSignals(query)): AtlasWeightProfile {
	const weights: WeightVector = { ...BLEND };
	const reasons: string[] = [];

	if (signals.shortQuery) {
		weights.cosine += 0.08;
		reasons.push('short query -> cosine emphasis');
	}

	if (signals.codeAnchors) {
		weights.pagerank += 0.1;
		reasons.push('file/path hints -> pagerank emphasis');
	}

	if (signals.procedural || signals.architecture) {
		weights.topology += 0.1;
		reasons.push('procedural / architecture terms -> topology emphasis');
	}

	if (signals.debugging) {
		weights.cosine += 0.05;
		weights.pagerank += 0.05;
		reasons.push('debugging terms -> cosine + pagerank');
	}

	if (signals.lexicalHint) {
		weights.pagerank += 0.04;
		reasons.push('lexical search hint -> pagerank');
	}

	if (signals.queryLength > 120) {
		weights.topology += 0.05;
		reasons.push('long query -> topology follow-through');
	}

	if (reasons.length === 0) {
		reasons.push('default retrieval mix');
	}

	const normalized = normalizeWeightVector(weights);
	return {
		...normalized,
		total: Number((normalized.cosine + normalized.pagerank + normalized.topology).toFixed(4)),
		adaptive: true,
		reasons,
	};
}

function buildManualWeightProfile(weights: WeightVector): AtlasWeightProfile {
	const normalized = normalizeWeightVector(weights);
	return {
		...normalized,
		total: Number((normalized.cosine + normalized.pagerank + normalized.topology).toFixed(4)),
		adaptive: false,
		reasons: ['manual tuning override'],
	};
}

function hitKey(hit: QHit) {
	const payload = hit.payload ?? {};
	return String(payload.file_path ?? payload.source_path ?? payload.url ?? hit.id);
}

function mergeHits(primary: QHit[], lexical: QHit[]) {
	const merged = new Map<string, QHit>();
	for (const hit of primary) merged.set(hitKey(hit), hit);

	for (const hit of lexical) {
		const key = hitKey(hit);
		const existing = merged.get(key);
		if (!existing) {
			merged.set(key, hit);
			continue;
		}

		const existingTags = Array.isArray(existing.payload?.tags) ? (existing.payload?.tags as string[]) : [];
		const lexicalTags = Array.isArray(hit.payload?.tags) ? (hit.payload?.tags as string[]) : [];
		merged.set(key, {
			...hit,
			...existing,
			score: Math.max(existing.score, hit.score),
			payload: {
				...(hit.payload ?? {}),
				...(existing.payload ?? {}),
				tags: [...new Set([...existingTags, ...lexicalTags])],
			},
		});
	}

	return [...merged.values()].sort((a, b) => b.score - a.score);
}

function rrfFuse(sets: QHit[][], k = 60) {
	const map = new Map<string, { rrf: number; payload: Record<string, unknown> | null }>();
	for (const results of sets) {
		for (const [rank, r] of results.entries()) {
			const key = String(r.id);
			const rrf = 1 / (k + rank + 1);
			const ex = map.get(key);
			if (ex) ex.rrf += rrf;
			else map.set(key, { rrf, payload: r.payload ?? null });
		}
	}
	return [...map.entries()].sort((a, b) => b[1].rrf - a[1].rrf).map(([id, v]) => ({ id, ...v }));
}

function radialPos(i: number, n: number, cx: number, cy: number, r: number) {
	const angle = (i / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
	return { x: Math.round(cx + r * Math.cos(angle)), y: Math.round(cy + r * Math.sin(angle)) };
}

function chunkFromHit(r: QHit): AtlasChunk {
	const p = r.payload ?? {};
	const path = (p.file_path ?? p.source_path ?? p.url ?? String(r.id)) as string;
	const text = (p.text as string) ?? '';
	const tags = (p.tags as string[]) ?? [];
	return {
		chunk_id: String(r.id),
		source_ref: path,
		text: text.slice(0, 150),
		score: parseFloat(r.score.toFixed(4)),
		signals: { cosine: parseFloat(r.score.toFixed(3)), pagerank: 0, topology: 0, hotness: 0 },
		topology4d: {
			x: parseFloat(r.score.toFixed(3)),
			y: parseFloat(Math.min(text.length / 800, 1).toFixed(3)),
			z: parseFloat(Math.min(tags.length / 8, 1).toFixed(3)),
			w: 0.4,
		},
		aceFeatureKey: tags.find(t => t in WIKI_TOPICS) ?? null,
	};
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => ({}));
	const query: string = (body.query ?? '').trim();

	const requestedWeights = {
		cosine: body.blendCosine !== undefined ? Number(body.blendCosine) : BLEND.cosine,
		pagerank: body.blendPageRank !== undefined ? Number(body.blendPageRank) : BLEND.pagerank,
		topology: body.blendTopology !== undefined ? Number(body.blendTopology) : BLEND.topology,
	};

	const hasCustomWeights =
		Math.abs(requestedWeights.cosine - BLEND.cosine) > 0.001 ||
		Math.abs(requestedWeights.pagerank - BLEND.pagerank) > 0.001 ||
		Math.abs(requestedWeights.topology - BLEND.topology) > 0.001;

	const routingSignals = buildRoutingSignals(query);
	const effectiveWeights = hasCustomWeights
		? buildManualWeightProfile(requestedWeights)
		: buildAdaptiveWeightProfile(query, routingSignals);

	const noCache: boolean = (body.noCache ?? false) || hasCustomWeights;
	if (!query) return json({ error: 'query required' }, { status: 400 });

	const t0 = performance.now();
	const trace: TraceStep[] = [];
	let lexicalFallback = false;
	let lexicalHitCount = 0;
	const qHash = createHash('sha256').update(query).digest('hex').slice(0, 16);
	const cacheKey = `${CACHE_PREFIX}${qHash}`;

	const { getRedis } = await import('$lib/server/redis.js');
	const redis = getRedis();
	const lexicalPromise = runRgAsync(query, ['src', 'scripts']);
	const karpathyPromise = redis.hgetall('gpu:karpathy:scores').catch(() => null);

	// ── A0: Redis CHR97 cartridge cache ──────────────────────────────────────
	if (!noCache) {
		try {
			const t = performance.now();
			const cached = await redis.get(cacheKey);
			if (cached) {
				const parsed = JSON.parse(cached);
				trace.push({ stage: 'A0:cache', durationMs: Math.round(performance.now() - t), detail: 'HIT' });
				return json({ ...parsed, cacheHit: true, trace, latencyMs: Math.round(performance.now() - t0) });
			}
			trace.push({ stage: 'A0:cache', durationMs: Math.round(performance.now() - t), detail: 'MISS' });
		} catch {
			trace.push({ stage: 'A0:cache', durationMs: 0, detail: 'Redis offline' });
		}
	}

	// ── A1: Embed query ───────────────────────────────────────────────────────
	let embedding: number[] = [];
	try {
		const t = performance.now();
		const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
		embedding = await generateSingleEmbedding(query);
		trace.push({ stage: 'A1:embed', durationMs: Math.round(performance.now() - t), detail: `${embedding.length}d` });
	} catch (e) {
		return json({ error: `Embedding failed: ${String(e)}` }, { status: 502 });
	}

	// ── A2: Qdrant codebase search ────────────────────────────────────────────
	let codebaseHits: QHit[] = [];
	try {
		const t = performance.now();
		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
		const qdrantPromise = qdrant.client.search(CODEBASE_COLLECTION, {
			vector: { name: 'content', vector: embedding }, limit: 8, with_payload: true, score_threshold: 0.2,
		});
		const [qdrantResult, rgResult] = await Promise.allSettled([qdrantPromise, lexicalPromise]);
		const qdrantHits = qdrantResult.status === 'fulfilled' ? qdrantResult.value : [];
		const rgHits = rgResult.status === 'fulfilled' ? rgResult.value : [];
		codebaseHits = qdrantHits;
		lexicalHitCount = rgHits.length;
		lexicalFallback = lexicalHitCount > 0;
		if (lexicalHitCount > 0) {
			const lexicalHits: QHit[] = rgHits.map((hit, index) => ({
				id: `rg:${hit.file}:${hit.lineNumber}`,
				score: Math.max(0.45, 0.92 - index * 0.03),
				payload: {
					file_path: hit.file,
					source_path: hit.file,
					text: hit.snippet,
					tags: ['rg'],
				},
			}));
			codebaseHits = mergeHits(codebaseHits, lexicalHits).slice(0, 8);
		}
		const qdrantState = qdrantResult.status === 'fulfilled' ? `${qdrantHits.length} qdrant` : 'qdrant offline';
		const rgState = rgResult.status === 'fulfilled' ? `${lexicalHitCount} rg` : 'rg offline';
		trace.push({ stage: 'A2:qdrant+rg', durationMs: Math.round(performance.now() - t), detail: `${qdrantState} + ${rgState}` });
	} catch {
		trace.push({ stage: 'A2:qdrant+rg', durationMs: 0, detail: 'offline' });
	}

	// ── A3: Karpathy blend ────────────────────────────────────────────────────
	let prMap: Record<string, number> = {};
	try {
		const t = performance.now();
		const raw = await karpathyPromise;
		if (raw) {
			for (const [k, v] of Object.entries(raw)) {
				try { prMap[k] = JSON.parse(v as string).blend ?? 0; } catch { /* skip */ }
			}
		}
		trace.push({ stage: 'A3:karpathy', durationMs: Math.round(performance.now() - t), detail: `${Object.keys(prMap).length} entries` });
	} catch {
		trace.push({ stage: 'A3:karpathy', durationMs: 0, detail: 'Redis offline' });
	}

	const isImpl = /implement|error|fix|bug|test|handler|worker|async/.test(query.toLowerCase());
	const isArch = /architect|design|pattern|service|pipeline|system|module/.test(query.toLowerCase());
	const prMax = Math.max(1, ...Object.values(prMap));

	const blended: AtlasChunk[] = codebaseHits.map(r => {
		const c = chunkFromHit(r);
		const p = r.payload ?? {};
		const text = (p.text as string) ?? '';
		const tags = (p.tags as string[]) ?? [];
		const cosine = r.score;
		const pagerank = (prMap[c.source_ref] ?? 0) / prMax;
		const topo = 0.5 * Math.min(text.length / 800, 1) + 0.5 * Math.min(tags.length / 8, 1);
		const bonus =
			(isImpl && /error|worker|handler/.test(c.source_ref)) ||
			(isArch && /service|pipeline|manager/.test(c.source_ref))
				? 0.15 : 0;
		const score = effectiveWeights.cosine * cosine + effectiveWeights.pagerank * pagerank + effectiveWeights.topology * topo + bonus;
		return {
			...c,
			score: parseFloat(score.toFixed(4)),
			signals: {
				cosine: parseFloat(cosine.toFixed(3)),
				pagerank: parseFloat(pagerank.toFixed(3)),
				topology: parseFloat(topo.toFixed(3)),
				hotness: 0,
			},
		};
	}).sort((a, b) => b.score - a.score);

	const topScore = blended[0]?.score ?? 0;
	const mode = topScore >= 0.75 ? 'fast' : 'hybrid';
	trace.push({ stage: 'A3:blend', durationMs: 0, detail: `top=${topScore.toFixed(3)} → ${mode} | ${effectiveWeights.reasons.slice(0, 2).join('; ')}` });

	// ── A4: HyperRAG wiki expansion (hybrid mode) ─────────────────────────────
	let wikiChunks: AtlasChunk[] = [];
	if (mode !== 'fast' && embedding.length) {
		const t = performance.now();
		try {
			const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
			const wikiHits: QHit[] = await qdrant.client.search(WIKI_COLLECTION, {
				vector: embedding, limit: 6, with_payload: true, score_threshold: 0.2,
			});
			rrfFuse([codebaseHits, wikiHits]);
			wikiChunks = wikiHits.map(chunkFromHit);
			trace.push({ stage: 'A4:hyperrag', durationMs: Math.round(performance.now() - t), detail: `${wikiHits.length} wiki hits` });
		} catch {
			trace.push({ stage: 'A4:hyperrag', durationMs: Math.round(performance.now() - t), detail: 'wiki offline' });
		}
		try {
			const topicKeys = Object.keys(WIKI_TOPICS);
			const vals = await redis.mget(...topicKeys.map(k => `ace:feature:${k}`));
			const hot = new Set(topicKeys.filter((_, i) => vals[i] !== null));
			wikiChunks = wikiChunks.map(c => ({
				...c,
				signals: { ...c.signals, hotness: c.aceFeatureKey && hot.has(c.aceFeatureKey) ? 1 : 0 },
			}));
		} catch { /* Redis offline */ }
	}

	// ── Merge + deduplicate ───────────────────────────────────────────────────
	const seen = new Set<string>();
	const allChunks = [...blended, ...wikiChunks]
		.filter(c => { if (seen.has(c.source_ref)) return false; seen.add(c.source_ref); return true; })
		.slice(0, 10);

	const sourceRefs = [...new Set(allChunks.map(c => c.source_ref))];
	const confidence = allChunks[0]?.score ?? 0;
	const codebaseHitCount = blended.length;
	const wikiHitCount = wikiChunks.length;

	// ── Build graph nodes + edges ─────────────────────────────────────────────
	const CX = 460, CY = 320;
	const nodes: AtlasNode[] = [
		{ id: 'query', type: 'query', label: query.slice(0, 45), position: { x: CX, y: CY }, data: {} },
		{ id: 'cache', type: 'cache', label: 'Redis CHR97', position: { x: CX + 130, y: CY - 95 }, data: { redis_hot: 0 } },
	];
	const edges: AtlasEdge[] = [
		{ id: 'q-cache', source: 'query', target: 'cache', label: 'check' },
	];

	allChunks.forEach((c, i) => {
		nodes.push({
			id: c.chunk_id,
			type: c.aceFeatureKey ? 'wiki' : 'chunk',
			label: c.source_ref.split('/').pop() ?? c.source_ref,
			position: radialPos(i, allChunks.length, CX, CY, 210),
			data: {
				source_ref: c.source_ref,
				chunk_id: c.chunk_id,
				qdrant_score: c.signals.cosine,
				pagerank_score: c.signals.pagerank,
				topology_score: c.signals.topology,
				feature_key: c.aceFeatureKey ?? undefined,
				llm_synthesis_weight: c.score,
				text: c.text,
				topology4d: c.topology4d,
			},
		});
		edges.push({ id: `q-${c.chunk_id}`, source: 'query', target: c.chunk_id, label: `${(c.score * 100).toFixed(0)}%` });

		if (c.aceFeatureKey) {
			const fid = `feat-${c.aceFeatureKey}`;
			if (!nodes.find(n => n.id === fid)) {
				nodes.push({
					id: fid, type: 'feature',
					label: (WIKI_TOPICS[c.aceFeatureKey] ?? c.aceFeatureKey).slice(0, 30),
					position: radialPos(i, allChunks.length, CX, CY, 340),
					data: { feature_key: c.aceFeatureKey, redis_hot: c.signals.hotness },
				});
			}
			edges.push({ id: `${c.chunk_id}-${fid}`, source: c.chunk_id, target: fid, label: 'ACE' });
		}
	});

	sourceRefs.forEach((sr, i) => {
		const sid = `src-${i}`;
		const linked = allChunks.find(c => c.source_ref === sr);
		nodes.push({
			id: sid, type: 'source',
			label: sr.split('/').slice(-2).join('/'),
			position: radialPos(i, sourceRefs.length, CX, CY, 440),
			data: { source_ref: sr },
		});
		if (linked) edges.push({ id: `${linked.chunk_id}-${sid}`, source: linked.chunk_id, target: sid, label: 'ref' });
	});

	const result = {
		mode, query,
		confidence: parseFloat(confidence.toFixed(4)),
		latencyMs: Math.round(performance.now() - t0),
		cacheHit: false,
		lexicalFallback,
		lexicalHitCount,
		codebaseHitCount,
		wikiHitCount,
		effectiveWeights,
		routingSignals,
		karpathyRev: Object.keys(prMap).length > 0 ? 'loaded' : 'unknown',
		chunks: allChunks,
		sourceRefs,
	};

	try { await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)); } catch { /* offline */ }

	return json({ result, nodes, edges, trace });
};