import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { generateText, tool } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import IORedis from 'ioredis';
import { z } from 'zod';

const REPO_ROOT = process.cwd();
const STATUS_FILE = path.join(REPO_ROOT, 'IMPLEMENTATION_STATUS.md');
const PARENT_ATLAS_INDEX = path.join(REPO_ROOT, 'memory', 'exports', 'parent-atlas', 'parent_atlas_index.json');
const ENGRAM_CACHE_DIR = path.join(REPO_ROOT, '.tmp', 'engram-cache');
const PACKET_CACHE_PREFIX = 'engram:packet';
const PACKET_TTL_SECONDS = 300;
const PACKET_SCHEMA = 'nes.packet.v1';

const STATUS_SCAN_COMMAND = 'cat IMPLEMENTATION_STATUS.md | grep -A3 "Phase 101|✅.*101|Phase 102" | head -40';

export const nesPacketV1Schema = z.object({
  schemaVersion: z.literal(PACKET_SCHEMA),
  packetId: z.string().min(8),
  createdAt: z.string().min(1),
  phase: z.literal(101),
  phaseLabel: z.string().min(1),
  query: z.string().min(1),
  queryHash: z.string().min(8),
  titleId: z.string().min(1),
  featureId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)).min(1),
  cacheKey: z.string().min(1),
  cacheBackend: z.enum(['redis', 'file', 'none']),
  status: z.enum(['dry-run', 'ready', 'blocked']),
  summary: z.string().min(1),
  contextPack: z.string().min(1),
  phaseStatus: z.object({
    scannerCommand: z.string().min(1),
    matchedCount: z.number().int().nonnegative(),
    lines: z.array(z.string()),
  }),
  parentAtlas: z.object({
    totalEntries: z.number().int().nonnegative(),
    uniqueSources: z.number().int().nonnegative(),
    uniqueKinds: z.number().int().nonnegative(),
  }),
  missingEnvVars: z.array(z.string()),
  recommendedAction: z.object({
    kind: z.enum(['read_only', 'dry_run']),
    label: z.string().min(1),
    reason: z.string().min(1),
    target: z.string().optional(),
  }),
  toolsUsed: z.array(z.string()),
  nextSteps: z.array(z.object({
    kind: z.enum(['read_only', 'dry_run']),
    label: z.string().min(1),
    target: z.string().optional(),
  })),
  model: z.object({
    provider: z.string().min(1),
    baseURL: z.string().min(1),
    model: z.string().min(1),
    usedModel: z.boolean(),
  }),
}).strict();

function sha256Hex(input) {
  return createHash('sha256').update(String(input)).digest('hex');
}

function shortHash(input, len = 16) {
  return sha256Hex(input).slice(0, len);
}

