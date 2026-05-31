#!/usr/bin/env node
/**
 * sync-cluster-tags-redis.mjs
 *
 * Phase A — Write Qdrant cluster tags from disk artifact into Redis.
 *
 * Reads memory/runs/{latest}/qdrant_cluster_tags.json (+ synthesis_summary.json)
 * and writes each ClusterTagsEntry to:
 *   ace:cluster:tags:{clusterKey}   hash  24h TTL
 *
 * Run after graphify:semantic or graphify:full:
 *   node scripts/atlas/sync-cluster-tags-redis.mjs
 *
 * npm alias: npm run graphify:sync-cluster-tags
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../sveltekit-frontend');
const REDIS_URL = process.env.REDIS_URL;
const TTL = 604800; // 7 days — matches gpu:karpathy:scores

if (!REDIS_URL) {
  console.error('[cluster-tags-redis] REDIS_URL not set — skipping');
  process.exit(0);
}

async function loadClusterTags() {
  const runsDir = resolve(ROOT, 'memory/runs');
  if (!existsSync(runsDir)) {
    console.warn('[cluster-tags-redis] memory/runs not found');
    return [];
  }
  const entries = readdirSync(runsDir)
    .filter(e => /^\d{4}-\d{2}-\d{2}T/.test(e))
    .sort();
  if (!entries.length) {
    console.warn('[cluster-tags-redis] no run directories found');
    return [];
  }
  const latestDir = join(runsDir, entries[entries.length - 1]);
  const tagsPath = join(latestDir, 'qdrant_cluster_tags.json');
  if (!existsSync(tagsPath)) {
    console.warn(`[cluster-tags-redis] qdrant_cluster_tags.json not found in ${latestDir}`);
    return [];
  }

  const tags = JSON.parse(readFileSync(tagsPath, 'utf-8'));

  // Merge synthesis summary if present
  const synPath = join(latestDir, 'synthesis_summary.json');
  if (existsSync(synPath)) {
    const synData = JSON.parse(readFileSync(synPath, 'utf-8'));
    const synList = [...(synData.p0 || []), ...(synData.p1 || [])];
    const synMap = new Map(synList.map(s => [s.cluster, s]));
    for (const t of tags) {
      const syn = synMap.get(t.clusterKey);
      if (syn) {
        t.summary = syn.summary ?? t.summary;
        t.purpose = syn.purpose ?? t.purpose;
        t.risk_level = syn.risk !== undefined ? String(syn.risk) : (syn.risk_level ?? t.risk_level);
        t.mitigation_protocols = syn.protocols ?? syn.mitigation_protocols ?? t.mitigation_protocols;
      }
    }
  }

  return tags;
}

async function main() {
  const tags = await loadClusterTags();
  if (!tags.length) {
    console.log('[cluster-tags-redis] no cluster tags to sync');
    return;
  }

  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  await redis.connect().catch(() => {
    console.error('[cluster-tags-redis] Redis unavailable — skipping');
    process.exit(0);
  });

  const pipe = redis.pipeline();
  let written = 0;

  for (const entry of tags) {
    const key = `ace:cluster:tags:${entry.clusterKey}`;
    pipe.hset(key, {
      clusterKey:           entry.clusterKey,
      fileCount:            String(entry.fileCount ?? 0),
      summary:              entry.summary ?? '',
      purpose:              entry.purpose ?? '',
      risk_level:           entry.risk_level ?? '',
      topTags:              JSON.stringify((entry.topTags ?? []).slice(0, 20)),
      topFiles:             JSON.stringify((entry.topFiles ?? []).filter(Boolean).slice(0, 20)),
      topoClasses:          JSON.stringify(entry.topoClasses ?? []),
      mitigation_protocols: JSON.stringify(entry.mitigation_protocols ?? []),
    });
    pipe.expire(key, TTL);
    written++;
  }

  // Write a manifest so context-assembler can check if Redis is populated
  pipe.setex('ace:cluster:tags:__meta', TTL, JSON.stringify({
    ts: new Date().toISOString(),
    count: tags.length,
    clusterKeys: tags.map(t => t.clusterKey),
  }));

  await pipe.exec();
  await redis.quit();

  console.log(`[cluster-tags-redis] wrote ${written} cluster tag hashes to Redis (TTL ${TTL}s)`);
}

main().catch(err => {
  console.error('[cluster-tags-redis] error:', err.message);
  process.exit(1);
});