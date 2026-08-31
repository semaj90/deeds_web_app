// @ts-nocheck
/**
 * Go Retrieval Orchestrator
 *
 * Unified orchestrator that fans out to all retrieval backends and merges results
 * using the 6-signal RRF (Reciprocal Rank Fusion) blend.
 *
 * Architecture (immutable):
 * - Postgres: identity (source_ref, symbol, kind) + stats (pagerank, hits_authority, community, som_cell)
 * - Neo4j: graph computation (edges, traversal, centrality)
 * - Qdrant: vector retrieval (768-dim content vector, named vectors for multi-modal)
 * - TurboVec: latent reranking (768→64 for hot memory, NOT search)
 * - RRF: 6-signal blend (semantic, lexical, noun, pagerank, topology, freshness)
 * - Gemma4: explanation only (summarize top-3 results, not a ranking source)
 *
 * RRF Formula (6 independent signals, equal weight):
 *   0.25·content_vector + 0.20·summary_vector + 0.20·lexical
 *   + 0.15·noun_overlap + 0.12·pagerank + 0.08·topology
 */

import fetch from 'node-fetch';
import { db } from '../db/client.js';
import { qdrant } from '../vector/qdrant-manager.js';
import { codebase_chunk_index, feature_statistics } from '../db/schema-postgres.js';
import { mergeRRF, type RRFResult } from './multi-vector-rrf.js';
import { getSourceRef, parseFeatureId } from './feature-identity.js';
import { embedQueryForLane } from './embedding-service.js';

import { ENV } from '$lib/server/env.server.js';
export interface RetrievalQuery {
  q: string;
  topK?: number;
  includePayload?: boolean;
  includeVector?: boolean;
  scoreThreshold?: number;
}

export interface RetrievalCandidate {
  id: string;
  feature_id: string;
  source_ref: string;
  title: string;
  content: string;
  scores: {
    semantic: number;
    lexical: number;
    noun_overlap: number;
    pagerank: number;
    topology: number;
    freshness: number;
  };
  final_score: number;
  rank: number;
}

export interface RetrievalResult {
  candidates: RetrievalCandidate[];
  total_time_ms: number;
  stages: {
    qdrant_time_ms: number;
    postgres_time_ms: number;
    neo4j_time_ms: number;
    rrf_time_ms: number;
    turbovec_time_ms?: number;
    gemma4_time_ms?: number;
  };
}

export interface GoRetrievalBm25CompatResponse {
  results?: Array<Record<string, unknown>>;
  error?: string;
  /** Real lane owner per LEXICAL-OWNER-02 — expected 'postgres_fts', not true BM25. */
  lane?: string;
  /** Compatibility label for pre-rename callers — expected 'bm25'. */
  legacy_lane?: string;
  capability?: { trueBm25?: boolean };
}

export interface ParsedGoRetrievalBm25Result {
  ids: string[];
  ranked: Array<{ feature_id: string; bm25_score: number; rank: number }>;
  laneMeta: {
    lane: string | null;
    legacyLane: string | null;
    trueBm25: boolean | null;
  };
}

/**
 * Pure parser for the Go retrieval `/search/bm25` compatibility response — extracted from
 * `GoRetrievalOrchestrator.queryPostgresBM25()` (2026-08-25) so the response contract can be
 * unit-tested without mocking `fetch` or the orchestrator's other three external dependencies
 * (embedding service, Qdrant, Neo4j).
 *
 * Per LEXICAL-OWNER-02 (openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md): the
 * route is a compatibility shim over PostgreSQL FTS, not true BM25. This parser MUST tolerate
 * `lane: 'postgres_fts'`, `legacy_lane: 'bm25'`, and `capability.trueBm25` fields being present
 * (or absent — the actual Go service is not checked into this repo, so its real response shape
 * cannot be verified from here) without inferring scoring semantics from the route name itself.
 * The output field `bm25_score` is kept for backward compatibility with existing RRF callers,
 * not as a claim that the upstream score is true BM25 — `laneMeta.trueBm25` carries whatever the
 * service actually reports (or `null` if it reports nothing), and callers wanting to distinguish
 * true BM25 from the FTS compatibility shim should read `laneMeta`, not the field name.
 */
