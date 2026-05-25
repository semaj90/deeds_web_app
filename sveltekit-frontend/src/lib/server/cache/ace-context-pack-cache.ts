import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import childProcess from 'child_process';
const exec = promisify(childProcess.exec);

// ACE Context Pack Cache — skeleton implementation
// Purpose:
// - Redis hot pointer (NOT implemented here)
// - Postgres LLM context_cache audit row (placeholder)
// - SeaweedFS / NVMe JSON snapshot (written to tmp path as placeholder)
//
// Notes:
// - Do NOT modify storage clients in this module.
// - This file provides a small, safe surface for the next step.

export type AceContextPack = {
  id: string;
  contextId: string;
  cacheKey?: string;
  queryHash?: string;
  intent?: string;
  coordinates?: {
    clusterId?: string;
    somRow?: number;
    somCol?: number;
    manifold4?: [number, number, number, number];
  };
  chunkIds?: string[];
  summaryIds?: string[];
  sourceRefs?: string[];
  graphPaths?: string[];
  featureMapPackets?: unknown[];
  wikiCards?: unknown[];
  relationshipReports?: unknown[];
  tscDiagnostics?: {
    errors: number;
    warnings: number;
    rawOutputPath: string;
  };
  turboVecCandidates?: Array<Record<string, unknown>>;
  retrievalTrace?: Record<string, unknown>;
  toolPolicy?: Record<string, unknown>;
  nextSteps?: string[];
  degraded?: boolean;
  snapshotUrl?: string;
  version?: string;
  createdAt: string; // ISO
  summary?: string;
  metadata?: Record<string, unknown>;
  pointers?: {
    // optional audit pointer into Postgres
    postgresRowId?: string;
    // SeaweedFS path placeholder
    seaweedPath?: string;
    // NVMe path placeholder
    nvmePath?: string;
  };
};

type TypeScriptDiagnosticsSnapshot = {
  byDir?: Record<string, number>;
  generatedAt?: string;
  total?: number;
};

type TscSnapshotSummary = {
  errors: number;
  warnings: number;
  rawOutputPath: string;
};
type TscSnapshotFullSummary = TscSnapshotSummary & { repoGitSha?: string; fileCounts?: Record<string, number> };

export function buildAceContextCacheKey(contextId: string, version = 'v1'): string {
  return `ace:context:${contextId}:${version}`;
}

export function buildAceContextPack(input: Partial<AceContextPack> & Pick<AceContextPack, 'id' | 'contextId' | 'createdAt' | 'summary'>): AceContextPack {
  const pack: AceContextPack = {
    id: input.id,
    contextId: input.contextId,
    cacheKey: input.cacheKey ?? buildAceContextCacheKey(input.contextId, input.version ?? 'v1'),
    queryHash: input.queryHash,
    intent: input.intent,
    coordinates: input.coordinates,
    chunkIds: input.chunkIds ?? [],
    summaryIds: input.summaryIds ?? [],
    sourceRefs: input.sourceRefs ?? [],
    graphPaths: input.graphPaths ?? [],
    featureMapPackets: input.featureMapPackets ?? [],
    wikiCards: input.wikiCards ?? [],
    relationshipReports: input.relationshipReports ?? [],
    tscDiagnostics: input.tscDiagnostics,
    turboVecCandidates: input.turboVecCandidates ?? [],
    retrievalTrace: input.retrievalTrace ?? {},
    toolPolicy: input.toolPolicy ?? {},
    nextSteps: input.nextSteps ?? [],
    degraded: input.degraded ?? false,
    snapshotUrl: input.snapshotUrl,
    version: input.version ?? 'v1',
    createdAt: input.createdAt,
    summary: input.summary,
    metadata: input.metadata ?? {},
    pointers: input.pointers ?? {},
  };
  return pack;
}

/**
 * Placeholder: return the pointer/audit row for an ACE context pack.
 * Implementations should consult Postgres or Redis for the authoritative pointer.
 */
