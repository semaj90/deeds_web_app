import type { TopologyCoordinate4 } from './topology-coordinate4';

export interface TopologyTileNode {
  id: string;
  minSomX: number;
  maxSomX: number;
  minSomY: number;
  maxSomY: number;
  minAuthority: number;
  maxAuthority: number;
  minEntropyUtility: number;
  maxEntropyUtility: number;
  tileKeys: readonly string[];
  children?: readonly TopologyTileNode[];
}

export function contains(node: TopologyTileNode, p: TopologyCoordinate4): boolean {
  return p[0] >= node.minSomX && p[0] <= node.maxSomX &&
    p[1] >= node.minSomY && p[1] <= node.maxSomY &&
    p[2] >= node.minAuthority && p[2] <= node.maxAuthority &&
    p[3] >= node.minEntropyUtility && p[3] <= node.maxEntropyUtility;
}

/** BVH-like culling helper for visualization/prefetch only; never semantic ANN truth. */
export function collectCandidateTiles(node: TopologyTileNode, p: TopologyCoordinate4): string[] {
  if (!contains(node, p)) return [];
  const out = [...node.tileKeys];
  for (const child of node.children ?? []) out.push(...collectCandidateTiles(child, p));
  return [...new Set(out)].sort();
}
