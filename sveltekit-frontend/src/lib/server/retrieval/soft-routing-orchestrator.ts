/**
 * Phase 3, Step 13: Soft Routing Orchestrator
 *
 * Execute all 4 retrieval lanes in parallel without hard filters.
 * Each lane produces independent ranked results; RRF fusion happens downstream.
 *
 * Lanes:
 * 1. Qdrant dense vector search (384-dim HNSW)
 * 2. TurboVec prefilter (4-bit quantized)
 * 3. Postgres full-text search (lexical)
 * 4. Neo4j graph neighbors (topology, optional K-hop expansion)
 *
 * No WHERE clauses filtering candidates — all lanes return full results.
 * Soft scoring only; downstream reranker decides which candidates matter.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import pg from 'pg';
import fetch from 'node-fetch';

export interface RetrievalCandidate {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  domain_class?: string;
  score: number;
  lane: 'qdrant' | 'turbovec' | 'postgres' | 'neo4j';
  rank: number; // Position in this lane's results
}

export interface SoftRoutingRequest {
  query_embedding: number[];
  query_text: string;
  top_k: number;
  enable_neo4j?: boolean;
}

export interface SoftRoutingResult {
  candidates: RetrievalCandidate[];
  timing: {
    qdrant_ms: number;
    turbovec_ms: number;
    postgres_ms: number;
    neo4j_ms: number;
    total_ms: number;
  };
  lanes_completed: string[];
}

export class SoftRoutingOrchestrator {
  private qdrant: QdrantClient;
  private pgPool: pg.Pool;
  private turboVecUrl: string;

  constructor(
    qdrantHost: string = '127.0.0.1',
    qdrantPort: number = 6333,
    pgUrl?: string,
    turboVecUrl?: string
  ) {
    this.qdrant = new QdrantClient({
      host: qdrantHost,
      port: qdrantPort,
    });

    this.pgPool = new pg.Pool({
      connectionString: pgUrl || process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
    });

    this.turboVecUrl = turboVecUrl || 'http://127.0.0.1:8791';
  }

  /**
   * Execute all 4 retrieval lanes in parallel
   */
  async route(request: SoftRoutingRequest): Promise<SoftRoutingResult> {
    const startTime = Date.now();
    const candidates: RetrievalCandidate[] = [];
    const timing = {
      qdrant_ms: 0,
      turbovec_ms: 0,
      postgres_ms: 0,
      neo4j_ms: 0,
      total_ms: 0,
    };
    const lanesCompleted: string[] = [];

    try {
      // Launch all 4 lanes in parallel
      const [qdrantResults, turboVecResults, postgresResults, neo4jResults] = await Promise.allSettled([
        this.qdrantLane(request),
        this.turboVecLane(request),
        this.postgresLane(request),
        request.enable_neo4j ? this.neo4jLane(request) : Promise.resolve({ candidates: [], timing: 0 }),
      ]).then((results) =>
        results.map((r) => (r.status === 'fulfilled' ? r.value : { candidates: [], timing: 0 }))
      );

      // Collect results from all lanes
      if (qdrantResults.candidates.length > 0) {
        candidates.push(...qdrantResults.candidates);
        lanesCompleted.push('qdrant');
        timing.qdrant_ms = qdrantResults.timing;
      }

      if (turboVecResults.candidates.length > 0) {
        candidates.push(...turboVecResults.candidates);
        lanesCompleted.push('turbovec');
        timing.turbovec_ms = turboVecResults.timing;
      }

      if (postgresResults.candidates.length > 0) {
        candidates.push(...postgresResults.candidates);
        lanesCompleted.push('postgres');
        timing.postgres_ms = postgresResults.timing;
      }

      if (neo4jResults.candidates.length > 0) {
        candidates.push(...neo4jResults.candidates);
        lanesCompleted.push('neo4j');
        timing.neo4j_ms = neo4jResults.timing;
      }

      // Deduplicate by packet_key, keeping highest score per packet
      const deduped = new Map<string, RetrievalCandidate>();
      for (const cand of candidates) {
        const existing = deduped.get(cand.packet_key);
        if (!existing || cand.score > existing.score) {
          deduped.set(cand.packet_key, cand);
        }
      }

      timing.total_ms = Date.now() - startTime;

      return {
        candidates: Array.from(deduped.values()),
        timing,
        lanes_completed: lanesCompleted,
      };
    } catch (err) {
      console.error('[SoftRouting] Error:', err);
      timing.total_ms = Date.now() - startTime;

      return {
        candidates,
        timing,
        lanes_completed: lanesCompleted,
      };
    }
  }

  /**
   * Lane 1: Qdrant dense vector search (384-dim HNSW)
   */
  private async qdrantLane(request: SoftRoutingRequest): Promise<{
    candidates: RetrievalCandidate[];
    timing: number;
  }> {
    const startTime = Date.now();

    try {
      const results = await this.qdrant.search('codebase_chunks_384', {
        vector: request.query_embedding,
        limit: request.top_k * 2, // Over-fetch for deduplication
      });

      const candidates: RetrievalCandidate[] = (results.result || []).map((hit, rank) => ({
        packet_key: hit.payload?.packet_key as string,
        source_ref: hit.payload?.source_ref as string,
        feature_id: hit.payload?.feature_id as string,
        domain_class: hit.payload?.domain_class as string,
        score: hit.score,
        lane: 'qdrant',
        rank: rank + 1,
      }));

      return {
        candidates,
        timing: Date.now() - startTime,
      };
    } catch (err) {
      console.error('[Qdrant Lane] Error:', err);
      return { candidates: [], timing: Date.now() - startTime };
    }
  }

  /**
   * Lane 2: TurboVec 4-bit prefilter
   */
  private async turboVecLane(request: SoftRoutingRequest): Promise<{
    candidates: RetrievalCandidate[];
    timing: number;
  }> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.turboVecUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: request.query_embedding,
          k: request.top_k * 2,
        }),
      });

      if (!response.ok) {
        throw new Error(`TurboVec returned ${response.status}`);
      }

      const data = (await response.json()) as any;
      const candidates: RetrievalCandidate[] = (data.results || []).map((hit: any, rank: number) => ({
        packet_key: hit.metadata?.packet_key || hit.id,
        source_ref: hit.metadata?.source_ref || '',
        feature_id: hit.metadata?.feature_id || '',
        score: hit.score,
        lane: 'turbovec',
        rank: rank + 1,
      }));

      return {
        candidates,
        timing: Date.now() - startTime,
      };
    } catch (err) {
      console.error('[TurboVec Lane] Error:', err);
      return { candidates: [], timing: Date.now() - startTime };
    }
  }

  /**
   * Lane 3: Postgres full-text search (lexical)
   */
  private async postgresLane(request: SoftRoutingRequest): Promise<{
    candidates: RetrievalCandidate[];
    timing: number;
  }> {
    const startTime = Date.now();

    try {
      const client = await this.pgPool.connect();

      try {
        const query = `
          SELECT
            ap.packet_key,
            ap.source_ref,
            ap.feature_id,
            ap.predicted_domain,
            ts_rank(to_tsvector('english', cci.content), plainto_tsquery('english', $1)) as score
          FROM atlas_packets ap
          JOIN codebase_chunk_index cci ON ap.source_ref = cci.source_ref
          WHERE to_tsvector('english', cci.content) @@ plainto_tsquery('english', $1)
          ORDER BY score DESC
          LIMIT $2
        `;

        const result = await client.query(query, [request.query_text, request.top_k * 2]);

        const candidates: RetrievalCandidate[] = (result.rows || []).map((row, rank) => ({
          packet_key: row.packet_key,
          source_ref: row.source_ref,
          feature_id: row.feature_id,
          domain_class: row.predicted_domain,
          score: row.score,
          lane: 'postgres',
          rank: rank + 1,
        }));

        return {
          candidates,
          timing: Date.now() - startTime,
        };
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[Postgres Lane] Error:', err);
      return { candidates: [], timing: Date.now() - startTime };
    }
  }

  /**
   * Lane 4: Neo4j graph neighbor expansion (optional)
   */
  private async neo4jLane(request: SoftRoutingRequest): Promise<{
    candidates: RetrievalCandidate[];
    timing: number;
  }> {
    const startTime = Date.now();

    try {
      // Neo4j integration would go here
      // For now, return empty (this lane is optional and will be wired in Step 14)
      return { candidates: [], timing: Date.now() - startTime };
    } catch (err) {
      console.error('[Neo4j Lane] Error:', err);
      return { candidates: [], timing: Date.now() - startTime };
    }
  }

  async close(): Promise<void> {
    await this.pgPool.end();
  }
}

/**
 * Singleton instance
 */
let orchestratorInstance: SoftRoutingOrchestrator | null = null;

export function getSoftRoutingOrchestrator(): SoftRoutingOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new SoftRoutingOrchestrator();
  }
  return orchestratorInstance;
}

export async function closeSoftRoutingOrchestrator(): Promise<void> {
  if (orchestratorInstance) {
    await orchestratorInstance.close();
    orchestratorInstance = null;
  }
}