export function parseGoRetrievalBm25Response(
  data: GoRetrievalBm25CompatResponse,
  httpOk: boolean,
  httpStatus: number,
): ParsedGoRetrievalBm25Result {
  if (!httpOk || data.error) {
    throw new Error(data.error ?? `BM25 service returned ${httpStatus}`);
  }
  const results = data.results ?? [];
  return {
    ids: results.map((r) => String(r.id ?? r.source_ref ?? '')),
    ranked: results.map((r, idx) => ({
      feature_id: String(r.id ?? r.source_ref ?? ''),
      bm25_score: Number(r.score ?? 0),
      rank: idx,
    })),
    laneMeta: {
      lane: typeof data.lane === 'string' ? data.lane : null,
      legacyLane: typeof data.legacy_lane === 'string' ? data.legacy_lane : null,
      trueBm25: typeof data.capability?.trueBm25 === 'boolean' ? data.capability.trueBm25 : null,
    },
  };
}

export class GoRetrievalOrchestrator {
  private goRetrievalUrl = ENV.GO_RETRIEVAL_HTTP_URL ?? 'http://127.0.0.1:8100';
  private turbovecUrl = ENV.TURBOVEC_SIDECAR ?? 'http://127.0.0.1:8791';
  private gemma4Url = ENV.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090';

  constructor(urls?: { goRetrieval?: string; turbovec?: string; gemma4?: string }) {
    if (urls?.goRetrieval) this.goRetrievalUrl = urls.goRetrieval;
    if (urls?.turbovec) this.turbovecUrl = urls.turbovec;
    if (urls?.gemma4) this.gemma4Url = urls.gemma4;
  }

  /**
   * Execute unified retrieval pipeline
   */
  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    const startTime = Date.now();
    const stages = {
      qdrant_time_ms: 0,
      postgres_time_ms: 0,
      neo4j_time_ms: 0,
      rrf_time_ms: 0
    };

    // Embed query
    const queryEmbedding = await this.embedQuery(query.q);

    // Parallel stage 1: Qdrant ANN, Postgres BM25, Neo4j PageRank
    const [qdrantResults, postgresResults, neo4jResults] = await Promise.all([
      this.queryQdrantANN(queryEmbedding, query.topK || 20),
      this.queryPostgresBM25(query.q, query.topK || 20),
      this.queryNeo4jPageRank(query.q, query.topK || 20)
    ]);

    stages.qdrant_time_ms = qdrantResults.duration_ms || 0;
    stages.postgres_time_ms = postgresResults.duration_ms || 0;
    stages.neo4j_time_ms = neo4jResults.duration_ms || 0;

    // Noun overlap scoring
    const nounResults = await this.scoreNounOverlap(query.q, [...qdrantResults.ids, ...postgresResults.ids]);

    // SOM topology proximity
    const topologyScores = await this.scoreSOMTopology(qdrantResults.embeddings);

    // RRF merge
    const rffStart = Date.now();
    const mergedResults = mergeRRF({
      content: qdrantResults.ranked,
      summary: [], // Placeholder for summary vector results
      lexical: postgresResults.ranked,
      noun: nounResults,
      authority: neo4jResults.ranked,
      topology: topologyScores
    });
    stages.rrf_time_ms = Date.now() - rffStart;

    // Build final candidates
    const candidates = this.buildCandidates(mergedResults, query.topK || 20);

