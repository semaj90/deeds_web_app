/**
 * Packet Reader — Canonical Ingestion from Postgres
 *
 * Reads atlas_packets (identity/metadata) and codebase_chunk_index (embeddings).
 * Routes by policy task type (error-fixing, semantic-diff, qdrant-mirror, etc).
 * Yields packets with full context for downstream processing.
 *
 * Canonical truth: Postgres (never cache or Qdrant as source).
 * Output: Packet[] with identity + embeddings + policy classification.
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

export class PacketReader {
  private pool: PoolType;

  constructor(connectionString?: string) {
    this.pool = new Pool({
      connectionString:
        connectionString ||
        `postgres://${process.env.DB_USER || 'legal_admin'}:${process.env.DB_PASSWORD || '123456'}@${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || '5432'}/legal_ai_db`
    });
  }

  /**
   * Read packets from canonical truth (Postgres)
   * Joins atlas_packets + codebase_chunk_index for embeddings
   */
  async readPackets(options: PacketReaderOptions = {}): Promise<Packet[]> {
    const { batchSize = 256, limit = 10000, filters = {} } = options;

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
        cci.content_embedding,
        cci.embedding_dimension
      FROM atlas_packets ap
      LEFT JOIN codebase_chunk_index cci ON cci.source_ref = ap.source_ref
      WHERE ${whereClause}
      LIMIT $${paramIndex}
    `;

    try {
      const result: QueryResult = await this.pool.query(query, params);
      const packets: Packet[] = result.rows.map((row: any) => ({
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        feature_label: row.feature_label,
        directory_path: row.directory_path,
        embedding: row.content_embedding
          ? new Float32Array(row.content_embedding)
          : undefined,
        embedding_dim: row.embedding_dimension,
        som_cluster: row.som_cluster,
        summary: row.summary,
        metadata: row.metadata || {}
      }));

      return packets;
    } catch (err) {
      console.error('PacketReader: Failed to read packets:', err);
      throw err;
    }
  }

  /**
   * Stream packets in batches (memory-efficient for large datasets)
   */
  async *streamPackets(
    options: PacketReaderOptions = {}
  ): AsyncGenerator<Packet[]> {
    const { batchSize = 256, limit = 10000 } = options;

    let offset = 0;
    let totalRead = 0;

    while (totalRead < limit) {
      const toRead = Math.min(batchSize, limit - totalRead);
      const batch = await this.readPackets({
        ...options,
        limit: toRead
      });

      if (batch.length === 0) break;
      yield batch;

      totalRead += batch.length;
      offset += batch.length;
    }
  }

  /**
   * Validate packet identity (hard fail if missing critical fields)
   */
  validatePacket(packet: Packet): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!packet.packet_key) errors.push('Missing packet_key (identity)');
    if (!packet.source_ref) errors.push('Missing source_ref (lineage)');
    if (!packet.feature_id) errors.push('Missing feature_id (clustering)');
    if (!packet.feature_label) errors.push('Missing feature_label (context)');

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default PacketReader;
