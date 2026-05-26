import type { BowClusterScore } from './context-assembler.js';
import type { HotCluster } from './hot-cluster-reader.js';

export interface MergeOpts {
  /** Hotness score above which a hot cluster overrides its BoW score (default 0.6) */
  hotThreshold?: number;
  /** Max number of cluster should-filter entries to emit (default 4) */
  maxShould?: number;
  /** Blend weight for hotness in merged score: finalScore = hotWeight·hot + (1−hotWeight)·bow (default 0.5) */
  hotWeight?: number;
}

export interface MergedCluster {
  clusterId: number;
  score: number;
  fromHot: boolean;
  hotness?: number;
  source?: HotCluster['source'];
  fileCount?: number;
  metadataSummary?: string;
  scalarSeed?: number;
}

/**
 * Merges BoW cluster scores with XGBoost hotness scores.
 *
 * Strategy:
 *  1. For clusters present in both sets, blend: `hotWeight·hot + (1−hotWeight)·bowNorm`
 *  2. Hot-only clusters above threshold are included with their raw hotness score
 *  3. BoW-only clusters fill remaining slots up to maxShould
 *  4. Result is sorted by merged score descending, deduplicated by clusterId
 */
export function mergeClusterCandidates(
  bow: BowClusterScore[],
  hot: HotCluster[],
  opts: MergeOpts = {}
): MergedCluster[] {
  const { hotThreshold = 0.6, maxShould = 4, hotWeight = 0.5 } = opts;

  const bowWeight = 1 - hotWeight;
  const maxBow = bow.length > 0 ? Math.max(...bow.map((b) => b.score)) : 1;
  const bowMap = new Map(bow.map((b) => [b.clusterId, b.score / (maxBow || 1)]));
  const hotMap = new Map(hot.map((h) => [h.clusterId, h.hotness]));

  const seen = new Set<number>();
  const merged: MergedCluster[] = [];

  // Pass 1: clusters in both sets get blended score
  for (const h of hot) {
    const bowNorm = bowMap.get(h.clusterId) ?? 0;
    const blended = hotWeight * h.hotness + bowWeight * bowNorm;
    merged.push({
      clusterId: h.clusterId,
      score: blended,
      fromHot: true,
      hotness: h.hotness,
      source: h.source,
      fileCount: h.fileCount,
      metadataSummary: h.metadataSummary,
      scalarSeed: h.scalarSeed,
    });
    seen.add(h.clusterId);
  }

  // Pass 2: hot-only clusters above threshold (already processed above, but add BoW-only clusters)
  for (const b of bow) {
    if (!seen.has(b.clusterId)) {
      const bowNorm = b.score / (maxBow || 1);
      merged.push({ clusterId: b.clusterId, score: bowWeight * bowNorm, fromHot: false });
      seen.add(b.clusterId);
    }
  }

  // Hot-only clusters are already included from Pass 1; filter those below threshold
  const filtered = merged.filter((m) => !m.fromHot || (m.hotness ?? hotMap.get(m.clusterId) ?? 0) >= hotThreshold);

  return filtered
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (scoreDelta !== 0) return scoreDelta;

      const hotnessDelta = (b.hotness ?? 0) - (a.hotness ?? 0);
      if (hotnessDelta !== 0) return hotnessDelta;

      const scalarSeedDelta = (b.scalarSeed ?? 0) - (a.scalarSeed ?? 0);
      if (scalarSeedDelta !== 0) return scalarSeedDelta;

      const fileCountDelta = (b.fileCount ?? 0) - (a.fileCount ?? 0);
      if (fileCountDelta !== 0) return fileCountDelta;

      return a.clusterId - b.clusterId;
    })
    .slice(0, maxShould);
}
