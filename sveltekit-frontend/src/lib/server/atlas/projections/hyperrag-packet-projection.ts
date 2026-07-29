/**
 * HyperRAG Packet Projection Adapter
 *
 * Maps between:
 * - HyperRAG RPC response (snake_case JSON fact structure)
 * - Application domain objects (camelCase)
 *
 * HyperRAG is a **remote service** that materializes packets as n-ary facts.
 * RPC responses must preserve:
 * 1. Packet identity (packet_key, source_ref, workspace_id)
 * 2. Ontology version (required for schema compatibility)
 * 3. Content hash (for freshness validation)
 *
 * CRITICAL: packet_key from RPC response must match Postgres truth.
 * HyperRAG is a MIRROR only, never the source of truth.
 */

import { toHyperRagRequestFromEnrichedTreeNode, type EnrichedTreeNodeProjectionSeed } from '../enriched-tree-node-projections.js';

export interface HyperRagFactResponse {
  packet_key: unknown;
  source_ref: unknown;
  feature_id: unknown;
  feature_label: unknown;
  workspace_id: unknown;
  workspace_revision?: string | null;
  ontology_id?: string | null;
  ontology_version?: string | null;
  content_hash?: string | null;
  tree_node_id?: string | null;
  n_ary_facts?: Array<{
    predicate: string;
    subject: string;
    objects: string[];
    confidence: number;
    sourced_from: string;
  }>;
  rpc_received_at: string; // ISO timestamp
  rpc_version: string; // e.g., "hyperrag-v1"
}

export interface HyperRagProjection {
  layer: 'HYPERRAG_RPC';
  packetKey: string | null;
  sourceRef: string | null;
  treeNodeId: string | null;
  contentHash: string | null;
  workspaceRevision?: string | null;
  ontologyId?: string | null;
  ontologyVersion?: string | null;
  featureId: string | null;
  domainClass?: string | null;
  factIds: string[];
  evidencePacketKeys: string[];
  raw: unknown;
}

export interface SemanticPacketDomainObject {
  packetKey: string;
  sourceRef: string;
  featureId: string | null;
  featureLabel: string | null;
  workspaceId: string | null;
  workspaceRevision?: string | null;
  ontologyId?: string | null;
  ontologyVersion?: string | null;
  contentHash?: string | null;
  treeNodeId?: string | null;
  nAryFacts?: Array<{
    predicate: string;
    subject: string;
    objects: string[];
    confidence: number;
    sourcedFrom: string;
  }>;
  rpcReceivedAt: string;
  rpcVersion: string;
}

export interface AdapterViolation {
  code:
    | 'PACKET_KEY_MISSING'
    | 'PACKET_KEY_INVALID_PREFIX'
    | 'SOURCE_REF_MISSING'
    | 'FEATURE_ID_MISSING'
    | 'WORKSPACE_ID_MISSING'
    | 'ONTOLOGY_VERSION_MISSING'
    | 'CONTENT_HASH_MISSING'
    | 'RPC_VERSION_MISSING'
    | 'N_ARY_FACTS_EMPTY';
  severity: 'INFO' | 'WARN' | 'BLOCK';
  path: string;
  expected?: string;
  actual?: string;
  message: string;
}

export interface AdapterResult<T> {
  value: T | null;
  violations: AdapterViolation[];
}

function isValidPacketKey(packetKey: string): boolean {
  return (
    packetKey.startsWith('packet:') ||
    packetKey.startsWith('pkt_') ||
    packetKey.startsWith('ace:packet:')
  );
}

/**
 * Convert HyperRAG RPC response (snake_case) to domain object (camelCase).
 *
 * No validation—assumes response is already valid from HyperRAG.
 */
export function fromHyperRagResponse(response: HyperRagFactResponse): SemanticPacketDomainObject {
  const packetKey = typeof response.packet_key === 'string' ? response.packet_key : '';
  const sourceRef = typeof response.source_ref === 'string' ? response.source_ref : '';
  const featureId = typeof response.feature_id === 'string' ? response.feature_id : null;
  const featureLabel = typeof response.feature_label === 'string' ? response.feature_label : null;
  const workspaceId = typeof response.workspace_id === 'string' ? response.workspace_id : null;
  return {
    packetKey,
    sourceRef,
    featureId,
    featureLabel,
    workspaceId,
    workspaceRevision: response.workspace_revision,
    ontologyId: response.ontology_id,
    ontologyVersion: response.ontology_version,
    contentHash: response.content_hash,
    treeNodeId: response.tree_node_id,
    nAryFacts: (response.n_ary_facts || []).map((fact) => ({
      predicate: fact.predicate,
      subject: fact.subject,
      objects: fact.objects,
      confidence: fact.confidence,
      sourcedFrom: fact.sourced_from,
    })),
    rpcReceivedAt: response.rpc_received_at,
    rpcVersion: response.rpc_version,
  };
}

