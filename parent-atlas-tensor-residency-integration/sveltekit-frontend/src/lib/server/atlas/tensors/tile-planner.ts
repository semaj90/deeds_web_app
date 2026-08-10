import { buildTileKey } from './tile-key';
import { quantizeTopology4, type TopologyCoordinate4 } from './topology-coordinate4';

export interface TilePlan {
  primary: string;
  neighbors: string[];
}

export function planTopologyTiles(
  coordinate: TopologyCoordinate4,
  representationRevision: string,
  options: { somWidth?: number; somHeight?: number; bins?: number; radius?: number } = {}
): TilePlan {
  const width = options.somWidth ?? 20;
  const height = options.somHeight ?? 20;
  const bins = options.bins ?? 8;
  const radius = Math.max(0, Math.min(4, options.radius ?? 1));
  const q = quantizeTopology4(coordinate, bins);
  const primary = buildTileKey(representationRevision, q);
  const neighbors: string[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = q.somX + dx;
      const y = q.somY + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      neighbors.push(buildTileKey(representationRevision, { ...q, somX: x, somY: y }));
    }
  }
  return { primary, neighbors };
}
