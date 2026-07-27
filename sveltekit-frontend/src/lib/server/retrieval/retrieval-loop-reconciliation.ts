import { createHash } from 'node:crypto';
import { getRedis } from '$lib/server/redis.js';
import { tracedQuery } from '$lib/server/db/client.js';

export type IdentityWarning =
  | 'MISSING_PACKET_KEY'
  | 'MISSING_SOURCE_REF'
  | 'MISSING_ALIAS_ID'
  | 'MISSING_FEATURE_ID'
  | 'FEATURE_ID_CONFLICT'
  | 'SOURCE_REF_CONFLICT'
  | 'PACKET_KEY_CONFLICT'
  | 'DUPLICATE_QDRANT_IDENTITY'
  | 'STALE_PAYLOAD_VERSION'
  | 'UNKNOWN_IDENTITY'
  | 'TASK_SEMANTIC_PACKETS_UNAVAILABLE';

export interface PromptResult {
  query: string;
  selectedCards: string[];
  sourceRefs: string[];
  featureIds?: string[];
  latencyMs: number;
  fallbackReason: string | null;
  aliasId?: string;
}

export interface ReconciledEvidence {
  packetKey: string;
  sourceRef: string;
  featureId: string;
  treeNodeId?: string;
  qdrantPointId?: string;
  clusterIds: {
    kmeans?: number;
    som?: number;
    community?: string;
  };
  warnings: IdentityWarning[];
}

export interface ReconciliationResult {
  aliasId?: string;
  queryHash: string;
  sourceRefs: string[];
  featureIds: string[];
  evidences: ReconciledEvidence[];
  warningCounts: Partial<Record<IdentityWarning, number>>;
  cacheKey: string;
  timing: {
    promptMs: number;
    reconciliationMs: number;
    totalMs: number;
  };
}

type ParentAtlasRow = {
  source_ref: string | null;
  feature_id: string | null;
  packet_key: string | null;
  qdrant_point_id: string | null;
  cluster_id: string | null;
  centroid_id: string | null;
};

const CACHE_VERSION = 'v1';
const CACHE_TTL_SECONDS = 300;

function makeCacheKey(queryHash: string, sourceRefs: string[], featureIds: string[]): string {
  const filterHash = createHash('sha256')
    .update(JSON.stringify({ queryHash, sourceRefs: [...sourceRefs].sort(), featureIds: [...featureIds].sort() }))
    .digest('hex');
  return `ace:reconciliation:${CACHE_VERSION}:${filterHash}`;
}

export function buildWarningCounts(evidences: ReconciledEvidence[]): Partial<Record<IdentityWarning, number>> {
  const counts: Partial<Record<IdentityWarning, number>> = {};
  for (const evidence of evidences) {
    for (const warning of evidence.warnings) {
      counts[warning] = (counts[warning] ?? 0) + 1;
    }
  }
  return counts;
}

