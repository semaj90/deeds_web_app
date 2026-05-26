import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { desc, eq, sql } from 'drizzle-orm';
import { generateContextHash } from '$lib/server/cache-keys.js';
import { db } from '$lib/server/db/client';
import { llmContextCache } from '$lib/server/db/schema-postgres.js';
import { getRedis } from '$lib/server/redis.js';

export type ContextCacheIdentity = {
  queryHash: string;
  modelName: string;
  modelQuant: string;
  kvQuant?: string;
  draftModel?: boolean;
  backend: string;
  tokenizerHash: string;
  systemPromptHash: string;
  toolDefinitionsHash: string;
  repoGitSha: string;
  corpusHash: string;
  evidenceBundleHash: string;
  ragBundleHash: string;
  graphSnapshotHash: string;
  retrievalModeHash: string;
  sectionTypesHash: string;
  personaKey: string;
  tokenAwarePacking: boolean;
  userId?: string;
  caseId?: string;
  conversationId?: string;
  filePath?: string;
};

export type CachedContextPacket = {
  summary: string;
  chunkIds: string[];
  graphPaths: string[];
  toolPolicy: Record<string, unknown>;
  prefixTokensEstimated: number;
  cacheHit: boolean;
  retrievalSkipped: boolean;
  backend: string;
  modelName: string;
  modelQuant: string;
  kvQuant?: string;
  draftModel?: boolean;
  tokenizerHash: string;
  systemPromptHash: string;
  toolDefinitionsHash: string;
  repoGitSha: string;
  corpusHash: string;
  ragBundleHash: string;
  graphSnapshotHash: string;
  cacheKey?: string;
  hitCount?: number;
  lastUsedAt?: string;
  featureId?: string;
  glyphMask?: number;
  topFiles?: string[];
  topTriples?: [string, string, string][];
  selectedSourceIds?: string[];
  cacheKeys?: string[];
  warnings?: string[];
  plannerState?: Record<string, unknown>;
};

type LookupSource = () => Promise<CachedContextPacket | null>;

type ContextCacheSource = 'redis' | 'postgres' | 'local-json';

export type ContextCacheResolution =
  | {
      hit: true;
      source: ContextCacheSource;
      cacheKey: string;
      packet: CachedContextPacket;
    }
  | {
      hit: false;
      source: 'miss';
      cacheKey: string;
      reason: string;
    };

export type ContextCacheLookupResult = {
  source: ContextCacheResolution['source'];
  pack: CachedContextPacket | null;
};

type NamedLookupSource = {
  source: ContextCacheSource;
  read: LookupSource;
};

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
}

export function buildContextCacheKey(identity: ContextCacheIdentity): string {
  const normalized = {
    backend: identity.backend,
    corpusHash: identity.corpusHash,
    conversationId: identity.conversationId ?? '',
    caseId: identity.caseId ?? '',
    evidenceBundleHash: identity.evidenceBundleHash,
    filePath: identity.filePath ?? '',
    graphSnapshotHash: identity.graphSnapshotHash,
    modelName: identity.modelName,
    modelQuant: identity.modelQuant,
    personaKey: identity.personaKey,
    repoGitSha: identity.repoGitSha,
    ragBundleHash: identity.ragBundleHash,
    queryHash: identity.queryHash,
    retrievalModeHash: identity.retrievalModeHash,
    sectionTypesHash: identity.sectionTypesHash,
    systemPromptHash: identity.systemPromptHash,
    tokenizerHash: identity.tokenizerHash,
    toolDefinitionsHash: identity.toolDefinitionsHash,
    tokenAwarePacking: identity.tokenAwarePacking,
    userId: identity.userId ?? '',
    ...(identity.kvQuant ? { kvQuant: identity.kvQuant } : {}),
    ...(typeof identity.draftModel === 'boolean' ? { draftModel: identity.draftModel } : {}),
  };
  return `llmctx:${generateContextHash(stableStringify(normalized))}`;
}

export function getContextCachePath(cacheKey: string): string {
  return resolve(process.cwd(), '.cache', 'ace', 'context-packs', `${cacheKey}.json`);
}

