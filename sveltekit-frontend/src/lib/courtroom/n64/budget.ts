/** N64 Expansion Pak-inspired game-owned memory budget. Not browser total RAM. */
export const GAME_BUDGET_BYTES = 8 * 1024 * 1024;
export const POOLS = {
  simulation: 512 * 1024,
  geometry: 2 * 1024 * 1024,
  textures: 3 * 1024 * 1024,
  animation: 1024 * 1024,
  streaming: 1024 * 1024,
  reserve: 512 * 1024
} as const;
export type Pool = keyof typeof POOLS;
export class Budget {
  private used: Record<Pool, number> = {
    simulation: 0, geometry: 0, textures: 0, animation: 0, streaming: 0, reserve: 0
  };
  reserve(pool: Pool, bytes: number): () => void {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid allocation');
    if (this.used[pool] + bytes > POOLS[pool]) throw new Error(`Budget exceeded for ${pool}`);
    this.used[pool] += bytes;
    let released = false;
    return () => { if (!released) { this.used[pool] -= bytes; released = true; } };
  }
  snapshot() { return { ...this.used }; }
  total() { return Object.values(this.used).reduce((a, b) => a + b, 0); }
}
