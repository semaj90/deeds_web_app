#!/usr/bin/env node
/**
 * intent-cache.mjs — Phase 11G
 * Writes intent_hash → sourceRefs + featureLabels + acePacketId to Redis.
 * TTL: 7 days for stable intents.
 *
 * Usage:
 *   node scripts/ingest/intent-cache.mjs
 *   node scripts/ingest/intent-cache.mjs --dry-run
 */

import fs from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import readline from 'readline';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const ROOT    = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');
const TTL     = 7 * 24 * 3600; // 7 days

async function loadRedis() {
  const require = createRequire(import.meta.url);
  const candidates = [
    path.join(ROOT, 'sveltekit-frontend', 'node_modules', 'ioredis'),
    path.join(ROOT, 'node_modules', 'ioredis'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const mod = await import(pathToFileURL(path.join(p, 'built', 'index.js')).href);
      const Redis = mod.default ?? mod;
      const r = new Redis({ host: '127.0.0.1', port: 6379, lazyConnect: true,
        maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: () => null });
      r.on('error', () => {});
      try { await r.connect(); await r.ping(); return r; } catch { r.disconnect(); }
    }
  }
  return null;
}

async function readNdjson(filePath) {
  const rows = [];
  if (!existsSync(filePath)) return rows;
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return rows;
}

async function main() {
  console.log('\n── Intent Cache (Phase 11G) ──────────────────────────────');

  // Load ace-packet for packet id + query + sourceRefs
  let packet = {};
  try {
    packet = JSON.parse(await fs.readFile(path.join(ROOT, '.opencode', 'ace-packet.json'), 'utf8'));
  } catch { console.error('❌ ace-packet.json missing — run compress-cards.mjs first'); process.exit(1); }

  const query      = packet.query || 'ACE context retrieval';
  const sourceRefs = Object.values(packet.sourceRefs || {}).filter(Boolean);
  const packetId   = packet.generatedAt || 'unknown';

  // Load feature labels for this packet's sourceRefs
  const labelRows  = await readNdjson(path.join(ROOT, '.tmp', 'feature-labels.ndjson'));
  const labelMap   = new Map(labelRows.map(l => [l.sourceRef, l]));
  const featureLabels = [...new Set(
    sourceRefs.map(s => labelMap.get(s)?.feature_label).filter(Boolean)
  )];

  const intentHash = crypto.createHash('sha256')
    .update(query.toLowerCase().replace(/\s+/g, ' ').trim())
    .digest('hex').slice(0, 16);

  const record = {
    intent_hash:    intentHash,
    query,
    sourceRefs:     sourceRefs.slice(0, 50),
    featureLabels:  featureLabels.slice(0, 20),
    acePacketId:    packetId,
    ttl_days:       TTL / 86400,
    createdAt:      new Date().toISOString(),
  };

  console.log(`  query       : "${query}"`);
  console.log(`  intent_hash : ${intentHash}`);
  console.log(`  sourceRefs  : ${sourceRefs.length}`);
  console.log(`  features    : ${featureLabels.slice(0,6).join(', ')}`);

  // Write manifest to disk always
  await fs.mkdir(path.join(ROOT, '.tmp'), { recursive: true });
  await fs.writeFile(
    path.join(ROOT, '.tmp', 'intent-cache-manifest.json'),
    JSON.stringify(record, null, 2), 'utf8'
  );

  if (DRY_RUN) {
    console.log(`\n  dry-run: would SET intent:${intentHash} (TTL ${TTL}s)`);
    console.log('──────────────────────────────────────────────────────────\n');
    return;
  }

  const redis = await loadRedis();
  if (!redis) {
    console.log('  ⚠️  Redis offline — manifest written to disk only');
    console.log('──────────────────────────────────────────────────────────\n');
    return;
  }

  await redis.set(`intent:${intentHash}`, JSON.stringify(record), 'EX', TTL);
  await redis.set(`intent:latest`, JSON.stringify(record), 'EX', TTL);
  // Store feature labels as a sorted set (label → count) for hot-label queries
  for (const label of featureLabels) {
    await redis.zincrby('intent:feature_labels:hot', 1, label);
  }
  await redis.expire('intent:feature_labels:hot', TTL);

  console.log(`\n  ✅ intent:${intentHash} SET (TTL ${TTL}s)`);
  console.log(`  ✅ intent:latest SET`);
  console.log(`  ✅ intent:feature_labels:hot ZINCRBY (${featureLabels.length} labels)`);
  console.log(`  ✅ wrote .tmp/intent-cache-manifest.json`);

  await redis.quit();
  console.log('──────────────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });
