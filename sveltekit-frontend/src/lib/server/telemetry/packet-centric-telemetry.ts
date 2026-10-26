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
import { recordRetrievalEvalTelemetry } from './retrieval-recorder.js';
import type { TransportTelemetry } from '../grpc/transport-telemetry.js';
import { TransportTelemetrySchema } from '../grpc/transport-telemetry.js';
import { ResourceOperationObservationSchema, type ResourceOperationObservation } from './gpu-telemetry.js';
import { validateTelemetryTraceBinding } from './acp-observation.js';

/** Packet-centric context added to every telemetry event. */
export interface PacketCentricContext {
  source_ref?: string | null;
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
  trace_id?: string | null;
  acp_observation?: import('./acp-observation.js').AcpObservation;
  resource_observation?: ResourceOperationObservation;
  transport_telemetry?: TransportTelemetry;
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
  const provided = event.packet_context ?? {};
  return {
    packet_id: Object.hasOwn(provided, 'packet_id') ? provided.packet_id : event.packet_id ?? event.selected_packet_key ?? null,
    source_ref: Object.hasOwn(provided, 'source_ref') ? provided.source_ref : event.source_ref ?? null,
    feature_id: Object.hasOwn(provided, 'feature_id') ? provided.feature_id : event.feature_id ?? event.selected_feature_id ?? null,
    som_cell: Object.hasOwn(provided, 'som_cell') ? provided.som_cell : event.som_cell ?? event.som_cluster ?? null,
    schema_version: Object.hasOwn(provided, 'schema_version') ? provided.schema_version : event.schema_version ?? null,
    embedding_version: Object.hasOwn(provided, 'embedding_version') ? provided.embedding_version : event.embedding_version ?? null,
    tool_version: Object.hasOwn(provided, 'tool_version') ? provided.tool_version : event.tool_version ?? null,
    gpu_kernel_version: Object.hasOwn(provided, 'gpu_kernel_version') ? provided.gpu_kernel_version : event.gpu_kernel_version ?? null,
    rpc_transport: Object.hasOwn(provided, 'rpc_transport') ? provided.rpc_transport : event.rpc_transport ?? null,
  };
}

/**
 * Normalize all 8 Phase 2 fields into a packet_context object.
 *
 * This function:
 * 1. Extracts packet_id, feature_id, som_cell
 * 2. Preserves supplied versions (schema, embedding, tool, gpu_kernel)
 * 3. Leaves unobserved versions and rpc_transport null
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
 * Store packet-centric telemetry with its enriched payload.
 *
 * Writes to phase_2_telemetry when present.
 * Otherwise reuses the existing atlas_retrieval_eval_times writer.
 *
 * Non-blocking: errors logged but not thrown.
 *
 * @param event - Enriched telemetry event
 */
export async function recordPacketCentricTelemetry(event: PacketCentricTelemetryEvent): Promise<void> {
  await recordPacketCentricTelemetryAcknowledged(event);
}

export async function recordPacketCentricTelemetryAcknowledged(event: PacketCentricTelemetryEvent): Promise<boolean> {
  try {
    const normalized = normalizePacketContext(event);
    if (normalized.acp_observation) {
      const { AcpObservationSchema } = await import('./acp-observation.js');
      normalized.acp_observation = AcpObservationSchema.parse(normalized.acp_observation);
    }
    normalized.trace_id = validateTelemetryTraceBinding(normalized.trace_id, normalized.acp_observation);
    if (normalized.transport_telemetry) normalized.transport_telemetry = TransportTelemetrySchema.parse(normalized.transport_telemetry);
    if (normalized.resource_observation) normalized.resource_observation = ResourceOperationObservationSchema.parse(normalized.resource_observation);
    validateTelemetryTraceBinding(normalized.trace_id, normalized.transport_telemetry);
    validateTelemetryTraceBinding(normalized.trace_id, normalized.resource_observation);
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
      // Table may not exist — reuse the existing eval writer with pointer-only provenance.
      if ((err as any)?.code === '42P01') {
        // Relation does not exist
        await recordRetrievalEvalTelemetry({
          query: normalized.query, queryHash: normalized.query_hash, latencyMs: normalized.latency_ms,
          vectorHits: normalized.vector_hits ?? 0, trigramHits: normalized.trigram_hits ?? 0,
          ftsHits: normalized.fts_hits ?? 0, selectedPacketKey: ctx.packet_id,
          selectedPacketKeys: normalized.selected_packet_keys ?? (ctx.packet_id ? [ctx.packet_id] : []),
          selectedFeatureId: ctx.feature_id, featureIds: normalized.feature_ids,
          sourceRef: ctx.source_ref, protocol: ctx.rpc_transport ?? undefined,
          surface: normalized.surface ?? 'unknown', environment: normalized.environment ?? 'unknown',
          cacheHit: normalized.cache_hit, retrievalStrategy: normalized.retrieval_strategy,
          timings: normalized.timings, accelerator: normalized.accelerator,
          cudaAvailable: normalized.cuda_available, matmulMs: normalized.matmul_ms,
          embeddingMs: normalized.embedding_ms,
          hitsPayload: { trace_id: normalized.trace_id, packet_context: ctx, transport_telemetry: normalized.transport_telemetry,
            resource_observation: normalized.resource_observation, acp_observation: normalized.acp_observation },
        });
      } else {
        throw err;
      }
    }
    return true;
  } catch (err) {
    // Non-blocking
    console.debug('[Packet-Centric Telemetry] Record failed (non-blocking):', {
      packet_id: event.packet_context?.packet_id,
      feature_id: event.packet_context?.feature_id,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
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
  return { ...selectPacketTelemetryCandidates(candidates), latency_ms: latencyMs,
    retrieval_strategy: strategy, vector_hits: candidates.length };
}

export function selectPacketTelemetryCandidates(
  candidates: Array<{ packet_key?: string; feature_id?: string; som_cluster?: string; [key: string]: unknown }>,
): Pick<PacketCentricTelemetryEvent, 'selected_packet_key' | 'selected_packet_keys' | 'selected_feature_id' | 'feature_ids' | 'packet_context'> {
  const packetKeys = new Set<string>();
  const featureIds = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.packet_key && typeof candidate.packet_key === 'string') {
      packetKeys.add(candidate.packet_key);
    }
    if (candidate.feature_id && typeof candidate.feature_id === 'string') {
      featureIds.add(candidate.feature_id);
    }
  }

  const packetKeysArray = Array.from(packetKeys);
  const featureIdsArray = Array.from(featureIds);
  const primaryCandidate = packetKeysArray.length > 0
    ? candidates.find((candidate) => candidate.packet_key === packetKeysArray[0]) : undefined;

  return {
    selected_packet_key: packetKeysArray[0] ?? null,
    selected_packet_keys: packetKeysArray,
    selected_feature_id: typeof primaryCandidate?.feature_id === 'string' ? primaryCandidate.feature_id : null,
    feature_ids: featureIdsArray,
    packet_context: {
      packet_id: packetKeysArray[0] ?? null,
      source_ref: typeof primaryCandidate?.source_ref === 'string' ? primaryCandidate.source_ref : null,
      feature_id: typeof primaryCandidate?.feature_id === 'string' ? primaryCandidate.feature_id : null,
      som_cell: typeof primaryCandidate?.som_cell === 'string' ? primaryCandidate.som_cell
        : typeof primaryCandidate?.som_cluster === 'string' ? primaryCandidate.som_cluster : null,
      schema_version: null,
      embedding_version: null,
      tool_version: null,
      gpu_kernel_version: null,
      rpc_transport: null,
    },
  };
}