export function reconcileIdentityRows(
  rows: ParentAtlasRow[],
  sourceRefs: string[],
  featureIds: string[],
  aliasId?: string
): ReconciledEvidence[] {
  const normalizedRows = rows.filter((row) => row.source_ref || row.feature_id || row.packet_key);
  const grouped = new Map<string, ParentAtlasRow[]>();

  for (const row of normalizedRows) {
    const key = row.packet_key ?? `${row.source_ref ?? 'unknown'}::${row.feature_id ?? 'unknown'}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  const evidences: ReconciledEvidence[] = [];

  for (const [packetKey, group] of grouped) {
    const sourceRefSet = new Set(group.map((row) => row.source_ref ?? '').filter(Boolean));
    const featureIdSet = new Set(group.map((row) => row.feature_id ?? '').filter(Boolean));
    const qdrantPointSet = new Set(group.map((row) => row.qdrant_point_id ?? '').filter(Boolean));
    const clusterIdSet = new Set(group.map((row) => row.cluster_id ?? '').filter(Boolean));
    const warnings: IdentityWarning[] = [];

    const sourceRef = sourceRefSet.values().next().value ?? sourceRefs[0] ?? '';
    const featureId = featureIdSet.values().next().value ?? featureIds[0] ?? '';

    if (!packetKey || packetKey.includes('unknown')) warnings.push('MISSING_PACKET_KEY');
    if (!sourceRef) warnings.push('MISSING_SOURCE_REF');
    if (!featureId) warnings.push('MISSING_FEATURE_ID');
    if (!aliasId) warnings.push('MISSING_ALIAS_ID');
    if (sourceRefSet.size > 1) warnings.push('SOURCE_REF_CONFLICT');
    if (featureIdSet.size > 1) warnings.push('FEATURE_ID_CONFLICT');
    if (qdrantPointSet.size > 1) warnings.push('DUPLICATE_QDRANT_IDENTITY');
    if (clusterIdSet.size === 0) warnings.push('UNKNOWN_IDENTITY');

    evidences.push({
      packetKey: packetKey.includes('unknown') ? '' : packetKey,
      sourceRef,
      featureId,
      qdrantPointId: qdrantPointSet.values().next().value,
      clusterIds: {
        kmeans: Number.isFinite(Number(clusterIdSet.values().next().value))
          ? Number(clusterIdSet.values().next().value)
          : undefined,
      },
      warnings,
    });
  }

  if (evidences.length === 0) {
    evidences.push({
      packetKey: '',
      sourceRef: sourceRefs[0] ?? '',
      featureId: featureIds[0] ?? '',
      clusterIds: {},
      warnings: ['UNKNOWN_IDENTITY', !aliasId ? 'MISSING_ALIAS_ID' : 'MISSING_PACKET_KEY'].filter(Boolean) as IdentityWarning[],
    });
  }

  return evidences;
}

async function fetchParentAtlasRows(sourceRefs: string[], featureIds: string[]): Promise<ParentAtlasRow[]> {
  const filters: string[] = [];
  const params: unknown[] = [];

  if (sourceRefs.length > 0) {
    params.push(sourceRefs);
    filters.push(`source_ref = ANY($${params.length})`);
  }

  if (featureIds.length > 0) {
    params.push(featureIds);
    filters.push(`feature_id = ANY($${params.length})`);
  }

  if (filters.length === 0) {
    return [];
  }

  const query = `
    SELECT source_ref, feature_id, packet_key, qdrant_point_id, cluster_id, centroid_id
    FROM parent_atlas_documents
    WHERE ${filters.join(' OR ')}
    LIMIT 100
  `;

  const result = await tracedQuery<{ rows: ParentAtlasRow[] }>(
    'atlas.reconciliation.parent_atlas_documents.lookup',
    query,
    params
  );
  return result.rows ?? [];
}

async function readCachedReconciliation(cacheKey: string): Promise<ReconciliationResult | null> {
  try {
    const redis = getRedis();
    const cached = await redis.get(cacheKey);
    return cached ? (JSON.parse(cached) as ReconciliationResult) : null;
  } catch {
    return null;
  }
}

async function writeCachedReconciliation(cacheKey: string, result: ReconciliationResult): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
  } catch {
    // Degraded cache path is non-fatal.
  }
}

export async function reconcileRetrievalLoop(promptResult: PromptResult): Promise<ReconciliationResult> {
  const startMs = Date.now();
  const sourceRefs = Array.from(new Set(promptResult.sourceRefs.filter(Boolean)));
  const featureIds = Array.from(new Set((promptResult.featureIds ?? []).filter(Boolean)));
  const queryHash = createHash('sha256').update(promptResult.query).digest('hex');
  const cacheKey = makeCacheKey(queryHash, sourceRefs, featureIds);

  const cached = await readCachedReconciliation(cacheKey);
  if (cached) {
    return cached;
  }

  let rows: ParentAtlasRow[] = [];
  let taskSemanticPacketsUnavailable = false;
  try {
    rows = await fetchParentAtlasRows(sourceRefs, featureIds);
  } catch {
    taskSemanticPacketsUnavailable = true;
  }

  const evidences = reconcileIdentityRows(rows, sourceRefs, featureIds, promptResult.aliasId);
  if (taskSemanticPacketsUnavailable) {
    evidences.forEach((evidence) => {
      evidence.warnings.push('TASK_SEMANTIC_PACKETS_UNAVAILABLE');
    });
  }

  const result: ReconciliationResult = {
    aliasId: promptResult.aliasId,
    queryHash,
    sourceRefs,
    featureIds,
    evidences,
    warningCounts: buildWarningCounts(evidences),
    cacheKey,
    timing: {
      promptMs: promptResult.latencyMs,
      reconciliationMs: Date.now() - startMs,
      totalMs: promptResult.latencyMs + (Date.now() - startMs),
    },
  };

  await writeCachedReconciliation(cacheKey, result);
  return result;
}

export async function getCachedReconciliation(
  query: string,
  sourceRefs: string[],
  featureIds: string[]
): Promise<ReconciliationResult | null> {
  return readCachedReconciliation(
    makeCacheKey(createHash('sha256').update(query).digest('hex'), sourceRefs, featureIds)
  );
}

export const __test = {
  CACHE_TTL_SECONDS,
  makeCacheKey,
};
