#!/usr/bin/env node
// @ts-check
/**
 * wiki:backfill-error-fingerprints
 *
 * Reads scratch/audits/tsgo-diagnostics.json (produced by npm run audit:tsgo:json)
 * and upserts each diagnostic into the error_fingerprints Postgres table.
 * Also warms Redis ace:error:{hash} keys for ACE multi-lane hash retrieval.
 *
 * Prerequisites:
 *   1. npm run audit:tsgo:json           → scratch/audits/tsgo-diagnostics.json
 *   2. npm run db:migrate:error-fingerprints → creates error_fingerprints table
 *   3. DATABASE_URL env var set
 *
 * Flags:
 *   --dry-run     Print what would be inserted, skip all writes
 *   --limit=N     Process at most N diagnostics (default: all)
 *   --no-redis    Skip Redis warming
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SVELTEKIT_ROOT = resolve(__dirname, '../..');
const DIAGNOSTICS_PATH = resolve(SVELTEKIT_ROOT, 'scratch/audits/tsgo-diagnostics.json');

const args = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const NO_REDIS = DRY_RUN || args.includes('--no-redis');
const LIMIT    = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0');

// ── Normalization (mirrors error-fingerprint.ts normalizeError) ───────────────

function normalizeError(raw) {
  return raw
    .replace(/\x1B\[[0-9;]*m/g, '')          // strip ANSI
    .replace(/\bat\s+\S+:\d+:\d+/g, 'at <FILE>:<LINE>')  // strip call stack locations
    .replace(/reading\s+'[^']+'/g, "reading '<PROP>'")    // strip property names
    .replace(/\bTS\d{4,6}\b/g, 'TS<CODE>')               // normalise TS error codes
    .toLowerCase()
    .trim()
    .slice(0, 800);
}

function fingerprintText(text) {
  return createHash('sha256').update(normalizeError(text)).digest('hex').slice(0, 16);
}

function extractSymbols(text) {
  const matches = [...text.matchAll(/\b([A-Z][a-zA-Z0-9]+(?:Service|Manager|Store|Bridge|Client|Handler)?)\b/g)];
  return [...new Set(matches.map((m) => m[1]))].slice(0, 6);
}

function extractFiles(text) {
  const matches = [...text.matchAll(/(?:src\/[^\s'"]+\.(?:ts|svelte|js|mjs))/g)];
  return [...new Set(matches.map((m) => m[0]))].slice(0, 5);
}

// ── Postgres upsert ───────────────────────────────────────────────────────────

async function upsertFingerprint(pool, fp) {
  await pool.query(
    `INSERT INTO error_fingerprints
       (error_hash, normalized_text, raw_text, top_symbols, top_files, seen_count)
     VALUES ($1, $2, $3, $4, $5, 1)
     ON CONFLICT (error_hash)
     DO UPDATE SET
       seen_count = error_fingerprints.seen_count + 1,
       last_seen  = now()`,
    [fp.hash, fp.normalizedText, fp.rawText, fp.topSymbols, fp.topFiles]
  );
}

// ── Redis warm ────────────────────────────────────────────────────────────────

async function warmRedis(fingerprints) {
  let Redis;
  try { ({ default: Redis } = await import('ioredis')); } catch { return; }

  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  try {
    await redis.connect();
    const pipe = redis.pipeline();
    const TTL = 7 * 24 * 3600; // 7 days

    for (const fp of fingerprints) {
      const payload = JSON.stringify([{
        id: fp.hash,
        text: fp.rawText.slice(0, 500),
        score: 0.9,
        topSymbols: fp.topSymbols,
        topFiles: fp.topFiles,
      }]);
      pipe.setex(`ace:error:${fp.hash}`, TTL, payload);
    }

    await pipe.exec();
    console.log(`  Redis: ${fingerprints.length} ace:error:* keys warmed`);
  } finally {
    await redis.quit().catch(() => {});
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔧 wiki:backfill-error-fingerprints starting...');
  if (DRY_RUN) console.log('   (dry-run mode)\n');

  // Load diagnostics
  let raw;
  try {
    raw = await readFile(DIAGNOSTICS_PATH, 'utf-8');
  } catch {
    console.error(`Error: ${DIAGNOSTICS_PATH} not found.`);
    console.error('Run: npm run audit:tsgo:json first.');
    process.exit(1);
  }

  let diagnostics;
  try {
    diagnostics = JSON.parse(raw);
  } catch (e) {
    console.error('Error: tsgo-diagnostics.json is not valid JSON:', e.message);
    process.exit(1);
  }

  // Normalize to array of {message, file, line, code}
  const items = Array.isArray(diagnostics)
    ? diagnostics
    : (diagnostics.diagnostics ?? diagnostics.errors ?? []);

  const limit = LIMIT > 0 ? LIMIT : items.length;
  const batch = items.slice(0, limit);

  console.log(`  Found ${items.length} diagnostics, processing ${batch.length}`);

  // Build fingerprints
  const seen = new Set();
  const fingerprints = [];

  for (const item of batch) {
    const rawText = [
      item.message ?? item.text ?? '',
      item.file ? `at ${item.file}:${item.line ?? 0}:${item.col ?? 0}` : '',
    ].filter(Boolean).join('\n');

    if (!rawText.trim()) continue;

    const hash = fingerprintText(rawText);
    if (seen.has(hash)) continue;
    seen.add(hash);

    fingerprints.push({
      hash,
      rawText,
      normalizedText: normalizeError(rawText),
      topSymbols: extractSymbols(rawText),
      topFiles: extractFiles(rawText),
    });
  }

  console.log(`  Unique fingerprints: ${fingerprints.length}`);

  if (DRY_RUN) {
    for (const fp of fingerprints.slice(0, 5)) {
      console.log(`\n  hash=${fp.hash}`);
      console.log(`  raw:  ${fp.rawText.slice(0, 100)}`);
      console.log(`  norm: ${fp.normalizedText.slice(0, 100)}`);
    }
    if (fingerprints.length > 5) console.log(`  ... and ${fingerprints.length - 5} more`);
    console.log('\n✅ Dry run complete');
    return;
  }

  // Postgres upsert
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL env var not set');
    process.exit(1);
  }

  let pg;
  try { pg = await import('pg'); } catch {
    console.error('Error: pg package not available');
    process.exit(1);
  }

  const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });

  let inserted = 0, errors = 0;
  for (const fp of fingerprints) {
    try {
      await upsertFingerprint(pool, fp);
      inserted++;
    } catch (e) {
      console.error(`  pg err ${fp.hash}:`, e.message);
      errors++;
    }
  }

  await pool.end();
  console.log(`\n  Postgres: ${inserted} upserted, ${errors} errors`);

  // Redis warm
  if (!NO_REDIS) {
    console.log('\n  Warming Redis...');
    await warmRedis(fingerprints);
  }

  console.log(`\n✅ Backfill complete — ${inserted} error fingerprints stored`);
  console.log('   gap_ace_004 readiness: run npm run wiki:gaps to re-check\n');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });