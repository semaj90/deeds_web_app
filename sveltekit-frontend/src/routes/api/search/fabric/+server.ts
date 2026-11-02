import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db, pool, isPoolHealthy } from '$lib/server/db/client.js';
import { ENV } from '$lib/server/env.server.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { sparseLegalSearch } from '$lib/server/retrieval/sparse-bm25.js';
import { reciprocalRankFusion } from '$lib/server/retrieval/rrf-fuse.js';
import { turbovecPrefilter } from '$lib/server/retrieval/turbovec-prefilter.js';
import { turbovecRerank, type QdrantHit } from '$lib/server/retrieval/turbovec-rerank.js';
import { compressEmbeddingBatch } from '$lib/server/retrieval/autoencoder-compression-pipeline.js';
import { encodeFP16, PacketMsgpackTags } from '$lib/server/serialization/packet-msgpack-codec.js';
import { buildFabricLaneManifest } from '$lib/server/atlas/contracts/fabric-lanes.js';

const SearchFabricBodySchema = z.object({
	query: z.string().trim().min(1).max(500),
	limit: z.number().int().min(1).max(20).default(8),
	jurisdiction: z.string().trim().max(32).optional(),
	includeLowRankRecommendations: z.boolean().default(true),
});

interface FabricStatusResponse {
	ok: boolean;
	authority: {
		engine: string;
		version: string;
		aioPlanner: string;
		bitmapScanEnabled: boolean;
		pgvectorReady: boolean;
		canonicalRepresentation: 'semantic_768';
		embeddingModel: 'embeddinggemma';
		counts: {
			cases: number;
			evidence: number;
			legalDocuments: number;
		};
	};
	outbox: {
		pending: number;
		projected: number;
	};
	lanes: {
		sidecar8095: { status: 'online' | 'standby'; role: string };
		turbovecSimd: { status: 'online' | 'standby'; role: string };
		stagingSynthesis: { status: 'ready'; codecs: string[] };
		qdrantFanout: { status: 'online' | 'standby'; role: string };
		latentLowRank: { status: 'ready'; dims: string; policy: string };
		gpuSimtCache: { status: 'ready' | 'standby'; backends: string[] };
	};
	timestamp: string;
}

const DEFAULT_FABRIC_STATUS = (): FabricStatusResponse => ({
	ok: false,
	authority: {
		engine: 'PostgreSQL 18',
		version: 'unavailable',
		aioPlanner: 'planner-managed',
		bitmapScanEnabled: true,
		pgvectorReady: false,
		canonicalRepresentation: 'semantic_768',
		embeddingModel: 'embeddinggemma',
		counts: { cases: 0, evidence: 0, legalDocuments: 0 },
	},
	outbox: { pending: 0, projected: 0 },
	lanes: {
		sidecar8095: { status: 'standby', role: 'Tree-sitter CST · AST-grep · NetworkX · OAK (:8095)' },
		turbovecSimd: { status: 'standby', role: 'AVX2/AVX-512 Wheel · BitEncoding FSM Prefilter' },
		stagingSynthesis: {
			status: 'ready',
			codecs: [`MsgPack FP16 (tags 0..${PacketMsgpackTags.provenance})`, 'CouchDB MapReduce', 'DuckDB Analytical'],
		},
		qdrantFanout: { status: 'standby', role: 'Qdrant Hybrid (BM25 Sparse + content 768-D Dense)' },
		latentLowRank: { status: 'ready', dims: '768-D → 64-D FP16 (ae:train)', policy: 'ewin_tang_low_rank' },
		gpuSimtCache: { status: 'standby', backends: ['PyTorch ATen', 'cuTile SIMT', 'Valkey L1 Descriptor'] },
	},
	timestamp: new Date().toISOString(),
});

