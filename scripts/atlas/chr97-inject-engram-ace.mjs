#!/usr/bin/env node
/**
 * chr97-inject-engram-ace.mjs
 *
 * Pipe chr97-sprites.ndjson into:
 *   1. Engram registry (Redis ace:engram:lesson:<glyphHash>)
 *   2. ACE packet cache (Redis ace:packet:<queryHash>, AcePacket shape from
 *      sveltekit-frontend/src/lib/server/cache/ace-packet-cache.ts)
 *   3. RabbitMQ glyph.tile.rebuild fan-out (best-effort, no-op if amqp down)
 *
 * The script does NOT mutate Postgres. All persistence is Redis + RabbitMQ.
 *
 * Usage:
 *   node scripts/atlas/chr97-inject-engram-ace.mjs --dry-run
 *   node scripts/atlas/chr97-inject-engram-ace.mjs --apply
 *   node scripts/atlas/chr97-inject-engram-ace.mjs --apply --query "cluster:gpu:92"
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
function flagVal(name, fallback) {
  const i = argv.findIndex((a) => a.startsWith(name));
  if (i < 0) return fallback;
  const eq = argv[i].indexOf('=');
  return eq >= 0 ? argv[i].slice(eq + 1) : argv[i + 1];
}
const QUERY = flagVal('--query', 'chr97 sprite eval — top reward nodes');

const SPRITES_PATH = path.join(ROOT, '.tmp', 'ingest', 'chr97-sprites.ndjson');
const REPORT = path.join(ROOT, 'memory', 'exports', 'chr97-inject-engram-ace-report.json');

function loadEnv() {
  const e = { ...process.env };
  const p = path.join(ROOT, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !e[m[1]]) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return e;
}
const env = loadEnv();

function hashQuery(q) {
  return createHash('sha256').update(q.normalize('NFC').trim().toLowerCase()).digest('hex').slice(0, 16);
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ CHR97 → Engram + ACE Packet Injection ═════════════════');
  console.log(`  Mode:  ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Query: "${QUERY}"`);

  // Load sprites
  if (!fs.existsSync(SPRITES_PATH)) {
    console.error(`  ❌ Missing ${SPRITES_PATH} — run chr97-sprite-eval.mjs --apply first`);
    process.exit(1);
  }
  const lines = fs.readFileSync(SPRITES_PATH, 'utf8').split('\n').filter(Boolean);
  const packets = lines.map((l) => JSON.parse(l));
  console.log(`  ✅ ${packets.length} sprite packets loaded`);

  // Connect Redis (cold-start safe per memory/ioredis-coldstart-pattern.md)
  const redis = new Redis({
    host: env.REDIS_HOST || 'localhost',
    port: parseInt(env.REDIS_PORT || '6379', 10),
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});

  try {
    await redis.connect();
    await redis.ping();
  } catch (e) {
    console.error(`  ❌ Redis unreachable: ${e.message}`);
    redis.disconnect();
    process.exit(1);
  }
  console.log('  ✅ Redis connected');

  // ─── Step 1: Engram writes ──────────────────────────────────────────
  console.log('\n  Step 1: Write engram lessons...');
  let engramWritten = 0;
  if (APPLY) {
    const pipe = redis.pipeline();
    for (const p of packets) {
      const memoryId = p.engramKey.replace(/[:]/g, '_'); // canonical id
      const memory = {
        id: memoryId,
        kind: p.engramKind,
        lane: p.rankedCard.lane,
        sourceRef: p.rankedCard.sourceRef,
        score: p.rankedCard.score,
        meta: p.rankedCard.meta,
        sprite: {
          hash: p.sprite.hash,
          bytes_b64: p.sprite.bytes_b64,
          palette: p.sprite.palette,
          origin: p.sprite.origin,
        },
        createdAt: new Date().toISOString(),
      };
      const key = `ace:engram:lesson:${memoryId}`;
      pipe.set(key, JSON.stringify(memory), 'EX', 86400);
      pipe.sadd('ace:engram:lessons', key);
      engramWritten++;
    }
    await pipe.exec();
  }
  console.log(`  ✅ ${engramWritten} engram lessons written`);

  // ─── Step 2: AcePacket build + cache ─────────────────────────────────
  console.log('\n  Step 2: Build AcePacket from rankedCards...');
  const queryHash = hashQuery(QUERY);
  const rankedCards = packets.map((p) => p.rankedCard);
  const sourceRefs = Array.from(new Set(rankedCards.map((c) => c.sourceRef).filter(Boolean)));

  // Build packet matching AcePacket type from ace-packet-cache.ts
  const acePacket = {
    query: QUERY,
    cacheSources: ['chr97-sprite-eval', 'gpu-enrich-parent-atlas'],
    sourceRefs,
    rankedCards,
    failureHints: [],
    nextActions: [
      'Inspect top-winner clusters from chr97-eval-report.json',
      'Pipe ranked sprites into Unsloth training dataset',
      'Trigger glyph.tile.rebuild to refresh Redis tile cache',
    ],
    promptCacheKey: `glyph:tile:atlas:chr97:${queryHash}`,
    degraded: false,
  };

  const cacheKey = `ace:packet:${queryHash}`;
  if (APPLY) {
    await redis.set(cacheKey, JSON.stringify(acePacket), 'EX', 3600);
    // Also stash a glyph-tile pointer (matches glyph-tile-engine.ts TILE_REDIS_PREFIX convention)
    await redis.set(`glyph:tile:atlas:chr97:${queryHash}`, JSON.stringify({
      generatedAt: new Date().toISOString(),
      origin: 'chr97-sprite-eval',
      spriteCount: packets.length,
      queryHash,
      packetKey: cacheKey,
    }), 'EX', 3600);
  }
  console.log(`  ✅ AcePacket cached at ${cacheKey} (${rankedCards.length} cards, ${sourceRefs.length} sourceRefs)`);

  // ─── Step 3: RabbitMQ glyph.tile.rebuild trigger ─────────────────────
  console.log('\n  Step 3: RabbitMQ glyph.tile.rebuild trigger...');
  let rabbitOk = false;
  let rabbitError = null;
  if (APPLY) {
    try {
      const amqp = await import('amqplib').catch(() => null);
      if (!amqp) {
        rabbitError = 'amqplib not installed';
      } else {
        const url = env.RABBITMQ_URL || 'amqp://localhost:5672';
        const conn = await amqp.default.connect(url);
        // Suppress unhandled error from channel reject before our try/catch sees it
        conn.on('error', () => {});
        const ch = await conn.createChannel();
        ch.on('error', () => {});
        // Passive check — attaches to existing queue without arg validation.
        // The queue was declared elsewhere with x-message-ttl + DLX policy.
        await ch.checkQueue('glyph.tile.rebuild');
        const msg = {
          source: 'chr97-sprite-eval',
          queryHash,
          spriteCount: packets.length,
          triggeredAt: new Date().toISOString(),
        };
        ch.sendToQueue('glyph.tile.rebuild', Buffer.from(JSON.stringify(msg)), { persistent: true });
        await ch.close().catch(() => {});
        await conn.close().catch(() => {});
        rabbitOk = true;
      }
    } catch (e) {
      rabbitError = e.message;
    }
  }
  console.log(`  ${rabbitOk ? '✅' : '⚠️ '} RabbitMQ ${rabbitOk ? 'published' : `skipped (${rabbitError || 'dry-run'})`}`);

  // ─── Step 4: Verify reads ────────────────────────────────────────────
  console.log('\n  Step 4: Verify reads...');
  let lessonCount = 0;
  let packetCached = false;
  if (APPLY) {
    lessonCount = await redis.scard('ace:engram:lessons');
    const cached = await redis.get(cacheKey);
    packetCached = !!cached;
  }
  console.log(`  ✅ Engram lessons in set: ${lessonCount}`);
  console.log(`  ${packetCached ? '✅' : '⚠️ '} AcePacket retrievable: ${packetCached}`);

  // Report
  const report = {
    timestamp: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    query: QUERY,
    queryHash,
    counts: {
      spritesIngested: packets.length,
      engramWritten,
      rankedCards: rankedCards.length,
      sourceRefs: sourceRefs.length,
      lessonsInSet: lessonCount,
    },
    rabbitmq: { ok: rabbitOk, error: rabbitError },
    keys: {
      acePacket: cacheKey,
      tilePointer: `glyph:tile:atlas:chr97:${queryHash}`,
    },
    sample: {
      firstEngramKey: packets[0]?.engramKey || null,
      firstRankedCard: rankedCards[0] || null,
    },
  };

  if (APPLY) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8');
  }

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Sprites ingested:   ${packets.length}`);
  console.log(`  Engrams written:    ${engramWritten}`);
  console.log(`  AcePacket cached:   ${packetCached ? 'yes' : 'no'}`);
  console.log(`  RabbitMQ fired:     ${rabbitOk ? 'yes' : 'no'}`);
  console.log(`  Cache key:          ${cacheKey}`);
  if (APPLY) console.log(`  📝 Report → ${REPORT}`);
  else console.log('\n  [DRY-RUN] Use --apply to persist.');

  await redis.quit();
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
