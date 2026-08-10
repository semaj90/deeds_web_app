export interface AnnRouteCacheKeyInput {
  queryHash: string;
  representationRevision: string;
  annIndexRevision: string;
  centroidRevision?: string;
  somRevision?: string;
  topK: number;
}

export function annRouteCacheKey(i: AnnRouteCacheKeyInput): string {
  return ['atlas', 'ann-route', i.queryHash, i.representationRevision, i.annIndexRevision, i.centroidRevision ?? '-', i.somRevision ?? '-', i.topK].join(':');
}

export interface AnnRouteCacheValue {
  packetKeys: string[];
  centroidIds?: number[];
  somCells?: string[];
  createdAt: number;
}
