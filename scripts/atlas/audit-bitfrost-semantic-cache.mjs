#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAtlasRedisContext, runRedisCli } from './lib/redis-valkey.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'bitfrost-semantic-cache-audit.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'bitfrost-semantic-cache-audit.md');

const PATTERNS = [
  { key: 'gpu:karpathy:scores', pattern: 'gpu:karpathy:scores', exact: true },
  { key: 'gpu:karpathy:encoded', pattern: 'gpu:karpathy:encoded', exact: true },
  { key: 'bifrost:*', pattern: 'bifrost:*' },
  { key: 'centroid:*', pattern: 'centroid:*' },
  { key: 'som:*', pattern: 'som:*' },
  { key: 'bifrost:sem:packet:*', pattern: 'bifrost:sem:packet:*' },
  { key: 'bifrost:sem:feature:*', pattern: 'bifrost:sem:feature:*' },
  { key: 'bifrost:sem:intent:*', pattern: 'bifrost:sem:intent:*' },
  { key: 'reward:zset', pattern: 'reward:zset', exact: true },
  { key: 'ace:context:*', pattern: 'ace:context:*' },
  { key: 'ace:summary:*', pattern: 'ace:summary:*' },
  { key: 'ace:feature:*', pattern: 'ace:feature:*' },
  { key: 'ace:query:*', pattern: 'ace:query:*' },
  { key: 'ace:tree:*', pattern: 'ace:tree:*' },
  { key: 'ace:authority:*', pattern: 'ace:authority:*' },
  { key: 'ace:ontology:*', pattern: 'ace:ontology:*' },
  { key: 'ace:memory:*', pattern: 'ace:memory:*' },
];

function scanCount(container, pattern, password = '') {
  const result = runRedisCli(container, ['--raw', '--scan', '--pattern', pattern], password, null, {
    maxBuffer: 1024 * 1024 * 8,
  });
  if (!result.ok) {
    return { ok: false, count: 0, sample: [], error: result.stderr.trim() || result.stdout.trim() || result.error };
  }
  const keys = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return { ok: true, count: keys.length, sample: keys.slice(0, 5), error: null };
}

function ttlSample(container, keys, password = '') {
  const samples = [];
  for (const key of keys.slice(0, 5)) {
    const result = runRedisCli(container, ['TTL', key], password);
    const ttl = result.ok ? Number(result.stdout.trim()) : null;
    samples.push({ key, ttl: Number.isFinite(ttl) ? ttl : null, ok: result.ok });
  }
  return samples;
}

function renderMarkdown(report) {
  const lines = [
    '# Bitfrost Semantic Cache Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Redis Container: ${report.redis.container || 'unavailable'}`,
    '',
    '## Summary',
    '',
    `- gpu:karpathy:scores: ${report.summary.gpuKarpathyScores}`,
    `- gpu:karpathy:encoded: ${report.summary.gpuKarpathyEncoded}`,
    `- bifrost keys: ${report.summary.bifrostKeys}`,
    `- centroid keys: ${report.summary.centroidKeys}`,
    `- som keys: ${report.summary.somKeys}`,
    '',
    '## Patterns',
    '',
    '| Pattern | Count | Sample | TTL samples |',
    '|---|---:|---|---|',
    ...report.patterns.map((item) => `| \`${item.key}\` | ${item.count} | ${item.sample.join(', ') || 'none'} | ${item.ttlSamples.map((sample) => `${sample.key}:${sample.ttl ?? 'n/a'}`).join(', ') || 'none'} |`),
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const { container, password: redisPassword } = await resolveAtlasRedisContext(REPO_ROOT, process.env);
  const report = {
    generatedAt: new Date().toISOString(),
    status: container ? 'PASS' : 'SOURCE_UNAVAILABLE',
    redis: {
      container,
      passwordConfigured: Boolean(redisPassword),
    },
    summary: {
      gpuKarpathyScores: 0,
      gpuKarpathyEncoded: 0,
      bifrostKeys: 0,
      centroidKeys: 0,
      somKeys: 0,
    },
    patterns: [],
    nextSafeAction: container
      ? 'Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.'
      : 'Bring the Redis/Valkey container online, then rerun the audit before warming caches.',
  };

  if (container) {
    const patternResults = PATTERNS.map((item) => {
      const result = scanCount(container, item.pattern, redisPassword);
      const ttlSamples = result.ok ? ttlSample(container, result.sample, redisPassword) : [];
      return {
        key: item.key,
        pattern: item.pattern,
        count: result.count,
        sample: result.sample,
        ttlSamples,
        ok: result.ok,
        error: result.error,
      };
    });

    report.patterns = patternResults;
    report.summary = {
      gpuKarpathyScores: patternResults.find((item) => item.key === 'gpu:karpathy:scores')?.count ?? 0,
      gpuKarpathyEncoded: patternResults.find((item) => item.key === 'gpu:karpathy:encoded')?.count ?? 0,
      bifrostKeys: patternResults.find((item) => item.key === 'bifrost:*')?.count ?? 0,
      centroidKeys: patternResults.find((item) => item.key === 'centroid:*')?.count ?? 0,
      somKeys: patternResults.find((item) => item.key === 'som:*')?.count ?? 0,
    };
    if (patternResults.every((item) => item.ok)) {
      report.status = 'PASS';
    } else if (patternResults.some((item) => /NOAUTH/i.test(item.error || ''))) {
      report.status = 'AUTH_REQUIRED';
    } else {
      report.status = 'PASS_WITH_WARN';
    }
    if (report.status === 'AUTH_REQUIRED') {
      report.nextSafeAction = 'Provide Redis/Valkey credentials through env or the local .env file, then rerun the audit so key counts and TTL samples can be measured.';
    }
  }

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, renderMarkdown(report), 'utf8');

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(JSON.stringify({
    status: report.status,
    container: report.redis.container,
    passwordConfigured: report.redis.passwordConfigured,
    gpuKarpathyScores: report.summary.gpuKarpathyScores,
    gpuKarpathyEncoded: report.summary.gpuKarpathyEncoded,
    bifrostKeys: report.summary.bifrostKeys,
    centroidKeys: report.summary.centroidKeys,
    somKeys: report.summary.somKeys,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
