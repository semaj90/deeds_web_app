import { loadRepoEnv } from '../env.js';
import {
  extractPacketIdentityFromRow,
  verifyPacketIdentityConsistency,
  createEnvelopeFromRow,
  type AtlasMemoryEnvelope,
} from '../core/canonical-packet-bridge.js';
import type { QueryResultRow } from 'pg';

// Phase 2: Packet-centric telemetry (optional — adapter works without it)
let recordPacketCentricTelemetry: ((event: any) => Promise<void>) | null = null;
// Intentionally left null here: this package must not depend on the app checkout
// for a build-time telemetry import. The app can inject telemetry separately.

export interface QdrantPoint {
  id: string | number;
  payload: Record<string, unknown>;
  vector?: number[];
}

export interface QdrantSearchResult {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
}

export interface QdrantAdapter {
  baseUrl: string;
  getPoint: (collection: string, pointId: string | number) => Promise<Record<string, unknown> | null>;
  scrollPoints: (collection: string, options?: {
    filter?: Record<string, unknown>;
    limit?: number;
    offset?: string | null;
    withPayload?: boolean;
  }) => Promise<{ points: QdrantPoint[]; nextOffset: string | null }>;
  searchVectors: (collection: string, vector: number[], options?: {
    limit?: number;
    filter?: Record<string, unknown>;
    withPayload?: boolean;
  }) => Promise<QdrantSearchResult[]>;
  countPoints: (collection: string, filter?: Record<string, unknown>) => Promise<number>;
  /** Upsert point with canonical envelope-shaped payload */
  upsertPoint: (
    collection: string,
    pointId: string | number,
    vector: number[],
    packetRow: QueryResultRow,
    traceId: string
  ) => Promise<void>;
}

