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

import { createHash, randomUUID } from 'node:crypto';
import { PacketTopologyEnvelopeSchema } from '../db/packet-topology-envelope.js';
import type {
  PacketTopologyEnvelope,
  CanonicalPacketIdentity,
  PacketMetadata,
} from '../db/packet-topology-envelope.js';
import { generateTitleIdentity } from '../ace/title-id-generator.js';
import { CANONICAL_SOURCE_COLLECTION } from '../vector/vector-contracts.js';

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
  const semantics = extractSemantics(
    toolResponse,
    metadata,
    identity.packet_key,
    identity.feature_label
  );

  // Extract topology (optional)
  const topology = extractTopology(toolResponse, metadata);

  // Extract mirrors (optional)
  const mirrors = extractMirrors(toolResponse, metadata);

  // Build canonical envelope
  const envelope: PacketTopologyEnvelope = {
    // Identity layer (required)
    packet_id: randomUUID(),
    packet_key: identity.packet_key,
    title_id: semantics?.title_id ?? generateTitleIdentity(identity.packet_key, {
      featureLabel: identity.feature_label,
    }).titleId,
    created_at: metadata.timestamp.toISOString(),
    source_ref: identity.source_ref,
    directory_path: identity.file_path.split(/[\\/]/).slice(0, -1).join('/'),
    file_path: identity.file_path,
    function_symbol: identity.function_symbol,
    feature_id: identity.feature_id,
    feature_label: identity.feature_label,
    neo4j_neighbors: [],
    semantic_tags: semantics?.semantic_tags ?? [],
    lexical_nouns: [],
    lexical_verbs: [],
    lexical_adverbs_ly: [],
    routing_hints: [],
    used_concepts: [],
    supersedes: [],

    // Semantics layer (optional)
    summary: semantics?.summary ?? null,
    domain_class: semantics?.domain_class ?? null,

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
    qdrant_collection: mirrors?.qdrant_collection ?? CANONICAL_SOURCE_COLLECTION,
    redis_key: mirrors?.redis_key ?? null,
    neo4j_node_id: mirrors?.neo4j_node_id ?? null,
    neo4j_edges: mirrors?.neo4j_edges ?? [],
    cold_storage_uri: mirrors?.cold_storage_uri ?? null,

    // OKF ontology fields (required)
    ontology_ids: [],
    concept_ids: [],
    runtime_evidence_refs: [],
    test_evidence_refs: [],

    // Metadata
    extracted_from_service: metadata.serviceId,
    extracted_from_method: metadata.methodName,
    extraction_duration_ms: metadata.durationMs,
    extracted_at: metadata.timestamp.toISOString(),
    request_id: metadata.requestId ?? null,
  };

  // Validate before return
  return PacketTopologyEnvelopeSchema.parse(envelope);
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
  const keySchema = PacketTopologyEnvelopeSchema.shape.packet_key;
  const alias = keySchema.safeParse(response.id ?? response.key);
  const extractedPacketKey = response.packet_key == null ? (alias.success ? alias.data : undefined)
    : keySchema.parse(response.packet_key);
  const extractedSourceRef = response.source_ref ?? response.sourceRef ?? response.file_path;
  const extractedFilePath = response.file_path ?? response.filePath ?? extractedSourceRef;
  const extractedFunctionSymbol = response.function_symbol ?? response.functionSymbol ?? null;
  const extractedFeatureId = response.feature_id ?? response.featureId ?? null;
  const extractedFeatureLabel = response.feature_label ?? response.featureLabel ?? null;

  let packet_key = extractedPacketKey;
  let source_ref = extractedSourceRef;
  let file_path = extractedFilePath;
  let function_symbol = extractedFunctionSymbol;
  let feature_id = extractedFeatureId;
  let feature_label = extractedFeatureLabel;

  // A derived transport key binds the declared source revision. Admission still checks canonical ownership.
  if (!packet_key && typeof source_ref === 'string' && source_ref.trim()) {
    const revision = keySchema.safeParse(response.source_revision ?? response.sourceRevision);
    if (!revision.success) throw new Error('PACKET_KEY_FALLBACK_REQUIRES_SOURCE_REVISION');
    const hash = createHash('sha256')
      .update(JSON.stringify(['atlas.acp-transport-packet-key.v1', source_ref,
        revision.data.replace(/^sha256:/, ''), function_symbol ?? null, feature_id ?? null]))
      .digest('hex');
    packet_key = `sha256:${hash}`;
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
  metadata: AssemblyMetadata,
  packetKey: string,
  _featureLabel: string
): Partial<PacketMetadata> | null {
  const summary = response.summary ?? null;
  const domain_class = response.domain_class ?? response.domainClass ?? null;
  const semantic_tags = response.semantic_tags ?? response.semanticTags ?? [];

  if (!summary && !domain_class && semantic_tags.length === 0) {
    return null; // No semantics extracted
  }

  // Always regenerate title_id through the canonical generator — never forward gRPC passthrough values.
  // This ensures every packet written via ACP uses the same derivation as the promotion enrichment path.
  const title_id = generateTitleIdentity(packetKey, { featureLabel: _featureLabel }).titleId;

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
  _metadata: AssemblyMetadata
): Partial<PacketTopologyEnvelope> | null {
  const som_cluster = response.som_cluster ?? response.somCluster ?? null;
  const som_row = response.som_row ?? response.somRow ?? null;
  const som_col = response.som_col ?? response.somCol ?? null;
  const manifold_t = response.manifold_t ?? response.manifoldT ?? null;
  const manifold_4d = response.manifold_4d ?? response.manifold4d ?? null;
  const community_id = response.community_id ?? response.communityId ?? null;
  const topological_neighbors = response.topological_neighbors ?? response.topologicalNeighbors ?? [];

  if (
    som_cluster === null &&
    som_row === null &&
    som_col === null &&
    manifold_t === null &&
    manifold_4d === null &&
    community_id === null &&
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
  _metadata: AssemblyMetadata
): Partial<PacketTopologyEnvelope> | null {
  const qdrant_point_id = response.qdrant_point_id ?? response.qdrantPointId ?? null;
  const qdrant_collection =
    response.qdrant_collection ?? response.qdrantCollection ?? CANONICAL_SOURCE_COLLECTION;
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

  return results.map((item, index) => {
    const requestId = metadata.requestId
      ? `${metadata.requestId}:${index}`
      : undefined;
    return assemblePacketFromGrpcResponse(item, {
      ...metadata,
      requestId,
    });
  });
}
