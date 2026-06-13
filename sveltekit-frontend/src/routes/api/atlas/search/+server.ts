/**
 * POST /api/atlas/search
 *
 * Atlas packet ANN cascade — 6-stage retrieval + ranking pipeline:
 *
 *   Stage 0: Qdrant payload pre-filter (feature_id + community_id + domain_class)
 *            → narrows search space from ~54k to ~4k candidates
 *   Stage 1: ANN vector search (EmbeddingGemma 768-dim) → top 100
 *   Stage 2: Neo4j contextual expansion via USED_CONCEPT edges → ~150
 *   Stage 3: Feature generation + RRF fusion
 *            (cosine, BM25, TurboVec, concept_overlap, pagerank, reward, freshness)
 *   Stage 4: XGBoost tabular reranker → top 20 (supervised, fast, explainable)
 *            Falls back to Gemma4 cross-encoder if sidecar offline.
 *
 *   Stage 5 (not in this route): PyTorch policy network → next action
 *            Receives the Stage 4 ranked list and current agent state.
 *            Actions: repair_file, rerank, call_tool, rollback, run_tests,
 *                     ask_gemma4, expand_graph
 *            SOM 20×20 cell routing is used HERE (topology, not retrieval):
 *              EmbeddingGemma 768 → AE 64 → SOM 20×20 → som_row/col/index
 *              stored in atlas_packets.payload + Qdrant payload.
 *
 *   Stage 6 (not in this route): Gemma4 → patch / explanation / tool call
 *
 * Response:
 *   {
 *     results: AtlasPacket[]     — ranked atlas packets
 *     cascade_stats: object      — per-stage counts and latency
 *     embed_ok: boolean
 *     source: 'cascade' | 'fallback'
 *   }
 */

import { json }    from '@sveltejs/kit';
import { z }       from 'zod';
import { ENV }     from '$lib/server/env.server.js';
import type { RequestHandler } from './$types';

// ── Request schema ─────────────────────────────────────────────────────────────
const SearchSchema = z.object({
  query:        z.string().min(1).max(4000),
  top_k:        z.number().int().min(1).max(100).optional().default(20),
  feature_id:   z.string().optional(),   // pre-filter hint
  community_id: z.string().optional(),   // pre-filter hint
  domain_class: z.string().optional(),   // pre-filter hint
  skip_neo4j:   z.boolean().optional().default(false),
  skip_rerank:  z.boolean().optional().default(false),
});

// ── Types ──────────────────────────────────────────────────────────────────────
interface AtlasPacket {
  packet_key:          string;
  source_ref:          string;
  feature_id:          string | null;
  community_id:        string | null;
  domain_class:        string | null;
  concept_ids:         string[];
  summary:             string | null;
  reward_prior:        number;
  community_confidence:number | null;
  ann_turbovec_score:  number;
  som_cache_hit:       number;
  created_at:          string | null;
  cascade_score:       number;
  stage_scores: {
    cosine:          number;
    concept_overlap: number;
    same_feature:    number;
    pagerank:        number;
    reward:          number;
    freshness:       number;
    domain_match:    number;
  };
  qdrant_id?: string | number;
}

interface QdrantHit {
  id:      string | number;
  score:   number;
  payload?: Record<string, unknown>;
}

// ── Config ─────────────────────────────────────────────────────────────────────
const QDRANT_URL  = ENV.QDRANT_URL || 'http://localhost:6333';
const COLLECTION  = 'codebase_chunks_768';

