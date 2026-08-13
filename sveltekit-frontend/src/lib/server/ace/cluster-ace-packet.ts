import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AtlasPacket, NewAtlasPacket } from '$lib/server/db/schema/atlas-packets.js';

export const ClusterSummaryRecordSchema = z.object({
  summary: z.string().trim().min(1),
  clusterId: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
  clusterCount: z.number().int().nonnegative().optional(),
  filePaths: z.array(z.string().trim().min(1)).default([]),
  authority: z.unknown().optional(),
  pageRankTop5: z.array(z.unknown()).default([]),
  trainedAt: z.string().trim().min(1),
  updatedAt: z.string().trim().optional(),
});

export const ClusterAcePacketInputSchema = z.object({
  clusterSummaryKey: z.string().trim().min(1),
  summaryRecord: ClusterSummaryRecordSchema,
  workspaceRevision: z.string().trim().min(1),
  sourceRevision: z.string().trim().min(1),
  graphRevision: z.string().trim().optional(),
  representationRevision: z.number().int().positive().default(1),
  representationId: z.string().trim().min(1).default('semantic_768'),
  centroidKey: z.string().trim().min(1).default('gpu:autoencoder:centroids_64'),
});

export type ClusterAcePacketInput = z.input<typeof ClusterAcePacketInputSchema>;

export interface ClusterAcePacket {
  schemaVersion: 'ace.cluster.packet.v1';
  packet_id: string;
  packet_key: string;
  feature_id: string;
  feature_label: string;
  source_ref: string;
  directory_path: string;
  summary: string;
  evidence_text: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  topology: Record<string, unknown>;
  vectors: Record<string, unknown>;
  permissions: Record<string, unknown>;
  cluster_id: number;
  community_id: number;
  som_cluster: number;
  workspace_revision: string;
  source_revision: string;
  graph_revision: string | null;
  representation_id: string;
  representation_revision: number;
  centroid_key: string;
  summary_key: string;
  summary_updated_at: string | null;
  canonical_hash: string;
  created_at: string;
}