export function createQdrantAdapter(baseUrl?: string): QdrantAdapter {
  const env = loadRepoEnv();
  const rawUrl = baseUrl ?? env.QDRANT_URL ?? env.PUBLIC_QDRANT_URL ?? '';
  const url = /^https?:\/\//.test(rawUrl)
    ? rawUrl.replace(/\/$/, '')
    : `http://${env.QDRANT_HOST ?? '127.0.0.1'}:${env.QDRANT_PORT ?? '6333'}`;

  async function qdrantFetch(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${url}${path}`, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Qdrant ${init?.method ?? 'GET'} ${path} → ${res.status}`);
    return res.json();
  }

  async function getPoint(collection: string, pointId: string | number): Promise<Record<string, unknown> | null> {
    try {
      const data = await qdrantFetch(`/collections/${collection}/points/${pointId}`) as { result?: { payload?: Record<string, unknown> } };
      return data.result?.payload ?? null;
    } catch {
      return null;
    }
  }

  async function scrollPoints(
    collection: string,
    options: { filter?: Record<string, unknown>; limit?: number; offset?: string | null; withPayload?: boolean } = {},
  ): Promise<{ points: QdrantPoint[]; nextOffset: string | null }> {
    const body: Record<string, unknown> = {
      limit: options.limit ?? 100,
      with_payload: options.withPayload ?? true,
      with_vector: false,
    };
    if (options.filter) body.filter = options.filter;
    if (options.offset) body.offset = options.offset;

    const data = await qdrantFetch(`/collections/${collection}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as { result?: { points?: QdrantPoint[]; next_page_offset?: string | null } };

    return {
      points: (data.result?.points ?? []).map(p => ({ ...p, payload: p.payload ?? {} })),
      nextOffset: data.result?.next_page_offset ?? null,
    };
  }

  async function searchVectors(
    collection: string,
    vector: number[],
    options: { limit?: number; filter?: Record<string, unknown>; withPayload?: boolean } = {},
  ): Promise<QdrantSearchResult[]> {
    const body: Record<string, unknown> = {
      vector,
      limit: options.limit ?? 10,
      with_payload: options.withPayload ?? true,
    };
    if (options.filter) body.filter = options.filter;

    const data = await qdrantFetch(`/collections/${collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as { result?: QdrantSearchResult[] };

    return data.result ?? [];
  }

  async function countPoints(collection: string, filter?: Record<string, unknown>): Promise<number> {
    const body = filter ? { filter } : {};
    const data = await qdrantFetch(`/collections/${collection}/points/count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as { result?: { count?: number } };
    return data.result?.count ?? 0;
  }

  async function upsertPoint(
    collection: string,
    pointId: string | number,
    vector: number[],
    packetRow: QueryResultRow,
    traceId: string
  ): Promise<void> {
    const startTime = Date.now();

    // Extract and verify canonical identity before writing
    const identity = extractPacketIdentityFromRow(packetRow);
    const { consistent, mismatches } = verifyPacketIdentityConsistency(identity, packetRow);
    if (!consistent) {
      throw new Error(`Cannot upsert Qdrant point: ${mismatches.join('; ')}`);
    }

    // Create envelope with all canonical fields
    const envelope = createEnvelopeFromRow(packetRow, traceId, 'packet');

    // Build envelope-shaped payload (always include identity + trace fields)
    const payload: Record<string, unknown> = {
      // Canonical identity (immutable spine)
      packet_key: envelope.packet_key,
      source_ref: envelope.source_ref,
      feature_id: envelope.feature_id,
      directory_path: packetRow.directory_path,
      file_path: packetRow.file_path,
      function_symbol: packetRow.function_symbol,
      feature_label: packetRow.feature_label,
      title_id: packetRow.title_id,
      tree_node_id: packetRow.tree_node_id ? String(packetRow.tree_node_id) : null,
      parent_packet_key: packetRow.parent_packet_key,
      domain_class: packetRow.domain_class,

      // Audit trail
      trace_id: envelope.trace_id,

      // Content fields
      summary: packetRow.summary,
      embedding_status: packetRow.embedding_status,

      // Topology fields
      som_x: packetRow.som_x,
      som_y: packetRow.som_y,
      som_row: packetRow.som_row ?? packetRow.som_x,
      som_col: packetRow.som_col ?? packetRow.som_y,
      som_index: packetRow.som_index,
      som_cluster: packetRow.som_cluster,
      kmeans_cluster: packetRow.kmeans_cluster ?? packetRow.kmeans_cluster_id,

      // Ranking fields
      karpathy_score: packetRow.karpathy_score,
      community_id: packetRow.community_id,
      page_rank_score: packetRow.page_rank_score ?? packetRow.pagerank,

      // Batch tracking
      batch_id: packetRow.batch_id,
      glyph_id: packetRow.glyph_id,
    };

    // Upsert to Qdrant
    const body: Record<string, unknown> = {
      points: [
        {
          id: pointId,
          vector,
          payload,
        },
      ],
    };

    await qdrantFetch(`/collections/${collection}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // Phase 2: Emit packet-centric telemetry (non-blocking)
    if (recordPacketCentricTelemetry) {
      recordPacketCentricTelemetry({
        selected_packet_key: envelope.packet_key,
        selected_feature_id: envelope.feature_id,
        latency_ms: Date.now() - startTime,
        retrieval_strategy: 'vector_only',
        packet_context: {
          packet_id: envelope.packet_key,
          feature_id: envelope.feature_id,
          tree_node_id: packetRow.tree_node_id ? String(packetRow.tree_node_id) : null,
          som_cell: packetRow.som_cluster,
          schema_version: 1,
          embedding_version: 'embeddinggemma:latest',
          tool_version: 'mcp:1.0',
          gpu_kernel_version: 'tensorrt_bridge:1.0',
          rpc_transport: 'jsonrpc',
        },
      }).catch((err) => {
        console.debug('[Qdrant Adapter] Telemetry failed (non-blocking):', err);
      });
    }
  }

  return { baseUrl: url, getPoint, scrollPoints, searchVectors, countPoints, upsertPoint };
}
