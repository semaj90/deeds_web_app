import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export type AceTopRetrievalResult = {
  id: string;
  score: number;
  sourceRef?: string;
  title?: string;
  clusterId?: string;
  featureFamily?: string;
  snippet?: string;
};

export type AceTopRetrievalCacheEntry = {
  cacheKey: string;
  queryHash: string;
  topN: number;
  createdAt: string;
  degraded?: boolean;
  results: AceTopRetrievalResult[];
  retrievalTrace?: Record<string, unknown>;
  source?: 'redis' | 'snapshot' | 'miss';
};

export function buildAceTopRetrievalCacheKey(queryHash: string, topN = 20): string {
  return `ace:retrieval:topn:${queryHash}:${topN}`;
}

export function buildAceTopRetrievalQueryHash(query: string): string {
  return createHash('sha256').update(query).digest('hex').slice(0, 24);
}

export function normalizeAceTopRetrievalEntry(entry: Partial<AceTopRetrievalCacheEntry> & Pick<AceTopRetrievalCacheEntry, 'queryHash' | 'topN' | 'results' | 'createdAt'>): AceTopRetrievalCacheEntry {
  const cacheKey = entry.cacheKey ?? buildAceTopRetrievalCacheKey(entry.queryHash, entry.topN);
  return {
    cacheKey,
    queryHash: entry.queryHash,
    topN: entry.topN,
    createdAt: entry.createdAt,
    degraded: entry.degraded ?? false,
    results: entry.results,
    retrievalTrace: entry.retrievalTrace ?? {},
    source: entry.source,
  };
}

export function getAceTopRetrievalSnapshotPath(cacheKey: string): string {
  const base = path.resolve(process.cwd(), '.cache', 'ace', 'top-retrieval');
  return path.join(base, `${sanitizeCacheKey(cacheKey)}.json`);
}

export async function writeAceTopRetrievalSnapshot(entry: AceTopRetrievalCacheEntry): Promise<string> {
  const snapshotPath = getAceTopRetrievalSnapshotPath(entry.cacheKey);
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(entry, null, 2), 'utf8');
  return snapshotPath;
}

export async function readAceTopRetrievalSnapshot(cacheKey: string): Promise<AceTopRetrievalCacheEntry | null> {
  try {
    const raw = await fs.readFile(getAceTopRetrievalSnapshotPath(cacheKey), 'utf8');
    return JSON.parse(raw) as AceTopRetrievalCacheEntry;
  } catch {
    return null;
  }
}

export async function getAceTopRetrievalPointer(cacheKey: string): Promise<AceTopRetrievalCacheEntry | null> {
  try {
    const { getRedis } = await import('../redis.js');
    const redis = getRedis();
    const raw = await redis.get(cacheKey);
    if (!raw) return null;
    return normalizeAceTopRetrievalEntry(JSON.parse(raw) as Partial<AceTopRetrievalCacheEntry> & Pick<AceTopRetrievalCacheEntry, 'queryHash' | 'topN' | 'results' | 'createdAt'>);
  } catch {
    return null;
  }
}

export async function setAceTopRetrievalPointer(entry: AceTopRetrievalCacheEntry): Promise<void> {
  try {
    const { getRedis } = await import('../redis.js');
    const redis = getRedis();
    await redis.set(entry.cacheKey, JSON.stringify(entry));
  } catch {
    // ignore
  }
}

export async function persistAceTopRetrievalCache(query: string, results: AceTopRetrievalResult[], topN = 20): Promise<AceTopRetrievalCacheEntry> {
  const queryHash = buildAceTopRetrievalQueryHash(query);
  const cacheKey = buildAceTopRetrievalCacheKey(queryHash, topN);
  const entry = normalizeAceTopRetrievalEntry({
    queryHash,
    topN,
    results: results.slice(0, topN),
    createdAt: new Date().toISOString(),
    retrievalTrace: {
      topN,
      source: 'top-retrieval-cache',
    },
    degraded: false,
  });

  await Promise.allSettled([
    setAceTopRetrievalPointer(entry),
    writeAceTopRetrievalSnapshot(entry),
  ]);

  return entry;
}

function sanitizeCacheKey(key: string): string {
  return key.replace(/[:<>"/\\|?*]+/g, '_');
}

export default {
  buildAceTopRetrievalCacheKey,
  buildAceTopRetrievalQueryHash,
  getAceTopRetrievalPointer,
  setAceTopRetrievalPointer,
  persistAceTopRetrievalCache,
  readAceTopRetrievalSnapshot,
  writeAceTopRetrievalSnapshot,
};