function sanitizeFileKey(input) {
  return String(input).replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function packetCacheKey(queryHash) {
  return `${PACKET_CACHE_PREFIX}:${queryHash}`;
}

function tupleCacheKey(cacheKey) {
  return `${cacheKey}:tuple`;
}

function readJsonIfExists(filePath) {
  try {
    if (!fsSync.existsSync(filePath)) return null;
    return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readTextIfExists(filePath) {
  try {
    if (!fsSync.existsSync(filePath)) return '';
    return fsSync.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function countUnique(items, key) {
  return new Set((items ?? []).map((item) => item?.[key]).filter(Boolean)).size;
}

function buildParentAtlasSummary() {
  const parentAtlas = readJsonIfExists(PARENT_ATLAS_INDEX);
  const entries = Array.isArray(parentAtlas?.entries) ? parentAtlas.entries : [];
  return {
    totalEntries: entries.length,
    uniqueSources: countUnique(entries, 'sourceRef'),
    uniqueKinds: countUnique(entries, 'kind'),
  };
}

function compactLines(text, limit = 40) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, limit);
}

function extractMatchedLines() {
  const script = [
    `$file = '${STATUS_FILE.replace(/'/g, "''")}'`,
    '$lines = Get-Content -Path $file',
    "$matches = $lines | Select-String -Pattern 'Phase 101|✅.*101|Phase 102' -Context 3,3",
    '$matches | Select-Object -First 40 | ForEach-Object { $_.ToString() }',
  ].join('; ');

  const run = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
  });

  if (run.status === 0) {
    const lines = compactLines(run.stdout, 40);
    return {
      scannerCommand: STATUS_SCAN_COMMAND,
      rawOutput: run.stdout ?? '',
      lines,
      matchedCount: lines.length,
      exitCode: 0,
      stderr: run.stderr ?? '',
    };
  }

  const fallback = compactLines(readTextIfExists(STATUS_FILE))
    .filter((line) => /Phase 101|✅.*101|Phase 102/i.test(line))
    .slice(0, 40);

  return {
    scannerCommand: STATUS_SCAN_COMMAND,
    rawOutput: fallback.join('\n'),
    lines: fallback,
    matchedCount: fallback.length,
    exitCode: run.status ?? 1,
    stderr: run.stderr ?? '',
  };
}

function buildMissingEnvVars() {
  const required = ['LOCAL_OPENAI_BASE_URL', 'LOCAL_OPENAI_API_KEY', 'LOCAL_GEMMA_MODEL'];
  return required.filter((name) => !String(process.env[name] ?? '').trim());
}

function normalizeOpenAIBaseURL(baseURL) {
  const trimmed = String(baseURL ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return 'http://127.0.0.1:8090/v1';
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function resolveProviderConfig() {
  const baseURL =
    String(process.env.LOCAL_OPENAI_BASE_URL ?? '').trim() ||
    String(process.env.BIFROST_OPENAI_BASE_URL ?? '').trim() ||
    String(process.env.TURBOQUANT_BASE_URL ?? '').trim() ||
    String(process.env.OLLAMA_BASE_URL ?? '').trim() ||
    String(process.env.OPENAI_BASE_URL ?? '').trim() ||
    'http://127.0.0.1:8090/v1';
  const apiKey = String(process.env.LOCAL_OPENAI_API_KEY ?? '').trim() || 'local';
  const model =
    String(process.env.LOCAL_GEMMA_MODEL ?? '').trim() ||
    String(process.env.GEMMA4_MODEL ?? '').trim() ||
    String(process.env.ROTORQUANT_CHAT_MODEL ?? '').trim() ||
    String(process.env.MODEL ?? '').trim() ||
    'gemma4-rotorquant:latest';

  return {
    providerName: 'phase101-local-openai',
    baseURL: normalizeOpenAIBaseURL(baseURL),
    apiKey,
    model,
    missingEnvVars: buildMissingEnvVars(),
  };
}

function createProvider() {
  const cfg = resolveProviderConfig();
  return {
    cfg,
    provider: createOpenAICompatible({
      name: cfg.providerName,
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      headers: {
        'x-phase101': 'parent-atlas-packetizer',
      },
    }),
  };
}

async function ensureCacheDir() {
  await fs.mkdir(ENGRAM_CACHE_DIR, { recursive: true });
}

async function getCacheAdapter() {
  let redis = null;
  try {
    const redisUrl = String(process.env.REDIS_URL ?? '').trim() || 'redis://127.0.0.1:6379';
    const redisPassword = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || undefined;
    redis = new IORedis({
      host: new URL(redisUrl).hostname || '127.0.0.1',
      port: Number(new URL(redisUrl).port) || 6379,
      password: redisPassword,
      lazyConnect: false,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    const ping = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('redis ping timeout')), 2000)),
    ]);
    if (String(ping).toUpperCase() !== 'PONG') throw new Error(`redis ping=${String(ping)}`);
    return {
      kind: 'redis',
      redis,
      async get(key) {
        return await redis.get(key);
      },
      async set(key, value, ttlSeconds = PACKET_TTL_SECONDS) {
        await redis.set(key, value, 'EX', ttlSeconds);
      },
      async close() {
        try {
          redis.disconnect();
        } catch {
          // ignore
        }
      },
    };
  } catch {
    try {
      redis?.disconnect();
    } catch {
      // ignore
    }
    await ensureCacheDir();
    return {
      kind: 'file',
      async get(key) {
        const file = path.join(ENGRAM_CACHE_DIR, `${sanitizeFileKey(key)}.json`);
        if (!fsSync.existsSync(file)) return null;
        return fs.readFile(file, 'utf8');
      },
      async set(key, value) {
        const file = path.join(ENGRAM_CACHE_DIR, `${sanitizeFileKey(key)}.json`);
        await fs.writeFile(file, value, 'utf8');
      },
      async close() {
        // no-op for file stub
      },
    };
  }
}

