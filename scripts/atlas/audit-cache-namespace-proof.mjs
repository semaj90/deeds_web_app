#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import Redis from 'ioredis';
import { loadRepoEnv, resolveRedisConfig, REPO_ROOT } from './connection-config.mjs';

const OUT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'cache-namespace-proof.json');
const OUT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'cache-namespace-proof.md');

const NAMESPACES = [
  { name: 'hyperrag_exact', pattern: 'hyperrag:query:*', role: 'query exact-match cache', required: true, ttl: 'required' },
  { name: 'bifrost', pattern: 'bifrost:*', role: 'semantic packet/cache mirror', required: true, ttl: 'mixed' },
  { name: 'som', pattern: 'som:*', role: 'SOM routing and centroid metadata', required: true, ttl: 'mixed' },
  { name: 'ace', pattern: 'ace:*', role: 'ACE planner/context packets', required: true, ttl: 'mixed' },
  { name: 'karpathy', pattern: 'gpu:karpathy:*', role: 'GPU rerank scores', required: true, ttl: 'persistent' },
  { name: 'centroid', pattern: 'centroid:*', role: 'community centroid shortcuts', required: false, ttl: 'mixed' },
];

async function scan(redis, pattern) {
  let cursor = '0';
  const keys = [];
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  return [...new Set(keys)];
}

async function main() {
  const env = loadRepoEnv(process.env);
  const config = resolveRedisConfig(env);
  const redis = new Redis(config.url, {
    password: config.password,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  await redis.connect();
  await redis.ping();

  const rows = [];
  try {
    for (const namespace of NAMESPACES) {
      const keys = await scan(redis, namespace.pattern);
      const sample = keys.slice(0, 20);
      const pipeline = redis.pipeline();
      for (const key of sample) {
        pipeline.type(key);
        pipeline.ttl(key);
      }
      const results = sample.length ? await pipeline.exec() : [];
      const samples = sample.map((key, index) => ({
        key,
        type: results?.[index * 2]?.[1] ?? null,
        ttl_seconds: Number(results?.[index * 2 + 1]?.[1] ?? -3),
      }));
      const hasExpiringKey = samples.some((row) => row.ttl_seconds > 0);
      rows.push({
        ...namespace,
        key_count: keys.length,
        samples,
        status: namespace.required && keys.length === 0
          ? 'FAIL_EMPTY'
          : namespace.ttl === 'required' && !hasExpiringKey
            ? 'FAIL_TTL'
            : 'PASS',
      });
    }
  } finally {
    redis.disconnect();
  }

  const matchedByKey = new Map();
  for (const row of rows) {
    for (const sample of row.samples) {
      if (!matchedByKey.has(sample.key)) matchedByKey.set(sample.key, []);
      matchedByKey.get(sample.key).push(row.name);
    }
  }
  const collisions = [...matchedByKey.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([key, names]) => ({ key, namespaces: names }));

  const failures = rows.filter((row) => row.status !== 'PASS');
  const report = {
    schema: 'cache_namespace_proof.v1',
    generated_at: new Date().toISOString(),
    canonical_truth: 'Postgres',
    namespaces: rows,
    collisions,
    summary: {
      status: failures.length === 0 && collisions.length === 0 ? 'PASS' : 'FAIL',
      namespace_count: rows.length,
      required_ready: rows.filter((row) => row.required && row.status === 'PASS').length,
      required_total: rows.filter((row) => row.required).length,
      sampled_collisions: collisions.length,
    },
  };

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    OUT_MD,
    [
      '# Cache Namespace Proof',
      '',
      `Generated: ${report.generated_at}`,
      `Status: ${report.summary.status}`,
      '',
      '| Namespace | Pattern | Role | Keys | Status |',
      '|---|---|---|---:|---|',
      ...rows.map((row) => `| ${row.name} | \`${row.pattern}\` | ${row.role} | ${row.key_count} | ${row.status} |`),
      '',
      `- sampled namespace collisions: ${collisions.length}`,
      '- Postgres remains canonical; all listed namespaces are runtime mirrors or accelerators.',
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(JSON.stringify(report.summary, null, 2));
  process.exitCode = report.summary.status === 'PASS' ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
