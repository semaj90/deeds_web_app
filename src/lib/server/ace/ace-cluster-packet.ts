/**
 * ACE Cluster Packet Builder
 *
 * Pure input contract — NO I/O, NO LLM, NO CACHE.
 * Constructs and validates canonical ACE cluster packets from autoencoder centroid metadata + SOM cluster summaries.
 *
 * Contract:
 * - Input: clusterId, centroidMeta, summaryRecord, workspaceRevision, sourceRevision
 * - Output: ACEPacket with schemaVersion, packetKey, representationId, etc.
 * - Validation: schema version, required fields, deterministic packetKey
 *
 * This is a pure function. No Postgres, Redis, or Valkey calls.
 */

import type { ACEPacket } from './ace-packet-types';

/**
 * Build a pure ACE cluster packet from cluster summary metadata.
 * No I/O, no LLM, no cache operations.
 *
 * @param input - Pure input contract with cluster metadata
 * @returns Constructed and validated ACE cluster packet
 *
 * @example
 * ```typescript
 * const packet = buildClusterAcePacket({
 *   clusterId: 0,
 *   centroidMeta: { trainedAt: '2026-08-13T02:35:34.490Z' },
 *   summaryRecord: {
 *     summary: 'SOM cluster 0: 33 centroids, 105761 points',
 *     size: 105761,
 *     filePaths: ['src/lib/server/db/client.ts', 'src/lib/server/db/schema.ts']
 *   },
 *   workspaceRevision: 'v1.0.0',
 *   sourceRevision: 'abc123'
 * });
 * ```
 */
export function buildClusterAcePacket(input: {
  clusterId: number;
  centroidMeta: {
    trainedAt: string;
    clusterCount?: number;
    totalPoints?: number;
  };
  summaryRecord: {
    summary: string;
    size: number;
    filePaths: string[];
    authority?: unknown;
    pageRankTop5?: unknown[];
    updatedAt?: string;
  };
  workspaceRevision: string;
  sourceRevision: string;
  graphRevision?: string;
}): ACEPacket {
  // Validate input
  validateClusterAcePacketInput(input);

  // Generate deterministic packetKey from clusterId and sourceRevision
  const packetKey = `ace:cluster:${input.clusterId}:${input.sourceRevision}`;

  // Generate representationId from clusterId
  const representationId = `cluster:${input.clusterId}`;

  // Build the cluster metadata
  const clusterMetadata: {
    id: number;
    trainedAt: string;
    clusterCount?: number;
    totalPoints?: number;
  } = {
    id: input.clusterId,
    trainedAt: input.centroidMeta.trainedAt
  };

  if (input.centroidMeta.clusterCount !== undefined) {
    clusterMetadata.clusterCount = input.centroidMeta.clusterCount;
  }

  if (input.centroidMeta.totalPoints !== undefined) {
    clusterMetadata.totalPoints = input.centroidMeta.totalPoints;
  }

  // Build the semantic metadata
  const semanticMetadata: {
    summary: string;
    size: number;
    filePaths: string[];
    authorityScore?: number;
    topFiles: Array<{
      sourceRef: string;
      pageRank?: number;
    }>;
    updatedAt?: string;
  } = {
    summary: input.summaryRecord.summary,
    size: input.summaryRecord.size,
    filePaths: input.summaryRecord.filePaths,
    topFiles: input.summaryRecord.pageRankTop5?.map((pr, idx) => ({
      sourceRef: typeof pr === 'string' ? pr : pr.sourceRef || '',
      pageRank: typeof pr === 'number' ? pr : undefined
    })) || [],
    updatedAt: input.summaryRecord.updatedAt
  };

  if (input.summaryRecord.authority !== undefined) {
    semanticMetadata.authorityScore = typeof input.summaryRecord.authority === 'number' ? input.summaryRecord.authority : undefined;
  }

  // Build the provenance metadata
  const provenanceMetadata: {
    centroidKey: string;
    summaryKey: string;
    summaryUpdatedAt?: string;
    graphRevision?: string;
  } = {
    centroidKey: 'gpu:autoencoder:centroids_64',
    summaryKey: `cluster:summary:${input.clusterId}`,
    summaryUpdatedAt: input.summaryRecord.updatedAt,
    graphRevision: input.graphRevision
  };

  // Calculate bounds
  const topFiles = semanticMetadata.topFiles.length;
  const summaryChars = input.summaryRecord.summary.length;

  // Build the canonical ACE cluster packet
  const packet: ACEPacket = {
    packet_key: packetKey,
    feature_id: `cluster:${input.clusterId}`,
    source_ref: `cluster:summary:${input.clusterId}`,
    summary: input.summaryRecord.summary,
    metadata: {
      cluster: clusterMetadata,
      semantic: semanticMetadata,
      provenance: provenanceMetadata,
      bounds: {
        topFiles,
        summaryChars
      }
    },
    cluster_id: input.clusterId,
    som_cluster: input.clusterId,
    domain: 'cluster',
    trace_id: input.sourceRevision,
    created_at: new Date().toISOString()
  };

  // Validate the constructed packet
  validateConstructedClusterPacket(packet);

  return packet;
}