export async function getAceContextPackPointer(key: string): Promise<AceContextPack | null> {
  try {
    const { getRedis } = await import('../redis.js');
    const redis = getRedis();
    const raw = await redis.get(`ace:ctx:${key}`);
    if (raw) return JSON.parse(raw) as AceContextPack;
  } catch {
    // ignore
  }

  try {
    const { db } = await import('../db/client.js');
    const { llmContextCache } = await import('../db/schema-postgres.js');
    const { desc, eq } = await import('drizzle-orm');
    const [row] = await db
      .select()
      .from(llmContextCache)
      .where(eq(llmContextCache.cacheKey, key))
      .orderBy(desc(llmContextCache.lastUsedAt))
      .limit(1);

    if (row) {
      return buildAceContextPack({
        id: row.id,
        contextId: key,
        cacheKey: row.cacheKey,
        createdAt: row.createdAt.toISOString(),
        summary: row.summary,
        chunkIds: (row.chunkIds as string[]) ?? [],
        graphPaths: (row.graphPaths as string[]) ?? [],
        toolPolicy: (row.toolPolicy as Record<string, unknown>) ?? {},
        queryHash: row.cacheKey,
        intent: 'context-cache',
        degraded: false,
        metadata: { source: 'postgres' },
      });
    }
  } catch {
    // ignore
  }

  try {
    const local = await readAceContextPackSnapshot(key);
    if (local) return local;
  } catch {
    // ignore
  }

  return null;
}

/**
 * Placeholder: set the pointer/audit row for an ACE context pack.
 * This should create/update a Postgres audit row in a real implementation.
 */
export async function setAceContextPackPointer(key: string, pack: AceContextPack): Promise<void> {
  const cacheKey = key || pack.cacheKey || buildAceContextCacheKey(pack.contextId, pack.version ?? 'v1');
  const normalized = buildAceContextPack({ ...pack, cacheKey, createdAt: pack.createdAt, summary: pack.summary ?? '' });
  await Promise.allSettled([
    writeRedisPointer(cacheKey, normalized),
    persistAceContextPackAuditRow(normalized),
  ]);
}

/**
 * Write the ACE context pack snapshot to SeaweedFS/NVMe placeholder location.
 * Returns the path where the snapshot was written.
 */
export async function writeAceContextPackSnapshot(pack: AceContextPack): Promise<{ seaweedPath: string; nvmePath: string }> {
  const base = path.resolve(process.cwd(), 'tmp', 'ace-context-snapshots');
  await fs.mkdir(base, { recursive: true });

  const filename = `${pack.id}-${pack.version ?? 'v1'}.json`;
  const filePath = path.join(base, filename);
  // Before writing the pack, attach cached TypeScript diagnostics if present.
  // Fallback to empty diagnostics when the Redis cache is missing.
  try {
    const tscInfo = await readCachedTscSnapshot();
    const effectiveTsc: { seaweedPath: string; nvmePath: string; summary: TscSnapshotSummary } = tscInfo ?? {
      seaweedPath: 'redis://code:ts:diag:manifest',
      nvmePath: 'redis://code:ts:diag:manifest',
      summary: {
        errors: 0,
        warnings: 0,
        rawOutputPath: '',
      },
    };
    if (!pack.metadata) pack.metadata = {};
    pack.metadata.typescriptDiagnostics = effectiveTsc.summary;
    pack.pointers = { ...(pack.pointers ?? {}), nvmePath: effectiveTsc.nvmePath };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ace-context-pack-cache] TypeScript diagnostics attach failed', String(err));
  }

  // Attach simple timing traces for key infra calls so snapshots include observability data.
  try {
    const timings: Record<string, number> = {};
    const tStart = Date.now();
    // Redis ping
    try {
      const { getRedis } = await import('../redis.js');
      const redis = getRedis();
      const t0 = Date.now();
      await redis.ping();
      timings.redisMs = Date.now() - t0;
    } catch {
      timings.redisMs = -1;
    }

    // Qdrant probe
    try {
      const { ENV } = await import('../../server/env.server.js');
      const t0 = Date.now();
      const res = await fetch(`${ENV.QDRANT_URL}/collections`, { method: 'GET' });
      await res.text();
      timings.qdrantMs = Date.now() - t0;
    } catch {
      timings.qdrantMs = -1;
    }

    // Bifrost probe
    try {
      const { ENV } = await import('../../server/env.server.js');
      const t0 = Date.now();
      const res = await fetch(`${ENV.BIFROST_URL}/health`, { method: 'GET' });
      await res.text();
      timings.bifrostMs = Date.now() - t0;
    } catch {
      timings.bifrostMs = -1;
    }

    timings.totalMs = Date.now() - tStart;
    if (!pack.retrievalTrace) pack.retrievalTrace = {};
    // preserve any existing trace keys
    (pack.retrievalTrace as Record<string, unknown>).timings = timings;
  } catch (e) {
    // don't fail snapshot on observability probe errors
    // eslint-disable-next-line no-console
    console.warn('[ace-context-pack-cache] timing probes failed', String(e));
  }

  const contents = JSON.stringify(pack, null, 2);

  await fs.writeFile(filePath, contents, { encoding: 'utf8' });

  // Return the placeholder paths for SeaweedFS and NVMe (same file for now)
  const snapshotUrl = `file://${filePath}`;
  try {
    await writeLocalIndexPointer(pack.cacheKey ?? pack.contextId, { ...pack, snapshotUrl, pointers: { ...(pack.pointers ?? {}), seaweedPath: snapshotUrl, nvmePath: snapshotUrl } });
  } catch {
    // ignore
  }
  return { seaweedPath: `seaweed://${filePath}`, nvmePath: `nvme://${filePath}` };
}

export async function readAceContextPackSnapshot(key: string): Promise<AceContextPack | null> {
  const filePath = getAceContextPackSnapshotPath(key);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as AceContextPack;
  } catch {
    return null;
  }
}

export function getAceContextPackSnapshotPath(key: string): string {
  const base = path.resolve(process.cwd(), '.cache', 'ace', 'context-packs');
  return path.join(base, `${sanitizeCacheKey(key)}.json`);
}

async function writeLocalIndexPointer(key: string, pack: AceContextPack): Promise<void> {
  const filePath = getAceContextPackSnapshotPath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(pack, null, 2), 'utf8');
}

async function writeRedisPointer(cacheKey: string, pack: AceContextPack): Promise<void> {
  try {
    const { getRedis } = await import('../redis.js');
    const redis = getRedis();
    await redis.set(`ace:ctx:${cacheKey}`, JSON.stringify(pack));
  } catch {
    // ignore
  }
}

async function readCachedTscSnapshot(): Promise<{ seaweedPath: string; nvmePath: string; summary: { errors: number; warnings: number; rawOutputPath: string } } | null> {
  try {
    const { getRedis } = await import('../redis.js');
    const redis = getRedis();
    const raw = await redis.get('code:ts:diag:manifest');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TypeScriptDiagnosticsSnapshot;
    const errors = Number(parsed.total ?? 0);
    const warnings = 0;
    return {
      seaweedPath: 'redis://code:ts:diag:manifest',
      nvmePath: 'redis://code:ts:diag:manifest',
      summary: {
        errors,
        warnings,
        rawOutputPath: 'redis://code:ts:diag:manifest',
      },
    };
  } catch {
    return null;
  }
}

/**
 * Run a TypeScript diagnostics snapshot using `tsgo` if available, otherwise `tsc`.
 * Writes JSON summary to the same snapshot directory and returns paths and counts.
 */
