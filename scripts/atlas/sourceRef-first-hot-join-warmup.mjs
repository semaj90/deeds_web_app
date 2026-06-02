#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const ENV_PATH = path.join(FRONTEND_ROOT, '.env');
const INPUT_JSON_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-nes-glyph-compress.json');
const REPORT_JSON_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-hot-join-warmup.json');
const REPORT_MD_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-hot-join-warmup.md');
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

dotenv.config({ path: ENV_PATH });

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const splitAt = trimmed.indexOf('=');
    if (splitAt === -1) continue;
    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toNonEmptyString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function buildMarkdown(report) {
  const lines = [
    '# SourceRef-First Hot Join Warmup',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    '',
    '## Inputs',
    '',
    `- compressed report: ${report.inputs.compressedReport}`,
    `- limit: ${report.inputs.limit}`,
    '',
    '## Output',
    '',
    `- items: ${report.summary.items}`,
    `- Redis warmups: ${report.summary.redisWarmups}`,
    `- Bifrost warmups: ${report.summary.bifrostWarmups}`,
    `- Neo4j applied: ${report.neo4j.applied ? 'yes' : 'no'}`,
    `- Neo4j communities: ${report.neo4j.communities}`,
    `- Neo4j total clusters: ${report.neo4j.totalClusters}`,
    `- Neo4j total members: ${report.neo4j.totalMembers}`,
    `- errors: ${report.summary.errors}`,
    '',
    '## Top sourceRefs',
    '',
    ...(report.top.sourceRefs.length > 0 ? report.top.sourceRefs.map((row) => `- ${row.value}: ${row.count}`) : ['- none']),
    '',
    '## Top featureIds',
    '',
    ...(report.top.featureIds.length > 0 ? report.top.featureIds.map((row) => `- ${row.value}: ${row.count}`) : ['- none']),
    '',
    '## Notes',
    '',
    '- The compressed packet report is the canonical source for hot joins.',
    '- Redis/Bitfrost warmup reuses the compressed packet summary and the same sourceRef + featureId + queryHash spine as the NES/Glyph packets.',
    '- Neo4j expansion is optional and can be skipped when the report should remain read-only.',
  ];
  return `${lines.join('\n')}\n`;
}

function buildPrompt(item) {
  const sourceRefs = Array.isArray(item.sourceRefs) ? item.sourceRefs.slice(0, 6) : [];
  return [
    'Summarize this compressed NES/Glyph packet as a hot join seed.',
    `kind: ${item.kind}`,
    `featureId: ${item.featureId}`,
    `sourceRef: ${item.sourceRef}`,
    `queryHash: ${item.queryHash}`,
    `chunkId: ${item.chunkId}`,
    `summary: ${item.summary}`,
    `sourceRefs: ${sourceRefs.join(', ') || 'none'}`,
    `summaryKey: ${item.summaryKey}`,
  ].join('\n');
}

function loadPacketItems(report, limit) {
  const outputs = Array.isArray(report?.outputs) ? report.outputs : [];
  return outputs.slice(0, limit).map((item) => ({
    kind: item.kind ?? 'nes_packet',
    featureId: toNonEmptyString(item.featureId) ?? 'unknown',
    sourceRef: toNonEmptyString(item.sourceRef) ?? 'unknown',
    sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs.filter(Boolean) : [item.sourceRef].filter(Boolean),
    queryHash: toNonEmptyString(item.queryHash) ?? '',
    chunkId: toNonEmptyString(item.chunkId) ?? '',
    summary: toNonEmptyString(item.summary) ?? '',
    summaryKey: toNonEmptyString(item.summaryKey) ?? '',
    hitCount: Number(item.hitCount ?? 0),
    cachedKey: toNonEmptyString(item.cachedKey) ?? '',
  }));
}

