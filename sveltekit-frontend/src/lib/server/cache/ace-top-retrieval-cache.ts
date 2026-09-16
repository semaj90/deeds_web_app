import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { aceTopkRevisionedKeyV1, type RetrievalCacheIdentityV1 } from '../ace/cache-keys.js';

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
  /** Present only for revision-qualified entries. Legacy entries omit it. */
  identity?: RetrievalCacheIdentityV1;
};

export type RevisionedAceTopRetrievalCacheEntry = AceTopRetrievalCacheEntry & {
  identity: RetrievalCacheIdentityV1;
};

/**
 * Admit a cached top-K result only when its complete revision identity and
 * derived key match the request. Missing identity is an intentional legacy
 * miss, never a current hit.
 */
export function admitRevisionedAceTopRetrievalEntry(
  entry: AceTopRetrievalCacheEntry,
  identity: RetrievalCacheIdentityV1,
  expectedTopN: number,
): RevisionedAceTopRetrievalCacheEntry | null {
  if (!entry.identity || aceTopkRevisionedKeyV1(entry.identity) !== aceTopkRevisionedKeyV1(identity)) {
    return null;
  }
  if (entry.queryHash !== identity.queryHash || entry.topN !== expectedTopN) {
    return null;
  }
  if (entry.cacheKey !== aceTopkRevisionedKeyV1(identity)) {
    return null;
  }
  return entry as RevisionedAceTopRetrievalCacheEntry;
}

// Cache entries are index-derived, not eternal facts — 5 min matches the sibling
// topo-candidate-cache.ts TTL (short enough to stay warm, long enough to be useful).
const TOP_RETRIEVAL_TTL_SECONDS = 300;

export function buildAceTopRetrievalCacheKey(queryHash: string, topN = 20, workspaceRevision?: number): string {
  const revisionSuffix = workspaceRevision !== undefined ? `:rev${workspaceRevision}` : '';
  return `ace:retrieval:topn:${queryHash}:${topN}${revisionSuffix}`;
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
    // Identity-less values are legacy observations, even when an older writer
    // omitted the degraded flag. They remain readable but cannot be current.
    degraded: entry.degraded ?? !entry.identity,
    results: entry.results,
    retrievalTrace: entry.retrievalTrace ?? {},
    source: entry.source,
    identity: entry.identity,
  };
}

export function buildRevisionedAceTopRetrievalEntry(
  identity: RetrievalCacheIdentityV1,
  results: AceTopRetrievalResult[],
  topN = 20,
): RevisionedAceTopRetrievalCacheEntry {
  if (!Number.isInteger(topN) || topN < 1) {
    throw new Error('topN must be a positive integer');
  }
  return {
    cacheKey: aceTopkRevisionedKeyV1(identity),
    queryHash: identity.queryHash,
    topN,
    createdAt: new Date().toISOString(),
    degraded: false,
    results: results.slice(0, topN),
    retrievalTrace: { topN, source: 'revisioned-top-retrieval-cache' },
    identity,
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
    const parsed = JSON.parse(raw) as Partial<AceTopRetrievalCacheEntry> &
      Pick<AceTopRetrievalCacheEntry, 'queryHash' | 'topN' | 'results' | 'createdAt'>;
    return normalizeAceTopRetrievalEntry(parsed);
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

export async function getRevisionedAceTopRetrievalPointer(
  identity: RetrievalCacheIdentityV1,
  topN: number,
): Promise<RevisionedAceTopRetrievalCacheEntry | null> {
  const entry = await getAceTopRetrievalPointer(aceTopkRevisionedKeyV1(identity));
  return entry ? admitRevisionedAceTopRetrievalEntry(entry, identity, topN) : null;
}

export async function setAceTopRetrievalPointer(entry: AceTopRetrievalCacheEntry): Promise<void> {
  try {
    const { getRedis } = await import('../redis.js');
    const redis = getRedis();
    await redis.setex(entry.cacheKey, TOP_RETRIEVAL_TTL_SECONDS, JSON.stringify(entry));
  } catch {
    // ignore
  }
}

export async function persistRevisionedAceTopRetrievalCache(
  identity: RetrievalCacheIdentityV1,
  results: AceTopRetrievalResult[],
  topN = 20,
): Promise<RevisionedAceTopRetrievalCacheEntry> {
  const entry = buildRevisionedAceTopRetrievalEntry(identity, results, topN);
  await Promise.allSettled([
    setAceTopRetrievalPointer(entry),
    writeAceTopRetrievalSnapshot(entry),
  ]);
  return entry;
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
    // Compatibility entries have no revision-qualified identity and must never
    // be treated as current ACE admissions by downstream readers.
    degraded: true,
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
  buildRevisionedAceTopRetrievalEntry,
  getAceTopRetrievalPointer,
  getRevisionedAceTopRetrievalPointer,
  setAceTopRetrievalPointer,
  persistAceTopRetrievalCache,
  persistRevisionedAceTopRetrievalCache,
  readAceTopRetrievalSnapshot,
  writeAceTopRetrievalSnapshot,
};
