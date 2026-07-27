import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

export const CLUSTER_CARD_SCHEMA_VERSION = 1 as const;
export const CLUSTER_CARD_CACHE_VERSION = 'v1' as const;

export const allowedClusterCardCollections = [
  'codebase',
  'codebase_chunks_384',
  'codebase_chunks_384_hybrid',
  'codebase_chunks_768',
] as const;

export const clusterCardRequestSchema = z.object({
  sourceRef: z.string().trim().min(1).optional(),
  featureId: z.string().trim().min(1).optional(),
  clusterId: z.number().int().min(0).max(399).optional(),
  collection: z.enum(allowedClusterCardCollections).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  aliasId: z.string().uuid().optional(),
});

export const clusterCardSchema = z.object({
  schemaVersion: z.literal(CLUSTER_CARD_SCHEMA_VERSION),
  clusterId: z.string().min(1),
  clusterType: z.enum(['kmeans', 'som', 'graph_community', 'domain']),
  domain: z.string().nullable(),
  label: z.string().min(1),
  summary: z.string().nullable(),
  sourceRefs: z.array(z.string().min(1)),
  packetKeys: z.array(z.string().min(1)),
  featureIds: z.array(z.string().min(1)),
  memberCount: z.number().int().min(0),
  score: z.number().min(0).max(1),
  generatedAt: z.string().min(1),
  snapshotId: z.string().min(1),
  centroidId: z.string().nullable().optional(),
});

export const clusterCardResponseSchema = z.object({
  clusterCards: z.array(clusterCardSchema),
  queryHash: z.string().min(1),
  totalCount: z.number().int().min(0),
  cache: z.object({
    hit: z.boolean(),
    key: z.string().min(1),
    ttlSeconds: z.number().int().min(0).nullable(),
    status: z.enum(['hit', 'miss', 'write', 'unavailable', 'invalid']),
  }),
  trace: z.object({
    serverTraceId: z.string().uuid(),
    requestAliasId: z.string().uuid().optional(),
  }),
  warnings: z.array(z.string().min(1)),
});

export type ClusterCardRequest = z.infer<typeof clusterCardRequestSchema>;
export type CanonicalClusterCard = z.infer<typeof clusterCardSchema>;
export type ClusterCardResponse = z.infer<typeof clusterCardResponseSchema>;

type LegacyClusterCardRow = {
  id: string;
  centroid_dim: number | null;
  card: Record<string, unknown> | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
};

type LegacyAtlasDocRow = {
  source_ref?: string | null;
  feature_id?: string | null;
  packet_key?: string | null;
  cluster_id?: string | null;
  centroid_id?: string | null;
};

function normalizeScalar(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
    )
  );
}

function normalizeScore(value: unknown, memberCount: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }

  if (memberCount <= 0) return 0;
  return Math.max(0, Math.min(1, memberCount / 100));
}

export function normalizeClusterCardRequest(request: ClusterCardRequest): ClusterCardRequest {
  return {
    sourceRef: normalizeScalar(request.sourceRef),
    featureId: normalizeScalar(request.featureId),
    clusterId: request.clusterId,
    collection: request.collection,
    limit: request.limit,
    aliasId: request.aliasId,
  };
}

export function buildClusterCardQueryHash(request: ClusterCardRequest): string {
  const normalized = normalizeClusterCardRequest(request);
  return createHash('sha256')
    .update(
      JSON.stringify({
        schemaVersion: CLUSTER_CARD_SCHEMA_VERSION,
        sourceRef: normalized.sourceRef ?? null,
        featureId: normalized.featureId ?? null,
        clusterId: normalized.clusterId ?? null,
        collection: normalized.collection ?? null,
        limit: normalized.limit,
      })
    )
    .digest('hex');
}

export function makeClusterCardCacheKey(queryHash: string): string {
  return `ace:cluster-cards:${CLUSTER_CARD_CACHE_VERSION}:${queryHash}`;
}

export function buildClusterCardTrace(requestAliasId?: string): ClusterCardResponse['trace'] {
  return {
    serverTraceId: randomUUID(),
    ...(requestAliasId ? { requestAliasId } : {}),
  };
}

export function mapLegacyClusterCardRow(
  row: LegacyClusterCardRow,
  docs: LegacyAtlasDocRow[] = []
): CanonicalClusterCard {
  const card = row.card ?? {};
  const clusterId = String(card.id ?? row.id);
  const label =
    typeof card.cluster_label === 'string' && card.cluster_label.trim().length > 0
      ? card.cluster_label.trim()
      : `Cluster ${clusterId}`;
  const summary =
    typeof card.summary === 'string'
      ? card.summary
      : typeof card.cluster_summary === 'string'
        ? card.cluster_summary
        : null;
  const memberCount =
    typeof card.member_count === 'number' && Number.isFinite(card.member_count)
      ? Math.max(0, Math.trunc(card.member_count))
      : 0;
  const generatedAtRaw = row.updated_at ?? row.created_at ?? card.updated_at ?? card.created_at ?? new Date().toISOString();
  const generatedAt =
    generatedAtRaw instanceof Date ? generatedAtRaw.toISOString() : String(generatedAtRaw);

  const matchingDocs = docs.filter((doc) => String(doc.cluster_id ?? '') === clusterId);
  const sourceRefs = Array.from(
    new Set([
      ...normalizeStringArray(card.source_refs),
      ...normalizeStringArray(card.files),
      ...matchingDocs.map((doc) => doc.source_ref ?? '').filter((value) => value.length > 0),
    ])
  );
  const packetKeys = Array.from(
    new Set(matchingDocs.map((doc) => doc.packet_key ?? '').filter((value) => value.length > 0))
  );
  const featureIds = Array.from(
    new Set([
      ...normalizeStringArray(card.features),
      ...matchingDocs.map((doc) => doc.feature_id ?? '').filter((value) => value.length > 0),
    ])
  );

  return clusterCardSchema.parse({
    schemaVersion: CLUSTER_CARD_SCHEMA_VERSION,
    clusterId,
    clusterType: 'kmeans',
    domain: typeof card.domain === 'string' ? card.domain : null,
    label,
    summary,
    sourceRefs,
    packetKeys,
    featureIds,
    memberCount,
    score: normalizeScore(card.authority_score, memberCount),
    generatedAt,
    snapshotId: `legacy-cluster-cards:${row.id}:${row.centroid_dim ?? 'unknown'}`,
    centroidId:
      typeof card.centroid_id === 'string'
        ? card.centroid_id
        : matchingDocs[0]?.centroid_id ?? null,
  });
}
