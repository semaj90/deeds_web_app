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

export interface Neo4jQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface Neo4jAdapter {
  baseUrl: string;
  query: (cypher: string, params?: Record<string, unknown>) => Promise<Neo4jQueryResult>;
  count: (cypher: string, params?: Record<string, unknown>) => Promise<number>;
  /** Create or update packet node with canonical identity metadata */
  upsertPacketNode: (
    packetRow: QueryResultRow,
    traceId: string
  ) => Promise<string | null>;
  /** Create relationship with trace_id in properties */
  createRelationshipWithTrace: (
    sourceNodeId: string,
    relationshipType: string,
    targetNodeId: string,
    traceId: string,
    properties?: Record<string, unknown>
  ) => Promise<void>;
}

export function createNeo4jAdapter(overrideUrl?: string): Neo4jAdapter {
  const env = loadRepoEnv();
  const rawUrl = overrideUrl
    ?? env.NEO4J_HTTP_URL
    ?? (env.NEO4J_URL ?? 'http://localhost:7474')
      .replace(/^bolt:\/\/|^neo4j:\/\//i, 'http://')
      .replace(':7687', ':7474');
  const baseUrl = rawUrl.replace(/\/$/, '');
  const user = env.NEO4J_USER ?? 'neo4j';
  const password = env.NEO4J_PASSWORD ?? env.NEO4J_PASS ?? 'neo4j';
  const auth = Buffer.from(`${user}:${password}`).toString('base64');

  async function query(cypher: string, params: Record<string, unknown> = {}): Promise<Neo4jQueryResult> {
    const res = await fetch(`${baseUrl}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        statements: [{ statement: cypher, parameters: params }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(`Neo4j query failed: ${res.status}`);
    }

    const data = await res.json() as {
      results?: Array<{ columns: string[]; data: Array<{ row: unknown[] }> }>;
      errors?: Array<{ message: string }>;
    };

    if (data.errors?.length) {
      throw new Error(`Neo4j error: ${data.errors[0].message}`);
    }

    const result = data.results?.[0];
    if (!result) return { columns: [], rows: [] };

    const columns = result.columns;
    const rows = result.data.map(d => {
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => { row[col] = d.row[i]; });
      return row;
    });

    return { columns, rows };
  }

  async function count(cypher: string, params: Record<string, unknown> = {}): Promise<number> {
    const result = await query(cypher, params);
    const first = result.rows[0];
    if (!first) return 0;
    const val = Object.values(first)[0];
    return typeof val === 'number' ? val : Number(val) || 0;
  }

  async function upsertPacketNode(
    packetRow: QueryResultRow,
    traceId: string
  ): Promise<string | null> {
    const startTime = Date.now();

    // Extract and verify canonical identity
    const identity = extractPacketIdentityFromRow(packetRow);
    const { consistent, mismatches } = verifyPacketIdentityConsistency(identity, packetRow);
    if (!consistent) {
      throw new Error(`Cannot upsert Neo4j packet node: ${mismatches.join('; ')}`);
    }

    // Create envelope for audit trail
    const envelope = createEnvelopeFromRow(packetRow, traceId, 'packet');

    // Upsert packet node with canonical identity fields + trace_id
    const cypher = `
      MERGE (p:Packet { packet_key: $packet_key })
      ON CREATE SET
        p.source_ref = $source_ref,
        p.feature_id = $feature_id,
        p.directory_path = $directory_path,
        p.file_path = $file_path,
        p.function_symbol = $function_symbol,
        p.feature_label = $feature_label,
        p.title_id = $title_id,
        p.tree_node_id = $tree_node_id,
        p.parent_packet_key = $parent_packet_key,
        p.domain_class = $domain_class,
        p.summary = $summary,
        p.trace_id = $trace_id,
        p.embedding_status = $embedding_status,
        p.som_x = $som_x,
        p.som_y = $som_y,
        p.som_row = $som_row,
        p.som_col = $som_col,
        p.som_index = $som_index,
        p.som_cluster = $som_cluster,
        p.kmeans_cluster = $kmeans_cluster,
        p.karpathy_score = $karpathy_score,
        p.community_id = $community_id,
        p.page_rank_score = $page_rank_score,
        p.batch_id = $batch_id,
        p.created_at = timestamp()
      ON MATCH SET
        p.summary = $summary,
        p.trace_id = $trace_id,
        p.embedding_status = $embedding_status,
        p.karpathy_score = $karpathy_score,
        p.tree_node_id = $tree_node_id,
        p.parent_packet_key = $parent_packet_key,
        p.domain_class = $domain_class,
        p.som_x = $som_x,
        p.som_y = $som_y,
        p.som_row = $som_row,
        p.som_col = $som_col,
        p.som_index = $som_index,
        p.som_cluster = $som_cluster,
        p.kmeans_cluster = $kmeans_cluster,
        p.community_id = $community_id,
        p.page_rank_score = $page_rank_score,
        p.updated_at = timestamp()
      RETURN id(p) as nodeId
    `;

    const result = await query(cypher, {
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
      summary: packetRow.summary,
      trace_id: envelope.trace_id,
      embedding_status: packetRow.embedding_status,
      som_x: packetRow.som_x,
      som_y: packetRow.som_y,
      som_row: packetRow.som_row ?? packetRow.som_x,
      som_col: packetRow.som_col ?? packetRow.som_y,
      som_index: packetRow.som_index,
      som_cluster: packetRow.som_cluster,
      kmeans_cluster: packetRow.kmeans_cluster ?? packetRow.kmeans_cluster_id,
      karpathy_score: packetRow.karpathy_score,
      community_id: packetRow.community_id,
      page_rank_score: packetRow.page_rank_score ?? packetRow.pagerank,
      batch_id: packetRow.batch_id,
    });

    const nodeId = result.rows[0]?.nodeId;

    // Phase 2: Emit packet-centric telemetry (non-blocking)
    if (recordPacketCentricTelemetry) {
      recordPacketCentricTelemetry({
        selected_packet_key: envelope.packet_key,
        selected_feature_id: envelope.feature_id,
        latency_ms: Date.now() - startTime,
        retrieval_strategy: 'graph_topology',
        packet_context: {
          packet_id: envelope.packet_key,
          feature_id: envelope.feature_id,
          tree_node_id: packetRow.tree_node_id ? String(packetRow.tree_node_id) : null,
          som_cell: packetRow.som_cluster,
          schema_version: 1,
          embedding_version: 'embeddinggemma:latest',
          tool_version: 'mcp:1.0',
          gpu_kernel_version: 'tensorrt_bridge:1.0',
          rpc_transport: 'grpc',
        },
      }).catch((err) => {
        console.debug('[Neo4j Adapter] Telemetry failed (non-blocking):', err);
      });
    }

    return nodeId ? String(nodeId) : null;
  }

  async function createRelationshipWithTrace(
    sourceNodeId: string,
    relationshipType: string,
    targetNodeId: string,
    traceId: string,
    properties: Record<string, unknown> = {}
  ): Promise<void> {
    const startTime = Date.now();

    // Always include trace_id in relationship properties
    const relationshipProps = {
      ...properties,
      trace_id: traceId,
      created_at: new Date().toISOString(),
    };

    const cypher = `
      MATCH (a) WHERE id(a) = $sourceId
      MATCH (b) WHERE id(b) = $targetId
      CREATE (a)-[r:${relationshipType} $props]->(b)
      RETURN r
    `;

    await query(cypher, {
      sourceId: parseInt(sourceNodeId, 10),
      targetId: parseInt(targetNodeId, 10),
      props: relationshipProps,
    });

    // Phase 2: Emit packet-centric telemetry for relationship creation (non-blocking)
    if (recordPacketCentricTelemetry) {
      recordPacketCentricTelemetry({
        selected_packet_key: sourceNodeId,
        selected_feature_id: relationshipType,
        latency_ms: Date.now() - startTime,
        retrieval_strategy: 'graph_relationship',
        packet_context: {
          packet_id: sourceNodeId,
          feature_id: relationshipType,
          som_cell: null,
          schema_version: 1,
          embedding_version: 'embeddinggemma:latest',
          tool_version: 'mcp:1.0',
          gpu_kernel_version: 'tensorrt_bridge:1.0',
          rpc_transport: 'grpc',
        },
      }).catch((err) => {
        console.debug('[Neo4j Adapter] Relationship telemetry failed (non-blocking):', err);
      });
    }
  }

  return { baseUrl, query, count, upsertPacketNode, createRelationshipWithTrace };
}
