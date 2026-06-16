import { createHash } from 'node:crypto';

export type HotnessBucket = 'cold' | 'cool' | 'warm' | 'hot';

export type JsonbLabelValue = string | number | boolean | null | string[];

export type JsonbLabelRecord = Record<string, JsonbLabelValue>;

export interface NormalizedLabels {
  centroid_label: string | null;
  topology_label: string | null;
  cluster_key: string | null;
  hotness_bucket: HotnessBucket;
  feature_family: string;
  tags: JsonbLabelRecord;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normaliseBucket(value: string): HotnessBucket {
  const bucket = value.trim().toLowerCase();
  if (bucket === 'hot' || bucket === 'warm' || bucket === 'cool' || bucket === 'cold') {
    return bucket;
  }
  if (bucket === 'high' || bucket === 'active' || bucket === 'live') return 'hot';
  if (bucket === 'medium' || bucket === 'moderate') return 'warm';
  if (bucket === 'low' || bucket === 'idle' || bucket === 'coldish') return 'cool';
  return 'cold';
}

function bucketFromScore(score: number): HotnessBucket {
  if (score >= 0.85) return 'hot';
  if (score >= 0.6) return 'warm';
  if (score >= 0.3) return 'cool';
  return 'cold';
}

function cleanFamily(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'general';
}

function deriveFeatureFamily(input: LabelNormalizationInput, topologyLabel: string | null): string {
  const candidate =
    asText(input.jsonb?.feature_family) ??
    asText(input.jsonb?.family) ??
    asText(input.jsonb?.kind) ??
    asText(input.jsonb?.route_type) ??
    asText(input.jsonb?.topology_label) ??
    asText(input.jsonb?.topo_class) ??
    topologyLabel;

  const family = cleanFamily(candidate ?? 'general');
  if (family.includes('api') || family.includes('route')) return 'api-route';
  if (family.includes('ui') || family.includes('component') || family.includes('page') || family.includes('view')) {
    return 'ui-component';
  }
  if (family.includes('evidence') || family.includes('document') || family.includes('pdf')) {
    return 'evidence';
  }
  if (family.includes('graph') || family.includes('neo4j') || family.includes('topolog') || family.includes('som') || family.includes('cluster')) {
    return 'graph';
  }
  if (family.includes('db') || family.includes('sql') || family.includes('drizzle') || family.includes('postgres')) {
    return 'database';
  }
  if (family.includes('search') || family.includes('retrieval') || family.includes('rag') || family.includes('query')) {
    return 'retrieval';
  }
  if (family.includes('agent') || family.includes('mcp') || family.includes('tool')) {
    return 'agent';
  }
  if (family.includes('cache') || family.includes('redis')) {
    return 'cache';
  }
  return family;
}

function extractJsonbTags(
  jsonb: Record<string, unknown> | undefined,
  canonical: {
    centroidLabel: string | null;
    topologyLabel: string | null;
    clusterKey: string | null;
    hotnessBucket: HotnessBucket;
    featureFamily: string;
  }
): JsonbLabelRecord {
  const tags: JsonbLabelRecord = {};
  if (jsonb) {
    for (const [key, value] of Object.entries(jsonb).sort(([a], [b]) => a.localeCompare(b))) {
      if (value == null) continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        tags[key] = value;
        continue;
      }
      if (
        Array.isArray(value) &&
        value.every((item) => item == null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
      ) {
        tags[key] = value.filter((item): item is string | number | boolean => item != null).map((item) => String(item));
      }
    }
  }

  if (canonical.centroidLabel) tags.centroid_label = canonical.centroidLabel;
  if (canonical.topologyLabel) tags.topology_label = canonical.topologyLabel;
  if (canonical.clusterKey) tags.cluster_key = canonical.clusterKey;
  tags.hotness_bucket = canonical.hotnessBucket;
  tags.feature_family = canonical.featureFamily;
  if (!tags.source_system) tags.source_system = 'legal-ai';

  return tags;
}

export function normalizeLabels(input: LabelNormalizationInput): NormalizedLabels {
  const centroidLabel =
    asText(input.centroid?.label) ??
    asText(input.jsonb?.centroid_label) ??
    asText(input.jsonb?.centroidLabel) ??
    asText(input.jsonb?.cluster_key) ??
    asText(input.jsonb?.clusterKey) ??
    null;

  const topologyLabel =
    asText(input.centroid?.topology) ??
    asText(input.jsonb?.topology_label) ??
    asText(input.jsonb?.topologyLabel) ??
    asText(input.jsonb?.topo_class) ??
    asText(input.jsonb?.topoClass) ??
    null;

  const clusterKey =
    asText(input.centroid?.clusterKey) ??
    asText(input.jsonb?.cluster_key) ??
    asText(input.jsonb?.clusterKey) ??
    (centroidLabel && topologyLabel ? `${topologyLabel}:${centroidLabel}` : centroidLabel);

  const rawBucket =
    asText(input.karpathy?.bucket) ??
    asText(input.jsonb?.hotness_bucket) ??
    asText(input.jsonb?.hotnessBucket) ??
    null;

  const numericScore =
    asNumber(input.karpathy?.hotness) ??
    asNumber(input.karpathy?.blend) ??
    asNumber(input.karpathy?.score) ??
    asNumber(input.karpathy?.authority) ??
    null;

  const hotnessBucket = rawBucket
    ? normaliseBucket(rawBucket)
    : numericScore != null
      ? bucketFromScore(numericScore)
      : 'cold';

  const featureFamily = deriveFeatureFamily(input, topologyLabel);
  const tags = extractJsonbTags(input.jsonb, {
    centroidLabel,
    topologyLabel,
    clusterKey,
    hotnessBucket,
    featureFamily,
  });

  return {
    centroid_label: centroidLabel,
    topology_label: topologyLabel,
    cluster_key: clusterKey,
    hotness_bucket: hotnessBucket,
    feature_family: featureFamily,
    tags,
  };
}

// --- Sink Write Functions (Stubs for integration) ---

/**
 * Writes the normalized labels to the Redis cache layer.
 * @param labels The labels to write.
 * @param key The primary key for the cache entry.
 */
export async function writeToRedisCache(labels: NormalizedLabels, key: string): Promise<void> {
  console.log('[Redis] Setting label key ' + key + '...');
    // TODO: Call redisClient.set(key, JSON.stringify(labels), 'EX', '24h');
    console.log('Redis write stub successful.');
}

/**
 * Writes the normalized labels to the Qdrant vector store.
 * @param labels The labels to write.
 * @param collectionName The target collection name (e.g., 'evidence_vectors').
 * @param vector The associated vector data (placeholder).
 */
export async function writeToQdrant(
  labels: NormalizedLabels,
  collectionName: string,
  pointId: string | number,
  options: LabelSinkOptions = { mode: 'dry-run' }
): Promise<void> {
  requireApply(options);
  if (options.mode !== 'apply') return;

  await qdrant.setPayload(collectionName, {
    points: [pointId],
    payload: {
      ...labels.tags,
      centroid_label: labels.centroid_label,
      topology_label: labels.topology_label,
      cluster_key: labels.cluster_key,
      hotness_bucket: labels.hotness_bucket,
      feature_family: labels.feature_family,
      label_signature: labelsSignature(labels),
      label_payload_version: 1,
      label_updated_at: new Date().toISOString(),
    },
  });
}

/**
 * Writes the normalized labels to the JSONL export for retraining/auditing.
 * @param labels The labels to write.
 * @param recordId A unique identifier for the record.
 */
export async function writeToJsonlExport(labels: NormalizedLabels, recordId: string): Promise<void> {
  console.log('[JSONL] Appending record ' + recordId + ' to synthesis log...');
    synthesisLogger.append(recordId, labels)
    console.log('JSONL write stub successful.');
}

/**
 * Updates the ClusterCard schema record with the normalized labels.
 * @param labels The labels to write.
 * @param recordId The ID of the cluster card/record being updated.
 */
export async function updateClusterCard(labels: NormalizedLabels, recordId: string): Promise<void> {
  console.log('[ClusterCard] Updating metadata for record ' + recordId + '...');
    databaseClient.update_cluster_card_metadata(recordId, labels)
    console.log('ClusterCard update stub successful.');
}
// --- End of Sink Write Functions ---

export function labelsSignature(labels: NormalizedLabels): string {
  const canonical = {
    centroid_label: labels.centroid_label,
    topology_label: labels.topology_label,
    cluster_key: labels.cluster_key,
    hotness_bucket: labels.hotness_bucket,
    feature_family: labels.feature_family,
    tags: labels.tags,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}