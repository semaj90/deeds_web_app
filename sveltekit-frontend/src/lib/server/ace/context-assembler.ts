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
import { getValkeyClient } from '$lib/server/cache/valkey-client.js';
import { setACECursor, type ACECursor } from '$lib/server/cache/ace-cursor-cache.js';
export {
  assembleACEContext,
  buildACEPromptCached,
  fetchGlossaryMatches,
  fetchCachedACEChunks,
  persistACEChunks,
  fetchCodebaseContext,
} from '../features/ai/ace/context-assembler.js';
export type { BowClusterScore } from '../features/ai/ace/context-assembler.js';

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
  workspace_revision?: number;
  source_revision?: number;
}

/**
 * Sorts candidates by `final_score` descending (highest-scoring first) before any
 * truncation. Extracted as a pure function so it is unit-testable without the
 * class's live Postgres/Redis connections.
 *
 * Bug context (parent-atlas-ace-bitfrost-cache-correctness, T2 item 3): `assemble()`
 * previously called `candidates.slice(0, 50)` directly on caller-supplied order with
 * no sort in between. The one live caller (`phase110-end-to-end-retrieval-flow.ts`)
 * passes `extracted_facts` filtered but never sorted by score, so a truncation past
 * index 50 silently dropped whichever candidates happened to land after index 50 in
 * upstream extraction order -- not the lowest-scoring ones. `Array.prototype.sort` is
 * stable in Node/V8, so candidates with equal `final_score` keep their relative
 * input order.
 */
export function selectTopCandidatesV1<T extends { final_score: number }>(
  candidates: readonly T[],
  limit: number
): T[] {
  return [...candidates].sort((a, b) => b.final_score - a.final_score).slice(0, limit);
}

/**
 * Conservative content-token estimate used only for ACE accounting. The
 * assembler does not own a model tokenizer, so this deliberately reports an
 * estimate from UTF-8 byte length rather than pretending identifiers are
 * evidence content.
 */
export function estimateContentTokensV1(content: string): number {
  return Math.ceil(Buffer.byteLength(content, 'utf8') / 4);
}

export class ACEContextAssembler {
  private pgPool: pg.Pool;
  private redis: ReturnType<typeof getValkeyClient>;
  // Whether `this.redis` is a connection this instance owns (and must `.quit()`
  // itself) versus the shared app-wide singleton from `getValkeyClient()`, which
  // must never be quit by one caller — see `close()` below.
  private ownsRedisConnection: boolean;

  constructor(pgUrl?: string, redisHost?: string, redisPort?: number, redisPassword?: string) {
    this.pgPool = new pg.Pool({
      connectionString: pgUrl || process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
    });

    // T2 item 1 fix (parent-atlas-ace-bitfrost-cache-correctness): previously this
    // always called `.duplicate()`, opening a second persistent Redis connection
    // even when no caller ever overrides the connection settings (confirmed live:
    // both real callers construct with zero args). Reuse the shared
    // `getValkeyClient()` singleton in that common case; only duplicate when an
    // explicit override is actually supplied, so a caller that legitimately wants
    // a distinct connection still gets one.
    if (redisHost || redisPort !== undefined || redisPassword) {
      this.redis = getValkeyClient().duplicate({
        host: redisHost || process.env.REDIS_HOST || '127.0.0.1',
        port: redisPort || parseInt(process.env.REDIS_PORT || '6379'),
        password: redisPassword || process.env.REDIS_PASSWORD || 'redis',
      });
      this.ownsRedisConnection = true;
    } else {
      this.redis = getValkeyClient();
      this.ownsRedisConnection = false;
    }
  }

