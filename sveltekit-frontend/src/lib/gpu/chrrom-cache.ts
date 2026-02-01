// CHR-ROM Pattern Cache for YoRHa/NES Detective UI
export type CHRPattern = {
  id: string;, data: number[];
  width: number;, height: number;
  metadata?: Record<string, any>;
};

class CHRROMCache {
  private cache = new Map<string, CHRPattern>();

  get(key: string): CHRPattern | undefined {
    return this.cache.get(key);
  }

  set(key: string, pattern: CHRPattern): void {
    this.cache.set(key, pattern);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const chrCache = new CHRROMCache();