export function normalizeCachedContextPacket(pack: Partial<CachedContextPacket> & Pick<CachedContextPacket, 'summary'>): CachedContextPacket {
  return {
    summary: pack.summary,
    chunkIds: pack.chunkIds ?? [],
    graphPaths: pack.graphPaths ?? [],
    toolPolicy: pack.toolPolicy ?? {},
    prefixTokensEstimated: pack.prefixTokensEstimated ?? 0,
    cacheHit: pack.cacheHit ?? false,
    retrievalSkipped: pack.retrievalSkipped ?? false,
    backend: pack.backend ?? 'unknown',
    modelName: pack.modelName ?? 'unknown',
    modelQuant: pack.modelQuant ?? 'unknown',
    kvQuant: pack.kvQuant,
    draftModel: pack.draftModel,
    tokenizerHash: pack.tokenizerHash ?? 'unknown',
    systemPromptHash: pack.systemPromptHash ?? 'unknown',
    toolDefinitionsHash: pack.toolDefinitionsHash ?? 'unknown',
    repoGitSha: pack.repoGitSha ?? 'unknown',
    corpusHash: pack.corpusHash ?? 'unknown',
    ragBundleHash: pack.ragBundleHash ?? 'unknown',
    graphSnapshotHash: pack.graphSnapshotHash ?? 'unknown',
    cacheKey: pack.cacheKey,
    hitCount: pack.hitCount ?? 0,
    lastUsedAt: pack.lastUsedAt,
    featureId: pack.featureId,
    glyphMask: pack.glyphMask,
    topFiles: pack.topFiles ?? [],
    topTriples: pack.topTriples ?? [],
    selectedSourceIds: pack.selectedSourceIds ?? [],
    cacheKeys: pack.cacheKeys ?? [],
    warnings: pack.warnings ?? [],
    plannerState: pack.plannerState ?? {},
  };
}

function enrichForPersistence(cacheKey: string, pack: CachedContextPacket): CachedContextPacket {
  return normalizeCachedContextPacket({
    ...pack,
    cacheKey,
    lastUsedAt: pack.lastUsedAt ?? new Date().toISOString(),
  });
}

async function readRedisContextCache(cacheKey: string): Promise<CachedContextPacket | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(`ace:ctx:${cacheKey}`);
    if (!raw) return null;
    return normalizeCachedContextPacket(JSON.parse(raw) as Partial<CachedContextPacket> & Pick<CachedContextPacket, 'summary'>);
  } catch {
    return null;
  }
}

async function readPostgresContextCache(cacheKey: string): Promise<CachedContextPacket | null> {
  try {
    const [row] = await db
      .select()
      .from(llmContextCache)
      .where(eq(llmContextCache.cacheKey, cacheKey))
      .orderBy(desc(llmContextCache.lastUsedAt))
      .limit(1);

    if (!row) return null;

    const pack = row.contextPackJson as unknown as Partial<CachedContextPacket> & Pick<CachedContextPacket, 'summary'>;
    return normalizeCachedContextPacket({
      ...pack,
      cacheKey: row.cacheKey,
      cacheHit: row.hitCount > 0,
      hitCount: row.hitCount,
      lastUsedAt: row.lastUsedAt.toISOString(),
      backend: row.backend,
      modelName: row.modelName,
      modelQuant: row.modelQuant ?? 'unknown',
      tokenizerHash: row.tokenizerHash,
      systemPromptHash: row.systemPromptHash,
      toolDefinitionsHash: row.toolDefinitionsHash,
      repoGitSha: row.repoGitSha ?? 'unknown',
      corpusHash: row.corpusHash ?? 'unknown',
      ragBundleHash: row.ragBundleHash ?? 'unknown',
      graphSnapshotHash: row.graphSnapshotHash ?? 'unknown',
      prefixTokensEstimated: row.estimatedPrefixTokens,
      chunkIds: (row.chunkIds as string[] | null | undefined) ?? pack.chunkIds ?? [],
      graphPaths: (row.graphPaths as string[] | null | undefined) ?? pack.graphPaths ?? [],
      toolPolicy: (row.toolPolicy as Record<string, unknown> | null | undefined) ?? pack.toolPolicy ?? {},
    });
  } catch {
    return null;
  }
}

async function readLocalContextCache(cacheKey: string): Promise<CachedContextPacket | null> {
  try {
    const path = getContextCachePath(cacheKey);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf8');
    return normalizeCachedContextPacket(JSON.parse(raw) as Partial<CachedContextPacket> & Pick<CachedContextPacket, 'summary'>);
  } catch {
    return null;
  }
}

async function writeLocalContextCache(cacheKey: string, pack: CachedContextPacket): Promise<void> {
  try {
    const path = getContextCachePath(cacheKey);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(enrichForPersistence(cacheKey, pack), null, 2), 'utf8');
  } catch {
    // best-effort
  }
}

async function writeRedisContextCache(cacheKey: string, pack: CachedContextPacket): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(`ace:ctx:${cacheKey}`, JSON.stringify(enrichForPersistence(cacheKey, pack)));
  } catch {
    // best-effort
  }
}

