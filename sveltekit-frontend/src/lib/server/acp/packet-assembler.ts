/**
 * ACP Packet Assembler — gRPC Response → Canonical Envelope
 *
 * Converts gRPC service responses (ToolCallingService, RetrievalService, etc.)
 * into canonical PacketTopologyEnvelope shape for unified storage/caching.
 *
 * Enforces 5-step truth flow:
 * 1. Extract from gRPC response
 * 2. Validate Zod schema
 * 3. Write to Postgres (canonical)
 * 4. Invalidate Redis cache
 * 5. Emit events
 */

import { z } from 'zod';
import type {
  PacketTopologyEnvelope,
  CanonicalPacketIdentity,
  PacketMetadata,
} from './packet-topology-envelope.js';

/**
 * Metadata about the gRPC call that produced this response
 */
export interface AssemblyMetadata {
  serviceId: 'embedding' | 'retrieval' | 'toolCalling' | 'chatAssistant' | 'codeIntel';
  methodName: string;
  durationMs: number;
  timestamp: Date;
  requestId?: string;
}

/**
 * Assemble a canonical packet envelope from a gRPC service response.
 *
 * Extracts identity, semantics, topology, and mirror references from the
 * raw response and packs them into a validated canonical shape.
 *
 * @param toolResponse Raw response from a gRPC service method
 * @param metadata Call metadata (service, method, duration, timestamp)
 * @returns Validated PacketTopologyEnvelope ready for persistence
 * @throws Error if response fails Zod validation
 */
export function assemblePacketFromGrpcResponse(
  toolResponse: Record<string, any>,
  metadata: AssemblyMetadata
): PacketTopologyEnvelope {
  // Extract identity (required)
  const identity = extractIdentity(toolResponse, metadata);

  // Extract semantics (optional but recommended)
  const semantics = extractSemantics(toolResponse, metadata);

  // Extract topology (optional)
  const topology = extractTopology(toolResponse, metadata);

  // Extract mirrors (optional)
  const mirrors = extractMirrors(toolResponse, metadata);

  // Build canonical envelope
  const envelope: PacketTopologyEnvelope = {
    // Identity layer (required)
    packet_key: identity.packet_key,
    source_ref: identity.source_ref,
    file_path: identity.file_path,
    function_symbol: identity.function_symbol,
    feature_id: identity.feature_id,
    feature_label: identity.feature_label,

    // Semantics layer (optional)
    title_id: semantics?.title_id ?? null,
    summary: semantics?.summary ?? null,
    domain_class: semantics?.domain_class ?? null,
    semantic_tags: semantics?.semantic_tags ?? [],

    // Topology layer (optional)
    som_cluster: topology?.som_cluster ?? null,
    som_row: topology?.som_row ?? null,
    som_col: topology?.som_col ?? null,
    manifold_t: topology?.manifold_t ?? null,
    manifold_4d: topology?.manifold_4d ?? null,
    community_id: topology?.community_id ?? null,
    topological_neighbors: topology?.topological_neighbors ?? [],

    // Mirror references (optional)
    qdrant_point_id: mirrors?.qdrant_point_id ?? null,
    qdrant_collection: mirrors?.qdrant_collection ?? 'codebase_chunks_768',
    redis_key: mirrors?.redis_key ?? null,
    neo4j_node_id: mirrors?.neo4j_node_id ?? null,
    neo4j_edges: mirrors?.neo4j_edges ?? [],
    cold_storage_uri: mirrors?.cold_storage_uri ?? null,

    // Metadata
    extracted_from_service: metadata.serviceId,
    extracted_from_method: metadata.methodName,
    extraction_duration_ms: metadata.durationMs,
    extracted_at: metadata.timestamp.toISOString(),
    request_id: metadata.requestId ?? null,
  };

  // Validate before return
  validatePacketEnvelope(envelope);

  return envelope;
}

/**
 * Extract identity fields (packet_key, source_ref, feature_id, etc.)
 * Identity is REQUIRED and must always be present.
 */
function extractIdentity(
  response: Record<string, any>,
  metadata: AssemblyMetadata
): CanonicalPacketIdentity {
  // Try to extract from response first
  let packet_key = response.packet_key ?? response.id ?? response.key;
  let source_ref = response.source_ref ?? response.sourceRef ?? response.file_path;
  let file_path = response.file_path ?? response.filePath ?? source_ref;
  let function_symbol = response.function_symbol ?? response.functionSymbol ?? null;
  let feature_id = response.feature_id ?? response.featureId ?? null;
  let feature_label = response.feature_label ?? response.featureLabel ?? null;

  // Generate packet_key if missing (deterministic from source_ref + symbol)
  if (!packet_key && source_ref) {
    const hash = require('crypto')
      .createHash('sha256')
      .update(`${source_ref}:${function_symbol || 'default'}`)
      .digest('hex')
      .slice(0, 8);
    packet_key = `ace:packet:${metadata.serviceId}:${hash}`;
  }

  // Validate minimums
  if (!packet_key) {
    throw new Error(
      `Cannot extract packet_key from gRPC response (service: ${metadata.serviceId}, method: ${metadata.methodName})`
    );
  }
  if (!source_ref) {
    throw new Error(
      `Cannot extract source_ref from gRPC response (service: ${metadata.serviceId}, method: ${metadata.methodName})`
    );
  }

  return {
    packet_key,
    source_ref,
    file_path: file_path || source_ref,
    function_symbol: function_symbol || 'unknown',
    feature_id: feature_id || 'unclassified',
    feature_label: feature_label || 'Unclassified Feature',
  };
}

