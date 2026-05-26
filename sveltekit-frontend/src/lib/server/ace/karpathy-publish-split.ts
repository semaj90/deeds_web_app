import type { HotCluster } from './hot-cluster-reader.js';

export interface PublishSplitClusterAuthority {
  clusterAuthorityScore?: number;
  avgPr?: number;
  maxPr?: number;
  totalFiles?: number;
  topPrFiles?: Array<{
    filePath?: string;
    pageRank?: number;
    karpathyBlend?: number;
  }>;
  topBlendFiles?: Array<{
    filePath?: string;
    pageRank?: number;
    karpathyBlend?: number;
  }>;
}

export interface PublishSplitMemberFile {
  path?: string;
  filePath?: string;
  kind?: string;
  symbol?: string;
  lineStart?: number | null;
  lineEnd?: number | null;
}

export interface PublishSplitClusterSource {
  id?: number;
  clusterId?: number;
  clusterBlend?: number;
  inferredTopic?: string;
  summary?: string;
  purpose?: string;
  riskLevel?: string;
  mitigationProtocols?: string[];
  topTags?: Array<{ tag?: string; count?: number } | null>;
  topDirs?: Array<{ dir?: string; count?: number } | null>;
  memberFiles?: Array<PublishSplitMemberFile | null>;
  authority?: PublishSplitClusterAuthority;
  size?: number;
  sampledFor?: number;
  somRow?: number;
  somCol?: number;
  somCluster?: number;
  somGridW?: number;
  somGridH?: number;
}

export interface PublishSplitBuildOptions {
  limit?: number;
  minRawHotness?: number;
  generatedAt?: string;
}

export interface PublishSplitRedisHashes {
  hotSet: Array<{ clusterKey: string; hotness: number }>;
  meta: {
    clusterKeys: string[];
    generatedAt: string;
    sourceCount: number;
    selectedCount: number;
    maxRawHotness: number;
  };
  clusterHashes: Record<string, Record<string, string>>;
}

export interface PublishSplitManifest {
  generatedAt: string;
  sourceCount: number;
  selectedCount: number;
  maxRawHotness: number;
  selectedClusters: HotCluster[];
  scrollRows: Array<{
    clusterKey: string;
    clusterId: number;
    rawHotness: number;
    hotness: number;
    fileCount: number;
    summary: string;
    purpose: string;
    riskLevel: string;
    mitigationProtocols: string[];
    topTags: string[];
    topFiles: string[];
    topoClasses: string[];
    scalarSeed: number;
    source: HotCluster['source'];
  }>;
  redis: PublishSplitRedisHashes;
}

function parseNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '');
}

function inferClusterId(cluster: PublishSplitClusterSource): number {
  const id = cluster.id ?? cluster.clusterId ?? cluster.somCluster ?? -1;
  return Number.isFinite(id) ? Number(id) : -1;
}

function inferRawHotness(cluster: PublishSplitClusterSource): number {
  return parseNumber(
    cluster.clusterBlend ??
      cluster.authority?.clusterAuthorityScore ??
      cluster.authority?.maxPr ??
      cluster.authority?.avgPr ??
      0,
    0,
  );
}

function inferTopTags(cluster: PublishSplitClusterSource): string[] {
  const tags = (cluster.topTags ?? [])
    .map((entry) => entry?.tag ?? '')
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length > 0) return uniqueStrings(tags).slice(0, 8);

  const inferred = (cluster.inferredTopic ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((part) => part.length >= 3);
  return uniqueStrings(inferred).slice(0, 6);
}

function inferTopFiles(cluster: PublishSplitClusterSource): string[] {
  const authorityFiles = [
    ...(cluster.authority?.topPrFiles ?? []),
    ...(cluster.authority?.topBlendFiles ?? []),
  ]
    .map((entry) => normalizePath(entry.filePath ?? ''))
    .filter(Boolean);
  if (authorityFiles.length > 0) return uniqueStrings(authorityFiles).slice(0, 8);

  const memberFiles = (cluster.memberFiles ?? [])
    .map((entry) => normalizePath(entry?.path ?? entry?.filePath ?? ''))
    .filter(Boolean);
  return uniqueStrings(memberFiles).slice(0, 8);
}

