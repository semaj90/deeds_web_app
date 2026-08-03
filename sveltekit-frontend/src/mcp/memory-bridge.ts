/**
 * Engram Memory Bridge: Decision Memory for Agentic Loops
 *
 * Stores and retrieves PAST OBSERVATIONS for agent decision-making.
 * NOT the active LangGraph state — that lives in the dispatcher node.
 *
 * This bridge records what happened (tool_name, confidence, outcome) so the NEXT run
 * can ask: "Have we seen a similar decision before? Which tool worked last time?"
 *
 * Data flow:
 *   LangGraph node (active) → [executes action] → recordObservation() → Engram table
 *   Next LangGraph node → [needs context] → searchMemoryByLexical/HNSW() → past decisions
 *
 * Storage: Postgres agent_observations table with Postgres full-text (tsvector) + pgvector HNSW.
 *
 * Usage:
 *   const bridge = new EngramMemoryBridge(ENV.DATABASE_URL);
 *   await bridge.ensureSchema();
 *   await bridge.recordObservation({ agent_name, tool_name, input_hash, ... });
 *   const similar = await bridge.searchMemoryByLexical(['auth', 'database']);
 *   const neighbors = await bridge.searchMemoryByHNSW(embedding);
 */

import { Pool } from 'pg';
import { z } from 'zod';
import { createHash } from 'node:crypto';

export const EngramObservationSchema = z.object({
  observation_id: z.string().uuid().optional(),
  agent_name: z.string().min(1).max(255),
  tool_name: z.string().min(1).max(255),
  input_hash: z.string().length(64), // SHA256
  output_summary: z.string().max(2000),
  decision_context: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1).default(0.5),
  timestamp: z.string().datetime().optional(),
  bm25_tags: z.array(z.string().min(1)).default([]),
  hnsw_embedding: z.array(z.number()).length(768).optional(), // Primary: 768-dim embeddinggemma
  hnsw_embedding_512: z.array(z.number()).length(512).optional(), // Fallback: 512-dim nomic
  embedding_lane: z.enum(['primary-768d', 'fallback-512d', 'multimodal-clip-512d']).optional(),
  created_at: z.string().datetime().optional(),
});

export type EngramObservation = z.infer<typeof EngramObservationSchema>;