export function fromHyperRagRpcPacket(response: HyperRagFactResponse): AdapterResult<HyperRagProjection> {
  const violations: AdapterViolation[] = [];
  const packetKey = typeof response.packet_key === "string" ? response.packet_key : null;
  const sourceRef = typeof response.source_ref === "string" ? response.source_ref : null;
  const featureId = typeof response.feature_id === "string" ? response.feature_id : null;
  const contentHash = typeof response.content_hash === "string" ? response.content_hash : null;

  if (!packetKey) {
    violations.push({
      code: 'PACKET_KEY_MISSING',
      severity: 'BLOCK',
      path: 'packet_key',
      message: 'HyperRAG packet does not expose packet_key',
    });
  } else if (!isValidPacketKey(packetKey)) {
    violations.push({
      code: 'PACKET_KEY_INVALID_PREFIX',
      severity: 'BLOCK',
      path: 'packet_key',
      expected: 'packet:<id>, pkt_<32-char hex>, or ace:packet:<id>',
      actual: packetKey,
      message: 'HyperRAG packet_key does not match expected canonical prefix',
    });
  }

  if (!sourceRef) {
    violations.push({
      code: 'SOURCE_REF_MISSING',
      severity: 'BLOCK',
      path: 'source_ref',
      message: 'HyperRAG projection does not expose source_ref',
    });
  }

  if (!featureId) {
    violations.push({
      code: 'FEATURE_ID_MISSING',
      severity: 'WARN',
      path: 'feature_id',
      message: 'HyperRAG projection does not expose feature_id',
    });
  }

  if (typeof response.workspace_id !== 'string') {
    violations.push({
      code: 'WORKSPACE_ID_MISSING',
      severity: 'WARN',
      path: 'workspace_id',
      message: 'HyperRAG projection does not expose workspace_id',
    });
  }

  if (!contentHash) {
    violations.push({
      code: 'CONTENT_HASH_MISSING',
      severity: 'WARN',
      path: 'content_hash',
      message: 'HyperRAG projection cannot prove content freshness',
    });
  }

  if (!response.ontology_version) {
    violations.push({
      code: 'ONTOLOGY_VERSION_MISSING',
      severity: 'WARN',
      path: 'ontology_version',
      message: 'HyperRAG projection does not expose ontology_version',
    });
  }

  if (!response.rpc_version) {
    violations.push({
      code: 'RPC_VERSION_MISSING',
      severity: 'WARN',
      path: 'rpc_version',
      message: 'HyperRAG projection does not expose rpc_version',
    });
  }

  if (!response.n_ary_facts || response.n_ary_facts.length === 0) {
    violations.push({
      code: 'N_ARY_FACTS_EMPTY',
      severity: 'INFO',
      path: 'n_ary_facts',
      message: 'HyperRAG projection has no materialized facts',
    });
  }

  if (!packetKey) {
    return { value: null, violations };
  }

  return {
    value: {
      layer: 'HYPERRAG_RPC',
      packetKey,
      sourceRef,
      treeNodeId: typeof response.tree_node_id === 'string' ? response.tree_node_id : null,
      contentHash,
      workspaceRevision: response.workspace_revision ?? null,
      ontologyId: response.ontology_id ?? null,
      ontologyVersion: response.ontology_version ?? null,
      featureId,
      domainClass: null,
      factIds: Array.isArray(response.n_ary_facts)
        ? response.n_ary_facts
            .map((fact) => `${fact.predicate}:${fact.subject}`)
            .filter((value): value is string => Boolean(value))
        : [],
      evidencePacketKeys: [],
      raw: response,
    },
    violations,
  };
}

/**
 * Convert domain object (camelCase) to HyperRAG request (snake_case).
 *
 * Used when requesting fact materialization from HyperRAG.
 */
export function toHyperRagRequest(packet: SemanticPacketDomainObject): Omit<
  HyperRagFactResponse,
  'n_ary_facts' | 'rpc_received_at' | 'rpc_version'
> {
  return {
    packet_key: packet.packetKey,
    source_ref: packet.sourceRef,
    feature_id: packet.featureId,
    feature_label: packet.featureLabel,
    workspace_id: packet.workspaceId,
    workspace_revision: packet.workspaceRevision,
    ontology_id: packet.ontologyId,
    ontology_version: packet.ontologyVersion,
    content_hash: packet.contentHash,
    tree_node_id: packet.treeNodeId,
  };
}

export function toHyperRagRequestFromStrictTreeNode(seed: EnrichedTreeNodeProjectionSeed): Omit<
  HyperRagFactResponse,
  'n_ary_facts' | 'rpc_received_at' | 'rpc_version'
