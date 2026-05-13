import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { desc, eq, sql } from 'drizzle-orm';
import { generateContextHash } from '$lib/server/cache-keys.js';
import { db } from '$lib/server/db/client.js';
import { llmContextCache } from '$lib/server/db/schema-postgres.js';
import { getRedis } from '$lib/server/redis.js';

export type ContextCacheIdentity = {
  queryHash: string;
  modelName: string;
  modelQuant: string;
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

export type ContextPack = {
  summary: string;
  chunk_ids: string[];
  graph_paths: string[];
  tool_policy: Record<string, unknown>;
  prefix_tokens_estimated: number;
  cache_hit: boolean;
  retrieval_skipped: boolean;
  backend: string;
  model_name: string;
  model_quant: string;
  tokenizer_hash: string;
  system_prompt_hash: string;
  tool_definitions_hash: string;
  repo_git_sha: string;
  corpus_hash: string;
  rag_bundle_hash: string;
  graph_snapshot_hash: string;
  cache_key?: string;
  hit_count?: number;
  last_used_at?: string;
  featureId?: string;
  glyphMask?: number;
  topFiles?: string[];
  topTriples?: [string, string, string][];
  selectedSourceIds?: string[];
  cacheKeys?: string[];
  warnings?: string[];
  planner_state?: Record<string, unknown>;
};

type LookupSource = () => Promise<ContextPack | null>;

export type ContextCacheLookupResult = {
  source: 'redis' | 'postgres' | 'local' | 'miss';
  pack: ContextPack | null;
};

type NamedLookupSource = {
  source: ContextCacheLookupResult['source'];
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
  };
  return `llmctx:${generateContextHash(stableStringify(normalized))}`;
}

export function getContextCachePath(cacheKey: string): string {
  return resolve(process.cwd(), '.cache', 'ace', 'context-packs', `${cacheKey}.json`);
}

export function normalizeContextPack(pack: Partial<ContextPack> & Pick<ContextPack, 'summary'>): ContextPack {
  return {
    summary: pack.summary,
    chunk_ids: pack.chunk_ids ?? [],
    graph_paths: pack.graph_paths ?? [],
    tool_policy: pack.tool_policy ?? {},
    prefix_tokens_estimated: pack.prefix_tokens_estimated ?? 0,
    cache_hit: pack.cache_hit ?? false,
    retrieval_skipped: pack.retrieval_skipped ?? false,
    backend: pack.backend ?? 'unknown',
    model_name: pack.model_name ?? 'unknown',
    model_quant: pack.model_quant ?? 'unknown',
    tokenizer_hash: pack.tokenizer_hash ?? 'unknown',
    system_prompt_hash: pack.system_prompt_hash ?? 'unknown',
    tool_definitions_hash: pack.tool_definitions_hash ?? 'unknown',
    repo_git_sha: pack.repo_git_sha ?? 'unknown',
    corpus_hash: pack.corpus_hash ?? 'unknown',
    rag_bundle_hash: pack.rag_bundle_hash ?? 'unknown',
    graph_snapshot_hash: pack.graph_snapshot_hash ?? 'unknown',
    cache_key: pack.cache_key,
    hit_count: pack.hit_count ?? 0,
    last_used_at: pack.last_used_at,
    featureId: pack.featureId,
    glyphMask: pack.glyphMask,
    topFiles: pack.topFiles ?? [],
    topTriples: pack.topTriples ?? [],
    selectedSourceIds: pack.selectedSourceIds ?? [],
    cacheKeys: pack.cacheKeys ?? [],
    warnings: pack.warnings ?? [],
    planner_state: pack.planner_state ?? {},
  };
}

function enrichForPersistence(cacheKey: string, pack: ContextPack): ContextPack {
  return normalizeContextPack({ ...pack, cache_key: cacheKey });
}

async function readRedisContextCache(cacheKey: string): Promise<ContextPack | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(`ace:ctx:${cacheKey}`);
    if (!raw) return null;
    return normalizeContextPack(JSON.parse(raw) as Partial<ContextPack> & Pick<ContextPack, 'summary'>);
  } catch {
    return null;
  }
}

async function readPostgresContextCache(cacheKey: string): Promise<ContextPack | null> {
  try {
    const [row] = await db
      .select()
      .from(llmContextCache)
      .where(eq(llmContextCache.cacheKey, cacheKey))
      .orderBy(desc(llmContextCache.lastUsedAt))
      .limit(1);

    if (!row) return null;

    const pack = row.contextPackJson as unknown as Partial<ContextPack> & Pick<ContextPack, 'summary'>;
    return normalizeContextPack({
      ...pack,
      cache_key: row.cacheKey,
      cache_hit: row.hitCount > 0,
      hit_count: row.hitCount,
      last_used_at: row.lastUsedAt.toISOString(),
      backend: row.backend,
      model_name: row.modelName,
      model_quant: row.modelQuant ?? 'unknown',
      tokenizer_hash: row.tokenizerHash,
      system_prompt_hash: row.systemPromptHash,
      tool_definitions_hash: row.toolDefinitionsHash,
      repo_git_sha: row.repoGitSha ?? 'unknown',
      corpus_hash: row.corpusHash ?? 'unknown',
      rag_bundle_hash: row.ragBundleHash ?? 'unknown',
      graph_snapshot_hash: row.graphSnapshotHash ?? 'unknown',
      prefix_tokens_estimated: row.estimatedPrefixTokens,
      chunk_ids: (row.chunkIds as string[] | null | undefined) ?? pack.chunk_ids ?? [],
      graph_paths: (row.graphPaths as string[] | null | undefined) ?? pack.graph_paths ?? [],
      tool_policy: (row.toolPolicy as Record<string, unknown> | null | undefined) ?? pack.tool_policy ?? {},
    });
  } catch {
    return null;
  }
}

