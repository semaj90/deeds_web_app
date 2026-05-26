#!/usr/bin/env node
/**
 * build-authority-snapshot.mjs
 *
 * Consolidates the authority lanes used by Karpathy / ACE / Redis / BitFrost / KAG
 * into one durable snapshot:
 *   - Redis couchdb:pagerank_scores (+ meta)
 *   - Redis ace:authority:top
 *   - Redis gpu:karpathy:scores
 *   - docs/graph/codebase-pagerank-top100.json fallback
 *
 * Writes:
 *   - logs/authority/latest.json
 *   - logs/authority/latest.md
 *
 * The goal is to give multi-hop analysis one stable authority artifact instead of
 * requiring each consumer to stitch together Redis hashes independently.
 */

import 'dotenv/config';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.join(ROOT, 'logs', 'authority');
const OUT_JSON = path.join(LOG_DIR, 'latest.json');
const OUT_MD = path.join(LOG_DIR, 'latest.md');
const LIMIT = 200;
const DRY_RUN = process.argv.includes('--dry-run');

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PASS = process.env.REDIS_PASSWORD ?? undefined;
const PAGERANK_KEY = 'couchdb:pagerank_scores';
const PAGERANK_META_KEY = 'couchdb:pagerank_scores:meta';
const AUTHORITY_KEY = 'ace:authority:top';
const KARPATHY_KEY = 'gpu:karpathy:scores';
const FALLBACK_PATH = path.join(ROOT, 'docs', 'graph', 'codebase-pagerank-top100.json');

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePath(raw) {
  if (!raw) return null;
  let p = String(raw).trim().replace(/\\/g, '/');
  if (!p) return null;
  const repoPrefix = 'sveltekit-frontend/';
  if (p.startsWith(repoPrefix)) p = p.slice(repoPrefix.length);
  if (p.startsWith('src/')) return p;
  if (p.startsWith('./')) return p.slice(2);
  return p.replace(/^\/+/u, '');
}

function safeJsonParse(raw, fallback = null) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function mergeEntry(target, patch) {
  const sourceSet = new Set([...(target.sources ?? []), ...(patch.sources ?? [])].filter(Boolean));
  const sourceRefs = new Set([...(target.sourceRefs ?? []), ...(patch.sourceRefs ?? [])].filter(Boolean));
  return {
    ...target,
    ...patch,
    sources: [...sourceSet],
    sourceRefs: [...sourceRefs],
    pagerank: Math.max(toNumber(target.pagerank), toNumber(patch.pagerank)),
    graphAuthority: Math.max(toNumber(target.graphAuthority), toNumber(patch.graphAuthority)),
    karpathyBlend: Math.max(toNumber(target.karpathyBlend), toNumber(patch.karpathyBlend)),
    aceAuthority: Math.max(toNumber(target.aceAuthority), toNumber(patch.aceAuthority)),
    topology: Math.max(toNumber(target.topology), toNumber(patch.topology)),
    redisHot: Math.max(toNumber(target.redisHot), toNumber(patch.redisHot)),
  };
}

function combinedScore(entry) {
  const pagerank = toNumber(entry.pagerank);
  const karpathyBlend = toNumber(entry.karpathyBlend);
  const graphAuthority = toNumber(entry.graphAuthority);
  const aceAuthority = toNumber(entry.aceAuthority);
  const topology = toNumber(entry.topology);
  const redisHot = toNumber(entry.redisHot);
  return (
    0.34 * pagerank +
    0.28 * karpathyBlend +
    0.18 * graphAuthority +
    0.10 * aceAuthority +
    0.05 * topology +
    0.05 * redisHot
  );
}

async function loadRedisHash(redis, key) {
  try {
    const out = await redis.hgetall(key);
    return out && Object.keys(out).length ? out : {};
  } catch {
    return {};
  }
}