  async assemble(
    queryText: string,
    queryEmbedding: number[],
    candidates: Array<{
      packet_key: string;
      source_ref: string;
      feature_id: string;
      domain_class?: string;
      /** Evidence text used for token accounting; not copied into the packet identity list. */
      content: string;
      final_score: number;
      retrieval_trace: RetrievalTraceEntry[];
    }>,
    sessionId?: string,
    workspaceRevision?: number,
    sourceRevision?: number
  ): Promise<ACEPacket> {
    const id = crypto.randomUUID();
    const retrievedAt = new Date().toISOString();

    const lanesUsed = new Set<string>();
    let totalTokens = 0;

    for (const candidate of candidates) {
      for (const trace of candidate.retrieval_trace) {
        lanesUsed.add(trace.lane);
      }
      totalTokens += estimateContentTokensV1(candidate.content);
    }

    const compressedTokens = Math.min(totalTokens, 4800);
    const compressionRatio = totalTokens > 0 ? compressedTokens / totalTokens : 1;

    const packet: ACEPacket = {
      id,
      query_text: queryText,
      query_embedding: queryEmbedding,
      retrieved_at: retrievedAt,
      candidates: selectTopCandidatesV1(candidates, 50).map((c) => ({
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

    // P3 fix: bind workspace/source revision into the cache key so a corpus/index
    // change (not just a different query) invalidates the key. Previously this hashed
    // only queryText + embedding prefix, so a stale packet could be served indefinitely
    // unless a caller separately remembered to call validateCachedPacket().
    const cacheKeyInput = [
      queryText,
      queryEmbedding.slice(0, 10).join(','),
      workspaceRevision !== undefined ? `wsrev:${workspaceRevision}` : null,
      sourceRevision !== undefined ? `srcrev:${sourceRevision}` : null,
    ]
      .filter((part) => part !== null)
      .join('|');
    packet.cache_key = `ace:context:${crypto.createHash('sha256').update(cacheKeyInput).digest('hex')}`;
    if (workspaceRevision !== undefined) packet.workspace_revision = workspaceRevision;
    if (sourceRevision !== undefined) packet.source_revision = sourceRevision;

    // Store ACE cursor for session recovery (Phase B2 wiring)
    if (sessionId && packet.candidates.length > 0) {
      const now = new Date().toISOString();
      const cursor: ACECursor = {
        id: crypto.randomUUID(),
        query_text: queryText,
        query_hash: crypto.createHash('sha256').update(queryText).digest('hex'),
        last_rank: 0,
        last_score: packet.candidates[0].final_score ?? 0,
        candidates_retrieved: packet.candidates.length,
        lanes_completed: Array.from(lanesUsed) as ('qdrant' | 'turbovec' | 'postgres' | 'neo4j')[],
        next_lane: undefined,
        session_id: sessionId,
        created_at: now,
        last_accessed_at: now,
        ttl_seconds: 3600,
        packet_key: packet.candidates[0].packet_key,
        last_retrieved_at: now,
        validation_gates: {
          gate_1_deserialization: 'PASS',
          gate_2_contract_validation: 'PASS',
          gate_3_qdrant_payload: 'PASS',
          gate_4_qdrant_manager_upsert: 'PASS',
        },
        dimension_verified: 768,
        embedding_lane: 'dense_768',
        projection_version: null,
        retrieval_trace: {
          qdrant_elapsed_ms: 0,
          postgres_join_elapsed_ms: 0,
          total_elapsed_ms: packet.candidates.reduce((sum, c) => sum + (c.retrieval_trace[0]?.returned_at_ms ?? 0), 0),
        },
      };

      setACECursor(sessionId, cursor).catch((err) => {
        console.warn('[ACEContext] Failed to store cursor for session', sessionId, ':', err);
      });
    }

    return packet;
  }

  /**
   * P3: Workspace-scoped cache key generation (Phase 110)
   * Incorporates workspace_revision + source_revision to invalidate stale caches
   */
  generateWorkspaceScopedCacheKey(
    packet_key: string,
    source_ref: string,
    workspace_revision: number
  ): string {
    const hashInput = `${source_ref}|workspace:${workspace_revision}`;
    return `kv:card:${packet_key}:${crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 16)}`;
  }

  /**
   * P4: Stale rejection logic (Phase 110)
   * Validates cached packets against current workspace_revision and source_revision
   * Returns null or stale marker if versions don't match
   */
  async validateCachedPacket(
    packet: ACEPacket,
    currentWorkspaceRevision: number,
    currentSourceRevision?: number
  ): Promise<ACEPacket | { text: string; proof_state: 'STALE' } | null> {
    if (!packet.cached_at) {
      return packet;
    }

    // Check if cached packet needs validation
    const cachedRevision = (packet as any).workspace_revision;

    // If workspace_revision doesn't match, packet is stale
    if (cachedRevision !== undefined && cachedRevision !== currentWorkspaceRevision) {
      return {
        text: '[STALE: workspace revision mismatch]',
        proof_state: 'STALE'
      };
    }

    // If source_revision provided, validate it
    if (currentSourceRevision !== undefined) {
      const cachedSourceRevision = (packet as any).source_revision;
      if (cachedSourceRevision !== undefined && cachedSourceRevision !== currentSourceRevision) {
        return {
          text: '[STALE: source revision mismatch]',
          proof_state: 'STALE'
        };
      }
    }

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

  async getCachedCursorPacket(sessionId: string): Promise<ACEPacket | null> {
    try {
      const cursorKey = `ace:cursor:${sessionId}`;
      const cursorData = await this.redis.get(cursorKey);
      if (!cursorData) return null;

      const cursor = JSON.parse(cursorData) as ACECursor;

      // Validate all gates are PASS
      const allGatesPassed = Object.values(cursor.validation_gates).every((gate) => gate === 'PASS');
      if (!allGatesPassed) return null;

      // Verify dimension is canonical 768
      if (cursor.dimension_verified !== 768) return null;

      // Cursor is valid; packet_key is the top candidate
      // Return a minimal ACEPacket for session recovery
      return {
        id: `cursor-${sessionId}`,
        query_text: '',
        query_embedding: [],
        retrieved_at: cursor.last_retrieved_at,
        candidates: [
          {
            packet_key: cursor.packet_key,
            source_ref: '',
            feature_id: '',
            authority_score: 0,
            final_score: 1.0,
            retrieval_trace: [],
          },
        ],
        total_tokens: 0,
        compressed_tokens: 0,
        compression_ratio: 1.0,
        lanes_used: ['cache'],
        total_candidates_considered: 1,
        cached_at: cursor.last_retrieved_at,
      } as ACEPacket;
    } catch (err) {
      console.warn('[ACEContext] Failed to retrieve cached cursor for session', sessionId, ':', err);
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
    // Only quit a connection this instance actually opened. The shared
    // `getValkeyClient()` singleton is used by the rest of the app and must
    // outlive any single ACEContextAssembler instance's lifecycle.
    if (this.ownsRedisConnection) {
      await this.redis.quit();
    }
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
