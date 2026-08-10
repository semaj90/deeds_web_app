import type { TensorTileManifest } from './tile-directory';

export interface AceTileSignals {
  relevance: number;
  authority: number;
  executionUtility: number;
  predictedReuse: number;
  memoryBytes: number;
  transferCost: number;
  recomputeCost: number;
}

export interface AceWeights {
  relevance: number;
  authority: number;
  executionUtility: number;
  predictedReuse: number;
  memoryCost: number;
  transferCost: number;
  recomputeCost: number;
}

export const DEFAULT_ACE_WEIGHTS: AceWeights = {
  relevance: 1,
  authority: 0.2,
  executionUtility: 0.4,
  predictedReuse: 0.5,
  memoryCost: 0.15,
  transferCost: 0.15,
  recomputeCost: 0.1
};

export function tileUtility(s: AceTileSignals, w: AceWeights = DEFAULT_ACE_WEIGHTS): number {
  return (
    w.relevance * s.relevance +
    w.authority * s.authority +
    w.executionUtility * s.executionUtility +
    w.predictedReuse * s.predictedReuse -
    w.memoryCost * Math.log1p(Math.max(0, s.memoryBytes)) -
    w.transferCost * s.transferCost -
    w.recomputeCost * s.recomputeCost
  );
}

export function rankEvictionCandidates(tiles: readonly TensorTileManifest[]): TensorTileManifest[] {
  return [...tiles]
    .filter((t) => t.pinCount === 0 && t.gpuState !== 'IN_USE')
    .sort((a, b) => a.utility - b.utility || a.lastUsedAt - b.lastUsedAt || a.tileKey.localeCompare(b.tileKey));
}