> {
  return toHyperRagRequestFromEnrichedTreeNode(seed);
}

/**
 * Projection validation: check for required fields + immutability constraints.
 *
 * Returns violations (missing fields, mismatches) rather than throwing.
 */
export type ProjectionViolation = {
  code:
    | 'PACKET_KEY_MISSING'
    | 'PACKET_KEY_INVALID_PREFIX'
    | 'SOURCE_REF_MISSING'
    | 'FEATURE_ID_MISSING'
    | 'WORKSPACE_ID_MISSING'
    | 'ONTOLOGY_VERSION_MISSING'
    | 'CONTENT_HASH_MISSING'
    | 'RPC_VERSION_MISSING'
    | 'N_ARY_FACTS_EMPTY';
  path: string;
  expected?: string;
  actual?: string;
};

export function validateHyperRagProjection(
  response: HyperRagFactResponse
): { isValid: boolean; violations: ProjectionViolation[] } {
  const { violations: adapterViolations } = fromHyperRagRpcPacket(response);
  const violations: ProjectionViolation[] = adapterViolations.map((violation) => ({
    code: violation.code,
    path: violation.path,
    expected: violation.expected,
    actual: violation.actual,
  }));

  return {
    isValid: adapterViolations.every((violation) => violation.severity !== 'BLOCK'),
    violations,
  };
}

/**
 * Immutability gate: verify packet_key stability in HyperRAG responses.
 *
 * If the same packetKey is queried from HyperRAG multiple times,
 * both responses must have identical packet_key, source_ref, feature_id, workspace_id.
 */
export function verifyPacketKeyImmutability(
  response1: HyperRagFactResponse,
  response2: HyperRagFactResponse
): { isImmutable: boolean; reason?: string } {
  if (response1.packet_key !== response2.packet_key) {
    return {
      isImmutable: false,
      reason: `packet_key changed: ${response1.packet_key} → ${response2.packet_key}`,
    };
  }

  if (response1.source_ref !== response2.source_ref) {
    return {
      isImmutable: false,
      reason: `source_ref changed: ${response1.source_ref} → ${response2.source_ref}`,
    };
  }

  if (response1.feature_id !== response2.feature_id) {
    return {
      isImmutable: false,
      reason: `feature_id changed: ${response1.feature_id} → ${response2.feature_id}`,
    };
  }

  if (response1.workspace_id !== response2.workspace_id) {
    return {
      isImmutable: false,
      reason: `workspace_id changed: ${response1.workspace_id} → ${response2.workspace_id}`,
    };
  }

  // Mutable fields MAY change:
  // - contentHash (content version)
  // - treeNodeId (structural metadata)
  // - nAryFacts (facts may be added/updated)
  // - rpcReceivedAt (timestamp)

  return { isImmutable: true };
}

/**
 * Cross-layer immutability: compare Postgres packet with HyperRAG response.
 *
 * This is the critical proof-matrix check (Phase 108D):
 * Do PostgreSQL truth and HyperRAG mirror agree on packet_key + identity fields?
 */
export function verifyPostgresHyperRagConsistency(
  postgresPacket: {
    packetKey: string;
    sourceRef: string;
    featureId: string;
    workspaceId: string | null;
    contentHash?: string | null;
  },
  hyperragResponse: HyperRagFactResponse
): { isConsistent: boolean; reason?: string } {
  const { value: projection } = fromHyperRagRpcPacket(hyperragResponse);
  if (!projection) {
    return {
      isConsistent: false,
      reason: 'HyperRAG projection missing canonical packet_key',
    };
  }

  if (postgresPacket.packetKey !== projection.packetKey) {
    return {
      isConsistent: false,
      reason: `packet_key mismatch: Postgres=${postgresPacket.packetKey}, HyperRAG=${projection.packetKey}`,
    };
  }

  if (postgresPacket.sourceRef !== projection.sourceRef) {
    return {
      isConsistent: false,
      reason: `source_ref mismatch: Postgres=${postgresPacket.sourceRef}, HyperRAG=${projection.sourceRef}`,
    };
  }

  if (projection.featureId && postgresPacket.featureId !== projection.featureId) {
    return {
      isConsistent: false,
      reason: `feature_id mismatch: Postgres=${postgresPacket.featureId}, HyperRAG=${projection.featureId}`,
    };
  }

  if (
    postgresPacket.contentHash &&
    projection.contentHash &&
    postgresPacket.contentHash !== projection.contentHash
  ) {
    return {
      isConsistent: false,
      reason: `content_hash mismatch: Postgres=${postgresPacket.contentHash}, HyperRAG=${projection.contentHash}`,
    };
  }

  return { isConsistent: true };
}
