#!/usr/bin/env node
/**
 * atlas-cartridge-seed.mjs — generate .tmp/atlas-cartridge-seeds.jsonl
 *
 * Reads parent atlas cards produced by `atlas:build` and any available
 * atlas JSONL artifacts, then writes compact seed packets for ACE injection.
 *
 * Runs as a non-fatal step inside graphify:daily — exit code is always 0
 * so that a seed failure never breaks the broader daily pipeline.
 *
 * Flags:
 *   --publish    Write hot seeds to Redis (off by default)
 *   --limit=N    Max seeds to emit (default 500)
 *   --dry-run    Print stats without writing files
 *   --quiet      Suppress non-error console output
 *
 * Outputs:
 *   .tmp/atlas-cartridge-seeds.jsonl      — compressed seed packets (one per line)
 *   .tmp/atlas-cartridge-seed-meta.json  — metadata: seed_count, status, generatedAt
 *
 * Consumed by:
 *   graphify-health.mjs  (reads meta for daily report)
 *   ACE context injection pipeline (reads seeds JSONL)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { mkdirSync }                                             from 'node:fs';
import { join, resolve }                                         from 'node:path';
import { fileURLToPath }                                         from 'node:url';
import { createClient }                                          from 'redis';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = resolve(__dirname, '../..'); // sveltekit-frontend/

// ── CLI flags ─────────────────────────────────────────────────────────────────

const argv      = process.argv.slice(2);
const PUBLISH   = argv.includes('--publish');
const DRY_RUN   = argv.includes('--dry-run');
const QUIET     = argv.includes('--quiet');
const RAW_LIMIT = argv.find(a => a.startsWith('--limit='));
const MAX_SEEDS = RAW_LIMIT ? Math.max(1, parseInt(RAW_LIMIT.split('=')[1], 10)) : 500;

const TMP_DIR       = join(ROOT, '.tmp');
const SEEDS_JSONL   = join(TMP_DIR, 'atlas-cartridge-seeds.jsonl');
const SEED_META     = join(TMP_DIR, 'atlas-cartridge-seed-meta.json');
const REDIS_URL     = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Input locations — searched in priority order
const INPUT_CANDIDATES = [
  join(TMP_DIR, 'parent-atlas-profile-cards.jsonl'),
  join(ROOT, 'docs', 'atlas', 'atlas-index.jsonl'),
  join(ROOT, 'docs', 'atlas', 'parent-atlas-profile-cards.jsonl'),
  join(ROOT, '..', 'memory', 'knowledge', 'schema-indexer-contract-cards.jsonl'),
  join(ROOT, 'memory', 'knowledge', 'schema-indexer-contract-cards.jsonl'),
];

function log(...args) {
  if (!QUIET) console.log('[atlas:cartridge-seed]', ...args);
}
function warn(...args) {
  console.warn('[atlas:cartridge-seed] ⚠', ...args);
}

// ── Card loading ──────────────────────────────────────────────────────────────

function loadLines(filePath) {
  try {
    return readFileSync(filePath, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseAtlasCard(raw) {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // Normalise across different atlas card schemas
    const id      = obj.card_id   || obj.cardId    || obj.id    || `seed:${Date.now()}`;
    const summary = obj.summary   || obj.description || '';
    const tags    = [
      ...(obj.hot_keywords   || []),
      ...(obj.clusterTags    || []),
      ...(obj.qdrant_tags    || []),
      ...(obj.featureLabels  || []),
    ].slice(0, 20);
    const src     = obj.sourceRef || (obj.sourceRefs && obj.sourceRefs[0]) || '';
    const score   = typeof obj.hotness_score === 'number' ? obj.hotness_score :
                    typeof obj.pagerank       === 'number' ? obj.pagerank       : 0;
    return { id, summary: String(summary).slice(0, 400), tags, src, score, ts: Date.now() };
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const sources = [];
const rawCards = [];

for (const candidate of INPUT_CANDIDATES) {
  if (!existsSync(candidate)) continue;
  const lines = loadLines(candidate);
  if (!lines.length) continue;
  log(`Reading ${lines.length} lines from ${candidate}`);
  sources.push(candidate);
  for (const line of lines) {
    const card = parseAtlasCard(line);
    if (card) rawCards.push(card);
  }
}

// Also scan .tmp/ for any additional atlas JSONL artifacts
if (existsSync(TMP_DIR)) {
  for (const file of readdirSync(TMP_DIR)) {
    if (!file.endsWith('.jsonl') || file === 'atlas-cartridge-seeds.jsonl') continue;
    if (file.includes('atlas') || file.includes('card') || file.includes('cluster')) {
      const filePath = join(TMP_DIR, file);
      if (sources.includes(filePath)) continue;
      const lines = loadLines(filePath);
      if (!lines.length) continue;
      log(`Scanning ${file} (${lines.length} lines)`);
      for (const line of lines) {
        const card = parseAtlasCard(line);
        if (card) rawCards.push(card);
      }
      sources.push(filePath);
    }
  }
}

if (!rawCards.length) {
  warn('No atlas cards found — seeds JSONL will be empty.');
  warn('Run `npm run atlas:build` first to generate parent atlas profile cards.');
}

// Sort by score descending, then deduplicate by id
rawCards.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

const seen    = new Set();
const seeds   = [];
for (const card of rawCards) {
  if (seen.has(card.id)) continue;
  seen.add(card.id);
  seeds.push(card);
  if (seeds.length >= MAX_SEEDS) break;
}

log(`Selected ${seeds.length} seeds from ${rawCards.length} total cards (${MAX_SEEDS} cap)`);

const meta = {
  seed_count:   seeds.length,
  status:       seeds.length > 0 ? 'ok' : 'empty',
  generatedAt:  new Date().toISOString(),
  sources:      sources.map(s => s.replace(ROOT, '.')),
  warning:      seeds.length === 0 ? 'No atlas cards found — run atlas:build first' : null,
};

if (DRY_RUN) {
  log('--dry-run: skipping file writes');
  console.log(JSON.stringify(meta, null, 2));
  process.exit(0);
}

// ── Write outputs ─────────────────────────────────────────────────────────────

try {
  mkdirSync(TMP_DIR, { recursive: true });

  if (seeds.length > 0) {
    writeFileSync(SEEDS_JSONL, seeds.map(s => JSON.stringify(s)).join('\n') + '\n', 'utf-8');
    log(`✓ Wrote ${seeds.length} seeds → ${SEEDS_JSONL}`);
  } else {
    // Write empty file so downstream consumers can detect the run occurred
    writeFileSync(SEEDS_JSONL, '', 'utf-8');
  }

  writeFileSync(SEED_META, JSON.stringify(meta, null, 2), 'utf-8');
  log(`✓ Wrote seed meta → ${SEED_META}`);
} catch (err) {
  warn('Failed to write seed files:', err.message);
  meta.status  = 'write_error';
  meta.warning = err.message;
  // Attempt to still write meta so graphify-health can report the warning
  try { writeFileSync(SEED_META, JSON.stringify(meta, null, 2), 'utf-8'); } catch { /* ignore */ }
  process.exit(0); // non-fatal
}

// ── Optional Redis publish ────────────────────────────────────────────────────

if (!PUBLISH) {
  log('Redis publish skipped (pass --publish to enable)');
  process.exit(0);
}

if (seeds.length === 0) {
  log('No seeds to publish to Redis');
  process.exit(0);
}

let redis;
try {
  redis = createClient({ url: REDIS_URL });
  await redis.connect();
} catch (err) {
  warn(`Cannot connect to Redis at ${REDIS_URL}: ${err.message}`);
  process.exit(0); // non-fatal
}

try {
  const dateKey   = new Date().toISOString().slice(0, 10);
  const redisKey  = `atlas:seeds:${dateKey}`;
  const pipeline  = redis.pipeline();

  for (const seed of seeds) {
    pipeline.hSet(redisKey, seed.id, JSON.stringify(seed));
  }
  pipeline.expire(redisKey, 24 * 60 * 60); // 24 h TTL
  await pipeline.exec();

  log(`✓ Published ${seeds.length} seeds to Redis key ${redisKey} (TTL 24h)`);
} catch (err) {
  warn(`Redis publish failed: ${err.message} — seeds file still written`);
} finally {
  await redis.quit().catch(() => {});
}

process.exit(0);