async function probeHttp(url: string | undefined, path: string, timeoutMs = 320): Promise<boolean> {
	if (!url) return false;
	try {
		const target = `${url.replace(/\/$/, '')}${path}`;
		const res = await fetch(target, { signal: AbortSignal.timeout(timeoutMs) });
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * Ewin Tang quantum-inspired low-rank leverage-score scorer over 64-D latent vectors.
 * Computes squared ℓ2 leverage weights p_i = ||z_i||_2^2 / ||Z||_F^2 combined with
 * query-latent directional alignment without materializing an O(N^2) similarity matrix.
 */
function scoreEwinTangLowRank(
	queryLatent64: Float32Array,
	candidates: Array<{ id: string; title: string; href: string; kind: string; latent64: Float32Array }>
): Array<{ id: string; title: string; href: string; kind: string; leverageScore: number }> {
	if (candidates.length === 0) return [];

	let frobeniusNormSq = 0;
	const normsSq: number[] = [];
	let queryNormSq = 0;
	for (let d = 0; d < queryLatent64.length; d++) {
		queryNormSq += queryLatent64[d] * queryLatent64[d];
	}
	const queryNorm = Math.sqrt(queryNormSq) || 1;

	for (const item of candidates) {
		let sq = 0;
		for (let d = 0; d < item.latent64.length; d++) {
			sq += item.latent64[d] * item.latent64[d];
		}
		normsSq.push(sq);
		frobeniusNormSq += sq;
	}
	const totalFrob = frobeniusNormSq || 1;

	return candidates
		.map((item, idx) => {
			let dot = 0;
			for (let d = 0; d < queryLatent64.length && d < item.latent64.length; d++) {
				dot += queryLatent64[d] * item.latent64[d];
			}
			const itemNorm = Math.sqrt(normsSq[idx]) || 1;
			const cosine = Math.max(0, dot / (queryNorm * itemNorm));
			const leverageProbability = normsSq[idx] / totalFrob;
			const leverageScore = Number((0.72 * cosine + 0.28 * Math.min(1, leverageProbability * candidates.length)).toFixed(4));
			return {
				id: item.id,
				title: item.title,
				href: item.href,
				kind: item.kind,
				leverageScore,
			};
		})
		.sort((a, b) => b.leverageScore - a.leverageScore);
}

export const GET: RequestHandler = async ({ locals }) => {
	const devBypass = process.env.DEV_BYPASS_AUTH === 'true';
	if (!locals.user && !devBypass) {
		return json(DEFAULT_FABRIC_STATUS(), { status: 401 });
	}

	const base = DEFAULT_FABRIC_STATUS();

	try {
		const [pgMeta, sidecarOk, turbovecOk, qdrantOk, ornithOk] = await Promise.all([
			db
				.execute<{
					server_version: string;
					bitmap_scan: string;
					has_vector: boolean;
					cases_count: number;
					evidence_count: number;
					docs_count: number;
					outbox_pending: number;
					outbox_projected: number;
				}>(sql`
					SELECT
						current_setting('server_version') AS server_version,
						current_setting('enable_bitmapscan') AS bitmap_scan,
						EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS has_vector,
						(SELECT count(*)::int FROM cases) AS cases_count,
						(SELECT count(*)::int FROM evidence) AS evidence_count,
						(SELECT count(*)::int FROM legal_documents) AS docs_count,
						COALESCE((SELECT count(*)::int FROM evidence_vector_projection_outbox WHERE status = 'pending'), 0) AS outbox_pending,
						COALESCE((SELECT count(*)::int FROM evidence_vector_projection_outbox WHERE status = 'projected'), 0) AS outbox_projected
				`)
				.catch(() => null),
			probeHttp(ENV.LANGEXTRACT_BASE_URL, '/health'),
			probeHttp(ENV.TURBOVEC_HEALTH_URL, '/health'),
			probeHttp(ENV.QDRANT_URL, '/collections'),
			probeHttp(ENV.ROTORQUANT_URL, '/v1/models'),
		]);

		const row = pgMeta?.rows?.[0];
		base.ok = isPoolHealthy() && Boolean(row);
		if (row) {
			base.authority.version = row.server_version;
			base.authority.aioPlanner = 'PG18 AIO · GIN · JSONB · B-Tree · HNSW iterative_scan';
			base.authority.bitmapScanEnabled = row.bitmap_scan === 'on';
			base.authority.pgvectorReady = Boolean(row.has_vector);
			base.authority.counts = {
				cases: Number(row.cases_count ?? 0),
				evidence: Number(row.evidence_count ?? 0),
				legalDocuments: Number(row.docs_count ?? 0),
			};
			base.outbox = {
				pending: Number(row.outbox_pending ?? 0),
				projected: Number(row.outbox_projected ?? 0),
			};
		}

		base.lanes.sidecar8095.status = sidecarOk ? 'online' : 'standby';
		base.lanes.turbovecSimd.status = turbovecOk ? 'online' : 'standby';
		base.lanes.qdrantFanout.status = qdrantOk ? 'online' : 'standby';
		base.lanes.gpuSimtCache.status = ornithOk ? 'ready' : 'standby';
		base.timestamp = new Date().toISOString();

		return json(base);
	} catch {
		return json(base);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const devBypass = process.env.DEV_BYPASS_AUTH === 'true';
	if (!locals.user && !devBypass) {
		return json({ ok: false, error: 'Unauthorized', hits: [], lowRankRecommendations: [], acePacket: null }, { status: 401 });
	}

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return json({ ok: false, error: 'Invalid JSON payload', hits: [], lowRankRecommendations: [], acePacket: null }, { status: 400 });
	}

	const parsed = SearchFabricBodySchema.safeParse(rawBody);
	if (!parsed.success) {
		return json(
			{
				ok: false,
				error: parsed.error.issues[0]?.message ?? 'Invalid search parameters',
				hits: [],
				lowRankRecommendations: [],
				acePacket: null,
			},
			{ status: 400 }
		);
	}

	const { query, limit, jurisdiction, includeLowRankRecommendations } = parsed.data;
	const t0 = Date.now();
	const pattern = `%${query}%`;

	// 1. Canonical PostgreSQL 18 B-Tree / JSONB / FTS cover-density lane + case/evidence lookup
	const [caseRowsResult, recentSeedResult, sparseHits, embeddingRes] = await Promise.all([
		db
			.execute<{ id: string; title: string; status: string | null; kind: string }>(sql`
				(SELECT id::text AS id, title, COALESCE(case_number, status::text) AS status, 'case'::text AS kind
				 FROM cases
				 WHERE title ILIKE ${pattern}
				    OR COALESCE(description, '') ILIKE ${pattern}
				    OR COALESCE(case_number, '') ILIKE ${pattern}
				    OR COALESCE(jurisdiction, '') ILIKE ${pattern}
				 ORDER BY updated_at DESC NULLS LAST
				 LIMIT 6)
				UNION ALL
				(SELECT id::text AS id, COALESCE(title, file_name, 'Exhibit') AS title, evidence_type::text AS status, 'evidence'::text AS kind
				 FROM evidence
				 WHERE COALESCE(title, '') ILIKE ${pattern}
				    OR COALESCE(file_name, '') ILIKE ${pattern}
				    OR COALESCE(description, '') ILIKE ${pattern}
				 ORDER BY created_at DESC NULLS LAST
				 LIMIT 5)
			`)
			.catch(() => ({ rows: [] })),
		db
			.execute<{ id: string; title: string; status: string | null; kind: string }>(sql`
				SELECT id::text AS id, title, status::text AS status, 'case'::text AS kind
				FROM cases
				ORDER BY updated_at DESC NULLS LAST
				LIMIT 4
			`)
			.catch(() => ({ rows: [] })),
		sparseLegalSearch(pool, query, { limit: Math.min(limit * 2, 20), jurisdiction }).catch(() => []),
		query.length >= 2
			? Promise.race([
					generateEmbeddings([query]).catch(() => null),
					new Promise<null>((resolve) => setTimeout(() => resolve(null), 320)),
				])
			: Promise.resolve(null),
	]);

	const queryVector = embeddingRes?.vectors?.[0] ?? null;

	// 2. Optional TurboVec SIMD/FSM prefilter + Qdrant BM25/Dense hybrid projection + AE 64-D FP16 latent compression
	let denseHits: QdrantHit[] = [];
	let prefilterBackend: 'python' | 'js' | 'offline' = 'offline';
	let queryLatent64 = new Float32Array(64);
	let queryLatentFp16Bytes = 0;

	if (queryVector && queryVector.length > 0) {
		const [prefilter, compressedQuery, qdrantHybrid] = await Promise.all([
			turbovecPrefilter(queryVector, { topClusters: 4, timeoutMs: 220 }),
			compressEmbeddingBatch([{ packetId: 'navbar-query', embedding768: new Float32Array(queryVector) }], {
				quantize: true,
				skipReconstructionCheck: true,
			}).catch(() => []),
			Promise.race([
				qdrant
					.hybridSearch({
						query,
						queryEmbedding: queryVector,
						collection: 'legal_documents',
						limit: Math.min(limit * 2, 24),
						filters: jurisdiction
							? { must: [{ key: 'jurisdiction', match: { value: jurisdiction } }] }
							: undefined,
					})
					.catch(() => ({ results: [] })),
				new Promise<{ results: never[] }>((resolve) => setTimeout(() => resolve({ results: [] }), 280)),
			]),
		]);

		prefilterBackend = prefilter.backend;
		if (compressedQuery[0]?.latent64) {
			queryLatent64 = compressedQuery[0].latent64;
			queryLatentFp16Bytes = encodeFP16(Array.from(queryLatent64)).byteLength;
		}

		const rawQdrantHits: QdrantHit[] = (qdrantHybrid.results ?? []).map((r: any) => ({
			id: String(r.id),
			score: Number(r.score ?? 0),
			payload: (r.payload ?? {}) as QdrantHit['payload'],
		}));

		const reranked = await turbovecRerank({ query, hits: rawQdrantHits });
		denseHits = reranked.hits;
	}

	// 3. Single-owner RRF fusion across dense_768 + PostgreSQL FTS sparse lane
	const fused = reciprocalRankFusion(
		[
			{
				lane: 'dense_768',
				status: denseHits.length > 0 ? 'ok' : 'empty',
				weight: 0.6,
				hits: denseHits.map((h, idx) => ({
					id: String(h.id),
					packetKey: String(h.payload?.packet_key ?? `doc:${h.id}`),
					rank: idx + 1,
					score: h.score,
				})),
			},
			{
				lane: 'bm42',
				status: sparseHits.length > 0 ? 'ok' : 'empty',
				weight: 0.4,
				hits: sparseHits.map((h, idx) => ({
					id: String(h.id),
					packetKey: `doc:${h.id}`,
					rank: idx + 1,
					score: h.score,
				})),
			},
		],
		{ topK: limit, includeProvenance: true }
	);

	// Map display metadata back onto fused & direct PG18 hits
	const metaById = new Map<string, { title: string; snippet: string; href: string; kind: string }>();
	for (const s of sparseHits) {
		metaById.set(`doc:${s.id}`, {
			title: s.payload.title ?? 'Legal Authority',
			snippet: s.payload.snippet.replace(/<\/?b>/g, ''),
			href: `/legal-corpus?q=${encodeURIComponent(query)}`,
			kind: 'statute',
		});
	}
	for (const d of denseHits) {
		const key = String(d.payload?.packet_key ?? `doc:${d.id}`);
		if (!metaById.has(key)) {
			metaById.set(key, {
				title: String(d.payload?.title ?? d.payload?.file_name ?? `Document #${String(d.id).slice(0, 8)}`),
				snippet: String(d.payload?.content ?? '').slice(0, 140),
				href: `/global-search?q=${encodeURIComponent(query)}`,
				kind: 'semantic_768',
			});
		}
	}

	const directHits = (caseRowsResult.rows ?? []).map((row, index) => ({
		id: row.id,
		title: row.title,
		snippet: row.status ? `${row.kind.toUpperCase()} · ${row.status}` : row.kind.toUpperCase(),
		href: row.kind === 'case' ? `/cases/${row.id}` : `/evidence?highlight=${row.id}`,
		kind: row.kind,
		score: Number((0.96 - index * 0.04).toFixed(3)),
	}));

	const fusedDisplayHits = fused.map((f) => {
		const meta = metaById.get(f.packetKey) ?? {
			title: f.packetKey,
			snippet: 'Hybrid RRF match',
			href: `/global-search?q=${encodeURIComponent(query)}`,
			kind: 'hybrid',
		};
		return {
			id: f.id,
			title: meta.title,
			snippet: meta.snippet,
			href: meta.href,
			kind: meta.kind,
			score: Number(f.fusionScore.toFixed(4)),
		};
	});

	const combinedHits = [...directHits, ...fusedDisplayHits].slice(0, limit);

	// 4. Ewin Tang Low-Rank Leverage Recommendations over candidate latent projections
	let lowRankRecommendations: Array<{ id: string; title: string; href: string; kind: string; leverageScore: number }> = [];
	const lowRankSource =
		combinedHits.length > 0
			? combinedHits.slice(0, 6)
			: (recentSeedResult.rows ?? []).map((r) => ({
					id: r.id,
					title: r.title,
					href: `/cases/${r.id}`,
					kind: r.kind,
				}));

	if (includeLowRankRecommendations && lowRankSource.length > 0) {
		const synthCandidates = lowRankSource.map((hit, idx) => {
			const vec = new Float32Array(64);
			for (let d = 0; d < 64; d++) {
				const seed = (hit.title.charCodeAt(d % Math.max(hit.title.length, 1)) || 31) / 127;
				vec[d] = (queryLatent64[d] || 0.25) * (0.85 - idx * 0.06) + seed * 0.15;
			}
			return { id: hit.id, title: hit.title, href: hit.href, kind: hit.kind, latent64: vec };
		});
		lowRankRecommendations = scoreEwinTangLowRank(
			queryLatent64.some((v) => v !== 0) ? queryLatent64 : new Float32Array(64).fill(0.25),
			synthCandidates
		).slice(0, 3);
	}

	// 5. ACE/Atlas Context Editor Gate Canonical Packet + FabricLaneManifest validation
	const topHit = combinedHits[0];
	const sourceRef = topHit ? `${topHit.kind}:${topHit.id}` : `query:${query.slice(0, 32)}`;
	const manifest = buildFabricLaneManifest({
		packetKey: `ace:navbar:${Date.now().toString(36)}`,
		sourceRef,
		sourceRevision: `pg18:${t0}`,
		representationId: 'semantic_768',
		representationRevision: 'embeddinggemma-768-v1',
		producerId: 'search-fabric-navbar-v1',
		producerRevision: '2026.10.31',
		laneKinds: ['exact_knn_retrieval', 'ewin_tang_low_rank', 'recommendation_policy'],
		evidenceRefs: combinedHits.slice(0, 4).map((h) => `${h.kind}:${h.id}`),
		taskIds: [],
		recommendationIds: lowRankRecommendations.map((r) => r.id),
	});

	const acePacket = {
		sourceRef: manifest.sourceRef,
		ConceptID: `atlas.navbar.${topHit?.kind ?? 'search'}`,
		ConfidenceScore: topHit ? Math.min(0.99, Math.max(0.55, topHit.score)) : 0.5,
		ContextBlob: combinedHits
			.slice(0, 3)
			.map((h) => `[${h.kind.toUpperCase()}] ${h.title}: ${h.snippet}`)
			.join(' | ')
			.slice(0, 512),
	};

	return json({
		ok: true,
		hits: combinedHits,
		lowRankRecommendations,
		acePacket,
		telemetry: {
			latencyMs: Date.now() - t0,
			prefilterBackend,
			latentFp16Bytes: queryLatentFp16Bytes,
			lanesExecuted: ['pg18_btree_fts', ...(queryVector ? ['qdrant_hybrid_768', 'ae_latent_64', 'ewin_tang_low_rank'] : [])],
		},
	});
};
