#!/usr/bin/env node
/**
 * preassemble-ace-packets.mjs
 *
 * Pre-assembles and injects ACE packets into Redis/Valkey for all Parent Atlas cards.
 *
 * Steps:
 *   1. Load cards from .opencode/cards/*.json
 *   2. Load them into Redis under 'nes:card:<id>' and index by path variants ('nes:ref:<sha256-12>')
 *   3. For each card, perform parent-atlas-packet-assembler logic:
 *      - Expand feature_ids and cluster_id
 *      - Fetch SOM cluster packet ('ace:cluster:<row>:<col>') to get neighbor context
 *      - Build prompt_context and ranked_cards
 *      - Write full AcePacket to Redis ('ace:packet:<id>', index 'ace:source_ref:<sha256-8>')
 *
 * Usage:
 *   node scripts/atlas/preassemble-ace-packets.mjs            # dry-run
 *   node scripts/atlas/preassemble-ace-packets.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';
import { ROOT, CARDS_DIR as NESCHROM_CARDS_DIR, LEGACY_CARDS_DIR } from './_neschrom-paths.mjs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const TTL = 86400; // 24h for cache

// ─── ID Normalization (matches SvelteKit code exactly) ──────────────────────

const STRIP_PREFIXES = [
  /^file:/,
  /^sveltekit-frontend[/\\]/,
  /^[A-Za-z]:[/\\].*?sveltekit-frontend[/\\]/,
  /^[/\\]+/,
  /^\.\//,
];

function normalizeCardId(raw) {
  let s = raw.replace(/\\/g, '/').trim();
  for (const prefix of STRIP_PREFIXES) {
    s = s.replace(prefix, '');
  }
  if (s.startsWith('src/')) return s;
  if (!s.includes('/')) return s;
  return s;
}

function cardIdVariants(sourceRef) {
  const norm = normalizeCardId(sourceRef);
  const stem = norm.split('/').pop() ?? norm;
  const stemNoExt = stem.replace(/\.[^.]+$/, '');
  return [
    norm,
    `file:${norm}`,
    `sveltekit-frontend/${norm}`,
    stem,
    stemNoExt,
  ].filter((v, i, a) => a.indexOf(v) === i);
}

function cardKey(id) {
  return `nes:card:${id}`;
}

function sourceRefIndexKey(sourceRef) {
  const h = crypto.createHash('sha256').update(normalizeCardId(sourceRef)).digest('hex').slice(0, 12);
  return `nes:ref:${h}`;
}

function packetKey(id) {
  return `ace:packet:${id}`;
}

function sourceRefKey(ref) {
  const h = crypto.createHash('sha256').update(ref).digest('hex').slice(0, 8);
  return `ace:source_ref:${h}`;
}

function featureKey(featureId) {
  return `ace:feature:${featureId}`;
}

function taskKey(taskId) {
  return `ace:workspace_task:${taskId}`;
}

function makePacketId(query) {
  return crypto.createHash('sha256').update(query + Date.now()).digest('hex').slice(0, 16);
}

function makeQueryHash(query) {
  return crypto.createHash('sha256').update(query).digest('hex').slice(0, 16);
}

// ─── Env loader ───────────────────────────────────────────────────────────────

function loadEnv() {
  const env = { ...process.env };
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const REDIS_HOST = env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(env.REDIS_PORT || '6379', 10);
const REDIS_PASS = env.REDIS_PASSWORD || env.REDIS_PASS || '';

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Pre-assemble & Inject ACE Packets ══════════════════════');
  console.log(`  Redis: ${REDIS_HOST}:${REDIS_PORT}`);
  console.log(`  Mode:  ${APPLY ? 'APPLY (will write to Redis)' : 'DRY-RUN'}`);

  const cardsDir = fs.existsSync(NESCHROM_CARDS_DIR) && fs.readdirSync(NESCHROM_CARDS_DIR).filter(f => f.endsWith('.json')).length > 0
    ? NESCHROM_CARDS_DIR : LEGACY_CARDS_DIR;
  if (!fs.existsSync(cardsDir)) {
    console.error(`  ❌ Cards directory not found: ${cardsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.json'));
  console.log(`  Loaded ${files.length} cards from .opencode/cards/`);

  // Connect Redis
  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASS || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});

  if (APPLY) {
    try {
      await redis.connect();
      await redis.ping();
      console.log('  ✅ Connected to Redis successfully');
    } catch (e) {
      console.error(`  ❌ Redis unreachable: ${e.message}`);
      process.exit(1);
    }
  }

  let cardsLoaded = 0;
  let packetsAssembled = 0;

  const pipe = APPLY ? redis.pipeline() : null;

  for (const file of files) {
    let cardData;
    try {
      cardData = JSON.parse(fs.readFileSync(path.join(cardsDir, file), 'utf8'));
    } catch {
      continue;
    }

    if (!cardData.id || !cardData.source) continue;

    const norm = normalizeCardId(cardData.source);
    const somRow = cardData.som_bmu_row ?? null;
    const somCol = cardData.som_bmu_col ?? null;

    // Build NesChromCard shape
    const nesCard = {
      id: cardData.id,
      source_ref: norm,
      alias_ids: cardIdVariants(norm),
      title: cardData.title ?? null,
      som_row: somRow,
      som_col: somCol,
      som_distance: cardData.som_bmu_distance ?? null,
      cluster_id: somRow != null && somCol != null ? `${somRow}:${somCol}` : null,
      feature_ids: cardData.feature_ids ?? [],
      top_feature: cardData.top_feature ?? null,
      workspace_task_id: cardData.workspace_task_id ?? null,
      summary: cardData.summary ?? cardData.text ?? null,
      keywords: cardData.keywords ?? [],
      tags: cardData.tags ?? [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (APPLY) {
      // 1. Write NES card
      pipe.set(cardKey(nesCard.id), JSON.stringify(nesCard), 'EX', TTL);
      // Index all variants
      for (const variant of nesCard.alias_ids) {
        pipe.set(sourceRefIndexKey(variant), nesCard.id, 'EX', TTL);
      }
      cardsLoaded++;
    }

    // 2. Pre-assemble ACE packet
    const sourceRefs = [nesCard.source_ref];
    const featureIds = [...nesCard.feature_ids];
    if (nesCard.top_feature && !featureIds.includes(nesCard.top_feature)) {
      featureIds.push(nesCard.top_feature);
    }
    const clusterId = nesCard.cluster_id;
    const laneIds = ['nes-card'];

    // Retrieve cluster mappings if exists (in dry-run we mock it, in apply we query Redis or check cluster-summary file)
    let somSourceRefs = [];
    let somFeatureIds = [];
    if (clusterId && APPLY) {
      // Read cluster summary from Redis
      const rawCluster = await redis.get(`ace:cluster:${clusterId}`).catch(() => null);
      if (rawCluster) {
        try {
          const somPacket = JSON.parse(rawCluster);
          somSourceRefs = (somPacket.source_refs || []).filter(r => !sourceRefs.includes(r)).slice(0, 5);
          somFeatureIds = (somPacket.feature_ids || []).filter(f => !featureIds.includes(f));
          laneIds.push('som-cluster');
        } catch {}
      }
    }

    const allSourceRefs = [...new Set([...sourceRefs, ...somSourceRefs])];
    const allFeatureIds = [...new Set([...featureIds, ...somFeatureIds])];

    const promptLines = [];
    if (nesCard.summary) promptLines.push(`Summary: ${nesCard.summary}`);
    if (nesCard.keywords?.length) promptLines.push(`Keywords: ${nesCard.keywords.join(', ')}`);
    if (nesCard.tags?.length) promptLines.push(`Tags: ${nesCard.tags.join(', ')}`);
    const promptContext = promptLines.length
      ? `[${norm}]\n${promptLines.join('\n')}`
      : `[${norm}]\nNo cached summary available.`;

    const ranked_cards = allSourceRefs.map((ref, i) => ({
      source_ref: ref,
      score: i === 0 ? 1.0 : 0.5,
      feature_id: allFeatureIds[0] ?? null,
      snippet: i === 0 ? (nesCard.summary ?? '').slice(0, 200) : '',
    }));

    const queryHash = makeQueryHash(norm);
    const packet = {
      packet_id: crypto.createHash('sha256').update(norm + Date.now()).digest('hex').slice(0, 16),
      query: norm,
      query_hash: queryHash,
      source_refs: allSourceRefs,
      feature_ids: allFeatureIds,
      lane_ids: [...new Set(laneIds)],
      cluster_id: clusterId,
      workspace_task_id: nesCard.workspace_task_id,
      qdrant_point_ids: [],
      neo4j_neighbor_ids: [],
      redis_hot_keys: [],
      prompt_context: promptContext,
      ranked_cards,
      cache_hit: 'redis',
      latency_ms: 0,
      degraded: allSourceRefs.length === 0,
      created_at: new Date().toISOString(),
      ttl_seconds: TTL,
    };

    if (APPLY) {
      // Primary packet key
      pipe.set(packetKey(packet.packet_id), JSON.stringify(packet), 'EX', TTL);
      // latest pointer
      pipe.set('ace:packet:latest', packet.packet_id, 'EX', TTL);
      // SOM cluster key
      if (packet.cluster_id) {
        pipe.set(`ace:cluster:${packet.cluster_id}`, JSON.stringify(packet), 'EX', TTL);
      }
      // source_ref -> packet_id index
      for (const ref of packet.source_refs) {
        pipe.set(sourceRefKey(ref), packet.packet_id, 'EX', TTL);
      }
      // feature_id index
      for (const fid of packet.feature_ids) {
        pipe.lpush(featureKey(fid), packet.packet_id);
        pipe.ltrim(featureKey(fid), 0, 9);
        pipe.expire(featureKey(fid), TTL);
      }
      // workspace_task index
      if (packet.workspace_task_id) {
        pipe.set(taskKey(packet.workspace_task_id), packet.packet_id, 'EX', TTL);
      }
      packetsAssembled++;
    } else {
      if (VERBOSE) {
        console.log(`[DRY-RUN] Would assemble packet for: ${nesCard.source_ref}`);
      }
    }
  }

  if (APPLY) {
    console.log(`  Piping ${cardsLoaded} card writes and ${packetsAssembled} packet assembly writes to Redis...`);
    await pipe.exec();
    console.log('  ✅ Injected cards and pre-assembled packets into Redis successfully');
  } else {
    console.log(`  [DRY-RUN] Pre-assembled ${files.length} cards. Use --apply to execute.`);
  }

  if (APPLY) {
    await redis.quit();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
