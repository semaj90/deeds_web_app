export interface KarpathyClusterBackfillSource {
  clusterKey: string;
  clusterId: number;
  hotness: number;
  summary: string;
  purpose: string;
  riskLevel: string;
  mitigationProtocols: string[];
  topTags: string[];
  topFiles: string[];
  topoClasses: string[];
  scalarSeed: number;
  metadataSummary: string;
  source: string;
}

export interface KarpathyClusterPayloadPatch {
  cluster_id: number;
  cluster_key: string;
  cluster_hotness: number;
  cluster_hotness_bucket: 'cold' | 'cool' | 'warm' | 'hot';
  cluster_summary_text: string;
  cluster_purpose: string;
  cluster_risk_level: string;
  cluster_patterns: string[];
  cluster_warnings: string[];
  cluster_tags: string[];
  cluster_top_tags: string[];
  cluster_top_files: string[];
  cluster_topo_classes: string[];
  cluster_scalar_seed: number;
  cluster_metadata_summary: string;
  cluster_source: string;
}

export interface KarpathyClusterBackfillResult {
  clusterKey: string;
  clusterId: number;
  patch: KarpathyClusterPayloadPatch;
}

function bucketFromHotness(hotness: number): KarpathyClusterPayloadPatch['cluster_hotness_bucket'] {
  if (hotness >= 0.85) return 'hot';
  if (hotness >= 0.6) return 'warm';
  if (hotness >= 0.3) return 'cool';
  return 'cold';
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function truncate(values: string[], limit: number): string[] {
  return unique(values).slice(0, limit);
}

export function buildKarpathyClusterPayloadPatch(
  source: KarpathyClusterBackfillSource,
): KarpathyClusterPayloadPatch {
  return {
    cluster_id: source.clusterId,
    cluster_key: source.clusterKey,
    cluster_hotness: Number(source.hotness.toFixed(4)),
    cluster_hotness_bucket: bucketFromHotness(source.hotness),
    cluster_summary_text: source.summary.trim(),
    cluster_purpose: source.purpose.trim(),
    cluster_risk_level: source.riskLevel.trim(),
    cluster_patterns: truncate(source.topTags, 12),
    cluster_warnings: source.riskLevel.trim() ? [source.riskLevel.trim()] : [],
    cluster_tags: truncate(source.topFiles, 12),
    cluster_top_tags: truncate(source.topTags, 8),
    cluster_top_files: truncate(source.topFiles, 8),
    cluster_topo_classes: truncate(source.topoClasses, 6),
    cluster_scalar_seed: source.scalarSeed,
    cluster_metadata_summary: source.metadataSummary.trim(),
    cluster_source: source.source,
  };
}

export function buildKarpathyClusterBackfillRows(
  sources: KarpathyClusterBackfillSource[],
): KarpathyClusterBackfillResult[] {
  return sources.map((source) => ({
    clusterKey: source.clusterKey,
    clusterId: source.clusterId,
    patch: buildKarpathyClusterPayloadPatch(source),
  }));
}

