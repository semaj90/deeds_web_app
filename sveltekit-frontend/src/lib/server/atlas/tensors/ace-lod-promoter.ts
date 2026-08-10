import type { TensorTileManifest } from './tile-directory';
import type { RuntimePolicyManifest } from './runtime-policy-manifest';

export interface LodPromotionDecision {
  promote: readonly string[];
  keep: readonly string[];
  demote: readonly string[];
}

/** DLSS-like only in the scheduling sense: promote known higher-fidelity data; never synthesize canonical semantic vectors. */
export function planLodPromotion(
  tiles: readonly TensorTileManifest[],
  wanted: readonly string[],
  policy: RuntimePolicyManifest
): LodPromotionDecision {
  const wantedSet = new Set(wanted);
  const resident = tiles.filter((t) => t.gpuState === 'RESIDENT' || t.gpuState === 'IN_USE');
  const wantedResident = resident.filter((t) => wantedSet.has(t.tileKey));
  const missing = wanted.filter((k) => !resident.some((t) => t.tileKey === k));
  const max = policy.maxResidentTiles;
  const keep = [...wantedResident].sort((a,b) => b.utility - a.utility || a.tileKey.localeCompare(b.tileKey)).slice(0, max);
  const room = Math.max(0, max - keep.length);
  const promote = missing.slice(0, room);
  const keepSet = new Set(keep.map((t) => t.tileKey));
  const demote = resident
    .filter((t) => !keepSet.has(t.tileKey) && t.pinCount === 0 && t.gpuState !== 'IN_USE')
    .sort((a,b) => a.utility - b.utility || a.lastUsedAt - b.lastUsedAt || a.tileKey.localeCompare(b.tileKey))
    .map((t) => t.tileKey);
  return { promote, keep: keep.map((t) => t.tileKey), demote };
}