function buildContextPack({ phaseStatus, parentAtlas, query }) {
  const lines = [
    `Phase 101 parent-atlas packetizer for: ${query}`,
    `Scanner matches: ${phaseStatus.matchedCount}`,
    ...phaseStatus.lines.slice(0, 12).map((line) => `- ${line}`),
    `Parent atlas entries: ${parentAtlas.totalEntries}`,
    `Unique parent sources: ${parentAtlas.uniqueSources}`,
    `Unique parent kinds: ${parentAtlas.uniqueKinds}`,
    'Allowed outputs are read-only or dry-run only.',
  ];
  return lines.join('\n');
}

function buildFallbackRecommendation(phaseStatus) {
  const hasPhase101 = phaseStatus.lines.some((line) => /Phase 101/i.test(line));
  return {
    kind: 'read_only',
    label: hasPhase101 ? 'Inspect Phase 101 open items' : 'Review Phase 102 handoff',
    reason: 'Keep the lane read-only until the packetizer has a validated JSON packet and a stable cache key.',
    target: hasPhase101 ? 'IMPLEMENTATION_STATUS.md' : 'MASTER-FEATURE-TODO-2026-05-20.md',
  };
}

function buildPacketSkeleton({
  query,
  phaseStatus,
  parentAtlas,
  cacheKey,
  missingEnvVars,
  model,
  contextPack,
  recommendedAction,
  usedModel,
  status = 'dry-run',
  cacheBackend = 'none',
}) {
  const queryHash = shortHash(query, 16);
  const sourceRef = 'IMPLEMENTATION_STATUS.md#phase-101';
  const titleId = 'phase101-parent-atlas';
  const featureId = 'feature:phase101:parent-atlas-packetizer';
  const packetId = `nes:${shortHash(`${titleId}:${queryHash}:${sourceRef}`, 16)}`;

  return {
    schemaVersion: PACKET_SCHEMA,
    packetId,
    createdAt: new Date().toISOString(),
    phase: 101,
    phaseLabel: 'Parent Atlas → Gemma function-calling → Engram NES packet cache',
    query,
    queryHash,
    titleId,
    featureId,
    sourceRef,
    sourceRefs: [sourceRef, 'docs/atlas/parent-atlas-table-of-contents.md'],
    cacheKey,
    cacheBackend,
    status,
    summary: contextPack,
    contextPack,
    phaseStatus,
    parentAtlas,
    missingEnvVars,
    recommendedAction,
    toolsUsed: [
      'readPhaseStatus',
      'emitNesPacket',
      'storeEngramPacket',
      'retrieveContextPack',
      'recommendNextOpenCodeTask',
    ],
    nextSteps: [
      {
        kind: 'read_only',
        label: 'Inspect Phase 101 status lane',
        target: 'IMPLEMENTATION_STATUS.md',
      },
      {
        kind: 'read_only',
        label: 'Inspect parent atlas TOC',
        target: 'docs/atlas/parent-atlas-table-of-contents.md',
      },
      {
        kind: 'dry_run',
        label: 'Re-run packetizer dry-run after env hydration',
        target: 'scripts/atlas/phase101-parent-atlas-packetize.mjs',
      },
    ],
    model: {
      provider: model.providerName,
      baseURL: model.baseURL,
      model: model.model,
      usedModel,
    },
  };
}

export async function readPhaseStatus() {
  const scan = extractMatchedLines();
  return {
    scannerCommand: scan.scannerCommand,
    matchedCount: scan.matchedCount,
    lines: scan.lines,
    rawOutput: scan.rawOutput,
    exitCode: scan.exitCode,
  };
}

export async function retrieveContextPack({
  query,
  dryRun = true,
} = {}) {
  const effectiveQuery = String(query ?? 'Phase 101 parent atlas packetization').trim();
  const queryHash = shortHash(effectiveQuery, 16);
  const cacheKey = packetCacheKey(queryHash);
  const adapter = await getCacheAdapter();
  let source = 'generated';
  let packet = null;

  try {
    const raw = await adapter.get(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        packet = parsed;
        source = adapter.kind;
      }
    }
  } catch {
    // ignore and fall through to generated context
  } finally {
    await adapter.close?.();
  }

  if (!packet) {
    const phaseStatus = await readPhaseStatus();
    const parentAtlas = buildParentAtlasSummary();
    const recommendedAction = buildFallbackRecommendation(phaseStatus);
    const fallback = buildPacketSkeleton({
      query: effectiveQuery,
      phaseStatus,
      parentAtlas,
      cacheKey,
      missingEnvVars: buildMissingEnvVars(),
      model: resolveProviderConfig(),
      contextPack: buildContextPack({ phaseStatus, parentAtlas, query: effectiveQuery }),
      recommendedAction,
      usedModel: false,
      status: dryRun ? 'dry-run' : 'ready',
      cacheBackend: adapter.kind,
    });
    packet = fallback;
    source = 'generated';
  }

  return {
    cacheKey,
    source,
    packet,
  };
}