export async function writeTscSnapshot(packId: string): Promise<{ seaweedPath: string; nvmePath: string; summary: TscSnapshotFullSummary }> {
  const base = path.resolve(process.cwd(), 'tmp', 'ace-context-snapshots');
  await fs.mkdir(base, { recursive: true });

  // Prefer tsgo (fast) if installed; fallback to tsc
  const candidates = [
    'npx -y tsgo --noEmit --pretty false',
    'npx -y tsc --noEmit --pretty false'
  ];

  let output = '';
  let usedCmd = '';
  for (const cmd of candidates) {
    try {
      usedCmd = cmd;
      const { stdout, stderr } = await exec(cmd, { maxBuffer: 10 * 1024 * 1024 });
      output = `${stdout ?? ''}\n${stderr ?? ''}`.trim();
      break;
    } catch (e: any) {
      // capture stdout/stderr when tsc/tsgo exits with non-zero on diagnostics
      const maybeOut = (e && (e.stdout || e.stderr)) ? `${e.stdout || ''}\n${e.stderr || ''}` : String(e);
      output = `${maybeOut}`.trim();
      // If command not found, try next candidate
      if (/not found|command not found|npm ERR!/i.test(output)) continue;
      break;
    }
  }

  // Parse output to count errors per-file and overall warnings/errors
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fileCounts: Record<string, number> = {};
  let errors = 0;
  let warnings = 0;
  const fileRegex = /^(.+?\.(?:ts|tsx|js|jsx))(?:\(\d+,\d+\))?:\s*(error|warning)\s+TS\d+\s*:/i;
  for (const line of lines) {
    const m = fileRegex.exec(line);
    if (m) {
      const file = m[1];
      const kind = (m[2] || '').toLowerCase();
      if (!fileCounts[file]) fileCounts[file] = 0;
      fileCounts[file]++;
      if (kind === 'error') errors++;
      if (kind === 'warning') warnings++;
      continue;
    }
    // fallback: detect generic 'error TS' or 'warning'
    if (/error TS\d+/i.test(line)) errors++;
    if (/warning/i.test(line)) warnings++;
  }

  // Get current repo git sha (short) if available
  let repoSha: string | undefined = undefined;
  try {
    const { stdout: shaOut } = await exec('git rev-parse --short HEAD', { maxBuffer: 1024 * 1024 });
    repoSha = (shaOut || '').trim();
  } catch {
    // ignore
  }

  const outFile = path.join(base, `${packId}-tsc.json`);
  const summary: TscSnapshotFullSummary = { errors, warnings, rawOutputPath: outFile, repoGitSha: repoSha, fileCounts };
  const payload = {
    packId,
    command: usedCmd,
    repoGitSha: repoSha,
    timestamp: new Date().toISOString(),
    summary,
    raw: output,
  };
  await fs.writeFile(outFile, JSON.stringify(payload, null, 2), 'utf8');

  return { seaweedPath: `seaweed://${outFile}`, nvmePath: `nvme://${outFile}`, summary };
}

function sanitizeCacheKey(key: string): string {
  return key.replace(/[:<>"/\\|?*]+/g, '_');
}

/**
 * Placeholder Postgres audit function.
 * Real implementation should insert/update an audit row in Postgres and return the row id.
 */
export async function auditAceContextPackToPostgres(pack: AceContextPack): Promise<string | null> {
  return persistAceContextPackAuditRow(pack);
}

export async function persistAceContextPackAuditRow(pack: AceContextPack): Promise<string | null> {
  try {
    const { db } = await import('../db/client.js');
    const { llmContextCache } = await import('../db/schema-postgres.js');
    const cacheKey = pack.cacheKey ?? buildAceContextCacheKey(pack.contextId, pack.version ?? 'v1');
    const tscDiagnostics = pack.tscDiagnostics ?? { errors: 0, warnings: 0, rawOutputPath: '' };
    const persisted = buildAceContextPack({
      ...pack,
      cacheKey,
      summary: pack.summary ?? '',
      createdAt: pack.createdAt,
      metadata: {
        ...(pack.metadata ?? {}),
        tscDiagnostics,
      },
    });

    await db
      .insert(llmContextCache)
      .values({
        cacheKey,
        modelName: 'embeddinggemma:latest',
        modelQuant: 'n/a',
        backend: 'ace-context-pack',
        tokenizerHash: 'n/a',
        systemPromptHash: 'n/a',
        toolDefinitionsHash: 'n/a',
        repoGitSha: persisted.metadata?.repoGitSha as string | undefined,
        corpusHash: persisted.metadata?.corpusHash as string | undefined,
        ragBundleHash: persisted.metadata?.ragBundleHash as string | undefined,
        graphSnapshotHash: persisted.metadata?.graphSnapshotHash as string | undefined,
        contextPackJson: persisted as unknown as Record<string, unknown>,
        summary: persisted.summary ?? '',
        chunkIds: persisted.chunkIds ?? [],
        graphPaths: persisted.graphPaths ?? [],
        toolPolicy: persisted.toolPolicy ?? {},
        estimatedPrefixTokens: 0,
        hitCount: 0,
        lastUsedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: llmContextCache.cacheKey,
        set: {
          contextPackJson: persisted as unknown as Record<string, unknown>,
          summary: persisted.summary ?? '',
          chunkIds: persisted.chunkIds ?? [],
          graphPaths: persisted.graphPaths ?? [],
          toolPolicy: persisted.toolPolicy ?? {},
          lastUsedAt: new Date(),
        },
      });

    return cacheKey;
  } catch {
    return null;
  }
}

export default {
  AceContextPack: null as unknown,
  buildAceContextCacheKey,
  getAceContextPackPointer,
  setAceContextPackPointer,
  writeAceContextPackSnapshot,
  auditAceContextPackToPostgres,
};
