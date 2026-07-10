import { getRedis } from '$lib/server/redis';
import type { SomCell, SomNeighborSet } from './contracts';

/**
 * SOM Neighbor Lookup — Local Cache Before Network
 *
 * Query: What packets are near me in the SOM grid?
 * Answer: Redis exact lookup (5ms) + 8-neighbor radius check
 * Fallback: Network SOM lookup if Redis miss
 */

export async function lookupSomNeighbors(
  packetKey: string,
  limit: number = 100
): Promise<SomNeighborSet | null> {
  try {
    const redis = getRedis();

    // Step 1: Find exact cell coordinates
    const exactCellKey = `sw:som:cell:${packetKey}`;
    const cellData = await redis.get(exactCellKey);

    if (!cellData) {
      return null; // Cache miss — fall through to network
    }

    const { row, col } = JSON.parse(cellData) as SomCell;
    const exact: SomCell = { row, col };

    // Step 2: Enumerate 8-neighbor radius
    const neighbors: SomCell[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue; // skip exact cell
        neighbors.push({ row: row + dr, col: col + dc });
      }
    }

    return {
      exact,
      neighbors,
      isExact: (cell: SomCell) => cell.row === exact.row && cell.col === exact.col
    };
  } catch (err) {
    console.error('SOM neighbor lookup error:', err);
    return null; // Graceful fallback
  }
}

/**
 * Fetch SOM Manifest from Cache or Network
 *
 * Priority:
 * 1. Redis exact SOM cell match (5ms)
 * 2. Redis neighbor cell match (5ms, marked as non-exact)
 * 3. Network fetch (500ms+)
 */

export async function fetchSomManifest(
  packetKey: string,
  options?: { strict?: boolean }
): Promise<{ data: any; source: 'redis-exact' | 'redis-neighbor' | 'network' | null } | null> {
  try {
    const redis = getRedis();

    // Try exact cell
    const exactKey = `sw:som:manifest:${packetKey}`;
    const exactData = await redis.get(exactKey);
    if (exactData) {
      return {
        data: JSON.parse(exactData),
        source: 'redis-exact'
      };
    }

    // Try 8-neighbor radius (fallback, non-strict)
    if (!options?.strict) {
      const neighbors = await lookupSomNeighbors(packetKey);
      if (neighbors) {
        for (const neighbor of neighbors.neighbors) {
          const neighborKey = `sw:som:manifest:${neighbor.row}:${neighbor.col}`;
          const neighborData = await redis.get(neighborKey);
          if (neighborData) {
            return {
              data: JSON.parse(neighborData),
              source: 'redis-neighbor'
            };
          }
        }
      }
    }

    return { data: null, source: null }; // Cache miss
  } catch (err) {
    console.error('SOM manifest fetch error:', err);
    return { data: null, source: null };
  }
}

/**
 * Write SOM Cell Coordinates to Cache
 * Called after SOM clustering completes
 */

export async function cacheSomCell(
  packetKey: string,
  row: number,
  col: number,
  ttl: number = 86400
): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `sw:som:cell:${packetKey}`;
    await redis.setex(key, ttl, JSON.stringify({ row, col }));
    return true;
  } catch (err) {
    console.error('Cache SOM cell error:', err);
    return false;
  }
}

/**
 * Write SOM Manifest to Cache
 * Called after LOD manifest is generated
 */

export async function cacheSomManifest(
  packetKey: string,
  manifest: any,
  ttl: number = 3600
): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `sw:som:manifest:${packetKey}`;
    await redis.setex(key, ttl, JSON.stringify(manifest));
    return true;
  } catch (err) {
    console.error('Cache SOM manifest error:', err);
    return false;
  }
}
