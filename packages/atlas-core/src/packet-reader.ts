/**
 * Packet Reader — Canonical Ingestion from Postgres
 *
 * Reads atlas_packets (identity/metadata) and codebase_chunk_index (embeddings).
 * Routes by policy task type (error-fixing, semantic-diff, qdrant-mirror, etc).
 * Yields packets with full context for downstream processing.
 *
 * Canonical truth: Postgres (never cache or Qdrant as source).
 * Canonical semantic representation: codebase_chunk_index.content_embedding
 * as halfvec(768). content_embedding_768 is a legacy/alternate vector(768)
 * surface and must not be selected implicitly.
 */

import pkg from 'pg';
const { Pool } = pkg;
import type { QueryResult, Pool as PoolType } from 'pg';

export interface Packet {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  feature_label: string;
  directory_path: string;
  embedding?: Float32Array;
  embedding_dim?: number;
  som_cluster?: number;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface PacketReaderOptions {
  batchSize?: number;
  limit?: number;
  filters?: {
    source_ref?: string;
    feature_id?: string;
    directory_path?: string;
    som_cluster?: number;
  };
}

const CANONICAL_EMBEDDING_DIMENSION = 768;

function parseHalfvec(value: unknown): Float32Array | undefined {
  if (value == null) return undefined;
  const raw = Array.isArray(value)
    ? value.map(Number)
    : typeof value === 'string'
      ? value.trim().replace(/^\[|\]$/g, '').split(',').filter(Boolean).map(Number)
      : [];
  if (raw.length !== CANONICAL_EMBEDDING_DIMENSION || raw.some((entry) => !Number.isFinite(entry))) {
    return undefined;
  }
  return new Float32Array(raw);
}

export class PacketReader {
  private pool: PoolType;

  constructor(connectionString?: string) {
    this.pool = new Pool({
      connectionString:
        connectionString ||
        `postgres://${process.env.DB_USER || 'legal_admin'}:${process.env.DB_PASSWORD || '123456'}@${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || '5432'}/legal_ai_db`
    });
  }

  /** Read packets from canonical truth (Postgres). */
  async readPackets(options: PacketReaderOptions = {}): Promise<Packet[]> {
    const { limit = 10000, filters = {} } = options;

    const whereConditions: string[] = ['ap.packet_key IS NOT NULL'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.source_ref) {
      whereConditions.push(`ap.source_ref = $${paramIndex}`);
      params.push(filters.source_ref);
      paramIndex++;
    }
    if (filters.feature_id) {
      whereConditions.push(`ap.feature_id = $${paramIndex}`);
      params.push(filters.feature_id);
      paramIndex++;
    }
    if (filters.directory_path) {
      whereConditions.push(`ap.directory_path LIKE $${paramIndex}`);
      params.push(`${filters.directory_path}%`);
      paramIndex++;
    }
    if (filters.som_cluster !== undefined) {
      whereConditions.push(`ap.som_cluster = $${paramIndex}`);
      params.push(filters.som_cluster);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');
    params.push(limit);

    const query = `
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.feature_label,
        ap.directory_path,
        ap.summary,
        ap.som_cluster,
        ap.metadata,
        cci.content_embedding::text AS content_embedding,
        CASE WHEN cci.content_embedding IS NULL THEN NULL ELSE 768 END AS embedding_dimension
      FROM atlas_packets ap
      LEFT JOIN codebase_chunk_index cci ON cci.source_ref = ap.source_ref
      WHERE ${whereClause}
      LIMIT $${paramIndex}
    `;

    try {
      const result: QueryResult = await this.pool.query(query, params);
      return result.rows.map((row: any) => ({
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        feature_label: row.feature_label,
        directory_path: row.directory_path,
        embedding: parseHalfvec(row.content_embedding),
        embedding_dim: row.embedding_dimension == null ? undefined : Number(row.embedding_dimension),
        som_cluster: row.som_cluster,
        summary: row.summary,
        metadata: row.metadata || {}
      }));
    } catch (err) {
      console.error('PacketReader: Failed to read packets:', err);
      throw err;
    }
  }

  async *streamPackets(options: PacketReaderOptions = {}): AsyncGenerator<Packet[]> {
    const { batchSize = 256, limit = 10000 } = options;
    let totalRead = 0;

    while (totalRead < limit) {
      const toRead = Math.min(batchSize, limit - totalRead);
      const batch = await this.readPackets({ ...options, limit: toRead });
      if (batch.length === 0) break;
      yield batch;
      totalRead += batch.length;
    }
  }

  validatePacket(packet: Packet): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!packet.packet_key) errors.push('Missing packet_key (identity)');
    if (!packet.source_ref) errors.push('Missing source_ref (lineage)');
    if (!packet.feature_id) errors.push('Missing feature_id (clustering)');
    if (!packet.feature_label) errors.push('Missing feature_label (context)');
    if (packet.embedding && packet.embedding.length !== CANONICAL_EMBEDDING_DIMENSION) {
      errors.push(`Invalid semantic_768 embedding dimension: ${packet.embedding.length}`);
    }
    return { valid: errors.length === 0, errors };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default PacketReader;
