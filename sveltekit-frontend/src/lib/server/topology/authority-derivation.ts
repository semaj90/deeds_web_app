import type {
  DerivedAuthorityScore,
  RawPageRankScore,
} from './pagerank-types.js';

export interface DeriveAuthorityOptions {
  runId: string;
  contractVersion: string;
  graphSnapshotHash: string;
}

export function classifyAuthorityBand(
  percentile: number,
): DerivedAuthorityScore['authorityBand'] {
  if (percentile <= 0) return 'none';
  if (percentile < 0.5) return 'low';
  if (percentile < 0.85) return 'medium';
  if (percentile < 0.97) return 'high';
  return 'critical';
}

export function deriveAuthorityScores(
  rawScores: readonly RawPageRankScore[],
  options: DeriveAuthorityOptions,
): DerivedAuthorityScore[] {
  const sorted = [...rawScores].sort((a, b) => {
    if (a.rawScore !== b.rawScore) return a.rawScore - b.rawScore;
    return a.packetKey.localeCompare(b.packetKey);
  });

  const percentileByPacket = new Map<string, number>();
  const denominator = Math.max(sorted.length - 1, 1);

  for (let index = 0; index < sorted.length; index++) {
    percentileByPacket.set(sorted[index].packetKey, index / denominator);
  }

  return rawScores.map((row) => {
    const percentile = percentileByPacket.get(row.packetKey) ?? 0;
    const authorityScore = Math.sqrt(percentile);

    return {
      packetKey: row.packetKey,
      rawPageRank: row.rawScore,
      percentile,
      authorityScore,
      authorityBand: classifyAuthorityBand(percentile),
      runId: options.runId,
      contractVersion: options.contractVersion,
      graphSnapshotHash: options.graphSnapshotHash,
    };
  });
}