async function main() {
  const env = loadEnv();
  const { values } = parseArgs({
    options: {
      dryRun: { type: 'boolean', default: false },
      apply: { type: 'boolean', default: false },
      limit: { type: 'string' },
      skipNeo4j: { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: false,
  });

  const dryRun = Boolean(values.dryRun) || !Boolean(values.apply);
  const skipNeo4j = Boolean(values.skipNeo4j);
  const limit = clampInt(values.limit, 8, 1, 64);

  if (!fs.existsSync(INPUT_JSON_PATH)) {
    console.error(`[sourceRef-hot-join] compressed report not found: ${INPUT_JSON_PATH}`);
    process.exit(1);
  }

  const compressedReport = loadJson(INPUT_JSON_PATH, null);
  if (!compressedReport) {
    console.error('[sourceRef-hot-join] could not read compressed report');
    process.exit(1);
  }

  const items = loadPacketItems(compressedReport, limit);
  const redisUrl = process.env.REDIS_URL || env.REDIS_URL || DEFAULT_REDIS_URL;
  const redisPassword = process.env.REDIS_PASSWORD || env.REDIS_PASSWORD || null;

  const report = {
    schema: 'sourceRef_first_hot_join_warmup_report.v1',
    generatedAt: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'apply',
    inputs: {
      compressedReport: INPUT_JSON_PATH,
      limit,
    },
    summary: {
      items: items.length,
      redisWarmups: 0,
      bifrostWarmups: 0,
      errors: 0,
    },
    neo4j: {
      applied: false,
      communities: 0,
      totalClusters: 0,
      totalMembers: 0,
      turboHits: 0,
      turboMisses: 0,
    },
    top: {
      featureIds: [],
      sourceRefs: [],
    },
    samples: [],
  };

  const featureIdCounts = new Map();
  const sourceRefCounts = new Map();

  let redis = null;
  try {
    if (!dryRun) {
      const redisOptions = {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      };
      if (redisPassword) redisOptions.password = redisPassword;
      redis = new Redis(redisUrl, redisOptions);
      redis.on('error', () => {});
      await redis.connect().catch(() => null);
    }

    if (!skipNeo4j && !dryRun) {
      report.neo4j.applied = false;
      report.neo4j.note = 'Neo4j expansion is best-effort in the Node runner and is skipped here to avoid TS-loader coupling.';
    }

    for (const item of items) {
      const summary = item.summary;
      const cacheKey = `sourceRef-first:hot-join:${item.kind}:${item.featureId}:${item.queryHash.slice(0, 16)}`;
      const entry = {
        kind: item.kind,
        featureId: item.featureId,
        sourceRef: item.sourceRef,
        sourceRefs: item.sourceRefs,
        queryHash: item.queryHash,
        chunkId: item.chunkId,
        summaryKey: item.summaryKey,
        cachedKey: item.cachedKey,
        summary,
        bifrostModel: compressedReport?.inputs?.bifrostModels?.[0] ?? null,
        bifrostFallback: false,
      };
      report.samples.push(entry);

      if (!dryRun && redis) {
        const packet = {
          kind: 'source_ref_first_hot_join',
          featureId: item.featureId,
          sourceRef: item.sourceRef,
          sourceRefs: item.sourceRefs,
          queryHash: item.queryHash,
          chunkId: item.chunkId,
          summary,
          summaryKey: item.summaryKey,
          compressedReport: INPUT_JSON_PATH,
          compressedAt: compressedReport.generatedAt,
        };
        await redis.set(`bifrost:kag:${cacheKey}`, JSON.stringify(packet), 'EX', 3600 * 4).catch(() => null);
        report.summary.redisWarmups += 1;
        report.summary.bifrostWarmups += 1;
      }

      featureIdCounts.set(item.featureId, (featureIdCounts.get(item.featureId) ?? 0) + 1);
      for (const sourceRef of item.sourceRefs) {
        sourceRefCounts.set(sourceRef, (sourceRefCounts.get(sourceRef) ?? 0) + 1);
      }
    }
  } finally {
    if (redis) await redis.quit().catch(() => null);
  }

  report.top.featureIds = [...featureIdCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 10);
  report.top.sourceRefs = [...sourceRefCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 10);

  fs.mkdirSync(path.dirname(REPORT_JSON_PATH), { recursive: true });
  fs.writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(REPORT_MD_PATH, buildMarkdown(report), 'utf8');

  console.log(`[sourceRef-hot-join] items=${report.summary.items} redis=${report.summary.redisWarmups} bifrost=${report.summary.bifrostWarmups} errors=${report.summary.errors}`);
  console.log(`[sourceRef-hot-join] json=${REPORT_JSON_PATH}`);
  console.log(`[sourceRef-hot-join] md=${REPORT_MD_PATH}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[sourceRef-hot-join] fatal:', err?.message ?? err);
    process.exit(1);
  });
