#!/usr/bin/env node
/**
 * cache-feature-cards.mjs
 *
 * Stage 6 of the ACE Feature Context Matrix pipeline.
 * Reads an NDJSON chunk file and writes compact feature card packets to Redis
 * under the keys defined in the ACE Feature Context Matrix spec:
 *
 *   ace:feature:{featureKey}   — aggregated card for a feature (all chunks)
 *   ace:error:{errorHash}      — card for a specific error code/pattern
 *   ace:rg:{queryHash}         — card for a specific rg search pattern
 *
 * Each card is a JSON string containing:
 *   - feature_key, tags, source_type
 *   - chunk_ids[], file_refs[], rg_paths[]
 *   - top_snippets (first 3 chunk texts, truncated to 300 chars each)
 *   - indexed_at
 *
 * Cards deliberately EXCLUDE raw vectors / GPU tensors — Redis is hot cache only.
 *
 * Usage:
 *   node scripts/atlas/cache-feature-cards.mjs \
 *     --input tmp/chunks/error-context.ndjson \
 *     --prefix ace:feature \
 *     --ttl 86400
 *   node scripts/atlas/cache-feature-cards.mjs \
 *     --input tmp/chunks/notes.ndjson --dry-run
 *
 * Env:
 *   REDIS_URL   default redis://localhost:6379
 */

import fs      from 'node:fs';
import path    from 'node:path';
import crypto  from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Redis   from 'ioredis';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');
const CARD_TYPES = new Set(['graph', 'route', 'glyph', 'cartridge', 'feature']);

// ── Args ─────────────────────────────────────────────────────────────────────
const argv      = process.argv.slice(2);
const inputI    = argv.indexOf('--input');
const prefixI   = argv.indexOf('--prefix');
const ttlI      = argv.indexOf('--ttl');
const DRY_RUN   = argv.includes('--dry-run');
const VERBOSE   = argv.includes('--verbose');

const INPUT_PATH = inputI  >= 0 ? argv[inputI + 1]  : null;
const PREFIX     = prefixI >= 0 ? argv[prefixI + 1] : 'ace:feature';
const TTL        = ttlI    >= 0 ? Number(argv[ttlI + 1]) : 86400;

const REDIS_URL  = process.env.REDIS_URL ?? 'redis://localhost:6379';

// ── Helpers ───────────────────────────────────────────────────────────────────
function sha256short(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12); }

function deriveFeatureKey(tags, sourcePath) {
  const featureTags = (tags ?? []).filter(t => t.startsWith('feature:')).map(t => t.replace('feature:', ''));
  if (featureTags.length > 0) return featureTags[0];
  return path.basename(sourcePath ?? 'unknown').replace(/\.[^.]+$/, '');
}

function deriveErrorHash(text) {
  // If the chunk contains TS error codes, use first one
  const m = text.match(/TS(\d{4})/);
  return m ? `TS${m[1]}` : null;
}

function normalizeCardType(value) {
  const candidate = String(value ?? '')
    .trim()
    .toLowerCase();
  return CARD_TYPES.has(candidate) ? candidate : 'feature';
}

