/**
 * RRF Integration: Multi-Signal Ranking with Reciprocal Rank Fusion
 *
 * Combines BM25 (lexical), concept overlap, ANN (semantic), and Neo4j (graph)
 * signals via RRF to produce a unified ranked list of context hits.
 *
 * Formula: RRF(d) = Σ weight_i / (k + rank_i(d))
 * Default k=60 keeps early positions dominant while avoiding rank=1 singularity.
 */

import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { bm25SearchIndexed } from './bm25-search.js';
import { conceptOverlapSearch } from './concept-overlap-search.js';
import { combineViaRRF, type ContextHit, type RRFResult, type RetrievalLaneName } from './rrf-combiner.js';
import { extractQueryConceptsViaGemma } from './concept-extraction-tool.js';
import { queryNeoJsGraphSignal, queryNeoJsGraphSignalByNames } from './neo4j-graph-signal.js';
import { expandNeighbours, fetchAuthorityScores } from '$lib/server/search/neo4j-rerank.js';
import { turbovecSearch } from './turbovec-prefilter.js';
import { searchCodebaseAnn } from '$lib/server/search/qdrant-search.js';
import { buildVectorPayload } from '$lib/server/config/vector-config.js';
import { encode768to64 } from '$lib/server/gpu/encode-768-to-64.js';
import { toStableFileKey } from './subgraph-seed-neighborhood.js';

export interface RRFIntegrationOptions {
  k?: number; // RRF constant (default 60)
  weights?: Partial<Record<string, number>>;
  topK?: number; // results to return (default 20)
  minScore?: number; // filter results below this RRF score (default 0.001)
  deduplicateBy?: 'id' | 'text'; // default 'id'
}

export interface RRFIntegrationOutput {
  results: RRFResult[];
  breakdown: {
    bm25Count: number;
    conceptCount: number;
    qdrantCount: number;
    turbovecCount: number;
    neoCount: number;
  };
  durationMs: number;
  timings?: {
    bm25_ms: number;
    qdrant_ms: number;
    turbovec_ms: number;
    neo4j_ms: number;
    redis_ms: number;
    gemma4_ms: number;
    rrf_ms: number;
    pgvector_ms?: number;
    concept_overlap_ms?: number;
  };
}

/**
 * Query Qdrant for vector similarity results on atlas_packets collection.
 */
