import pg from 'pg';
import type { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import { resolveDatabaseUrl, loadRepoEnv } from '../env.js';
import {
  extractPacketIdentityFromRow,
  verifyPacketIdentityConsistency,
  createEnvelopeFromRow,
  type AtlasMemoryEnvelope,
} from '../core/canonical-packet-bridge.js';

// Phase 2: Packet-centric telemetry (optional — adapter works without it)
let recordPacketCentricTelemetry: ((event: any) => Promise<void>) | null = null;
// Intentionally left null here: this package must not depend on the app checkout
// for a build-time telemetry import. The app can inject telemetry separately.

export interface PostgresAdapter {
  pool: Pool;
  query: <T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  close: () => Promise<void>;
  /** Log packet operation to audit trail with envelope metadata */
  auditPacketOperation: (
    packetRow: QueryResultRow,
    traceId: string,
    operation: 'create' | 'update' | 'delete' | 'sync',
    metadata?: Record<string, unknown>
  ) => Promise<void>;
}

export function createPostgresAdapter(connectionString?: string): PostgresAdapter {
  const env = loadRepoEnv();
  const url = connectionString ?? resolveDatabaseUrl(env);
  const pool = new pg.Pool({ connectionString: url });

  async function query<T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await pool.query<T>(sql, params);
    return result.rows;
  }

  async function close(): Promise<void> {
    await pool.end();
  }

  async function auditPacketOperation(
    packetRow: QueryResultRow,
    traceId: string,
    operation: 'create' | 'update' | 'delete' | 'sync',
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const startTime = Date.now();

    // Extract and verify canonical identity
    const identity = extractPacketIdentityFromRow(packetRow);
    const { consistent, mismatches } = verifyPacketIdentityConsistency(identity, packetRow);
    if (!consistent) {
      throw new Error(`Cannot audit packet operation: ${mismatches.join('; ')}`);
    }

    // Create envelope with full context
    const envelope = createEnvelopeFromRow(packetRow, traceId, 'packet');

    // Insert audit log with envelope shape
    const sql = `
      INSERT INTO atlas_packet_audit_trail (
        packet_key,
        source_ref,
        feature_id,
        operation,
        trace_id,
        envelope_data,
        metadata,
        timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `;

    const envelopeData = {
      trace_id: envelope.trace_id,
      packet_key: envelope.packet_key,
      source_ref: envelope.source_ref,
      feature_id: envelope.feature_id,
      directory_path: packetRow.directory_path,
      file_path: packetRow.file_path,
      function_symbol: packetRow.function_symbol,
      feature_label: packetRow.feature_label,
      summary: packetRow.summary,
      embedding_status: packetRow.embedding_status,
      som_cluster: packetRow.som_cluster,
      community_id: packetRow.community_id,
      batch_id: packetRow.batch_id,
    };

    try {
      await query(sql, [
        envelope.packet_key,
        envelope.source_ref,
        envelope.feature_id,
        operation,
        envelope.trace_id,
        JSON.stringify(envelopeData),
        JSON.stringify(metadata),
      ]);

      // Phase 2: Emit packet-centric telemetry (non-blocking)
      if (recordPacketCentricTelemetry) {
        recordPacketCentricTelemetry({
          selected_packet_key: envelope.packet_key,
          selected_feature_id: envelope.feature_id,
          latency_ms: Date.now() - startTime,
          retrieval_strategy: 'audit_trail',
          packet_context: {
            packet_id: envelope.packet_key,
            feature_id: envelope.feature_id,
            som_cell: packetRow.som_cluster,
            schema_version: 1,
            embedding_version: 'embeddinggemma:latest',
            tool_version: 'mcp:1.0',
            gpu_kernel_version: 'tensorrt_bridge:1.0',
            rpc_transport: 'jsonrpc',
          },
        }).catch((err) => {
          console.debug('[Postgres Adapter] Telemetry failed (non-blocking):', err);
        });
      }
    } catch (error) {
      // Log audit failures but don't throw — audit trail is best-effort
      console.error(`Failed to audit packet operation: ${error}`);
    }
  }

  return { pool, query, close, auditPacketOperation };
}

export async function withPostgres<T>(
  fn: (adapter: PostgresAdapter) => Promise<T>,
  connectionString?: string,
): Promise<T> {
  const adapter = createPostgresAdapter(connectionString);
  try {
    return await fn(adapter);
  } finally {
    await adapter.close();
  }
}