const NEO4J_URI   = (process.env.NEO4J_URI  ?? process.env.NEO4J_URL  ?? 'bolt://localhost:7687');
const NEO4J_USER  = (process.env.NEO4J_USER ?? 'neo4j');
const NEO4J_PASS  = (process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123');

// RRF weights matching Phase 4B canonical weights
const RRF_K = 60;
const WEIGHTS = { cosine: 1.0, concept: 0.25, reward: 0.15, pagerank: 0.10, freshness: 0.05 };

// ── Helpers ────────────────────────────────────────────────────────────────────

function freshnessScore(createdAt: unknown): number {
  if (!createdAt) return 0.5;
  const ageDays = (Date.now() - new Date(String(createdAt)).getTime()) / 86_400_000;
  return Math.max(0.1, 1.0 - (ageDays / 365) * 0.9);
}

function jaccard(a: string[], b: string[]): number {
  if (!a?.length || !b?.length) return 0;
  const sa = new Set(a.map(s => s.toLowerCase()));
  const sb = new Set(b.map(s => s.toLowerCase()));
  const intersection = [...sa].filter(x => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : intersection / union;
}

function rrfScore(ranks: number[]): number {
  return ranks.reduce((s, r) => s + 1 / (RRF_K + r), 0);
}

// ── Stage 0: Embed query ───────────────────────────────────────────────────────

async function embedQuery(query: string): Promise<number[] | null> {
  const _raw = (process.env.OLLAMA_HOST ?? '127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
  const ollamaBase = _raw.startsWith('http') ? _raw : `http://${_raw.includes(':') ? _raw : `${_raw}:11434`}`;

  for (const model of ['nomic-embed-text:latest', 'embeddinggemma:latest']) {
    try {
      const res = await fetch(`${ollamaBase}/api/embeddings`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model, prompt: query.slice(0, 1024) }),
        signal:  AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const d = await res.json() as { embedding?: number[] };
      if (Array.isArray(d.embedding) && d.embedding.length === 768) return d.embedding;
    } catch { /* try next */ }
  }
  return null;
}

// ── Stage 1: Qdrant ANN with optional pre-filter ───────────────────────────────

async function qdrantSearch(
  vector: number[],
  {
    topK,
    featureId,
    communityId,
    domainClass,
  }: { topK: number; featureId?: string; communityId?: string; domainClass?: string }
): Promise<QdrantHit[]> {
  // Build pre-filter from provided hints (Stage 0 narrowing)
  const must: unknown[] = [];
  if (featureId)   must.push({ key: 'feature_id',   match: { value: featureId } });
  if (communityId) must.push({ key: 'community_id', match: { value: communityId } });
  if (domainClass) must.push({ key: 'domain_class', match: { value: domainClass } });

  const body: Record<string, unknown> = {
    vector:       { name: 'content', vector },
    limit:        topK * 5, // oversample for downstream reranking
    with_payload: true,
  };
  if (must.length > 0) body.filter = { must };

  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const d = await res.json() as { result?: QdrantHit[] };
    return d.result ?? [];
  } catch {
    return [];
  }
}

// ── Stage 2: Neo4j concept expansion ──────────────────────────────────────────

async function neo4jExpand(
  packetKeys: string[],
  conceptIds: string[],
  limit: number
): Promise<string[]> {
  try {
    // Lazy-import neo4j-driver to avoid SSR bundling issues
    const neo4j = await import('neo4j-driver');
    const driver = neo4j.default.driver(
      NEO4J_URI,
      neo4j.default.auth.basic(NEO4J_USER, NEO4J_PASS),
    );
    const session = driver.session({ defaultAccessMode: neo4j.default.session.READ });

    try {
      // Expand via USED_CONCEPT edges: find packets sharing concepts with the top hits
      const result = await session.run(
        `
        MATCH (p:Packet)-[:USED_CONCEPT]->(c:Concept)
        WHERE c.concept_id IN $conceptIds
          AND NOT p.packet_key IN $existingKeys
        RETURN DISTINCT p.packet_key AS packet_key, count(c) AS shared_concepts
        ORDER BY shared_concepts DESC
        LIMIT $limit
        `,
        { conceptIds, existingKeys: packetKeys, limit }
      );
      return result.records.map(r => r.get('packet_key') as string).filter(Boolean);
    } finally {
      await session.close();
      await driver.close();
    }
  } catch {
    return []; // Neo4j offline → skip expansion gracefully
  }
}

// ── Stage 3: Feature generation + RRF fusion ───────────────────────────────────

function buildCascadeScore(
  hit: QdrantHit,
  queryConceptIds: string[],
  karpathyScores: Map<string, number>,
  cosineRank: number,
  conceptRank: number,
): { score: number; stage_scores: AtlasPacket['stage_scores'] } {
  const p = hit.payload ?? {};

  const cosine         = hit.score;
  const packetConcepts = (p.concept_ids as string[] | undefined) ?? [];
  const conceptOverlap = jaccard(queryConceptIds, packetConcepts);
  const sameFeature    = queryConceptIds.includes(String(p.feature_id ?? '')) ? 1 : 0;
  const pagerank       = karpathyScores.get(String(p.source_ref ?? '')) ?? 0;
  const rewardNorm     = Math.min(1.0, Number(p.reward_prior ?? 0) / 10);
  const freshness      = freshnessScore(p.created_at);
  const domainMatch    = queryConceptIds.some(c =>
    String(p.domain_class ?? '').includes(c) || String(p.ontology_tags ?? '').includes(c)
  ) ? 1 : 0;

  // RRF + weighted blend
  const rrfBase   = WEIGHTS.cosine   * (1 / (RRF_K + cosineRank))
                  + WEIGHTS.concept  * (1 / (RRF_K + conceptRank));
  const boostMul  = 1
                  + WEIGHTS.reward   * rewardNorm
                  + WEIGHTS.pagerank * Math.min(pagerank / 10, 1)
                  + WEIGHTS.freshness * freshness;

  const score = (rrfBase + conceptOverlap * 0.03 + sameFeature * 0.05 + domainMatch * 0.02) * boostMul;

  return {
    score,
    stage_scores: {
      cosine, concept_overlap: conceptOverlap, same_feature: sameFeature,
      pagerank: Math.round(pagerank * 1000) / 1000,
      reward: rewardNorm, freshness: Math.round(freshness * 1000) / 1000,
      domain_match: domainMatch,
    },
  };
}

// ── Stage 4a: XGBoost sidecar scoring ─────────────────────────────────────────

async function xgboostRerank(
  candidates: AtlasPacket[],
  queryConceptIds: string[],
): Promise<{ scored: Array<{ key: string; score: number }>; model: string } | null> {
  const sidecarUrl = process.env.XGBOOST_SIDECAR_URL ?? 'http://127.0.0.1:8765';

  try {
    // Health check first (fast — avoids hanging on offline sidecar)
    const health = await fetch(`${sidecarUrl}/health`, { signal: AbortSignal.timeout(1_000) });
    if (!health.ok) return null;

    const n = candidates.length;
    const rows = candidates.slice(0, 40).map(p => {
      const ageDays = p.created_at
        ? (Date.now() - new Date(p.created_at).getTime()) / 86_400_000 : 180;
      return {
        cosine_score:       p.stage_scores.cosine,
        bm25_rank_norm:     0,   // not available at runtime — rely on cosine
        ann_turbovec_score: p.ann_turbovec_score,
        concept_overlap:    p.stage_scores.concept_overlap,
        same_feature:       p.stage_scores.same_feature,
        community_conf:     p.community_confidence ?? 0,
        reward_prior:       p.reward_prior,
        domain_class_match: p.stage_scores.domain_match,
        freshness_score:    p.stage_scores.freshness,
        pagerank_score:     p.stage_scores.pagerank,
        som_cache_hit:      p.som_cache_hit,
        provenance_git_age: Math.min(1.0, ageDays / 365),
        packet_hit_count:   0,  // not tracked at runtime
        n_retrieved:        n,
        n_concepts:         p.concept_ids.length,
        trace_score:        p.cascade_score,
      };
    });

    const res = await fetch(`${sidecarUrl}/score`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rows }),
      signal:  AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;

    const d = await res.json() as { scores?: number[]; model?: string };
    const scores = d.scores;
    if (!Array.isArray(scores) || scores.length !== rows.length) return null;

    return {
      scored: candidates.slice(0, 40).map((p, i) => ({ key: p.packet_key, score: scores[i] ?? 0.5 })),
      model: d.model ?? 'sidecar',
    };
  } catch {
    return null; // Sidecar offline → fallback to Gemma4 or cascade-only
  }
}

