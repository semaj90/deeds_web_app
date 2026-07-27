import type { AceCacheIdentity } from './cache-key.js';

function stableKey(identity: AceCacheIdentity): string {
  return JSON.stringify(identity);
}

export class RevisionAwareCache {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();

  async get(identity: AceCacheIdentity): Promise<unknown | null> {
    const key = stableKey(identity);
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(identity: AceCacheIdentity, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(stableKey(identity), {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}