// ── Build card map from records ────────────────────────────────────────────────
function buildCards(records) {
  // Map: featureKey → card
  const featureCards = new Map();
  // Map: errorCode  → card
  const errorCards   = new Map();

  for (const rec of records) {
    const featureKey = deriveFeatureKey(rec.tags, rec.source_path);
    const errorCode  = deriveErrorHash(rec.text ?? '');

    // ─ Feature card ─
    if (!featureCards.has(featureKey)) {
      featureCards.set(featureKey, {
        schema_version: 2,
        feature_key: featureKey,
        card_type: normalizeCardType(rec.card_type),
        tags: new Set(rec.tags ?? []),
        source_type: rec.source_type ?? 'notes',
        compact_summary: rec.compact_summary ?? rec.summary ?? (rec.text ?? '').slice(0, 300),
        route: rec.route ?? null,
        cluster_key: rec.cluster_key ?? null,
        glyph_kind: rec.glyph_kind ?? null,
        cartridge_kind: rec.cartridge_kind ?? null,
        chunk_ids: [],
        file_refs: new Set(),
        rg_paths: new Set(),
        top_snippets: [],
        indexed_at: new Date().toISOString(),
      });
    }
    const fc = featureCards.get(featureKey);
    fc.chunk_ids.push(rec.chunk_id);
    for (const t of (rec.tags     ?? [])) fc.tags.add(t);
    for (const p of (rec.file_refs ?? [])) fc.file_refs.add(p);
    for (const p of (rec.rg_paths  ?? [])) fc.rg_paths.add(p);
    if (fc.top_snippets.length < 3) {
      fc.top_snippets.push((rec.text ?? '').slice(0, 300));
    }

    // ─ Error card ─
    if (errorCode) {
      if (!errorCards.has(errorCode)) {
        errorCards.set(errorCode, {
          schema_version: 2,
          error_code: errorCode,
          feature_key: featureKey,
          card_type: normalizeCardType(rec.card_type),
          tags: new Set(rec.tags ?? []),
          compact_summary: rec.compact_summary ?? rec.summary ?? (rec.text ?? '').slice(0, 300),
          route: rec.route ?? null,
          cluster_key: rec.cluster_key ?? null,
          chunk_ids: [],
          file_refs: new Set(),
          top_snippets: [],
          indexed_at: new Date().toISOString(),
        });
      }
      const ec = errorCards.get(errorCode);
      ec.chunk_ids.push(rec.chunk_id);
      for (const t of (rec.tags     ?? [])) ec.tags.add(t);
      for (const p of (rec.file_refs ?? [])) ec.file_refs.add(p);
      if (ec.top_snippets.length < 3) {
        ec.top_snippets.push((rec.text ?? '').slice(0, 300));
      }
    }
  }

  // Serialize Sets → Arrays
  const featureList = [...featureCards.values()].map(c => ({
    ...c,
    tags:      [...c.tags],
    file_refs: [...c.file_refs],
    rg_paths:  [...c.rg_paths],
  }));
  const errorList = [...errorCards.values()].map(c => ({
    ...c,
    tags:      [...c.tags],
    file_refs: [...c.file_refs],
  }));

  return { featureList, errorList };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!INPUT_PATH) {
    console.error('[cache-cards] --input required');
    process.exit(1);
  }

  const inputResolved = path.isAbsolute(INPUT_PATH) ? INPUT_PATH : path.join(ROOT, INPUT_PATH);
  const lines   = fs.readFileSync(inputResolved, 'utf8').trim().split('\n').filter(Boolean);
  const records = lines.map(l => JSON.parse(l));

  console.log(`[cache-cards] Loaded ${records.length} chunks from ${INPUT_PATH}`);
  const { featureList, errorList } = buildCards(records);
  console.log(`[cache-cards] Built ${featureList.length} feature cards, ${errorList.length} error cards`);
  console.log(`[cache-cards] prefix=${PREFIX}  ttl=${TTL}s  dry=${DRY_RUN}`);

  if (DRY_RUN) {
    console.log('[cache-cards] DRY RUN — sample feature card:');
    if (featureList[0]) console.log(JSON.stringify(featureList[0], null, 2));
    if (errorList[0])   console.log('[cache-cards] Sample error card:', JSON.stringify(errorList[0], null, 2));
    console.log(
      '[cache-cards] Schema preview:',
      JSON.stringify(
        {
          feature_keys: featureList[0] ? Object.keys(featureList[0]).sort() : [],
          error_keys: errorList[0] ? Object.keys(errorList[0]).sort() : [],
        },
        null,
        2
      )
    );
    console.log(`[cache-cards] Would write ${featureList.length + errorList.length} keys to Redis`);
    return;
  }

  // Connect to Redis
  const redis = new Redis(REDIS_URL, {
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
    console.error(`[cache-cards] Redis unavailable: ${err.message}`);
    redis.disconnect();
    process.exit(1);
  }

  const pipe = redis.pipeline();
  let count = 0;

  for (const card of featureList) {
    const key = `${PREFIX}:${card.feature_key}`;
    pipe.setex(key, TTL, JSON.stringify(card));
    if (VERBOSE) console.log(`  SET ${key}`);
    count++;
  }

  for (const card of errorList) {
    const key = `ace:error:${card.error_code}`;
    pipe.setex(key, TTL, JSON.stringify(card));
    if (VERBOSE) console.log(`  SET ${key}`);
    count++;
  }

  await pipe.exec();
  redis.disconnect();

  console.log(`[cache-cards] ✅ Wrote ${count} Redis keys (TTL ${TTL}s)`);
  console.log(`[cache-cards] Feature keys: ${featureList.map(c => `${PREFIX}:${c.feature_key}`).join(', ')}`);
}

main().catch(err => {
  console.error('[cache-cards]', err.message);
  process.exit(1);
});