// ── Stage 4b: Optional Gemma4 cross-encoder rerank (via llama-server) ──────────

async function crossEncoderRerank(
  query: string,
  candidates: AtlasPacket[],
  topK: number,
): Promise<AtlasPacket[]> {
  const llamaBase = process.env.LLAMA_BASE_URL ?? process.env.LLAMA_URL ?? 'http://127.0.0.1:8090';

  try {
    // Score each candidate as a query-document pair via Gemma4 chat completion
    // We use a lightweight scoring prompt; stream: true required for Gemma4
    const scored: Array<{ packet: AtlasPacket; ce_score: number }> = [];

    // Batch: score top 40 candidates only (cross-encoder is expensive)
    const toScore = candidates.slice(0, 40);

    await Promise.allSettled(toScore.map(async (packet) => {
      const doc = [
        packet.domain_class,
        packet.feature_id,
        packet.summary?.slice(0, 200),
        packet.concept_ids.slice(0, 4).join(' '),
      ].filter(Boolean).join(' | ');

      try {
        const res = await fetch(`${llamaBase}/v1/chat/completions`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            model:       'gemma4-legal-iq4xs-direct.gguf',
            messages: [
              { role: 'system', content: 'Rate relevance 0-10. Reply with only a number.' },
              { role: 'user',   content: `Query: ${query.slice(0, 300)}\nDocument: ${doc}` },
            ],
            max_tokens:  4,
            temperature: 0,
            stream:      false,
          }),
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) { scored.push({ packet, ce_score: 0.5 }); return; }
        const d = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        const raw = d.choices?.[0]?.message?.content?.trim() ?? '';
        const num = parseFloat(raw);
        scored.push({ packet, ce_score: isFinite(num) ? num / 10 : 0.5 });
      } catch {
        scored.push({ packet, ce_score: 0.5 });
      }
    }));

    // Merge cross-encoder scores back into cascade_score (weight: 0.3)
    const scoreMap = new Map(scored.map(s => [s.packet.packet_key, s.ce_score]));
    return candidates
      .map(p => ({
        ...p,
        cascade_score: p.cascade_score * 0.7 + (scoreMap.get(p.packet_key) ?? 0.5) * 0.3,
      }))
      .sort((a, b) => b.cascade_score - a.cascade_score)
      .slice(0, topK);
  } catch {
    return candidates.slice(0, topK);
  }
}

