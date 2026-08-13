/**
 * Loader — canonical cluster ACE packets from Postgres.
 *
 * This is the read-side consumer for the cluster packet lane. It does not
 * create identity. It only projects the canonical Postgres rows back into a
 * compact regen-friendly view for the directory card assembler.
 */

import { and, eq, like } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import type {
  ClusterAcePacketSummary,
  LoadClusterPacketsResult,
} from './types.js';

const DEFAULT_SOURCE_PREFIX = 'cluster:summary:%';

export interface LoadClusterPacketsOptions {
  sourcePrefix?: string;
}

type AtlasPacketRow = {
  packetKey: string | null;
  packetId: string;
  sourceRef: string;
  clusterId: number | null;
  summary: string | null;
  metadata: unknown;
  topology: unknown;
  workspaceRevision: number;
  representationRevision: number;
  sourceRepresentationId: string | null;
  redisCentroidKey: string | null;
  embeddingDigest: string | null;
  createdAt: Date | null;
};

export async function loadClusterPackets(
  opts: LoadClusterPacketsOptions = {},
): Promise<LoadClusterPacketsResult> {
  const loadedAt = new Date().toISOString();
  const sourcePrefix = opts.sourcePrefix ?? DEFAULT_SOURCE_PREFIX;
  const packets = new Map<string, ClusterAcePacketSummary>();

  const rows = await db
    .select({
      packetKey: atlasPackets.packetKey,
      packetId: atlasPackets.packetId,
      sourceRef: atlasPackets.sourceRef,
      clusterId: atlasPackets.clusterId,
      summary: atlasPackets.summary,
      metadata: atlasPackets.metadata,
      topology: atlasPackets.topology,
      workspaceRevision: atlasPackets.workspaceRevision,
      representationRevision: atlasPackets.representationRevision,
      sourceRepresentationId: atlasPackets.sourceRepresentationId,
      redisCentroidKey: atlasPackets.redisCentroidKey,
      embeddingDigest: atlasPackets.embeddingDigest,
      createdAt: atlasPackets.createdAt,
    })
    .from(atlasPackets)
    .where(and(eq(atlasPackets.domainClass, 'cluster.summary'), like(atlasPackets.sourceRef, sourcePrefix)))
    .orderBy(atlasPackets.clusterId);

  for (const row of rows as AtlasPacketRow[]) {
    const clusterSummaryKey = String(row.sourceRef ?? '').trim();
    const summary = String(row.summary ?? '').trim();
    const packetKey = String(row.packetKey ?? '').trim();
    const packetId = String(row.packetId ?? '').trim();
    if (!clusterSummaryKey || !packetKey || !packetId || !summary) continue;

    const metadata = asRecord(row.metadata);
    const topology = asRecord(row.topology);
    const pageRankTop5 = normalizePageRankTop5(
      Array.isArray(metadata?.pageRankTop5)
        ? metadata.pageRankTop5
        : Array.isArray(topology?.pageRankTop5)
          ? topology.pageRankTop5
          : [],
    );
    const topFiles = normalizeTopFiles(
      Array.isArray(metadata?.filePaths)
        ? metadata.filePaths
        : Array.isArray(topology?.filePaths)
          ? topology.filePaths
          : [],
    );
    const metadataCanonicalProjection = asRecord(metadata?.canonicalProjection);
    const metadataSemantic = asRecord(metadata?.semantic);
    const topologyRecord = asRecord(topology);
    const authorityScore = normalizeAuthorityScore(
      metadataSemantic?.authority ??
      metadata?.authority ??
      metadataCanonicalProjection?.authority
    );
    const graphRevision = readString(
      metadata?.graphRevision ??
      metadataCanonicalProjection?.graphRevision ??
      topologyRecord?.graphRevision ??
      null,
    );

    packets.set(clusterSummaryKey, {
      clusterSummaryKey,
      packetKey,
      packetId,
      clusterId: Number(row.clusterId ?? 0),
      summary,
      topFiles,
      pageRankTop5,
      authorityScore,
      workspaceRevision: Number(row.workspaceRevision ?? 0),
      sourceRevision: readString(metadata?.sourceRevision ?? metadataCanonicalProjection?.sourceRevision ?? null),
      graphRevision: graphRevision ?? null,
      representationId: readString(row.sourceRepresentationId ?? metadata?.representationId ?? metadataCanonicalProjection?.representationId ?? null),
      representationRevision: Number(row.representationRevision ?? 0),
      centroidKey: readString(row.redisCentroidKey ?? null),
      canonicalHash: readString(row.embeddingDigest ?? metadata?.canonicalHash ?? metadataCanonicalProjection?.canonicalHash ?? null),
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      source: 'postgres',
    });
  }

  return {
    packets,
    loadedAt,
    entryCount: packets.size,
    source: `postgres:atlas_packets(${sourcePrefix})`,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTopFiles(value: unknown[]): string[] {
  return [...new Set(value.map((entry) => readString(entry)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizePageRankTop5(value: unknown[]): ClusterAcePacketSummary['pageRankTop5'] {
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const filePath = readString(
        record.filePath ??
        record.file_path ??
        record.sourceRef ??
        record.source_ref ??
        '',
      );
      if (!filePath) return null;
      const pageRank = Number(record.pageRank ?? record.page_rank ?? record.score ?? 0);
      const karpathyBlend = Number(record.karpathyBlend ?? record.karpathy_blend ?? 0);
      return {
        filePath,
        pageRank: Number.isFinite(pageRank) ? Number(pageRank.toFixed(6)) : 0,
        karpathyBlend: Number.isFinite(karpathyBlend) ? Number(karpathyBlend.toFixed(6)) : 0,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function normalizeAuthorityScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toFixed(6));
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const score = Number(record.clusterAuthorityScore ?? record.cluster_authority_score ?? 0);
  return Number.isFinite(score) ? Number(score.toFixed(6)) : null;
}
