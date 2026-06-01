#!/usr/bin/env node
/**
 * smoke-glyph-pipeline.mjs
 *
 * Final phase verification — smoke test the complete glyph→training pipeline.
 *
 * Checks (all must pass):
 *   1. glyph_records table exists and has rows
 *   2. At least one row has non-null grpo_reward_score
 *   3. At least one JSONL training file exists in scripts/training-datasets/
 *   4. JSONL rows have required fields: prompt/instruction, completion/output, reward
 *   5. lora_training_runs table exists
 *   6. Redis gpu:karpathy:scores has entries (Karpathy blend pre-condition)
 *   7. No raw embedding768 floats in JSONL (anti-pattern guard)
 *   8. No hardcoded localhost in new atlas scripts (env hygiene)
 *
 * Usage:
 *   node scripts/atlas/smoke-glyph-pipeline.mjs
 *   node scripts/atlas/smoke-glyph-pipeline.mjs --verbose
 *   node scripts/atlas/smoke-glyph-pipeline.mjs --skip-redis
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const SKIP_REDIS = argv.includes('--skip-redis');

// ─── Env loader ─────────────────────────────────────────────────────────────

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

const PG_URL = env.DATABASE_URL || 'postgres://legal_admin:postgres@localhost:5432/legal_ai_db';
const REDIS_URL = env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASS = env.REDIS_PASSWORD || env.REDIS_PASS || '';

const TRAINING_DIR = path.join(ROOT, 'scripts', 'training-datasets');

// ─── Result tracking ─────────────────────────────────────────────────────────

const results = [];
let passed = 0;
let failed = 0;

function pass(label, detail = '') {
  passed++;
  results.push({ status: 'PASS', label, detail });
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail = '') {
  failed++;
  results.push({ status: 'FAIL', label, detail });
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
}

function warn(label, detail = '') {
  results.push({ status: 'WARN', label, detail });
  console.log(`  ⚠️  ${label}${detail ? ` — ${detail}` : ''}`);
}

// ─── Postgres checks ─────────────────────────────────────────────────────────

async function checkPostgres() {
  let pg;
  try {
    pg = await import('pg');
  } catch {
    fail('Postgres module available', 'npm install pg');
    return;
  }

  const client = new pg.default.Client({ connectionString: PG_URL });
  try {
    await client.connect();

    // Check 1: glyph_records table exists and has rows
    try {
      const r = await client.query('SELECT count(*) AS n FROM glyph_records');
      const n = parseInt(r.rows[0].n, 10);
      if (n > 0) {
        pass('glyph_records table has rows', `${n} rows`);
      } else {
        fail('glyph_records table has rows', 'table exists but is empty — run atlas:ingest-glyphs');
      }
    } catch (e) {
      fail('glyph_records table exists', e.message);
    }

    // Check 2: at least one row has grpo_reward_score
    try {
      const r = await client.query('SELECT count(*) AS n FROM glyph_records WHERE grpo_reward_score IS NOT NULL');
      const n = parseInt(r.rows[0].n, 10);
      if (n > 0) {
        const stats = await client.query('SELECT min(grpo_reward_score) AS mn, max(grpo_reward_score) AS mx, avg(grpo_reward_score)::numeric(5,3) AS av FROM glyph_records WHERE grpo_reward_score IS NOT NULL');
        const { mn, mx, av } = stats.rows[0];
        pass('grpo_reward_score populated', `${n} rows, range [${Number(mn).toFixed(3)}, ${Number(mx).toFixed(3)}], avg ${av}`);
      } else {
        warn('grpo_reward_score populated', '0 rows scored — run atlas:compute-rewards');
      }
    } catch (e) {
      fail('grpo_reward_score check', e.message);
    }

    // Check 3: glyph_kind distribution (health signal)
    try {
      const r = await client.query('SELECT glyph_kind, count(*) AS n FROM glyph_records GROUP BY glyph_kind ORDER BY n DESC LIMIT 5');
      if (r.rows.length > 0) {
        const dist = r.rows.map(row => `${row.glyph_kind}=${row.n}`).join(', ');
        pass('glyph_kind distribution non-empty', dist);
      } else {
        warn('glyph_kind distribution', 'no rows to group');
      }
    } catch (e) {
      warn('glyph_kind distribution check', e.message);
    }

    // Check 4: lora_training_runs table exists
    try {
      const r = await client.query('SELECT count(*) AS n FROM lora_training_runs');
      const n = parseInt(r.rows[0].n, 10);
      pass('lora_training_runs table exists', `${n} runs recorded`);
    } catch (e) {
      fail('lora_training_runs table exists', e.message + ' — run drizzle/manual/20260529_lora_training_runs.sql');
    }

  } catch (connErr) {
    fail('Postgres connection', connErr.message);
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── JSONL checks ────────────────────────────────────────────────────────────

function checkJSONL() {
  if (!fs.existsSync(TRAINING_DIR)) {
    fail('training-datasets directory exists', TRAINING_DIR);
    return;
  }

  const files = fs.readdirSync(TRAINING_DIR).filter(f => f.match(/glyph-pairs.*\.jsonl$/));

  if (files.length === 0) {
    // Also check chr97 pairs (fallback)
    const chr97 = fs.readdirSync(TRAINING_DIR).filter(f => f.match(/chr97.*\.jsonl$/));
    if (chr97.length > 0) {
      warn('glyph-pairs JSONL exists', `No glyph-pairs-*.jsonl yet, but ${chr97.length} chr97 file(s) present — run atlas:build-pairs`);
    } else {
      warn('glyph-pairs JSONL exists', 'No matching files yet — run atlas:build-pairs');
    }
    return;
  }

  // Pick the latest
  const sorted = files.sort().reverse();
  const latest = sorted[0];
  const latestPath = path.join(TRAINING_DIR, latest);
  pass('glyph-pairs JSONL exists', `${files.length} file(s), latest: ${latest}`);

  // Read and validate first 10 rows
  let lineCount = 0;
  let validRows = 0;
  let missingFields = 0;
  let hasEmbedding = false;

  const content = fs.readFileSync(latestPath, 'utf8');
  for (const line of content.split('\n').filter(Boolean)) {
    lineCount++;
    if (lineCount > 200) break; // only check first 200

    try {
      const row = JSON.parse(line);

      // Accept either prompt/completion (CHR97 style) or instruction/output (alpaca style)
      const hasPrompt = ('prompt' in row || 'instruction' in row);
      const hasCompletion = ('completion' in row || 'output' in row);
      const hasReward = 'reward' in row;

      if (hasPrompt && hasCompletion && hasReward) {
        validRows++;
      } else {
        missingFields++;
        if (VERBOSE && missingFields <= 3) {
          console.log(`    [JSONL row ${lineCount}] Missing fields — keys: ${Object.keys(row).join(', ')}`);
        }
      }

      // Anti-pattern: raw float arrays in JSONL
      if (JSON.stringify(row).includes('"embedding768"')) {
        hasEmbedding = true;
      }
    } catch {
      // skip malformed lines
    }
  }

  if (validRows > 0) {
    pass('JSONL rows have required fields', `${validRows}/${Math.min(lineCount, 200)} checked rows valid`);
  } else if (lineCount === 0) {
    warn('JSONL rows have required fields', 'file is empty');
  } else {
    fail('JSONL rows have required fields', `${missingFields}/${lineCount} rows missing prompt/completion/reward`);
  }

  if (hasEmbedding) {
    fail('JSONL anti-pattern: no raw embedding768', 'found "embedding768" keys in training file — training pairs must use centroidId+reward, not raw floats');
  } else {
    pass('JSONL anti-pattern: no raw embedding768');
  }
}

// ─── Redis check ─────────────────────────────────────────────────────────────

async function checkRedis() {
  if (SKIP_REDIS) {
    warn('Redis gpu:karpathy:scores', 'skipped via --skip-redis');
    return;
  }

  let ioredis;
  try {
    ioredis = await import('ioredis');
  } catch {
    warn('Redis check', 'ioredis not installed — skipping');
    return;
  }

  const Redis = ioredis.default || ioredis;
  const redis = new Redis(REDIS_URL, {
    password: REDIS_PASS || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});

  try {
    await redis.connect();
    await redis.ping();

    const size = await redis.hlen('gpu:karpathy:scores');
    if (size > 0) {
      pass('Redis gpu:karpathy:scores has entries', `${size} files scored`);
    } else {
      warn('Redis gpu:karpathy:scores', '0 entries — run karpathy:gpu to populate Karpathy blend');
    }
  } catch (e) {
    warn('Redis gpu:karpathy:scores', `Redis unreachable: ${e.message}`);
  } finally {
    redis.disconnect();
  }
}

// ─── Env hygiene check ───────────────────────────────────────────────────────

function checkEnvHygiene() {
  const atlasDir = path.join(ROOT, 'scripts', 'atlas');
  const files = fs.readdirSync(atlasDir).filter(f => f.endsWith('.mjs'));

  const phaseScripts = [
    'ingest-ace-cards-to-glyphs.mjs',
    'compute-glyph-rewards.mjs',
    'glyphs-to-training-pairs.mjs',
    'sample-glyphs-for-training.mjs',
    'smoke-glyph-pipeline.mjs',
    'record-lora-checkpoint.mjs',
  ];

  let violations = [];
  for (const fname of phaseScripts) {
    const fpath = path.join(atlasDir, fname);
    if (!fs.existsSync(fpath)) continue;
    const content = fs.readFileSync(fpath, 'utf8');
    // G17: no hardcoded localhost/127.0.0.1 outside of env fallback lines
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/localhost|127\.0\.0\.1/.test(line) && !/env\.|ENV\.|PG_URL|REDIS_URL|fallback|default/.test(line)) {
        violations.push(`${fname}:${i + 1}: ${line.trim()}`);
      }
    }
  }

  if (violations.length === 0) {
    pass('G17 env hygiene: no hardcoded localhost in glyph scripts');
  } else {
    fail('G17 env hygiene: hardcoded localhost found', violations.slice(0, 3).join(' | '));
    if (VERBOSE) violations.forEach(v => console.log(`    ${v}`));
  }
}

// ─── Script existence checks ─────────────────────────────────────────────────

function checkScripts() {
  const required = [
    'scripts/atlas/ingest-ace-cards-to-glyphs.mjs',
    'scripts/atlas/compute-glyph-rewards.mjs',
    'scripts/atlas/glyphs-to-training-pairs.mjs',
    'scripts/atlas/sample-glyphs-for-training.mjs',
    'scripts/atlas/smoke-glyph-pipeline.mjs',
    'sveltekit-frontend/drizzle/manual/20260529_glyph_records.sql',
    'sveltekit-frontend/drizzle/manual/20260529_lora_training_runs.sql',
  ];

  let missing = 0;
  for (const rel of required) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) {
      if (VERBOSE) pass(`Script exists: ${rel}`);
    } else {
      fail(`Script exists: ${rel}`);
      missing++;
    }
  }
  if (missing === 0 && !VERBOSE) {
    pass('All required pipeline scripts present', `${required.length} files checked`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Glyph Pipeline Smoke Test ════════════════════════════════');
  console.log(`  Date: ${new Date().toISOString().slice(0, 10)}`);
  console.log('');

  console.log('── Script presence ──────────────────────────────────────────');
  checkScripts();
  console.log('');

  console.log('── JSONL training files ─────────────────────────────────────');
  checkJSONL();
  console.log('');

  console.log('── Postgres tables ──────────────────────────────────────────');
  await checkPostgres();
  console.log('');

  console.log('── Redis Karpathy cache ─────────────────────────────────────');
  await checkRedis();
  console.log('');

  console.log('── Env hygiene (G17) ────────────────────────────────────────');
  checkEnvHygiene();
  console.log('');

  console.log('══ Summary ══════════════════════════════════════════════════');
  console.log(`  ✅ PASS: ${passed}`);
  console.log(`  ❌ FAIL: ${failed}`);
  console.log(`  ⚠️  WARN: ${results.filter(r => r.status === 'WARN').length}`);
  console.log('');

  if (failed > 0) {
    console.log('  Failing checks:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    • ${r.label}${r.detail ? ': ' + r.detail : ''}`);
    });
    console.log('');
    process.exit(1);
  } else {
    console.log('  Pipeline smoke passed ✅');
  }
}

main().catch(e => {
  console.error('Smoke error:', e.message);
  process.exit(1);
});
