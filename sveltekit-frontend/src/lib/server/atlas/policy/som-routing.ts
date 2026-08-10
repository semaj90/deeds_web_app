export interface SomRoutingManifest {
  revision: string;
  representationRevision: string;
  rows: 20;
  cols: 20;
  trainedFrom: 'KMEANS_CENTROIDS' | 'SEMANTIC_768_EXPERIMENT';
  promoted: false;
}

export interface SomCell { x: number; y: number }

export function chooseSomWindowRadius(confidence: number, maxRadius = 4): number {
  const c = Math.min(1, Math.max(0, confidence));
  if (c >= 0.85) return 0;
  if (c >= 0.65) return Math.min(1, maxRadius);
  if (c >= 0.45) return Math.min(2, maxRadius);
  if (c >= 0.25) return Math.min(3, maxRadius);
  return maxRadius;
}

export function somNeighborhood(cell: SomCell, radius: number, rows = 20, cols = 20): SomCell[] {
  const out: SomCell[] = [];
  for (let y = Math.max(0, cell.y - radius); y <= Math.min(rows - 1, cell.y + radius); y += 1) {
    for (let x = Math.max(0, cell.x - radius); x <= Math.min(cols - 1, cell.x + radius); x += 1) {
      out.push({ x, y });
    }
  }
  return out;
}