export function emitNesPacket(input) {
  const payload = {
    ...input,
    schemaVersion: input.schemaVersion ?? PACKET_SCHEMA,
  };
  return nesPacketV1Schema.parse(payload);
}

export async function storeEngramPacket(packet, { dryRun = true } = {}) {
  const validated = nesPacketV1Schema.parse(packet);
  const adapter = await getCacheAdapter();
  const cacheKey = validated.cacheKey;
  const tuple = [
    1,
    cacheKey,
    validated.query,
    validated.queryHash,
    validated.featureId,
    validated.sourceRef,
    validated.sourceRefs,
    validated.packetId,
  ];

  if (dryRun) {
    await adapter.close?.();
    return {
      ok: true,
      dryRun: true,
      cacheBackend: adapter.kind,
      cacheKey,
      tupleKey: tupleCacheKey(cacheKey),
      packet,
    };
  }

  const serializedPacket = JSON.stringify(validated, null, 2);
  await adapter.set(cacheKey, serializedPacket, PACKET_TTL_SECONDS);
  await adapter.set(tupleCacheKey(cacheKey), JSON.stringify(tuple), PACKET_TTL_SECONDS);
  await adapter.close?.();

  return {
    ok: true,
    dryRun: false,
    cacheBackend: adapter.kind,
    cacheKey,
    tupleKey: tupleCacheKey(cacheKey),
    packet: validated,
  };
}

export function recommendNextOpenCodeTask({ phaseStatus }) {
  return buildFallbackRecommendation(phaseStatus ?? { lines: [], matchedCount: 0 });
}

export function buildPhase101ToolMap({ dryRun = true } = {}) {
  return {
    readPhaseStatus: tool({
      description: 'Read the Phase 101 / Phase 102 status block from IMPLEMENTATION_STATUS.md.',
      parameters: z.object({}).strict(),
      execute: async () => readPhaseStatus(),
    }),
    emitNesPacket: tool({
      description: 'Validate and emit an nes.packet.v1 JSON packet.',
      parameters: z.object({
        query: z.string().min(1),
        titleId: z.string().min(1),
        featureId: z.string().min(1),
        sourceRef: z.string().min(1),
        sourceRefs: z.array(z.string().min(1)).default([]),
        summary: z.string().min(1),
        contextPack: z.string().min(1),
      }).strict(),
      execute: async (args) => {
        const queryHash = shortHash(args.query, 16);
        const cacheKey = packetCacheKey(queryHash);
        const packet = emitNesPacket({
          schemaVersion: PACKET_SCHEMA,
          packetId: `nes:${shortHash(`${args.titleId}:${queryHash}:${args.sourceRef}`, 16)}`,
          createdAt: new Date().toISOString(),
          phase: 101,
          phaseLabel: 'Parent Atlas → Gemma function-calling → Engram NES packet cache',
          query: args.query,
          queryHash,
          titleId: args.titleId,
          featureId: args.featureId,
          sourceRef: args.sourceRef,
          sourceRefs: args.sourceRefs.length ? args.sourceRefs : [args.sourceRef],
          cacheKey,
          cacheBackend: dryRun ? 'none' : 'redis',
          status: dryRun ? 'dry-run' : 'ready',
          summary: args.summary,
          contextPack: args.contextPack,
          phaseStatus: {
            scannerCommand: STATUS_SCAN_COMMAND,
            matchedCount: 0,
            lines: [],
          },
          parentAtlas: buildParentAtlasSummary(),
          missingEnvVars: buildMissingEnvVars(),
          recommendedAction: buildFallbackRecommendation({ lines: [], matchedCount: 0 }),
          toolsUsed: ['readPhaseStatus', 'emitNesPacket', 'storeEngramPacket', 'retrieveContextPack', 'recommendNextOpenCodeTask'],
          nextSteps: [],
          model: {
            provider: resolveProviderConfig().providerName,
            baseURL: resolveProviderConfig().baseURL,
            model: resolveProviderConfig().model,
            usedModel: false,
          },
        });
        return packet;
      },
    }),
    storeEngramPacket: tool({
      description: 'Store a validated NES packet in Redis or the file-backed dev stub.',
      parameters: z.object({
        packet: nesPacketV1Schema,
      }).strict(),
      execute: async ({ packet }) => storeEngramPacket(packet, { dryRun }),
    }),
    retrieveContextPack: tool({
      description: 'Retrieve or synthesize the compact context pack for a query.',
      parameters: z.object({
        query: z.string().min(1),
      }).strict(),
      execute: async ({ query }) => retrieveContextPack({ query, dryRun }),
    }),
    recommendNextOpenCodeTask: tool({
      description: 'Recommend the next read-only or dry-run OpenCode task for Phase 101.',
      parameters: z.object({
        phaseStatus: z.object({
          lines: z.array(z.string()),
          matchedCount: z.number().int().nonnegative(),
        }),
      }).strict(),
      execute: async ({ phaseStatus }) => recommendNextOpenCodeTask({ phaseStatus }),
    }),
  };
}