async function loadAuthorityEntries(redis) {
  const [pRaw, pMetaRaw, aceRaw, karRaw] = await Promise.all([
    redis.get(PAGERANK_KEY).catch(() => null),
    redis.get(PAGERANK_META_KEY).catch(() => null),
    loadRedisHash(redis, AUTHORITY_KEY),
    loadRedisHash(redis, KARPATHY_KEY),
  ]);

  const pagerankScores = safeJsonParse(pRaw, {}) ?? {};
  const pagerankMeta = safeJsonParse(pMetaRaw, null);

  const merged = new Map();

  for (const [filePath, score] of Object.entries(pagerankScores)) {
    const key = normalizePath(filePath);
    if (!key) continue;
    merged.set(key, {
      filePath: key,
      sourceRefs: [key],
      sources: ['couchdb:pagerank_scores'],
      pagerank: toNumber(score),
      graphAuthority: 0,
      karpathyBlend: 0,
      aceAuthority: 0,
      topology: 0,
      redisHot: 0,
    });
  }

  for (const [filePath, raw] of Object.entries(aceRaw)) {
    const key = normalizePath(filePath);
    if (!key) continue;
    const parsed = safeJsonParse(raw, {}) ?? {};
    const patch = {
      filePath: key,
      sourceRefs: [key],
      sources: ['ace:authority:top'],
      graphAuthority: toNumber(parsed.graphAuthorityScore ?? parsed.graph_authority_score),
      pagerank: toNumber(parsed.pagerank),
      topology: toNumber(parsed.topoClass ?? parsed.topology_score),
      aceAuthority: toNumber(parsed.graphAuthorityScore ?? parsed.graph_authority_score),
    };
    merged.set(key, merged.has(key) ? mergeEntry(merged.get(key), patch) : patch);
  }

  for (const [filePath, raw] of Object.entries(karRaw)) {
    const key = normalizePath(filePath);
    if (!key) continue;
    const parsed = safeJsonParse(raw, {}) ?? {};
    const patch = {
      filePath: key,
      sourceRefs: [key],
      sources: ['gpu:karpathy:scores'],
      pagerank: toNumber(parsed.pr ?? parsed.pagerank),
      karpathyBlend: toNumber(parsed.blend ?? parsed.authority ?? parsed.pr),
      redisHot: toNumber(parsed.hot_score ?? parsed.hotScore),
      topology: toNumber(parsed.topology ?? parsed.topology_score),
    };
    merged.set(key, merged.has(key) ? mergeEntry(merged.get(key), patch) : patch);
  }

  if (merged.size === 0 && existsSync(FALLBACK_PATH)) {
    const fallback = safeJsonParse(await readFile(FALLBACK_PATH, 'utf8'), null);
    const rows = Array.isArray(fallback?.rows) ? fallback.rows : [];
    for (const row of rows) {
      const key = normalizePath(row.rel ?? row.path ?? row.filePath);
      if (!key) continue;
      merged.set(key, {
        filePath: key,
        sourceRefs: [key],
        sources: ['docs/graph/codebase-pagerank-top100.json'],
        pagerank: toNumber(row.score),
        graphAuthority: 0,
        karpathyBlend: 0,
        aceAuthority: 0,
        topology: 0,
        redisHot: 0,
      });
    }
  }

  const rows = [...merged.values()]
    .map((entry) => ({
      ...entry,
      combinedScore: Number(combinedScore(entry).toFixed(6)),
    }))
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, LIMIT)
    .map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));

  return {
    generatedAt: new Date().toISOString(),
    limit: LIMIT,
    sources: {
      couchdbPagerank: Object.keys(pagerankScores).length,
      aceAuthorityTop: Object.keys(aceRaw).length,
      karpathyScores: Object.keys(karRaw).length,
      fallbackUsed: Object.keys(pagerankScores).length === 0 && Object.keys(aceRaw).length === 0 && Object.keys(karRaw).length === 0 && existsSync(FALLBACK_PATH),
    },
    pagerankMeta,
    rows,
  };
}

async function main() {
  const redis = new Redis(REDIS_URL, {
    password: REDIS_PASS,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});

  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    console.error('[authority:snapshot] Redis unavailable:', err?.message ?? err);
    process.exit(1);
  }

  const snapshot = await loadAuthorityEntries(redis);
  await redis.quit().catch(() => {});

  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(OUT_JSON, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await writeFile(
    OUT_MD,
    [
      '# Authority Snapshot',
      '',
      `- generatedAt: ${snapshot.generatedAt}`,
      `- limit: ${snapshot.limit}`,
      `- couchdb:pagerank_scores: ${snapshot.sources.couchdbPagerank}`,
      `- ace:authority:top: ${snapshot.sources.aceAuthorityTop}`,
      `- gpu:karpathy:scores: ${snapshot.sources.karpathyScores}`,
      `- fallbackUsed: ${snapshot.sources.fallbackUsed ? 'yes' : 'no'}`,
      '',
      '## Top Entries',
      '',
      ...snapshot.rows.slice(0, 50).map((row) => {
        const label = row.filePath ?? '(unknown)';
        return `- #${row.rank} ${label} | combined=${row.combinedScore.toFixed(4)} | pr=${toNumber(row.pagerank).toFixed(4)} | karpathy=${toNumber(row.karpathyBlend).toFixed(4)} | ace=${toNumber(row.aceAuthority).toFixed(4)}`;
      }),
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`✅ wrote ${OUT_JSON}`);
  console.log(`✅ wrote ${OUT_MD}`);
  console.log(`   rows=${snapshot.rows.length} sourceCounts=${JSON.stringify(snapshot.sources)}`);

  if (DRY_RUN) {
    console.log('[authority:snapshot] dry-run flag was present, but the snapshot still materializes for inspection.');
  }
}

main().catch((err) => {
  console.error('[authority:snapshot] Fatal:', err?.message ?? err);
  process.exit(1);
});