async function queryQdrantVectorSignal(
  query: string,
  embedding: number[] | null,
  topK: number,
  seedRefs: string[] = []
): Promise<Array<{ id: string; score: number; text?: string; metadata?: Record<string, unknown> }>> {
  if (!embedding) return [];

  try {
    const denseLimit = Math.max(topK * 2, topK);
    const collections = ['codebase_chunks_768'];
    const topologyVector = await encode768to64(new Float32Array(embedding));

    if (seedRefs.length > 0) {
      const cleanedSeeds = [...new Set(seedRefs.map((ref) => String(ref ?? '').trim()).filter(Boolean))];
      if (cleanedSeeds.length > 0) {
        const seededRes = await fetch(`${process.env.QDRANT_URL ?? 'http://127.0.0.1:6333'}/collections/codebase_chunks_768/points/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: buildVectorPayload('codebase_chunks_768', embedding),
            limit: denseLimit,
            score_threshold: 0.001,
            with_payload: true,
            filter: {
              should: [
                { key: 'source_ref', match: { any: cleanedSeeds } },
                { key: 'sourceRef', match: { any: cleanedSeeds } },
                { key: 'canonicalSourceRef', match: { any: cleanedSeeds } },
                { key: 'file_path', match: { any: cleanedSeeds } },
                { key: 'filePath', match: { any: cleanedSeeds } },
                { key: 'stable_key', match: { any: cleanedSeeds } },
                { key: 'packet_key', match: { any: cleanedSeeds } },
              ],
            },
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (seededRes.ok) {
          const seededData = await seededRes.json();
          const seeded = Array.isArray((seededData as { result?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }> }).result)
            ? ((seededData as { result: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }> }).result ?? [])
            : [];

          if (seeded.length > 0) {
            return seeded.map((r) => {
              const payload = (r.payload ?? {}) as Record<string, unknown>;
              return {
                id: String(r.id),
                score: Number(r.score ?? 0),
                text: String(payload.content ?? payload.summary ?? ''),
                metadata: {
                  packet_key: String(payload.packet_key ?? payload.packetKey ?? r.id ?? '').trim() || null,
                  source_ref: String(payload.source_ref ?? payload.sourceRef ?? payload.canonicalSourceRef ?? payload.file_path ?? payload.filePath ?? '').trim() || null,
                  feature_id: payload.feature_id ?? payload.featureId ?? null,
                  file_path: String(payload.file_path ?? payload.filePath ?? null) || null,
                  qdrant_point_id: String(r.id),
                  qdrant_collection: 'codebase_chunks_768',
                  som_cluster: payload.som_cluster ?? payload.somCluster ?? null,
                  som_bmu_row: payload.som_bmu_row ?? null,
                  som_bmu_col: payload.som_bmu_col ?? null,
                  centroid_id: payload.centroid_id ?? null,
                  cluster_id: payload.cluster_id ?? payload.clusterId ?? null,
                  community_id: payload.community_id ?? payload.communityId ?? null,
                },
              };
            });
          }
          return [];
        }
      }
    }

    const topologyRes = await fetch(`${process.env.QDRANT_URL ?? 'http://127.0.0.1:6333'}/collections/codebase_topology_64/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: buildVectorPayload('codebase_topology_64', Array.from(topologyVector)),
        limit: denseLimit,
        score_threshold: 0.001,
        with_payload: true,
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (topologyRes?.ok) {
      const topologyData = await topologyRes.json();
      const topologyHits = Array.isArray((topologyData as { result?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }> }).result)
        ? ((topologyData as { result: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }> }).result ?? [])
        : [];

      if (topologyHits.length > 0) {
        return topologyHits.map((r) => {
          const payload = (r.payload ?? {}) as Record<string, unknown>;
          return {
            id: String(r.id),
            score: Number(r.score ?? 0),
            text: String(payload.content ?? payload.summary ?? ''),
            metadata: {
              packet_key: String(payload.packet_key ?? payload.packetKey ?? r.id ?? '').trim() || null,
              source_ref: String(payload.source_ref ?? payload.sourceRef ?? payload.canonicalSourceRef ?? payload.file_path ?? payload.filePath ?? '').trim() || null,
              feature_id: payload.feature_id ?? payload.featureId ?? null,
              file_path: String(payload.file_path ?? payload.filePath ?? null) || null,
              qdrant_point_id: String(r.id),
              qdrant_collection: 'codebase_topology_64',
              som_cluster: payload.som_cluster ?? payload.somCluster ?? null,
              som_bmu_row: payload.som_bmu_row ?? null,
              som_bmu_col: payload.som_bmu_col ?? null,
              centroid_id: payload.centroid_id ?? null,
              cluster_id: payload.cluster_id ?? payload.clusterId ?? null,
              community_id: payload.community_id ?? payload.communityId ?? null,
            },
          };
        });
      }
    }

    const collectionResults = await Promise.allSettled(
      collections.map((collection) => searchCodebaseAnn(embedding, denseLimit, undefined, collection))
    );

    const mergedResults = new Map<string, { id: string; score: number; text?: string; metadata?: Record<string, unknown> }>();
    for (let i = 0; i < collectionResults.length; i++) {
      const collection = collections[i]!;
      const settled = collectionResults[i]!;
      if (settled.status !== 'fulfilled') continue;
      for (const r of settled.value) {
        const id = String(r.qdrant_id ?? r.stable_key ?? r.file_path ?? '');
        if (!id) continue;
        const current = mergedResults.get(id);
        const next = {
          id,
          score: r.semantic_score,
          text: String(r.content ?? ''),
          metadata: {
            packet_key: String(r.stable_key ?? r.qdrant_id ?? '').trim() || null,
            source_ref: String(r.file_path ?? '').trim() || null,
            feature_id: null,
            file_path: String(r.file_path ?? '').trim() || null,
            qdrant_point_id: String(r.qdrant_id ?? ''),
            qdrant_collection: collection,
            som_cluster: r.som_cluster ?? null,
            som_bmu_row: r.som_bmu_row ?? null,
            som_bmu_col: r.som_bmu_col ?? null,
            centroid_id: r.centroid_id ?? null,
            cluster_id: null,
            community_id: null,
          },
        };
        if (!current || next.score > current.score) mergedResults.set(id, next);
      }
    }

    if (mergedResults.size > 0) {
      return [...mergedResults.values()];
    }

    if (!seedRefs.length) return [];

    const cleanedSeeds = [...new Set(seedRefs.map((ref) => String(ref ?? '').trim()).filter(Boolean))];
    if (!cleanedSeeds.length) return [];

    const res = await fetch(`${process.env.QDRANT_URL ?? 'http://127.0.0.1:6333'}/collections/codebase_chunks_768/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: buildVectorPayload('codebase_chunks_768', embedding),
        limit: denseLimit,
        score_threshold: 0.001,
        with_payload: true,
        filter: {
          should: [
            { key: 'source_ref', match: { any: cleanedSeeds } },
            { key: 'sourceRef', match: { any: cleanedSeeds } },
            { key: 'canonicalSourceRef', match: { any: cleanedSeeds } },
            { key: 'file_path', match: { any: cleanedSeeds } },
            { key: 'filePath', match: { any: cleanedSeeds } },
            { key: 'stable_key', match: { any: cleanedSeeds } },
            { key: 'packet_key', match: { any: cleanedSeeds } },
          ],
        },
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const seeded = Array.isArray((data as { result?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }> }).result)
      ? ((data as { result: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }> }).result ?? [])
      : [];

    return seeded.map((r) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>;
      return {
        id: String(r.id),
        score: Number(r.score ?? 0),
        text: String(payload.content ?? payload.summary ?? ''),
        metadata: {
          packet_key: String(payload.packet_key ?? payload.packetKey ?? r.id ?? '').trim() || null,
          source_ref: String(payload.source_ref ?? payload.sourceRef ?? payload.canonicalSourceRef ?? payload.file_path ?? payload.filePath ?? '').trim() || null,
          feature_id: payload.feature_id ?? payload.featureId ?? null,
          file_path: String(payload.file_path ?? payload.filePath ?? null) || null,
          qdrant_point_id: String(r.id),
          qdrant_collection: 'codebase_chunks_768',
          som_cluster: payload.som_cluster ?? payload.somCluster ?? null,
          som_bmu_row: payload.som_bmu_row ?? null,
          som_bmu_col: payload.som_bmu_col ?? null,
          centroid_id: payload.centroid_id ?? null,
          cluster_id: payload.cluster_id ?? payload.clusterId ?? null,
          community_id: payload.community_id ?? payload.communityId ?? null,
        },
      };
    });
  } catch (err) {
    console.error('Qdrant search failed:', err);
    return [];
  }
}

function deriveGraphConceptSeeds(query: string, extracted: Array<{ name: string; confidence: number }>): string[] {
  const extractedNames = extracted
    .map((concept) => concept.name.trim())
    .filter(Boolean);

  if (extractedNames.length > 0) {
    return [...new Set(extractedNames.map((name) => name.toLowerCase()))].slice(0, 10);
  }

  const rawTerms = query
    .toLowerCase()
    .split(/[^a-z0-9_/-]+/g)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4);

  const stopWords = new Set([
    'find',
    'show',
    'what',
    'when',
    'where',
    'how',
    'does',
    'this',
    'that',
    'with',
    'from',
    'into',
    'next',
    'then',
    'lane',
    'open',
    'done',
  ]);

  return [...new Set(rawTerms.filter((term) => !stopWords.has(term)))].slice(0, 10);
}

async function queryNeo4jFileGraphSignal(seedRefs: string[], topK: number): Promise<Array<{
  id: string;
  score: number;
  text?: string;
  metadata?: Record<string, unknown>;
}>> {
  const normalizedSeeds = [...new Set(
    seedRefs
      .flatMap((ref) => {
        const raw = String(ref ?? '').trim();
        return raw ? [raw, toStableFileKey(raw)] : [];
      })
      .filter((ref) => ref.length > 0),
  )];

  if (!normalizedSeeds.length) return [];

  const expanded = await Promise.all(
    normalizedSeeds.slice(0, topK).map((seed) => expandNeighbours(seed, 1).catch(() => [])),
  );
  const neighborKeys = [...new Set(expanded.flat().map((key) => String(key ?? '').trim()).filter(Boolean))].filter(
    (key) => !normalizedSeeds.includes(key),
  );

  if (!neighborKeys.length) return [];

  const authority = await fetchAuthorityScores(neighborKeys).catch(() => ({}));

  return neighborKeys
    .map((id) => {
      const pagerank = authority[id]?.pagerank ?? 0;
      return {
        id,
        score: Math.min(1, 0.1 + Math.max(0, pagerank)),
        text: id.replace(/^file:/, ''),
        metadata: {
          graph_seed_mode: 'file_stable_key',
          pagerank,
        },
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, topK);
}

async function loadFallbackGraphSeedRefs(pool: Pool, limit: number): Promise<string[]> {
  try {
    const { rows } = await pool.query<{
      source_ref: string | null;
      rel_path: string | null;
    }>(
      `
        select source_ref, rel_path
        from parent_atlas_documents
        where source_ref is not null
        order by updated_at desc nulls last, id desc
        limit $1
      `,
      [Math.max(1, Math.min(limit, 10))],
    );

    return [...new Set(
      rows.flatMap((row) => [row.source_ref, row.rel_path].map((value) => String(value ?? '').trim())).filter(Boolean),
    )];
  } catch {
    return [];
  }
}


/**
 * Run multi-signal RRF ranking combining BM25, concept overlap, ANN, and Neo4j.
 *
 * Workflow:
 * 1. Generate embedding once for vector lanes
 * 2. Run BM25 on atlas_packets.summary (fast, lexical)
 * 3. Run concept overlap on atlas_packets.concept_ids (fast, exact match)
 * 4. Run Qdrant ANN search (fast, dense vector)
 * 5. Run Neo4j graph queries (fast, precomputed relationships)
 * 6. Call combineViaRRF to merge all signals
 * 7. Filter by minScore and return top-K results
 */
export async function multiLaneRetrievalWithRRF(
  query: string,
  pool: Pool,
  opts: RRFIntegrationOptions = {}
): Promise<RRFIntegrationOutput> {
  const t0 = Date.now();
  const {
    k = 60,
    topK = 20,
    minScore = 0.001,
    deduplicateBy = 'id',
    weights = {},
  } = opts;

  const defaultWeights = {
    postgres_trigram: 1.0,
    concept_overlap: 1.2,
    qdrant_vector: 1.0,
    turbovec_ann: 0.9,
    neo4j_graph: 0.8,
  };

  const finalWeights = { ...defaultWeights, ...weights };

  try {
    let pgvectorMs = 0;
    let gemma4Ms = 0;
    let pgBm25Ms = 0;
    let conceptOverlapMs = 0;
    let qdrantMs = 0;
    let turbovecMs = 0;
    let neo4jMs = 0;

    // Generate embedding once for all vector lanes
    const tEmbedStart = performance.now();
    const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
    const embedding = await generateSingleEmbedding(query).catch(() => null);
    pgvectorMs = performance.now() - tEmbedStart;

    // Extract concepts from query via Gemma4
    const tGemmaStart = performance.now();
    const conceptExtractionResult = await extractQueryConceptsViaGemma({
      query,
      maxConcepts: 5,
      minConfidence: 0.7,
    }).catch(() => ({ conceptIds: [], extracted: [], durationMs: 0 }));
    gemma4Ms = performance.now() - tGemmaStart;

    const graphConceptSeeds = deriveGraphConceptSeeds(query, conceptExtractionResult.extracted);

    // Run lexical + concept signals first so dense lanes can seed from them
    const bm25Promise = (async () => {
      const start = performance.now();
      const res = await bm25SearchIndexed(query, topK);
      pgBm25Ms = performance.now() - start;
      return res;
    })();

    const conceptPromise = (async () => {
      const start = performance.now();
      const res = await conceptOverlapSearch(conceptExtractionResult.conceptIds, topK);
      conceptOverlapMs = performance.now() - start;
      return res;
    })();

    const [bm25Results, conceptResults] = await Promise.allSettled([
      bm25Promise,
      conceptPromise,
    ]);

    const seedRefs =
      bm25Results.status === 'fulfilled'
        ? bm25Results.value.flatMap((hit) => [hit.file_path, hit.stable_key])
        : [];
    const fallbackSeedRefs = seedRefs.length > 0 ? [] : await loadFallbackGraphSeedRefs(pool, topK);
    const graphSeedRefs = seedRefs.length > 0 ? seedRefs : fallbackSeedRefs;
    const qdrantSeedRefs = graphSeedRefs;

    // Run dense/graph signals in parallel
    const qdrantPromise = (async () => {
      const start = performance.now();
      const res = await queryQdrantVectorSignal(query, embedding, topK, qdrantSeedRefs);
      qdrantMs = performance.now() - start;
      return res;
    })();

    const turbovecPromise = (async () => {
      const start = performance.now();
      const res = embedding ? await turbovecSearch(embedding, { topK: topK * 2, timeoutMs: 300 }) : { candidates: [], backend: 'offline', durationMs: 0 };
      turbovecMs = performance.now() - start;
      return res;
    })();

    const neoPromise = (async () => {
      const start = performance.now();
      const res = await Promise.allSettled([
        conceptExtractionResult.conceptIds.length > 0
          ? queryNeoJsGraphSignal({ conceptIds: conceptExtractionResult.conceptIds, topK }).then((r) =>
              r.map((hit) => ({
                id: hit.id,
                score: hit.score,
                text: hit.text,
                metadata: { graph_seed_mode: 'concept_id' },
              }))
            )
          : Promise.resolve([]),
        graphConceptSeeds.length > 0
          ? queryNeoJsGraphSignalByNames(graphConceptSeeds, topK).then((r) =>
              r.map((hit) => ({
                id: hit.id,
                score: hit.score,
                text: hit.text,
                metadata: { graph_seed_mode: 'concept_name' },
              }))
            )
          : Promise.resolve([]),
        graphSeedRefs.length > 0
          ? queryNeo4jFileGraphSignal(graphSeedRefs, topK).then((r) =>
              r.map((hit) => ({
                id: hit.id,
                score: hit.score,
                text: hit.text,
                metadata: { ...(hit.metadata ?? {}), graph_seed_mode: 'file_stable_key' },
              }))
            )
          : Promise.resolve([]),
      ]).then((results) =>
        results.flatMap((settled) => (settled.status === 'fulfilled' ? settled.value : []))
      );
      neo4jMs = performance.now() - start;
      return res;
    })();

    const [qdrantResults, turbovecResults, neoResults] = await Promise.allSettled([
      qdrantPromise,
      turbovecPromise,
      neoPromise,
    ]);

    // Convert results to ContextHit[] format for RRF
    const bm25Hits: ContextHit[] =
      bm25Results.status === 'fulfilled'
        ? bm25Results.value.map((hit) => ({
            id: hit.id,
            source: 'postgres_trigram' as const,
            score: hit.similarity,
            text: hit.summary,
            metadata: {
              stable_key: hit.stable_key,
              file_path: hit.file_path,
              source_ref: hit.file_path,
              packet_key: hit.stable_key,
            },
          }))
        : [];

    const conceptHits: ContextHit[] =
      conceptResults.status === 'fulfilled'
        ? conceptResults.value.map((hit) => ({
            id: hit.id,
            source: 'concept_overlap' as const,
            score: hit.overlapScore,
          }))
        : [];

    const qdrantHits: ContextHit[] =
      qdrantResults.status === 'fulfilled'
        ? qdrantResults.value.map((hit) => ({
            id: hit.id,
            source: 'qdrant_vector' as const,
            score: hit.score,
            text: hit.text,
            metadata: hit.metadata,
          }))
        : [];

    const turbovecHits: ContextHit[] =
      turbovecResults.status === 'fulfilled'
        ? turbovecResults.value.candidates.map((hit) => ({
            id: hit.id,
            source: 'turbovec_ann' as const,
            score: hit.score,
            text: hit.id,
            metadata: { turbovec_candidate_id: hit.id, turbovec_cluster: hit.cluster },
          }))
        : [];

    const neoHits: ContextHit[] =
      neoResults.status === 'fulfilled'
        ? neoResults.value.map((hit) => ({
            id: hit.id,
            source: 'neo4j_graph' as const,
            score: hit.score,
            text: hit.text,
            metadata: { neo4j_paths: hit.paths ?? 0 },
          }))
        : [];

    const tRerankStart = performance.now();
    // Combine via RRF
    const lanes = [bm25Hits, conceptHits, qdrantHits, turbovecHits, neoHits];
    const laneNames: RetrievalLaneName[] = ['postgres_trigram', 'concept_overlap', 'qdrant_vector', 'turbovec_ann', 'neo4j_graph'];

    const rrfResults = combineViaRRF(lanes, laneNames, {
      k,
      weights: finalWeights,
      deduplicateBy,
    });

    // Filter and slice
    const filtered = rrfResults.filter((r) => r.combinedScore >= minScore).slice(0, topK);
    const rerankMs = performance.now() - tRerankStart;

    return {
      results: filtered,
      breakdown: {
        bm25Count: bm25Hits.length,
        conceptCount: conceptHits.length,
        qdrantCount: qdrantHits.length,
        turbovecCount: turbovecHits.length,
        neoCount: neoHits.length,
      },
      durationMs: Date.now() - t0,
      timings: {
        bm25_ms: pgBm25Ms,
        qdrant_ms: qdrantMs,
        turbovec_ms: turbovecMs,
        neo4j_ms: neo4jMs,
        redis_ms: 0,
        gemma4_ms: gemma4Ms,
        rrf_ms: rerankMs,
        pgvector_ms: pgvectorMs,
        concept_overlap_ms: conceptOverlapMs,
      },
    };
  } catch (error) {
    console.error('RRF integration error:', error);
    return {
      results: [],
      breakdown: { bm25Count: 0, conceptCount: 0, qdrantCount: 0, turbovecCount: 0, neoCount: 0 },
      durationMs: Date.now() - t0,
      timings: {
        bm25_ms: 0,
        qdrant_ms: 0,
        turbovec_ms: 0,
        neo4j_ms: 0,
        redis_ms: 0,
        gemma4_ms: 0,
        rrf_ms: 0,
        pgvector_ms: 0,
        concept_overlap_ms: 0,
      },
    };
  }
}

/**
 * Compute information retrieval metrics for RRF evaluation.
 *
 * DCG@K: Σ_{i=1}^{K} (rel_i / log2(i+1)) where rel_i ∈ [0,1]
 * NDCG@K: DCG@K / ideal_DCG@K
 * MRR@K: 1 / rank of first relevant result
 */
export function computeMetrics(
  results: RRFResult[],
  relevanceLabels: Record<string, number>, // id → relevance [0,1]
  k: number = 10
): {
  dcg: number;
  ndcg: number;
  mrr: number;
  recall: number;
} {
  const topK = results.slice(0, k);
  let dcg = 0;
  let mrrFound = false;
  let mrrValue = 0;
  let relevantCount = 0;

  for (let i = 0; i < topK.length; i++) {
    const relevance = relevanceLabels[topK[i].id] ?? 0;
    dcg += relevance / Math.log2(i + 2);

    if (!mrrFound && relevance > 0) {
      mrrValue = 1 / (i + 1);
      mrrFound = true;
    }

    if (relevance > 0) relevantCount++;
  }

  const totalRelevant = Object.values(relevanceLabels).filter((rel) => rel > 0).length;
  const recall = totalRelevant > 0 ? relevantCount / totalRelevant : 0;

  // Ideal DCG: sort labels descending, compute DCG
  const sortedRelevance = Object.values(relevanceLabels)
    .sort((a, b) => b - a)
    .slice(0, k);

  let idealDcg = 0;
  for (let i = 0; i < sortedRelevance.length; i++) {
    idealDcg += sortedRelevance[i] / Math.log2(i + 2);
  }

  const ndcg = idealDcg > 0 ? dcg / idealDcg : 0;

  return {
    dcg: Math.round(dcg * 1000) / 1000,
    ndcg: Math.round(ndcg * 1000) / 1000,
    mrr: mrrFound ? Math.round(mrrValue * 1000) / 1000 : 0,
    recall: Math.round(recall * 1000) / 1000,
  };
}