export interface ClusterAcePacketBuildResult {
  packet: ClusterAcePacket;
  canonicalProjection: Record<string, unknown>;
  canonicalHash: string;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function normalizeFilePaths(filePaths: string[]): string[] {
  return [...new Set(filePaths.map((entry) => String(entry ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function normalizePageRankTop5(pageRankTop5: unknown[]): Array<{ filePath: string; pageRank: number; karpathyBlend: number }> {
  return pageRankTop5
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const filePath = String(
        record.filePath ??
        record.file_path ??
        record.sourceRef ??
        record.source_ref ??
        ''
      ).trim();
      if (!filePath) return null;
      const pageRank = Number(record.pageRank ?? record.page_rank ?? record.score ?? 0);
      const karpathyBlend = Number(record.karpathyBlend ?? record.karpathy_blend ?? 0);
      return {
        filePath,
        pageRank: Number.isFinite(pageRank) ? Number(pageRank.toFixed(6)) : 0,
        karpathyBlend: Number.isFinite(karpathyBlend) ? Number(karpathyBlend.toFixed(6)) : 0,
      };
    })
    .filter((entry): entry is { filePath: string; pageRank: number; karpathyBlend: number } => Boolean(entry))
    .sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function normalizeAuthority(authority: unknown): Record<string, unknown> | null {
  if (!authority || typeof authority !== 'object') return null;
  const record = authority as Record<string, unknown>;
  const score = Number(record.clusterAuthorityScore ?? record.cluster_authority_score ?? 0);
  const maxPageRank = Number(record.maxPageRank ?? record.maxPageRankScore ?? record.maxPr ?? record.max_pr ?? 0);
  const avgPageRank = Number(record.avgPageRank ?? record.avgPr ?? record.avg_pr ?? 0);
  const memberCount = Number(record.memberCount ?? record.totalFiles ?? record.member_count ?? 0);

  return {
    clusterAuthorityScore: Number.isFinite(score) ? Number(score.toFixed(6)) : 0,
    maxPageRank: Number.isFinite(maxPageRank) ? Number(maxPageRank.toFixed(6)) : 0,
    avgPageRank: Number.isFinite(avgPageRank) ? Number(avgPageRank.toFixed(6)) : 0,
    memberCount: Number.isFinite(memberCount) ? Math.max(0, Math.trunc(memberCount)) : 0,
  };
}

function toCanonicalProjection(input: ClusterAcePacketInput, packetKey: string): Record<string, unknown> {
  const parsed = ClusterAcePacketInputSchema.parse(input);
  const record = parsed.summaryRecord;
  const filePaths = normalizeFilePaths(record.filePaths);
  const pageRankTop5 = normalizePageRankTop5(record.pageRankTop5);
  const authority = normalizeAuthority(record.authority);
  const summary = record.summary.trim();
  const summaryChars = summary.length;

  return {
    schemaVersion: 'ace.cluster.packet.v1',
    packetId: packetKey,
    packetKey,
    clusterSummaryKey: parsed.clusterSummaryKey,
    featureId: `cluster:${record.clusterId}`,
    featureLabel: `SOM cluster ${record.clusterId}`,
    sourceRef: parsed.clusterSummaryKey,
    directoryPath: 'cluster-summary',
    workspaceRevision: parsed.workspaceRevision,
    sourceRevision: parsed.sourceRevision,
    graphRevision: parsed.graphRevision ?? null,
    representationId: parsed.representationId,
    representationRevision: parsed.representationRevision,
    centroidKey: parsed.centroidKey,
    cluster: {
      id: record.clusterId,
      size: record.size,
      clusterCount: record.clusterCount ?? null,
      trainedAt: record.trainedAt,
    },
    semantic: {
      summary,
      authority,
      topFiles: filePaths,
      pageRankTop5,
    },
    provenance: {
      summaryKey: parsed.clusterSummaryKey,
      summaryUpdatedAt: record.updatedAt ?? null,
      clusterCount: record.clusterCount ?? null,
      centroidKey: parsed.centroidKey,
    },
    bounds: {
      topFiles: filePaths.length,
      summaryChars,
    },
  };
}

export function buildClusterAcePacket(input: ClusterAcePacketInput): ClusterAcePacketBuildResult {
  const parsed = ClusterAcePacketInputSchema.parse(input);
  const packetKey = `sha256:${sha256([
    parsed.clusterSummaryKey,
    parsed.workspaceRevision,
    parsed.sourceRevision,
    parsed.graphRevision ?? '',
    String(parsed.summaryRecord.clusterId),
    String(parsed.summaryRecord.size),
    String(parsed.summaryRecord.clusterCount ?? ''),
    parsed.centroidKey,
    parsed.representationId,
    String(parsed.representationRevision),
  ].join('|')).slice(0, 24)}`;
  const canonicalProjection = toCanonicalProjection(parsed, packetKey);
  const canonicalHash = sha256(stableStringify(canonicalProjection));
  const summary = parsed.summaryRecord.summary.trim();
  const filePaths = normalizeFilePaths(parsed.summaryRecord.filePaths);
  const pageRankTop5 = normalizePageRankTop5(parsed.summaryRecord.pageRankTop5);
  const featureId = `cluster:${parsed.summaryRecord.clusterId}`;
  const featureLabel = `SOM cluster ${parsed.summaryRecord.clusterId}`;
  const evidenceText = [
    `Cluster ${parsed.summaryRecord.clusterId}`,
    `Summary: ${summary}`,
    `TrainedAt: ${parsed.summaryRecord.trainedAt}`,
    `Files: ${filePaths.slice(0, 20).join(', ') || 'none'}`,
    pageRankTop5.length > 0
      ? `PageRankTop5: ${pageRankTop5.map((entry) => `${entry.filePath}(${entry.pageRank})`).join(', ')}`
      : 'PageRankTop5: none',
  ].join('\n');

  const packet: ClusterAcePacket = {
    schemaVersion: 'ace.cluster.packet.v1',
    packet_id: packetKey,
    packet_key: packetKey,
    feature_id: featureId,
    feature_label: featureLabel,
    source_ref: parsed.clusterSummaryKey,
    directory_path: 'cluster-summary',
    summary,
    evidence_text: evidenceText,
    payload: {
      clusterSummaryKey: parsed.clusterSummaryKey,
      summaryRecord: {
        ...parsed.summaryRecord,
        filePaths,
        pageRankTop5,
        authority: normalizeAuthority(parsed.summaryRecord.authority),
      },
      canonicalProjection,
    },
    metadata: {
      ...canonicalProjection,
      canonicalHash,
      filePaths,
      pageRankTop5,
      summaryKey: parsed.clusterSummaryKey,
      summaryUpdatedAt: parsed.summaryRecord.updatedAt ?? null,
      clusterCount: parsed.summaryRecord.clusterCount ?? null,
    },
    topology: {
      clusterId: parsed.summaryRecord.clusterId,
      size: parsed.summaryRecord.size,
      clusterCount: parsed.summaryRecord.clusterCount ?? null,
      trainedAt: parsed.summaryRecord.trainedAt,
      filePaths,
      pageRankTop5,
    },
    vectors: {},
    permissions: {},
    cluster_id: parsed.summaryRecord.clusterId,
    community_id: parsed.summaryRecord.clusterId,
    som_cluster: parsed.summaryRecord.clusterId,
    workspace_revision: parsed.workspaceRevision,
    source_revision: parsed.sourceRevision,
    graph_revision: parsed.graphRevision ?? null,
    representation_id: parsed.representationId,
    representation_revision: parsed.representationRevision,
    centroid_key: parsed.centroidKey,
    summary_key: parsed.clusterSummaryKey,
    summary_updated_at: parsed.summaryRecord.updatedAt ?? null,
    canonical_hash: canonicalHash,
    created_at: parsed.summaryRecord.updatedAt ?? new Date().toISOString(),
  };

  return {
    packet,
    canonicalProjection,
    canonicalHash,
  };
}

export function projectClusterAcePacket(packet: Pick<ClusterAcePacket, keyof ClusterAcePacket>): Record<string, unknown> {
  return {
    schemaVersion: packet.schemaVersion,
    packetId: packet.packet_id,
    packetKey: packet.packet_key,
    clusterSummaryKey: packet.source_ref,
    featureId: packet.feature_id,
    featureLabel: packet.feature_label,
    sourceRef: packet.source_ref,
    directoryPath: packet.directory_path,
    workspaceRevision: packet.workspace_revision,
    sourceRevision: packet.source_revision,
    graphRevision: packet.graph_revision ?? null,
    representationId: packet.representation_id,
    representationRevision: packet.representation_revision,
    centroidKey: packet.centroid_key,
    cluster: {
      id: packet.cluster_id,
      size: packet.topology?.size ?? packet.cluster_id,
      clusterCount: packet.topology?.clusterCount ?? null,
      trainedAt: packet.topology?.trainedAt ?? null,
    },
    semantic: {
      summary: packet.summary,
      authority: (packet.metadata as Record<string, unknown> | undefined)?.semantic && typeof (packet.metadata as Record<string, unknown>).semantic === 'object'
        ? (packet.metadata as Record<string, unknown>).semantic
        : (packet.payload as Record<string, unknown> | undefined)?.summaryRecord && typeof (packet.payload as Record<string, unknown>).summaryRecord === 'object'
          ? normalizeAuthority((packet.payload as Record<string, unknown>).summaryRecord && typeof (packet.payload as Record<string, unknown>).summaryRecord === 'object'
            ? (packet.payload as Record<string, unknown>).summaryRecord
            : null)
          : null,
      topFiles: Array.isArray((packet.metadata as Record<string, unknown> | undefined)?.filePaths)
        ? (packet.metadata as Record<string, unknown>).filePaths
        : Array.isArray((packet.topology as Record<string, unknown> | undefined)?.filePaths)
          ? (packet.topology as Record<string, unknown>).filePaths
          : [],
      pageRankTop5: Array.isArray((packet.metadata as Record<string, unknown> | undefined)?.pageRankTop5)
        ? (packet.metadata as Record<string, unknown>).pageRankTop5
        : [],
    },
    provenance: {
      summaryKey: packet.summary_key,
      summaryUpdatedAt: packet.summary_updated_at ?? null,
      clusterCount: (packet.metadata as Record<string, unknown> | undefined)?.clusterCount ?? null,
      centroidKey: packet.centroid_key,
    },
    bounds: {
      topFiles: Array.isArray((packet.metadata as Record<string, unknown> | undefined)?.filePaths)
        ? (packet.metadata as Record<string, unknown>).filePaths.length
        : 0,
      summaryChars: packet.summary.trim().length,
    },
  };
}

export function hashClusterAcePacketProjection(packet: ClusterAcePacket | NewAtlasPacket | AtlasPacket | Record<string, unknown>): string {
  return sha256(stableStringify(packet));
}

export function clusterAcePacketToAtlasPacketInsert(packet: ClusterAcePacket): NewAtlasPacket {
  return {
    packetId: packet.packet_id,
    packetUlid: null,
    packetKey: packet.packet_key,
    artifactId: null,
    sourceRef: packet.source_ref,
    canonicalSourceRef: packet.source_ref,
    directoryPath: packet.directory_path,
    filePath: packet.summary_key,
    functionSymbol: null,
    featureId: packet.feature_id,
    featureLabel: packet.feature_label,
    titleId: packet.feature_id,
    communityId: packet.community_id,
    communitySource: 'som-autoencoder',
    communityConfidence: 1,
    conceptIds: [],
    clusterId: packet.cluster_id,
    permissions: packet.permissions,
    payload: packet.payload,
    metadata: packet.metadata,
    topology: packet.topology,
    vectors: packet.vectors,
    summary: packet.summary,
    sourceKind: 'cluster-summary',
    sourcePath: packet.source_ref,
    sourceRefKey: packet.source_ref,
    rewardPrior: 0,
    pagerank: null,
    betweenness: null,
    eigenvector: null,
    neo4jNodeId: null,
    treeNodeId: null,
    redisCentroidKey: packet.centroid_key,
    domainClass: 'cluster.summary',
    tags: ['cluster-summary', 'som', 'ace'],
    lineageVersion: packet.schemaVersion,
    ledgerType: 'cluster-summary',
    canonical: true,
    payloadBackfilledAt: null,
    somRow: packet.cluster_id,
    somCol: 0,
    somIndex: packet.cluster_id,
    kmeansCluster: packet.cluster_id,
    latent64: null,
    workspaceId: null,
    workspaceRevision: Number.parseInt(packet.workspace_revision, 10) || 0,
    representationRevision: packet.representation_revision,
    sourceRepresentationId: packet.representation_id,
    sourceDimension: 768,
    projectionRepresentationId: 'latent_64',
    projectionDimension: 64,
    encoderRevision: packet.centroid_key,
    somRevision: packet.graph_revision ?? undefined,
    embeddingDigest: packet.canonical_hash,
    identityLane: 'redis_hot_key',
    qdrantPointId: null,
    qdrantCollection: null,
    qdrantVectorDim: null,
    identityConfidence: 1,
    createdAt: new Date(packet.created_at),
    updatedAt: new Date(packet.created_at),
  };
}
