import { createHash } from 'node:crypto';

export type HotnessBucket = 'cold' | 'cool' | 'warm' | 'hot';

export type JsonbLabelValue = string | number | boolean | null | string[];

export type JsonbLabelRecord = Record<string, JsonbLabelValue>;

export interface LabelNormalizationInput {
  jsonb?: Record<string, unknown>;
  centroid?: {
    label?: string | number | null;
    topology?: string | null;
    clusterKey?: string | null;
  };
  karpathy?: {
    bucket?: string | null;
    hotness?: number | null;
    blend?: number | null;
    score?: number | null;
    authority?: number | null;
  };
}

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

// ── Sink Write Functions ──────────────────────────────────────────────────────
// Dynamic imports used throughout to avoid circular dependency chains.
// All writes are fire-and-forget by default — callers should await only when
// they need confirmation (e.g., ACE compaction, audit pipelines).

/**
 * Write normalized labels to Redis label cache.
 * Key: ace:labels:file:{sha1(fileKey)}  TTL: 24h
 */
export async function writeLabelsToRedis(
  labels: NormalizedLabels,
  fileKey: string
): Promise<void> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const sig = labelsSignature(labels);
    const redisKey = `ace:labels:file:${createHash('sha1').update(fileKey).digest('hex').slice(0, 16)}`;
    await redis.set(redisKey, JSON.stringify({ ...labels, sig, fileKey }), 'EX', 86400);
  } catch (err) {
    console.warn('[normalize-labels] Redis write skipped:', (err as Error)?.message);
  }
}

/**
 * Upsert structural label payload into a Qdrant point.
 * Adds connectionType, language, dependencyRole, edgeKind, clusterIds to payload.
 */
export async function writeLabelsToQdrant(
  labels: NormalizedLabels,
  collectionName: string,
  pointId: string | number
): Promise<void> {
  try {
    const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
    await qdrant.client.setPayload(collectionName, {
      points: [pointId],
      payload: {
        centroid_label: labels.centroid_label,
        topology_label: labels.topology_label,
        cluster_key: labels.cluster_key,
        hotness_bucket: labels.hotness_bucket,
        feature_family: labels.feature_family,
        label_sig: labelsSignature(labels),
      },
    });
  } catch (err) {
    console.warn('[normalize-labels] Qdrant payload write skipped:', (err as Error)?.message);
  }
}

/**
 * Append a label record to the daily JSONL synthesis log for fine-tuning.
 * Path: memory/datasets/llm_synthesis/YYYY-MM-DD.jsonl
 */
export async function writeLabelsToJsonl(
  labels: NormalizedLabels,
  meta: { recordId: string; query?: string; model?: string; latencyMs?: number }
): Promise<void> {
  try {
    const { appendFile, mkdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const date = new Date().toISOString().slice(0, 10);
    const dir = join(process.cwd(), '../memory/datasets/llm_synthesis');
    await mkdir(dir, { recursive: true });
    const line = JSON.stringify({
      record_id: meta.recordId,
      query: meta.query ?? '',
      model: meta.model ?? 'unknown',
      latency_ms: meta.latencyMs ?? 0,
      structural_labels: labels,
      label_sig: labelsSignature(labels),
      timestamp: new Date().toISOString(),
    });
    await appendFile(join(dir, `${date}.jsonl`), line + '\n', 'utf-8');
  } catch (err) {
    console.warn('[normalize-labels] JSONL write skipped:', (err as Error)?.message);
  }
}

/**
 * Upsert ClusterCard metadata in Postgres (kag_cluster_cards table).
 * No-ops gracefully if table does not yet exist.
 */
export async function writeLabelsToClusterCard(
  labels: NormalizedLabels,
  clusterId: string,
  cardType = 'cluster'
): Promise<void> {
  try {
    const { db } = await import('$lib/server/db/client.js');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`
      INSERT INTO kag_cluster_cards (cluster_id, card_type, cluster_key, labels, updated_at)
      VALUES (
        ${clusterId},
        ${cardType},
        ${labels.cluster_key ?? clusterId},
        ${JSON.stringify(labels)}::jsonb,
        NOW()
      )
      ON CONFLICT (cluster_id) DO UPDATE
        SET labels    = EXCLUDED.labels,
            card_type = EXCLUDED.card_type,
            updated_at = NOW()
    `);
  } catch (err) {
    // Table may not exist yet — silently skip
    console.debug('[normalize-labels] ClusterCard upsert skipped:', (err as Error)?.message);
  }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export interface LabelWriteOptions {
  /** Redis file key (e.g. filePath or stableKey) — skips Redis write if omitted */
  redisKey?: string;
  /** Qdrant collection + pointId — skips Qdrant write if omitted */
  qdrant?: { collection: string; pointId: string | number };
  /** Cluster ID for ClusterCard upsert — skips if omitted */
  clusterId?: string;
  /** JSONL synthesis log meta — skips JSONL write if omitted */
  jsonl?: { recordId: string; query?: string; model?: string; latencyMs?: number };
  /** If true, awaits all sinks before returning (default: fire-and-forget) */
  awaitAll?: boolean;
}

/**
 * Full label pipeline: normalize raw input → write to all configured sinks.
 *
 * By default writes are fire-and-forget (Promise.all not awaited).
 * Pass `awaitAll: true` for audit/test flows that need confirmation.
 *
 * Usage:
 *   const labels = await orchestrateLabels(input, { redisKey: filePath, clusterId });
 */
export async function orchestrateLabels(
  input: LabelNormalizationInput,
  opts: LabelWriteOptions = {}
): Promise<NormalizedLabels> {
  const labels = normalizeLabels(input);

  const writes: Promise<void>[] = [];

  if (opts.redisKey) {
    writes.push(writeLabelsToRedis(labels, opts.redisKey));
  }

  if (opts.qdrant) {
    writes.push(writeLabelsToQdrant(labels, opts.qdrant.collection, opts.qdrant.pointId));
  }

  if (opts.clusterId) {
    writes.push(writeLabelsToClusterCard(labels, opts.clusterId));
  }

  if (opts.jsonl) {
    writes.push(writeLabelsToJsonl(labels, opts.jsonl));
  }

  if (opts.awaitAll) {
    await Promise.all(writes);
  } else {
    // Fire-and-forget — surface errors to console only
    Promise.all(writes).catch((err) =>
      console.warn('[normalize-labels] orchestrateLabels sink error:', err)
    );
  }

  return labels;
}