async function readLocalContextCache(cacheKey: string): Promise<ContextPack | null> {
  try {
    const path = getContextCachePath(cacheKey);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf8');
    return normalizeContextPack(JSON.parse(raw) as Partial<ContextPack> & Pick<ContextPack, 'summary'>);
  } catch {
    return null;
  }
}

async function writeLocalContextCache(cacheKey: string, pack: ContextPack): Promise<void> {
  try {
    const path = getContextCachePath(cacheKey);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(enrichForPersistence(cacheKey, pack), null, 2), 'utf8');
  } catch {
    // best-effort
  }
}

async function writeRedisContextCache(cacheKey: string, pack: ContextPack): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(`ace:ctx:${cacheKey}`, JSON.stringify(enrichForPersistence(cacheKey, pack)));
  } catch {
    // best-effort
  }
}

async function writePostgresContextCache(cacheKey: string, pack: ContextPack): Promise<void> {
  try {
    const persisted = enrichForPersistence(cacheKey, pack);
    await db
      .insert(llmContextCache)
      .values({
        cacheKey,
        modelName: persisted.model_name,
        modelQuant: persisted.model_quant,
        backend: persisted.backend,
        tokenizerHash: persisted.tokenizer_hash,
        systemPromptHash: persisted.system_prompt_hash,
        toolDefinitionsHash: persisted.tool_definitions_hash,
        repoGitSha: persisted.repo_git_sha,
        corpusHash: persisted.corpus_hash,
        ragBundleHash: persisted.rag_bundle_hash,
        graphSnapshotHash: persisted.graph_snapshot_hash,
        contextPackJson: persisted as unknown as Record<string, unknown>,
        summary: persisted.summary,
        chunkIds: persisted.chunk_ids,
        graphPaths: persisted.graph_paths,
        toolPolicy: persisted.tool_policy,
        estimatedPrefixTokens: persisted.prefix_tokens_estimated,
        hitCount: persisted.hit_count ?? 0,
        lastUsedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: llmContextCache.cacheKey,
        set: {
          modelName: persisted.model_name,
          modelQuant: persisted.model_quant,
          backend: persisted.backend,
          tokenizerHash: persisted.tokenizer_hash,
          systemPromptHash: persisted.system_prompt_hash,
          toolDefinitionsHash: persisted.tool_definitions_hash,
          repoGitSha: persisted.repo_git_sha,
          corpusHash: persisted.corpus_hash,
          ragBundleHash: persisted.rag_bundle_hash,
          graphSnapshotHash: persisted.graph_snapshot_hash,
          contextPackJson: persisted as unknown as Record<string, unknown>,
          summary: persisted.summary,
          chunkIds: persisted.chunk_ids,
          graphPaths: persisted.graph_paths,
          toolPolicy: persisted.tool_policy,
          estimatedPrefixTokens: persisted.prefix_tokens_estimated,
          lastUsedAt: new Date(),
        },
      });
  } catch {
    // best-effort
  }
}

export async function getContextCache(cacheKey: string): Promise<ContextPack | null> {
  return (await getContextCacheWithSource(cacheKey)).pack;
}

export async function resolveContextCacheSources(readers: LookupSource[]): Promise<ContextPack | null> {
  for (const read of readers) {
    const hit = await read().catch(() => null);
    if (hit) return hit;
  }
  return null;
}

export async function resolveContextCacheSourcesWithSource(
  readers: NamedLookupSource[]
): Promise<ContextCacheLookupResult> {
  for (const { source, read } of readers) {
    const hit = await read().catch(() => null);
    if (hit) return { source, pack: hit };
  }

  return { source: 'miss', pack: null };
}

export async function getContextCacheWithSource(cacheKey: string): Promise<ContextCacheLookupResult> {
  const readers: NamedLookupSource[] = [
    { source: 'redis', read: () => readRedisContextCache(cacheKey) },
    { source: 'postgres', read: () => readPostgresContextCache(cacheKey) },
    { source: 'local', read: () => readLocalContextCache(cacheKey) },
  ];

  return resolveContextCacheSourcesWithSource(readers);
}

export async function setContextCache(cacheKey: string, contextPack: ContextPack): Promise<void> {
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
      const pack = normalizeContextPack(JSON.parse(raw) as Partial<ContextPack> & Pick<ContextPack, 'summary'>);
      pack.hit_count = (pack.hit_count ?? 0) + 1;
      pack.last_used_at = new Date().toISOString();
      pack.cache_hit = true;
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