// ── Route handler ──────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request }) => {
  const body   = await request.json().catch(() => null);
  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { query, top_k, feature_id, community_id, domain_class, skip_neo4j, skip_rerank } = parsed.data;
  const t0 = Date.now();

  const stats: Record<string, number | string> = {};

  // ── Stage 0+1: Embed + Qdrant ANN ──────────────────────────────────────────
  const vector = await embedQuery(query);
  stats.embed_ms = Date.now() - t0;

  if (!vector) {
    return json({
      results:      [],
      cascade_stats: { ...stats, error: 'embed_failed' },
      embed_ok:     false,
      source:       'fallback',
    });
  }

  const t1   = Date.now();
  const hits = await qdrantSearch(vector, { topK: top_k * 5, featureId: feature_id, communityId: community_id, domainClass: domain_class });
  stats.qdrant_ms   = Date.now() - t1;
  stats.qdrant_hits = hits.length;

  if (hits.length === 0) {
    return json({
      results:      [],
      cascade_stats: { ...stats, error: 'no_qdrant_hits' },
      embed_ok:     true,
      source:       'fallback',
    });
  }

  // ── Stage 2: Neo4j concept expansion ───────────────────────────────────────
  const topPacketKeys  = hits.slice(0, 20).map(h => String(h.payload?.packet_key ?? ''));
  const topConceptIds  = Array.from(new Set(
    hits.slice(0, 20).flatMap(h => (h.payload?.concept_ids as string[] | undefined) ?? [])
  )).slice(0, 10);

  let expandedKeys: string[] = [];
  if (!skip_neo4j && topConceptIds.length > 0) {
    const t2 = Date.now();
    expandedKeys = await neo4jExpand(topPacketKeys, topConceptIds, 50);
    stats.neo4j_ms       = Date.now() - t2;
    stats.neo4j_expanded = expandedKeys.length;
  }

  // ── Karpathy pagerank from Redis ────────────────────────────────────────────
  const karpathyScores = new Map<string, number>();
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const raw   = await redis.hgetall('gpu:karpathy:scores');
    for (const [ref, val] of Object.entries(raw ?? {})) {
      try {
        const parsed = JSON.parse(val as string) as { blend?: number };
        karpathyScores.set(ref, parsed.blend ?? 0);
      } catch { /* skip */ }
    }
  } catch { /* Redis offline — pagerank 0 */ }

  // ── Stage 3: Feature generation + RRF ──────────────────────────────────────
  // Sort hits by concept overlap for concept-rank signal
  const conceptRanked = [...hits].sort((a, b) => {
    const oa = jaccard(topConceptIds, (a.payload?.concept_ids as string[] | undefined) ?? []);
    const ob = jaccard(topConceptIds, (b.payload?.concept_ids as string[] | undefined) ?? []);
    return ob - oa;
  });
  const conceptRankMap = new Map(conceptRanked.map((h, i) => [h.id, i]));

  const packets: AtlasPacket[] = hits.map((hit, cosineRank) => {
    const p = hit.payload ?? {};
    const conceptRank = conceptRankMap.get(hit.id) ?? cosineRank;
    const { score, stage_scores } = buildCascadeScore(hit, topConceptIds, karpathyScores, cosineRank, conceptRank);

    return {
      packet_key:           String(p.packet_key   ?? ''),
      source_ref:           String(p.source_ref    ?? ''),
      feature_id:           (p.feature_id   as string | null) ?? null,
      community_id:         (p.community_id as string | null) ?? null,
      domain_class:         (p.domain_class as string | null) ?? null,
      concept_ids:          (p.concept_ids  as string[] | undefined) ?? [],
      summary:              (p.summary      as string | null) ?? null,
      reward_prior:         Number(p.reward_prior          ?? 0),
      community_confidence: p.community_confidence !== undefined ? Number(p.community_confidence) : null,
      ann_turbovec_score:   Number(p.ann_turbovec_score    ?? 0),
      som_cache_hit:        p.som_cache_hit ? 1 : 0,
      created_at:           (p.created_at as string | null) ?? null,
      cascade_score: score,
      stage_scores,
      qdrant_id: hit.id,
    };
  });

  // Sort by cascade_score, dedupe by packet_key
  const seen = new Set<string>();
  const deduped = packets
    .sort((a, b) => b.cascade_score - a.cascade_score)
    .filter(p => { if (!p.packet_key || seen.has(p.packet_key)) return false; seen.add(p.packet_key); return true; });

  stats.stage3_candidates = deduped.length;

  // ── Stage 4: XGBoost sidecar rerank → Gemma4 fallback → cascade-only ──────────
  let final = deduped;
  if (!skip_rerank && deduped.length > top_k) {
    const t4 = Date.now();

    // Try XGBoost sidecar first (deterministic, fast ~5ms)
    const xgbResult = await xgboostRerank(deduped, topConceptIds);
    if (xgbResult) {
      const xgbMap = new Map(xgbResult.scored.map(s => [s.key, s.score]));
      final = deduped
        .map(p => ({
          ...p,
          cascade_score: p.cascade_score * 0.70 + (xgbMap.get(p.packet_key) ?? 0.5) * 0.30,
        }))
        .sort((a, b) => b.cascade_score - a.cascade_score)
        .slice(0, top_k);
      stats.rerank_source = xgbResult.model;
    } else {
      // Fallback: Gemma4 cross-encoder (requires llama-server running)
      final = await crossEncoderRerank(query, deduped, top_k);
      stats.rerank_source = 'gemma4';
    }

    stats.rerank_ms = Date.now() - t4;
  } else {
    final = deduped.slice(0, top_k);
    stats.rerank_source = 'cascade_only';
  }

  stats.total_ms    = Date.now() - t0;
  stats.final_count = final.length;

  return json({
    results:       final,
    cascade_stats: stats,
    embed_ok:      true,
    source:        'cascade',
    top_k,
  });
};