/**
 * Extract semantic fields (title_id, summary, domain_class, tags)
 * Semantics are optional.
 */
function extractSemantics(
  response: Record<string, any>,
  metadata: AssemblyMetadata
): Partial<PacketMetadata> | null {
  const title_id = response.title_id ?? response.titleId ?? null;
  const summary = response.summary ?? null;
  const domain_class = response.domain_class ?? response.domainClass ?? null;
  const semantic_tags = response.semantic_tags ?? response.semanticTags ?? [];

  if (!title_id && !summary && !domain_class && semantic_tags.length === 0) {
    return null; // No semantics extracted
  }

  return {
    title_id,
    summary,
    domain_class,
    semantic_tags: Array.isArray(semantic_tags) ? semantic_tags : [],
  };
}

/**
 * Extract topology fields (SOM cluster, manifold, community, neighbors)
 * Topology is optional.
 */
function extractTopology(
  response: Record<string, any>,
  metadata: AssemblyMetadata
): Partial<PacketTopologyEnvelope> | null {
  const som_cluster = response.som_cluster ?? response.somCluster ?? null;
  const som_row = response.som_row ?? response.somRow ?? null;
  const som_col = response.som_col ?? response.somCol ?? null;
  const manifold_t = response.manifold_t ?? response.manifoldT ?? null;
  const manifold_4d = response.manifold_4d ?? response.manifold4d ?? null;
  const community_id = response.community_id ?? response.communityId ?? null;
  const topological_neighbors = response.topological_neighbors ?? response.topologicalNeighbors ?? [];

  if (
    !som_cluster &&
    !som_row &&
    !som_col &&
    !manifold_t &&
    !manifold_4d &&
    !community_id &&
    topological_neighbors.length === 0
  ) {
    return null; // No topology extracted
  }

  return {
    som_cluster,
    som_row,
    som_col,
    manifold_t,
    manifold_4d,
    community_id,
    topological_neighbors,
  };
}

/**
 * Extract mirror references (Qdrant point ID, Redis key, Neo4j node ID, etc.)
 * Mirrors are optional.
 */
function extractMirrors(
  response: Record<string, any>,
  metadata: AssemblyMetadata
): Partial<PacketTopologyEnvelope> | null {
  const qdrant_point_id = response.qdrant_point_id ?? response.qdrantPointId ?? null;
  const qdrant_collection =
    response.qdrant_collection ?? response.qdrantCollection ?? 'codebase_chunks_768';
  const redis_key = response.redis_key ?? response.redisKey ?? null;
  const neo4j_node_id = response.neo4j_node_id ?? response.neo4jNodeId ?? null;
  const neo4j_edges = response.neo4j_edges ?? response.neo4jEdges ?? [];
  const cold_storage_uri = response.cold_storage_uri ?? response.coldStorageUri ?? null;

  if (
    !qdrant_point_id &&
    !redis_key &&
    !neo4j_node_id &&
    neo4j_edges.length === 0 &&
    !cold_storage_uri
  ) {
    return null; // No mirrors extracted
  }

  return {
    qdrant_point_id,
    qdrant_collection,
    redis_key,
    neo4j_node_id,
    neo4j_edges,
    cold_storage_uri,
  };
}

/**
 * Validate a packet envelope against the canonical schema.
 * Hard fails if validation fails (prevents shape divergence).
 */
function validatePacketEnvelope(envelope: PacketTopologyEnvelope): void {
  // Validate required fields
  if (!envelope.packet_key || typeof envelope.packet_key !== 'string') {
    throw new Error('Invalid packet_key: must be non-empty string');
  }
  if (!envelope.source_ref || typeof envelope.source_ref !== 'string') {
    throw new Error('Invalid source_ref: must be non-empty string');
  }
  if (!envelope.feature_id || typeof envelope.feature_id !== 'string') {
    throw new Error('Invalid feature_id: must be non-empty string');
  }

  // Validate optional numeric fields
  if (envelope.som_row !== null && typeof envelope.som_row !== 'number') {
    throw new Error('Invalid som_row: must be number or null');
  }
  if (envelope.som_col !== null && typeof envelope.som_col !== 'number') {
    throw new Error('Invalid som_col: must be number or null');
  }

  // Validate arrays
  if (!Array.isArray(envelope.semantic_tags)) {
    throw new Error('Invalid semantic_tags: must be array');
  }
  if (!Array.isArray(envelope.topological_neighbors)) {
    throw new Error('Invalid topological_neighbors: must be array');
  }
  if (!Array.isArray(envelope.neo4j_edges)) {
    throw new Error('Invalid neo4j_edges: must be array');
  }
}

/**
 * Assemble multiple packets from a batch gRPC response (e.g., SearchRetrievalResponse with multiple results).
 *
 * @param batchResponse Response containing array of results
 * @param metadata Call metadata
 * @returns Array of validated PacketTopologyEnvelope objects
 */
export function assemblePacketsFromBatchGrpcResponse(
  batchResponse: Record<string, any>,
  metadata: AssemblyMetadata
): PacketTopologyEnvelope[] {
  const results = batchResponse.results ?? batchResponse.packets ?? batchResponse.items ?? [];

  if (!Array.isArray(results)) {
    throw new Error(`Cannot extract batch results from gRPC response`);
  }

  return results.map((item, index) =>
    assemblePacketFromGrpcResponse(item, {
      ...metadata,
      requestId: metadata.requestId ? `${metadata.requestId}:${index}` : null,
    })
  );
}