export class EngramMemoryBridge {
  private pool: Pool;
  private tableName = 'agent_observations';
  private isSchemaReady = false;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    this.pool.on('error', (err) => {
      console.error('[EngramMemoryBridge] Pool error:', err);
    });
  }

  /**
   * Record an agent tool invocation + outcome for future decisions
   */
  async recordObservation(
    obs: Omit<EngramObservation, 'observation_id' | 'created_at'>
  ): Promise<string> {
    if (!this.isSchemaReady) {
      await this.ensureSchema();
    }

    const validated = EngramObservationSchema.omit({
      observation_id: true,
      created_at: true,
    }).parse(obs);

    const client = await this.pool.connect();
    try {
      const embeddingValue = validated.hnsw_embedding
        ? `[${validated.hnsw_embedding.join(',')}]`
        : null;

      const result = await client.query(
        `INSERT INTO ${this.tableName}
          (agent_name, tool_name, input_hash, output_summary, decision_context,
           confidence, bm25_tags, hnsw_embedding, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, NOW())
         RETURNING observation_id`,
        [
          validated.agent_name,
          validated.tool_name,
          validated.input_hash,
          validated.output_summary,
          JSON.stringify(validated.decision_context),
          validated.confidence,
          validated.bm25_tags,
          embeddingValue,
        ]
      );

      return result.rows[0].observation_id;
    } finally {
      client.release();
    }
  }

  /**
   * Lexical search via Postgres full-text search (tsvector + tsquery + ts_rank)
   * Used for memory-scoped decision retrieval before tool call.
   * Note: This is Postgres full-text search, not true BM25 (which is probabilistic + corpus-aware).
   */
  async searchMemoryByLexical(terms: string[], limit = 10): Promise<EngramObservation[]> {
    if (!this.isSchemaReady) {
      await this.ensureSchema();
    }

    const client = await this.pool.connect();
    try {
      // Build tsquery from terms: term1 | term2 | term3
      const tsquery = terms
        .filter((t) => t.length > 0)
        .map((t) => `'${t.replace(/'/g, "''")}'`)
        .join(' | ');

      if (!tsquery) {
        return []; // No valid terms
      }

      const result = await client.query(
        `SELECT
           observation_id, agent_name, tool_name, input_hash, output_summary,
           decision_context, confidence, bm25_tags, hnsw_embedding, created_at
         FROM ${this.tableName}
         WHERE to_tsvector('english', bm25_tags::text || ' ' || output_summary)
               @@ to_tsquery('english', $1)
         ORDER BY ts_rank(
           to_tsvector('english', bm25_tags::text || ' ' || output_summary),
           to_tsquery('english', $1)
         ) DESC
         LIMIT $2`,
        [tsquery, limit]
      );

      return result.rows.map((row) => ({
        observation_id: row.observation_id,
        agent_name: row.agent_name,
        tool_name: row.tool_name,
        input_hash: row.input_hash,
        output_summary: row.output_summary,
        decision_context: row.decision_context || {},
        confidence: row.confidence,
        bm25_tags: row.bm25_tags || [],
        hnsw_embedding: row.hnsw_embedding
          ? Array.from(new Float32Array(row.hnsw_embedding))
          : undefined,
        created_at: row.created_at,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * HNSW vector search: find semantically similar past observations
   * Supports both 768-dim (primary) and 512-dim (fallback) embeddings
   * Used when BM25 is insufficient (open-ended reasoning)
   */
  async searchMemoryByHNSW(embedding: number[], limit = 10): Promise<EngramObservation[]> {
    if (!this.isSchemaReady) {
      await this.ensureSchema();
    }

    if (!embedding || embedding.length === 0) {
      throw new Error('Embedding must be a non-empty vector');
    }

    const dim = embedding.length;
    if (dim !== 768 && dim !== 512) {
      throw new Error(`Embedding must be 768-dim or 512-dim, got ${dim}-dim`);
    }

    const columnName = dim === 768 ? 'hnsw_embedding' : 'hnsw_embedding_512';
    const vectorType = dim === 768 ? 'vector(768)' : 'vector(512)';

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT
           observation_id, agent_name, tool_name, input_hash, output_summary,
           decision_context, confidence, bm25_tags, hnsw_embedding, hnsw_embedding_512,
           embedding_lane, created_at
         FROM ${this.tableName}
         WHERE ${columnName} IS NOT NULL
         ORDER BY ${columnName} <-> $1::${vectorType}
         LIMIT $2`,
        [
          `[${embedding.join(',')}]`,
          limit,
        ]
      );

      return result.rows.map((row) => ({
        observation_id: row.observation_id,
        agent_name: row.agent_name,
        tool_name: row.tool_name,
        input_hash: row.input_hash,
        output_summary: row.output_summary,
        decision_context: row.decision_context || {},
        confidence: row.confidence,
        bm25_tags: row.bm25_tags || [],
        hnsw_embedding: row.hnsw_embedding
          ? Array.from(new Float32Array(row.hnsw_embedding))
          : undefined,
        hnsw_embedding_512: row.hnsw_embedding_512
          ? Array.from(new Float32Array(row.hnsw_embedding_512))
          : undefined,
        embedding_lane: row.embedding_lane,
        created_at: row.created_at,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Create or update PostgreSQL table + indexes for agent memory storage
   */
  async ensureSchema(): Promise<void> {
    if (this.isSchemaReady) return;

    const client = await this.pool.connect();
    try {
      // Ensure extensions
      await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
      await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

      // Create table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          agent_name VARCHAR(255) NOT NULL,
          tool_name VARCHAR(255) NOT NULL,
          input_hash VARCHAR(64) NOT NULL,
          output_summary TEXT NOT NULL,
          decision_context JSONB NOT NULL DEFAULT '{}',
          confidence REAL NOT NULL DEFAULT 0.5,
          bm25_tags TEXT[] NOT NULL DEFAULT '{}',
          hnsw_embedding vector(768),
          hnsw_embedding_512 vector(512),
          embedding_lane VARCHAR(50),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),

          CONSTRAINT bm25_tags_not_empty CHECK (array_length(bm25_tags, 1) IS NULL OR array_length(bm25_tags, 1) > 0),
          CONSTRAINT confidence_range CHECK (confidence >= 0 AND confidence <= 1)
        );
      `);

      // Keep lexical lookup lightweight and startup-safe.
      // The fallback query path can still use Postgres FTS without this index;
      // we index the tag array itself instead of a mutable expression.
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_bm25_tags_gin
          ON ${this.tableName} USING GIN (bm25_tags);
      `);

      // Create HNSW vector index for 768-dim (cosine distance)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_hnsw_768
          ON ${this.tableName} USING hnsw (hnsw_embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64);
      `);

      // Create HNSW vector index for 512-dim fallback (cosine distance)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_hnsw_512
          ON ${this.tableName} USING hnsw (hnsw_embedding_512 vector_cosine_ops)
          WITH (m = 16, ef_construction = 64);
      `);

      // Create lookup index on agent_name + tool_name (frequent filters)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_agent_tool
          ON ${this.tableName} (agent_name, tool_name, created_at DESC);
      `);

      this.isSchemaReady = true;
    } catch (err) {
      console.error('[EngramMemoryBridge] Schema creation error:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Utility: Generate SHA256 hash of input for deduplication
   */
  static hashInput(input: unknown): string {
    const serialized = typeof input === 'string' ? input : JSON.stringify(input);
    return createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Cleanup: close the connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