function inferTopoClasses(cluster: PublishSplitClusterSource, topTags: string[]): string[] {
  const fromDirs = (cluster.topDirs ?? [])
    .map((entry) => entry?.dir ?? '')
    .map((dir) => dir.trim())
    .filter(Boolean);
  if (fromDirs.length > 0) return uniqueStrings(fromDirs).slice(0, 4);

  const topic = (cluster.inferredTopic ?? '')
    .toLowerCase()
    .replace(/[`"'()]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((part) => part.length >= 3);
  if (topic.length > 0) return uniqueStrings(topic).slice(0, 4);

  return uniqueStrings(topTags).slice(0, 4);
}

function inferRiskLevel(rawHotness: number): string {
  if (rawHotness >= 0.85) return 'high';
  if (rawHotness >= 0.65) return 'medium';
  return 'low';
}

function buildMetadataSummary(entry: {
  summary: string;
  purpose: string;
  riskLevel: string;
  topTags: string[];
  topFiles: string[];
  topoClasses: string[];
}): string {
  const parts: string[] = [];
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

function buildHotCluster(
  cluster: PublishSplitClusterSource,
  rawHotness: number,
  maxRawHotness: number,
  generatedAt: string,
): HotCluster {
  const clusterId = inferClusterId(cluster);
  const clusterKey = `cluster:gpu:${clusterId}`;
  const normalizedHotness = maxRawHotness > 0 ? Math.min(1, rawHotness / maxRawHotness) : 0;
  const topTags = inferTopTags(cluster);
  const topFiles = inferTopFiles(cluster);
  const topoClasses = inferTopoClasses(cluster, topTags);
  const fileCount =
    parseNumber(cluster.size, 0) ||
    parseNumber(cluster.authority?.totalFiles, 0) ||
    topFiles.length ||
    parseNumber(cluster.sampledFor, 0);
  const summary = (cluster.summary ?? cluster.inferredTopic ?? '').trim();
  const purpose = (cluster.purpose ?? '').trim();
  const riskLevel = (cluster.riskLevel ?? inferRiskLevel(normalizedHotness)).trim();
  const mitigationProtocols = uniqueStrings((cluster.mitigationProtocols ?? []).map((entry) => String(entry)));
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
    clusterId,
    hotness: Number(normalizedHotness.toFixed(4)),
    source: 'ace:cluster:hot',
    fileCount,
    summary,
    purpose,
    riskLevel,
    mitigationProtocols,
    topTags,
    topFiles,
    topoClasses,
    metadataSummary,
    scalarSeed: buildScalarSeed(normalizedHotness, fileCount, topTags, topFiles, topoClasses),
  };
}

export function buildKarpathyPublishSplit(
  clusters: PublishSplitClusterSource[],
  options: PublishSplitBuildOptions = {},
): PublishSplitManifest {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const limit = options.limit ?? 16;
  const minRawHotness = options.minRawHotness ?? 0;

  const ranked = clusters
    .map((cluster) => ({
      cluster,
      clusterId: inferClusterId(cluster),
      rawHotness: inferRawHotness(cluster),
    }))
    .filter((entry) => entry.clusterId >= 0)
    .filter((entry) => entry.rawHotness >= minRawHotness)
    .sort((a, b) => {
      const rawDelta = b.rawHotness - a.rawHotness;
      if (rawDelta !== 0) return rawDelta;
      const sizeDelta = parseNumber(b.cluster.size, 0) - parseNumber(a.cluster.size, 0);
      if (sizeDelta !== 0) return sizeDelta;
      return a.clusterId - b.clusterId;
    });

  const selected = ranked.slice(0, Math.max(0, limit));
  const maxRawHotness = selected.reduce((max, entry) => Math.max(max, entry.rawHotness), 0);
  const selectedClusters = selected.map((entry) => buildHotCluster(entry.cluster, entry.rawHotness, maxRawHotness, generatedAt));
  const scrollRows = selected.map((entry, index) => {
    const hotCluster = selectedClusters[index];
    return {
      clusterKey: hotCluster.clusterKey,
      clusterId: hotCluster.clusterId,
      rawHotness: Number(entry.rawHotness.toFixed(4)),
      hotness: hotCluster.hotness,
      fileCount: hotCluster.fileCount,
      summary: hotCluster.summary,
      purpose: hotCluster.purpose,
      riskLevel: hotCluster.riskLevel,
      mitigationProtocols: hotCluster.mitigationProtocols,
      topTags: hotCluster.topTags,
      topFiles: hotCluster.topFiles,
      topoClasses: hotCluster.topoClasses,
      scalarSeed: hotCluster.scalarSeed,
      source: hotCluster.source,
    };
  });

  const redisHotSet = selectedClusters.map((cluster) => ({
    clusterKey: cluster.clusterKey,
    hotness: cluster.hotness,
  }));
  const clusterKeys = selectedClusters.map((cluster) => cluster.clusterKey);

  const clusterHashes: Record<string, Record<string, string>> = {};
  for (const cluster of selectedClusters) {
    clusterHashes[cluster.clusterKey] = {
      summary: cluster.summary,
      purpose: cluster.purpose,
      risk_level: cluster.riskLevel,
      mitigation_protocols: JSON.stringify(cluster.mitigationProtocols),
      topTags: JSON.stringify(cluster.topTags),
      topFiles: JSON.stringify(cluster.topFiles),
      topoClasses: JSON.stringify(cluster.topoClasses),
      fileCount: String(cluster.fileCount),
      source: cluster.source,
      clusterId: String(cluster.clusterId),
      hotness: String(cluster.hotness),
      scalarSeed: String(cluster.scalarSeed),
      metadataSummary: cluster.metadataSummary,
      generatedAt,
    };
  }

  return {
    generatedAt,
    sourceCount: clusters.length,
    selectedCount: selectedClusters.length,
    maxRawHotness,
    selectedClusters,
    scrollRows,
    redis: {
      hotSet: redisHotSet,
      meta: {
        clusterKeys,
        generatedAt,
        sourceCount: clusters.length,
        selectedCount: selectedClusters.length,
        maxRawHotness,
      },
      clusterHashes,
    },
  };
}