async function writePostgresContextCache(cacheKey: string, pack: CachedContextPacket): Promise<void> {
  try {
    const persisted = enrichForPersistence(cacheKey, pack);
    await db
      .insert(llmContextCache)
      .values({
        cacheKey,
        modelName: persisted.modelName,
        modelQuant: persisted.modelQuant,
        backend: persisted.backend,
        tokenizerHash: persisted.tokenizerHash,
        systemPromptHash: persisted.systemPromptHash,
        toolDefinitionsHash: persisted.toolDefinitionsHash,
        repoGitSha: persisted.repoGitSha,
        corpusHash: persisted.corpusHash,
        ragBundleHash: persisted.ragBundleHash,
        graphSnapshotHash: persisted.graphSnapshotHash,
        contextPackJson: persisted as unknown as Record<string, unknown>,
        summary: persisted.summary,
        chunkIds: persisted.chunkIds,
        graphPaths: persisted.graphPaths,
        toolPolicy: persisted.toolPolicy,
        estimatedPrefixTokens: persisted.prefixTokensEstimated,
        hitCount: persisted.hitCount ?? 0,
        lastUsedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: llmContextCache.cacheKey,
        set: {
          modelName: persisted.modelName,
          modelQuant: persisted.modelQuant,
          backend: persisted.backend,
          tokenizerHash: persisted.tokenizerHash,
          systemPromptHash: persisted.systemPromptHash,
          toolDefinitionsHash: persisted.toolDefinitionsHash,
          repoGitSha: persisted.repoGitSha,
          corpusHash: persisted.corpusHash,
          ragBundleHash: persisted.ragBundleHash,
          graphSnapshotHash: persisted.graphSnapshotHash,
          contextPackJson: persisted as unknown as Record<string, unknown>,
          summary: persisted.summary,
          chunkIds: persisted.chunkIds,
          graphPaths: persisted.graphPaths,
          toolPolicy: persisted.toolPolicy,
          estimatedPrefixTokens: persisted.prefixTokensEstimated,
          lastUsedAt: new Date(),
        },
      });
  } catch {
    // best-effort
  }
}

export async function getContextCache(cacheKey: string): Promise<CachedContextPacket | null> {
  return (await getContextCacheWithSource(cacheKey)).pack;
}

export async function resolveContextCacheSources(cacheKey: string): Promise<ContextCacheResolution> {
  const readers: NamedLookupSource[] = [
    { source: 'redis', read: () => readRedisContextCache(cacheKey) },
    { source: 'postgres', read: () => readPostgresContextCache(cacheKey) },
    { source: 'local-json', read: () => readLocalContextCache(cacheKey) },
  ];

  for (const { source, read } of readers) {
    const packet = await read().catch(() => null);
    if (packet) {
      return { hit: true, source, cacheKey, packet };
    }
  }

  return {
    hit: false,
    source: 'miss',
    cacheKey,
    reason: 'cache miss after redis, postgres, and local-json fallbacks',
  };
}

export async function getContextCacheWithSource(cacheKey: string): Promise<ContextCacheLookupResult> {
  const resolution = await resolveContextCacheSources(cacheKey);
  return resolution.hit ? { source: resolution.source, pack: resolution.packet } : { source: 'miss', pack: null };
}

export async function setContextCache(cacheKey: string, contextPack: CachedContextPacket): Promise<void> {
  await Promise.allSettled([
    writeRedisContextCache(cacheKey, contextPack),
    writePostgresContextCache(cacheKey, contextPack),
    writeLocalContextCache(cacheKey, contextPack),
  ]);
}

export async function bumpContextCacheHit(cacheKey: string): Promise<void> {
  try {
    const redis = getRedis();
    const raw = await redis.get(`ace:ctx:${cacheKey}`);
    if (raw) {
      const pack = normalizeCachedContextPacket(JSON.parse(raw) as Partial<CachedContextPacket> & Pick<CachedContextPacket, 'summary'>);
      pack.hitCount = (pack.hitCount ?? 0) + 1;
      pack.lastUsedAt = new Date().toISOString();
      pack.cacheHit = true;
      await redis.set(`ace:ctx:${cacheKey}`, JSON.stringify(pack));
      await writeLocalContextCache(cacheKey, pack);
    }
  } catch {
    // ignore
  }

  try {
    await db
      .update(llmContextCache)
      .set({
        hitCount: sql`${llmContextCache.hitCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(llmContextCache.cacheKey, cacheKey));
  } catch {
    // ignore
  }
}
