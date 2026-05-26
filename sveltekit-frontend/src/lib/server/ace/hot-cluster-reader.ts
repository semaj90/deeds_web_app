import type { Redis } from 'ioredis';

export interface HotCluster {
  clusterKey: string;
  clusterId: number;
  hotness: number;
  source: 'ace:cluster:hot' | 'ace:cluster:tags:__meta';
  fileCount: number;
  summary: string;
  purpose: string;
  riskLevel: string;
  mitigationProtocols: string[];
  topTags: string[];
  topFiles: string[];
  topoClasses: string[];
  metadataSummary: string;
  scalarSeed: number;
}

export interface ReadHotClustersOptions {
  preferHotSet?: boolean;
}

type ClusterTagHash = Record<string, string>;

function parseJsonArray(value: string | undefined | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseClusterId(clusterKey: string): number {
  const id = parseInt(clusterKey.replace('cluster:gpu:', ''), 10);
  return Number.isFinite(id) ? id : -1;
}

function buildMetadataSummary(entry: {
  summary: string;
  purpose: string;
  riskLevel: string;
  topTags: string[];
  topFiles: string[];
  topoClasses: string[];
}): string {
  const parts = [] as string[];

  if (entry.summary.trim()) parts.push(entry.summary.trim());
  if (entry.purpose.trim()) parts.push(`Purpose: ${entry.purpose.trim()}`);
  if (entry.riskLevel.trim()) parts.push(`Risk: ${entry.riskLevel.trim()}`);
  if (entry.topTags.length > 0) parts.push(`Tags: ${entry.topTags.slice(0, 8).join(', ')}`);
  if (entry.topFiles.length > 0) parts.push(`Files: ${entry.topFiles.slice(0, 5).join(', ')}`);
  if (entry.topoClasses.length > 0) parts.push(`Topo: ${entry.topoClasses.slice(0, 4).join(', ')}`);

  return parts.join(' | ');
}

function buildScalarSeed(hotness: number, fileCount: number, topTags: string[], topFiles: string[], topoClasses: string[]): number {
  const hot = Math.max(0, Math.min(1, hotness));
  const diversity = Math.min(1, (topTags.length + topFiles.length + topoClasses.length) / 24);
  const sizeFactor = Math.min(1, Math.log1p(Math.max(0, fileCount)) / Math.log1p(1000));
  return Number((0.55 * hot + 0.25 * diversity + 0.2 * sizeFactor).toFixed(4));
}

async function readClusterTagHash(redis: Redis, clusterKey: string): Promise<ClusterTagHash> {
  try {
    return await redis.hgetall(`ace:cluster:tags:${clusterKey}`);
  } catch {
    return {};
  }
}

async function hydrateCluster(redis: Redis, clusterKey: string, hotness: number, source: HotCluster['source']): Promise<HotCluster> {
  const hash = await readClusterTagHash(redis, clusterKey);
  const summary = hash.summary ?? '';
  const purpose = hash.purpose ?? '';
  const riskLevel = hash.risk_level ?? hash.riskLevel ?? '';
  const mitigationProtocols = parseJsonArray(hash.mitigation_protocols);
  const topTags = parseJsonArray(hash.topTags);
  const topFiles = parseJsonArray(hash.topFiles);
  const topoClasses = parseJsonArray(hash.topoClasses);
  const fileCount = Number.parseInt(hash.fileCount ?? '0', 10) || 0;
  const metadataSummary = buildMetadataSummary({
    summary,
    purpose,
    riskLevel,
    topTags,
    topFiles,
    topoClasses,
  });

  return {
    clusterKey,
    clusterId: parseClusterId(clusterKey),
    hotness,
    source,
    fileCount,
    summary,
    purpose,
    riskLevel,
    mitigationProtocols,
    topTags,
    topFiles,
    topoClasses,
    metadataSummary,
    scalarSeed: buildScalarSeed(hotness, fileCount, topTags, topFiles, topoClasses),
  };
}

async function readHotSet(redis: Redis, topK: number): Promise<Array<{ clusterKey: string; hotness: number }>> {
  const raw = await redis.zrevrange('ace:cluster:hot', 0, Math.max(0, topK - 1), 'WITHSCORES');
  const result: Array<{ clusterKey: string; hotness: number }> = [];

  for (let i = 0; i < raw.length; i += 2) {
    const clusterKey = raw[i];
    const hotness = Number.parseFloat(raw[i + 1]);
    if (!clusterKey || !Number.isFinite(hotness)) continue;
    result.push({ clusterKey, hotness });
  }

  return result;
}

async function readClusterKeysFromMeta(redis: Redis, topK: number): Promise<string[]> {
  const metaRaw = await redis.get('ace:cluster:tags:__meta');
  if (!metaRaw) return [];

  try {
    const meta = JSON.parse(metaRaw) as { clusterKeys?: string[] };
    return (meta.clusterKeys ?? []).slice(0, topK);
  } catch {
    return [];
  }
}

/**
 * Reads the top-K hot clusters from `ace:cluster:hot` and hydrates each
 * cluster with Redis-backed metadata for Bifrost warmup and manifold seeds.
 *
 * When `preferHotSet` is true, the `ace:cluster:hot` sorted set is used if
 * present. Otherwise the reader falls back to the cluster-tag manifest.
 */
export async function readHotClusters(
  redis: Redis,
  topK = 10,
  options: ReadHotClustersOptions = {},
): Promise<HotCluster[]> {
  const preferHotSet = options.preferHotSet ?? true;

  try {
    const hotSet = preferHotSet ? await readHotSet(redis, topK) : [];
    if (hotSet.length > 0) {
      const result: HotCluster[] = [];
      for (const entry of hotSet) {
        result.push(await hydrateCluster(redis, entry.clusterKey, entry.hotness, 'ace:cluster:hot'));
      }
      return result;
    }

    const fallbackKeys = await readClusterKeysFromMeta(redis, topK);
    if (fallbackKeys.length === 0) return [];

    const result: HotCluster[] = [];
    for (const clusterKey of fallbackKeys) {
      result.push(await hydrateCluster(redis, clusterKey, 0, 'ace:cluster:tags:__meta'));
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * Builds the Bifrost warmup prompt from hydrated cluster metadata.
 */
export function buildClusterWarmupPrompt(cluster: HotCluster): string {
  return [
    `Cluster ${cluster.clusterKey} context`,
    `Hotness: ${cluster.hotness.toFixed(4)}`,
    `Scalar seed: ${cluster.scalarSeed.toFixed(4)}`,
    cluster.metadataSummary,
  ].filter(Boolean).join('\n');
}
