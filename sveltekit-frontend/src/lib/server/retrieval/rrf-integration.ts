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
import { queryNeoJsGraphSignal } from './neo4j-graph-signal.js';
import { turbovecSearch } from './turbovec-prefilter.js';

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
}

/**
 * Query Qdrant for vector similarity results on atlas_packets collection.
 */
async function queryQdrantVectorSignal(
  query: string,
  embedding: number[] | null,
  topK: number
): Promise<Array<{ id: string; score: number; text?: string; metadata?: Record<string, unknown> }>> {
  if (!embedding) return [];

  try {
    const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
    const response = await qdrant._denseSearch({
      query,
      queryEmbedding: embedding,
      collection: 'codebase_chunks_768',
      limit: topK,
      scoreThreshold: 0.001,
    });

    return response.results.map((r) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>;
      const packetKey = String(payload.packet_key ?? payload.packetKey ?? payload.qdrant_payload_key ?? r.id ?? '').trim();
      const sourceRef = String(payload.source_ref ?? payload.sourceRef ?? payload.canonicalSourceRef ?? payload.file_path ?? payload.filePath ?? '').trim();
      const featureId = String(payload.feature_id ?? payload.featureId ?? '').trim();
      return {
        id: String(r.id),
        score: r.score,
        text: String(payload.content ?? payload.summary ?? ''),
        metadata: {
          packet_key: packetKey || null,
          source_ref: sourceRef || null,
          feature_id: featureId || null,
          file_path: String(payload.file_path ?? payload.filePath ?? null) || null,
          qdrant_point_id: String(r.id),
          qdrant_collection: 'codebase_chunks_768',
          som_cluster: payload.som_cluster ?? payload.somCluster ?? null,
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
    // Generate embedding once for all vector lanes
    const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
    const embedding = await generateSingleEmbedding(query).catch(() => null);

    // Extract concepts from query via Gemma4
    const conceptExtractionResult = await extractQueryConceptsViaGemma({
      query,
      maxConcepts: 5,
      minConfidence: 0.7,
    }).catch(() => ({ conceptIds: [], extracted: [], durationMs: 0 }));

    // Run all retrieval signals in parallel
    const [bm25Results, conceptResults, qdrantResults, turbovecResults, neoResults] = await Promise.allSettled([
      bm25SearchIndexed(query, topK),
      conceptOverlapSearch(conceptExtractionResult.conceptIds, topK),
      queryQdrantVectorSignal(query, embedding, topK),
      embedding ? turbovecSearch(embedding, { topK: topK * 2, timeoutMs: 300 }) : Promise.resolve({ candidates: [], backend: 'offline', durationMs: 0 }),
      queryNeoJsGraphSignal({ conceptIds: conceptExtractionResult.conceptIds, topK }).then((r) =>
        r.map((hit) => ({
          id: hit.id,
          score: hit.score,
          text: hit.text,
        }))
      ),
    ]);

    // Convert results to ContextHit[] format for RRF
    const bm25Hits: ContextHit[] =
      bm25Results.status === 'fulfilled'
        ? bm25Results.value.map((hit) => ({
            id: hit.id,
            source: 'postgres_trigram',
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
            source: 'concept_overlap',
            score: hit.overlapScore,
          }))
        : [];

    const qdrantHits: ContextHit[] =
      qdrantResults.status === 'fulfilled'
        ? qdrantResults.value.map((hit) => ({
            id: hit.id,
            source: 'qdrant_vector',
            score: hit.score,
            text: hit.text,
            metadata: hit.metadata,
          }))
        : [];

    const turbovecHits: ContextHit[] =
      turbovecResults.status === 'fulfilled'
        ? turbovecResults.value.candidates.map((hit) => ({
            id: hit.id,
            source: 'turbovec_ann',
            score: hit.score,
            text: hit.id,
            metadata: { turbovec_candidate_id: hit.id, turbovec_cluster: hit.cluster },
          }))
        : [];

    const neoHits: ContextHit[] =
      neoResults.status === 'fulfilled'
        ? neoResults.value.map((hit) => ({
            id: hit.id,
            source: 'neo4j_graph',
            score: hit.score,
            text: hit.text,
            metadata: { neo4j_paths: hit.paths ?? 0 },
          }))
        : [];

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
    };
  } catch (error) {
    console.error('RRF integration error:', error);
    return {
      results: [],
      breakdown: { bm25Count: 0, conceptCount: 0, qdrantCount: 0, turbovecCount: 0, neoCount: 0 },
      durationMs: Date.now() - t0,
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