async function attemptModelPacketize({ query, dryRun }) {
  const cfg = resolveProviderConfig();
  const { provider } = createProvider();
  const phaseStatus = await readPhaseStatus();
  const parentAtlas = buildParentAtlasSummary();
  const contextPack = buildContextPack({ phaseStatus, parentAtlas, query });
  const tools = buildPhase101ToolMap({ dryRun });

  const result = await generateText({
    model: provider(cfg.model),
    prompt: [
      'You are a strict packet compiler for Phase 101.',
      'Call readPhaseStatus, retrieveContextPack, recommendNextOpenCodeTask, and emitNesPacket if needed.',
      'Return only valid JSON that matches the nes.packet.v1 schema.',
      'Do not write prose, markdown, or code fences.',
      '',
      `Query: ${query}`,
      `Context pack:\n${contextPack}`,
      `Missing local env vars: ${buildMissingEnvVars().join(', ') || 'none'}`,
    ].join('\n'),
    tools,
    maxSteps: 4,
    temperature: 0,
  });

  const text = String(result.text ?? '').trim();
  if (!text) {
    throw new Error('Model returned empty text');
  }
  if (text.startsWith('```')) {
    throw new Error('Model returned fenced prose instead of raw JSON');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Model returned non-JSON output: ${(err && err.message) || String(err)}`);
  }

  const validated = nesPacketV1Schema.parse(parsed);
  return {
    packet: validated,
    phaseStatus,
    parentAtlas,
    contextPack,
    modelUsed: true,
  };
}

function buildDeterministicPacket({ query, dryRun }) {
  const phaseStatus = extractMatchedLines();
  const parentAtlas = buildParentAtlasSummary();
  const contextPack = buildContextPack({ phaseStatus, parentAtlas, query });
  const recommendedAction = buildFallbackRecommendation(phaseStatus);
  const cfg = resolveProviderConfig();
  const queryHash = shortHash(query, 16);
  const cacheKey = packetCacheKey(queryHash);

  return {
    packet: emitNesPacket(buildPacketSkeleton({
      query,
      phaseStatus,
      parentAtlas,
      cacheKey,
      missingEnvVars: buildMissingEnvVars(),
      model: cfg,
      contextPack,
      recommendedAction,
      usedModel: false,
      status: dryRun ? 'dry-run' : 'ready',
      cacheBackend: 'none',
    })),
    phaseStatus,
    parentAtlas,
    contextPack,
    modelUsed: false,
  };
}

export async function packetizePhase101({ dryRun = true, query = 'Phase 101 Parent Atlas packetization' } = {}) {
  const providerCfg = resolveProviderConfig();
  const missingEnvVars = dryRun ? [] : buildMissingEnvVars();
  let payload;
  let usedModel = false;

  try {
    payload = await attemptModelPacketize({ query, dryRun });
    usedModel = true;
  } catch (err) {
    // Fail closed on narrative/prose output; fall back when the provider is unavailable
    // or returns no usable text.
    const message = String((err && err.message) || err);
    const isNarrativeFailure = /non-JSON|fenced prose/.test(message);
    if (isNarrativeFailure) {
      throw err;
    }
    payload = buildDeterministicPacket({ query, dryRun });
  }

  const packet = nesPacketV1Schema.parse(payload.packet);
  const cacheKey = packet.cacheKey;
  const tupleKey = tupleCacheKey(cacheKey);

  if (!dryRun) {
    await storeEngramPacket(packet, { dryRun: false });
  }

  return {
    packet,
    cacheKey,
    tupleKey,
    missingEnvVars,
    provider: providerCfg,
    usedModel,
  };
}