/**
 * Validate cluster ACE packet input contract.
 * Throws if input is missing required fields or has invalid values.
 */
function validateClusterAcePacketInput(input: {
  clusterId: number;
  centroidMeta: {
    trainedAt: string;
    clusterCount?: number;
    totalPoints?: number;
  };
  summaryRecord: {
    summary: string;
    size: number;
    filePaths: string[];
    authority?: unknown;
    pageRankTop5?: unknown[];
    updatedAt?: string;
  };
  workspaceRevision: string;
  sourceRevision: string;
  graphRevision?: string;
}): void {
  // Check required fields
  if (input.clusterId === undefined || input.clusterId === null) {
    throw new Error('buildClusterAcePacket: clusterId is required');
  }

  if (!input.centroidMeta || !input.centroidMeta.trainedAt) {
    throw new Error('buildClusterAcePacket: centroidMeta.trainedAt is required');
  }

  if (!input.summaryRecord || !input.summaryRecord.summary) {
    throw new Error('buildClusterAcePacket: summaryRecord.summary is required');
  }

  if (input.summaryRecord.size === undefined || input.summaryRecord.size < 0) {
    throw new Error('buildClusterAcePacket: summaryRecord.size must be a non-negative number');
  }

  if (!input.summaryRecord.filePaths || !Array.isArray(input.summaryRecord.filePaths)) {
    throw new Error('buildClusterAcePacket: summaryRecord.filePaths must be an array');
  }

  if (!input.workspaceRevision) {
    throw new Error('buildClusterAcePacket: workspaceRevision is required');
  }

  if (!input.sourceRevision) {
    throw new Error('buildClusterAcePacket: sourceRevision is required');
  }

  // Validate trainedAt is a valid ISO string
  const trainedAt = new Date(input.centroidMeta.trainedAt);
  if (isNaN(trainedAt.getTime())) {
    throw new Error(`buildClusterAcePacket: invalid trainedAt timestamp: ${input.centroidMeta.trainedAt}`);
  }

  // Validate summary is not empty
  if (!input.summaryRecord.summary.trim()) {
    throw new Error('buildClusterAcePacket: summaryRecord.summary must not be empty after trim');
  }

  // Validate filePaths are not empty strings
  for (const fp of input.summaryRecord.filePaths) {
    if (!fp || typeof fp !== 'string') {
      throw new Error('buildClusterAcePacket: summaryRecord.filePaths must contain non-empty strings');
    }
  }
}

/**
 * Validate the constructed cluster packet.
 * Ensures all required fields are present and correctly formatted.
 */
function validateConstructedClusterPacket(packet: ACEPacket): void {
  // Check required fields
  if (!packet.packet_key) {
    throw new Error('buildClusterAcePacket: packet_key is required in constructed packet');
  }

  if (!packet.feature_id) {
    throw new Error('buildClusterAcePacket: feature_id is required in constructed packet');
  }

  if (!packet.source_ref) {
    throw new Error('buildClusterAcePacket: source_ref is required in constructed packet');
  }

  if (!packet.summary) {
    throw new Error('buildClusterAcePacket: summary is required in constructed packet');
  }

  // Validate packet_key format: ace:cluster:{clusterId}:{sourceRevision}
  const packetKeyPattern = /^ace:cluster:\d+:.+/;
  if (!packetKeyPattern.test(packet.packet_key)) {
    throw new Error(`buildClusterAcePacket: invalid packet_key format: ${packet.packet_key}`);
  }

  // Validate feature_id format: cluster:{clusterId}
  const featureIdPattern = /^cluster:\d+$/;
  if (!featureIdPattern.test(packet.feature_id)) {
    throw new Error(`buildClusterAcePacket: invalid feature_id format: ${packet.feature_id}`);
  }

  // Validate source_ref format: cluster:summary:{clusterId}
  const sourceRefPattern = /^cluster:summary:\d+$/;
  if (!sourceRefPattern.test(packet.source_ref)) {
    throw new Error(`buildClusterAcePacket: invalid source_ref format: ${packet.source_ref}`);
  }

  // Validate metadata structure
  if (packet.metadata && !packet.metadata.cluster && !packet.metadata.semantic && !packet.metadata.provenance) {
    throw new Error('buildClusterAcePacket: metadata must contain cluster, semantic, and provenance fields');
  }

  // Validate bounds
  if (packet.metadata && packet.metadata.bounds) {
    const { topFiles, summaryChars } = packet.metadata.bounds;
    if (typeof topFiles !== 'number' || typeof summaryChars !== 'number') {
      throw new Error('buildClusterAcePacket: bounds must contain numeric topFiles and summaryChars');
    }
  }

  // Validate cluster_id matches
  if (packet.cluster_id !== packet.packet_key.match(/ace:cluster:(\d+):/)?.[1]) {
    throw new Error('buildClusterAcePacket: cluster_id must match packet_key clusterId');
  }
}
