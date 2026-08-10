export interface RuntimePolicyManifest {
  policyRevision: string;
  kmeansRevision: string;
  somRevision: string;
  annRevision: string;
  aceRevision: string;
  rerankerRevision: string;
  kmeansK: number;
  somWidth: 20;
  somHeight: 20;
  topCentroids: number;
  annTopK: number;
  exactParityTopK: number;
  maxResidentTileBytes: number;
  maxResidentTiles: number;
  activeComputeTiles: 1;
  prefetchTiles: 1;
  graphHopBudget: number;
}

export function validateRuntimePolicy(p: RuntimePolicyManifest): void {
  if (!p.policyRevision) throw new Error('policyRevision required');
  if (p.kmeansK < 2) throw new Error('kmeansK must be >= 2');
  if (p.somWidth !== 20 || p.somHeight !== 20) throw new Error('current topology contract is SOM 20x20');
  if (p.activeComputeTiles !== 1 || p.prefetchTiles !== 1) throw new Error('initial proof requires one active + one prefetch tile');
  if (p.maxResidentTiles < 2) throw new Error('resident tiles must cover active + prefetch');
}
