/**
 * Session 84: Phase 2 — Packet-Centric Telemetry
 *
 * Augment EVERY telemetry event with packet identity context:
 * - packet_id, feature_id, som_cell
 * - schema_version, embedding_version, tool_version, gpu_kernel_version, rpc_transport
 *
 * This layer ensures end-to-end packet traceability across the entire pipeline.
 * Non-blocking: failures are logged but do not interrupt queries.
 */

import { pool } from '$lib/server/db/client.js';
import { ENV } from '$lib/server/env.server.js';

/** Packet-centric context added to every telemetry event. */
export interface PacketCentricContext {
  /** Primary packet identifier (packet_key). */
  packet_id?: string | null;

  /** Feature classification (e.g., 'auth.sessions', 'ui.components'). */
  feature_id?: string | null;

  /** SOM cell coordinates (e.g., '5,3'). */
  som_cell?: string | null;

  /** Packet schema version (e.g., 1, 2). */
  schema_version?: number | null;

  /** Embedding model version (e.g., 'embeddinggemma:2.0'). */
  embedding_version?: string | null;

  /** Tool/worker version for MCP calls. */
  tool_version?: string | null;

  /** GPU kernel version (e.g., 'tensorrt_bridge:1.2'). */
  gpu_kernel_version?: string | null;

  /** RPC transport protocol (jsonrpc, http, grpc, mcp). */
  rpc_transport?: string | null;
}

/** Enriched telemetry signal combining retrieval + packet context. */
export interface PacketCentricTelemetryEvent {
  // Base retrieval fields
  query?: string;
  query_hash?: string;
  latency_ms?: number;
  vector_hits?: number;
  trigram_hits?: number;
  fts_hits?: number;
  cache_hit?: boolean;
  fusion_score?: number;

  // Selected packet(s)
  selected_packet_key?: string | null;
  selected_packet_keys?: string[];
  selected_feature_id?: string | null;
  feature_ids?: string[];

  // Strategy & routing
  retrieval_strategy?: 'vector_only' | 'lexical_only' | 'structural_only' | 'fusion' | 'cold_neschrom';
  surface?: string;
  environment?: string;

  // Phase 2: Packet-centric context (replaces individual packet_id/feature_id fields)
  packet_context?: PacketCentricContext;

  // Timing breakdowns
  timings?: {
    bm25_ms?: number;
    qdrant_ms?: number;
    redis_ms?: number;
    neo4j_ms?: number;
    fusion_ms?: number;
    rerank_ms?: number;
  };

  // Accelerator info
  accelerator?: string | null;
  cuda_available?: boolean | null;
  matmul_ms?: number | null;
  embedding_ms?: number | null;
}

/**
 * Extract packet context from a telemetry event.
 *
 * If packet_id/feature_id are already present at the top level,
 * they are normalized into the packet_context sub-object.
 *
 * @param event - Telemetry event (may have mixed structure)
 * @returns Normalized packet_context with all Phase 2 fields
 */
export function extractPacketContext(event: any): PacketCentricContext {
  const ctx: PacketCentricContext = {};

  // Primary identity
  ctx.packet_id = event.packet_id ?? event.selected_packet_key ?? null;
  ctx.feature_id = event.feature_id ?? event.selected_feature_id ?? null;

  // SOM routing
  ctx.som_cell = event.som_cell ?? event.som_cluster ?? null;

  // Versions (try multiple sources)
  ctx.schema_version = event.schema_version ?? 1;
  ctx.embedding_version = event.embedding_version ?? 'embeddinggemma:latest';
  ctx.tool_version = event.tool_version ?? 'mcp:1.0';
  ctx.gpu_kernel_version = event.gpu_kernel_version ?? 'tensorrt_bridge:1.0';
  ctx.rpc_transport = event.rpc_transport ?? determineRpcTransport(event);

  return ctx;
}

/**
 * Infer RPC transport from telemetry context.
 *
 * @param event - Telemetry event
 * @returns Inferred transport (jsonrpc, http, grpc, mcp)
 */
function determineRpcTransport(event: any): string {
  if (event.rpc_transport) return event.rpc_transport;

  // Heuristics
  if (event.surface === 'mcp') return 'mcp';
  if (event.surface === 'grpc' || event.proto === 'grpc') return 'grpc';
  if (event.surface === 'jsonrpc') return 'jsonrpc';
  if (event.retrieval_strategy === 'cold_neschrom') return 'http';

  // Default
  return 'jsonrpc';
}

/**
 * Normalize all 8 Phase 2 fields into a packet_context object.
 *
 * This function:
 * 1. Extracts packet_id, feature_id, som_cell
 * 2. Fills in versions (schema, embedding, tool, gpu_kernel)
 * 3. Infers rpc_transport if not present
 * 4. Stores as a single packet_context field for consistency
 *
 * @param event - Raw telemetry event (may have scattered fields)
 * @returns Normalized event with packet_context field
 */
