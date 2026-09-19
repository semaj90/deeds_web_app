#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(root, 'docs/reports/centroid-cache-families-v1.json');
const redisUrl = process.env.REDIS_URL ?? process.env.VALKEY_URL ?? 'redis://:redis@127.0.0.1:6379';
const patterns = ['centroid:*', 'ace:cluster:*', 'som:*', 'gpu:autoencoder:*'];
const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 1 });
const report = {
  schema: 'atlas.centroid-cache-families.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  canonicalAuthority: false,
  redisUrl: redisUrl.replace(/:\w+@/, ':***@'),
  families: {},
  status: 'UNAVAILABLE',
};
try {
  await redis.connect();
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    report.families[pattern] = { keyCount: keys.length, sample: keys.slice(0, 5) };
  }
  report.status = 'READBACK_PROVEN';
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  redis.disconnect();
}
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, families: report.families, reportPath }, null, 2));
