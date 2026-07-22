/**
 * Phase 4, Step 16: ACE Context Packet Assembly
 *
 * Build ACEPacket from retrieval candidates.
 *
 * ACE = Augmented Context Engine
 * - Retrieval trace: which lanes returned which candidates
 * - Metadata: domain classes, authority scores, freshness
 * - Chunked context: up to 4,800 tokens (vs 18,800 raw)
 * - Cache-ready: serializable to Redis
 */

import crypto from 'crypto';
import pg from 'pg';
import Redis from 'ioredis';

export interface RetrievalTraceEntry {
  lane: 'qdrant' | 'turbovec' | 'postgres' | 'neo4j';
  rank: number;
  score: number;
  returned_at_ms: number;
}

export interface ACEPacket {
  id: string;
  query_text: string;
  query_embedding: number[];
  retrieved_at: string;
  candidates: Array<{
    packet_key: string;
    source_ref: string;
    feature_id: string;
    domain_class?: string;
    authority_score: number;
    final_score: number;
    retrieval_trace: RetrievalTraceEntry[];
  }>;
  total_tokens: number;
  compressed_tokens: number;
  compression_ratio: number;
  lanes_used: string[];
  total_candidates_considered: number;
  cache_key?: string;
  cache_ttl_seconds?: number;
  cached_at?: string;
}

export class ACEContextAssembler {
  private pgPool: pg.Pool;
  private redis: Redis;

  constructor(pgUrl?: string, redisHost?: string, redisPort?: number, redisPassword?: string) {
    this.pgPool = new pg.Pool({
      connectionString: pgUrl || process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
    });

    this.redis = new Redis({
      host: redisHost || process.env.REDIS_HOST || '127.0.0.1',
      port: redisPort || parseInt(process.env.REDIS_PORT || '6379'),
      password: redisPassword || process.env.REDIS_PASSWORD || 'redis',
    });
  }

  async assemble(
    queryText: string,
    queryEmbedding: number[],
    candidates: Array<{
      packet_key: string;
      source_ref: string;
      feature_id: string;
      domain_class?: string;
      final_score: number;
      retrieval_trace: RetrievalTraceEntry[];
    }>
  ): Promise<ACEPacket> {
    const id = crypto.randomUUID();
    const retrievedAt = new Date().toISOString();

    const lanesUsed = new Set<string>();
    let totalTokens = 0;

    for (const candidate of candidates) {
      for (const trace of candidate.retrieval_trace) {
        lanesUsed.add(trace.lane);
      }
      totalTokens += Math.ceil(candidate.packet_key.length / 4) + Math.ceil(candidate.source_ref.length / 4);
    }

    const compressedTokens = Math.min(totalTokens, 4800);
    const compressionRatio = totalTokens > 0 ? compressedTokens / totalTokens : 1;

    const packet: ACEPacket = {
      id,
      query_text: queryText,
      query_embedding: queryEmbedding,
      retrieved_at: retrievedAt,
      candidates: candidates.slice(0, 50).map((c) => ({
        packet_key: c.packet_key,
        source_ref: c.source_ref,
        feature_id: c.feature_id,
        domain_class: c.domain_class,
        authority_score: 0,
        final_score: c.final_score,
        retrieval_trace: c.retrieval_trace,
      })),
      total_tokens: totalTokens,
      compressed_tokens: compressedTokens,
      compression_ratio: compressionRatio,
      lanes_used: Array.from(lanesUsed),
      total_candidates_considered: candidates.length,
    };

    const cacheKeyInput = `${queryText}|${queryEmbedding.slice(0, 10).join(',')}`;
    packet.cache_key = `ace:context:${crypto.createHash('sha256').update(cacheKeyInput).digest('hex')}`;

    return packet;
  }

  async cachePacket(packet: ACEPacket, ttl_seconds: number = 3600): Promise<void> {
    if (!packet.cache_key) {
      throw new Error('ACEPacket missing cache_key');
    }

    const value = JSON.stringify(packet);
    await this.redis.setex(packet.cache_key, ttl_seconds, value);

    packet.cache_ttl_seconds = ttl_seconds;
    packet.cached_at = new Date().toISOString();
  }

  async getCachedPacket(cacheKey: string): Promise<ACEPacket | null> {
    const cached = await this.redis.get(cacheKey);
    if (!cached) return null;

    try {
      return JSON.parse(cached) as ACEPacket;
    } catch (err) {
      console.error('[ACE] Cache parse error:', err);
      return null;
    }
  }

  async persistPacket(packet: ACEPacket): Promise<void> {
    const client = await this.pgPool.connect();

    try {
      await client.query(
        `
        INSERT INTO ace_context_packets (
          packet_id,
          query_text,
          query_embedding,
          candidates_json,
          total_tokens,
          compressed_tokens,
          lanes_used,
          cache_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (packet_id) DO NOTHING
      `,
        [
          packet.id,
          packet.query_text,
          JSON.stringify(packet.query_embedding),
          JSON.stringify(packet.candidates),
          packet.total_tokens,
          packet.compressed_tokens,
          packet.lanes_used,
          packet.cache_key,
        ]
      );
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pgPool.end();
    await this.redis.quit();
  }
}

let assembler: ACEContextAssembler | null = null;

export function getACEContextAssembler(): ACEContextAssembler {
  if (!assembler) {
    assembler = new ACEContextAssembler();
  }
  return assembler;
}

export async function closeACEContextAssembler(): Promise<void> {
  if (assembler) {
    await assembler.close();
    assembler = null;
  }
}