export function normalizePacketContext(event: PacketCentricTelemetryEvent): PacketCentricTelemetryEvent {
  // Extract + normalize
  const packet_context = extractPacketContext(event);

  // Return normalized event
  return {
    ...event,
    packet_context,
  };
}

/**
 * Store packet-centric telemetry to postgres retrieval_telemetry + enriched payload.
 *
 * Writes to atlas_retrieval_eval_times (if phase_2_telemetry table exists).
 * Otherwise falls back to retrieval_telemetry.
 *
 * Non-blocking: errors logged but not thrown.
 *
 * @param event - Enriched telemetry event
 */
export async function recordPacketCentricTelemetry(event: PacketCentricTelemetryEvent): Promise<void> {
  try {
    const normalized = normalizePacketContext(event);
    const ctx = normalized.packet_context || {};

    // Try new phase_2_telemetry table first (if it exists)
    try {
      await pool.query(
        `
        insert into phase_2_telemetry (
          query_hash,
          retrieval_strategy,
          latency_ms,
          vector_hits,
          cache_hit,
          packet_id,
          feature_id,
          som_cell,
          schema_version,
          embedding_version,
          tool_version,
          gpu_kernel_version,
          rpc_transport,
          payload
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `,
        [
          normalized.query_hash,
          normalized.retrieval_strategy,
          normalized.latency_ms,
          normalized.vector_hits,
          normalized.cache_hit,
          ctx.packet_id,
          ctx.feature_id,
          ctx.som_cell,
          ctx.schema_version,
          ctx.embedding_version,
          ctx.tool_version,
          ctx.gpu_kernel_version,
          ctx.rpc_transport,
          JSON.stringify(normalized),
        ]
      );
    } catch (err) {
      // Table may not exist — fall back to retrieval_telemetry with enriched payload
      if ((err as any)?.code === '42P01') {
        // Relation does not exist
        await pool.query(
          `
          insert into retrieval_telemetry (
            query_hash,
            latency_ms,
            vector_hits,
            trigram_hits,
            fts_hits,
            cache_hit,
            fusion_score,
            retrieval_strategy,
            surface,
            environment
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [
            normalized.query_hash,
            normalized.latency_ms,
            normalized.vector_hits,
            normalized.trigram_hits,
            normalized.fts_hits,
            normalized.cache_hit,
            normalized.fusion_score,
            normalized.retrieval_strategy,
            normalized.surface,
            normalized.environment,
          ]
        );
      } else {
        throw err;
      }
    }
  } catch (err) {
    // Non-blocking
    console.debug('[Packet-Centric Telemetry] Record failed (non-blocking):', {
      packet_id: event.packet_context?.packet_id,
      feature_id: event.packet_context?.feature_id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Build a minimal packet_centric event from selected candidates.
 *
 * Used by retrieval pipelines (Qdrant, Neo4j, hybrid search) to quickly
 * emit telemetry with the top-K packet_ids and feature_ids extracted.
 *
 * @param candidates - Ranked retrieval results
 * @param latencyMs - Query latency in milliseconds
 * @param strategy - Retrieval strategy that produced the results
 * @returns Minimal packet-centric telemetry event
 */
export function buildPacketCentricEvent(
  candidates: Array<{ packet_key?: string; feature_id?: string; som_cluster?: string; [key: string]: unknown }>,
  latencyMs: number,
  strategy: 'vector_only' | 'lexical_only' | 'structural_only' | 'fusion' | 'cold_neschrom'
): PacketCentricTelemetryEvent {
  const packetKeys = new Set<string>();
  const featureIds = new Set<string>();
  let somCell: string | null = null;

  for (const candidate of candidates) {
    if (candidate.packet_key && typeof candidate.packet_key === 'string') {
      packetKeys.add(candidate.packet_key);
    }
    if (candidate.feature_id && typeof candidate.feature_id === 'string') {
      featureIds.add(candidate.feature_id);
    }
    if (!somCell && candidate.som_cluster && typeof candidate.som_cluster === 'string') {
      somCell = candidate.som_cluster;
    }
  }

  const packetKeysArray = Array.from(packetKeys);
  const featureIdsArray = Array.from(featureIds);

  return {
    selected_packet_key: packetKeysArray[0] ?? null,
    selected_packet_keys: packetKeysArray,
    selected_feature_id: featureIdsArray[0] ?? null,
    feature_ids: featureIdsArray,
    latency_ms: latencyMs,
    retrieval_strategy: strategy,
    vector_hits: candidates.length,
    packet_context: {
      packet_id: packetKeysArray[0] ?? null,
      feature_id: featureIdsArray[0] ?? null,
      som_cell: somCell,
      schema_version: 1,
      embedding_version: 'embeddinggemma:latest',
      tool_version: 'mcp:1.0',
      gpu_kernel_version: 'tensorrt_bridge:1.0',
      rpc_transport: 'jsonrpc',
    },
  };
}