    return {
      candidates,
      total_time_ms: Date.now() - startTime,
      stages
    };
  }

  private async embedQuery(query: string): Promise<number[]> {
    const result = await embedQueryForLane(query, 'dense_768');
    return Array.from(result.vector);
  }

  private async queryQdrantANN(embedding: number[], topK: number): Promise<any> {
    const start = Date.now();

    try {
      const results = await qdrant.search('codebase_chunks_768', {
        vector: embedding,
        limit: topK,
        with_payload: true,
        with_vector: true,
        score_threshold: 0.5
      });

      return {
        ids: results.map((r: any) => r.id),
        embeddings: results.map((r: any) => r.vector),
        ranked: results.map((r: any, idx: number) => ({
          id: r.id,
          score: r.score || 0,
          rank: idx
        })),
        duration_ms: Date.now() - start
      };
    } catch (err) {
      console.error('Qdrant query failed:', err);
      return {
        ids: [],
        embeddings: [],
        ranked: [],
        duration_ms: Date.now() - start
      };
    }
  }

  private async queryPostgresBM25(query: string, topK: number): Promise<any> {
    const start = Date.now();

    try {
      const response = await fetch(`${this.goRetrievalUrl}/search/bm25`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: topK }),
        signal: AbortSignal.timeout(1200),
      });
      const data = (await response.json()) as GoRetrievalBm25CompatResponse;
      const parsed = parseGoRetrievalBm25Response(data, response.ok, response.status);

      return {
        ids: parsed.ids,
        ranked: parsed.ranked,
        duration_ms: Date.now() - start
      };
    } catch (err) {
      console.error('Postgres BM25 query failed:', err);
      return {
        ids: [],
        ranked: [],
        duration_ms: Date.now() - start
      };
    }
  }

  private async queryNeo4jPageRank(query: string, topK: number): Promise<any> {
    const start = Date.now();

    try {
      // Placeholder: actual Neo4j PageRank query
      // MATCH (f:Feature) WHERE f.name ~= query
      // OPTIONAL MATCH (f)-[r:IMPORTS|BELONGS_TO_CLUSTER]-(other:Feature)
      // WITH f, COUNT(other) as degree
      // RETURN f.feature_id as feature_id, f.pagerank as score
      // ORDER BY score DESC LIMIT topK

      const results = await db.query.feature_statistics.findMany({
        limit: topK,
        orderBy: (stats: any) => stats.pagerank
      });

      return {
        ids: results.map((r: any) => r.feature_id),
        ranked: results.map((r: any, idx: number) => ({
          feature_id: r.feature_id,
          score: r.pagerank || 0,
          rank: idx
        })),
        duration_ms: Date.now() - start
      };
    } catch (err) {
      console.error('Neo4j PageRank query failed:', err);
      return {
        ids: [],
        ranked: [],
        duration_ms: Date.now() - start
      };
    }
  }

  private async scoreNounOverlap(query: string, candidateIds: any[]): Promise<any[]> {
    // Extract nouns from query
    const queryNouns = this.extractNouns(query);

    // Score candidates by noun overlap with query
    const results = [];

    for (const id of candidateIds) {
      const chunk = await db.query.codebase_chunk_index.findFirst({
        where: (c: any) => c.id.equals(id)
      });

      if (!chunk) continue;

      const nounTerms = chunk.noun_terms as Record<string, any> || {};
      const candidateNouns = Object.keys(nounTerms);

      const overlap = queryNouns.filter(n => candidateNouns.includes(n)).length;
      const jaccardSim = overlap / Math.max(queryNouns.length, candidateNouns.length, 1);

      results.push({
        feature_id: chunk.feature_id,
        score: jaccardSim,
        rank: results.length
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private async scoreSOMTopology(embeddings: number[][]): Promise<any[]> {
    // Score based on SOM cell proximity
    // Features in nearby cells get higher scores

    const results = [];

    // Placeholder: actual SOM proximity scoring
    // In practice, this would compute pairwise distances in the 20x20 grid

    return results;
  }

  private extractNouns(query: string): string[] {
    // Simple noun extraction: split on whitespace and filter short words
    return query
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3);
  }

  private buildCandidates(results: RRFResult[], topK: number): RetrievalCandidate[] {
    return results.slice(0, topK).map((r, idx) => ({
      id: r.feature_id,
      feature_id: r.feature_id,
      source_ref: getSourceRef(r.feature_id),
      title: r.feature_id,
      content: '',
      scores: r.component_scores,
      final_score: r.rrf_score,
      rank: idx + 1
    }));
  }
}

/**
 * Convenience function
 */
export async function orchestrateRetrieval(query: string, topK = 20): Promise<RetrievalResult> {
  const orchestrator = new GoRetrievalOrchestrator();

  return orchestrator.retrieve({
    q: query,
    topK,
    includePayload: true
  });
}
