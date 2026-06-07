#!/usr/bin/env node
/**
 * ingest-calls-to-postgres.mjs
 *
 * Ingests CALLS edges from calls-edges-2026-05-29.ndjson into
 * code_relations_v1 (Postgres), skipping framework noise.
 *
 * Filters out: Svelte runes ($state, $derived...), framework internals,
 * single-letter callees, console.*, JSON.*, Object.*, Promise.*
 *
 * Usage:
 *   node scripts/atlas/ingest-calls-to-postgres.mjs --dry-run
 *   node scripts/atlas/ingest-calls-to-postgres.mjs --apply
 *   node scripts/atlas/ingest-calls-to-postgres.mjs --apply --batch=500
 */

import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');
const batchArg = process.argv.find(a => a.startsWith('--batch='));
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1]) : 500;

const INPUT = path.join(ROOT, 'scripts/atlas/out/calls-edges-2026-05-29.ndjson');

function loadEnv() {
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}
loadEnv();

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

// ── Noise filter ─────────────────────────────────────────────────────────────

const FRAMEWORK_PREFIXES = [
  '$state', '$derived', '$effect', '$props', '$bindable', '$inspect',
  'console.', 'JSON.', 'Object.', 'Array.', 'Promise.', 'Math.',
  'String.', 'Number.', 'Boolean.', 'Symbol.', 'Date.',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'fetch', 'structuredClone', 'crypto.',
  'response.', 'res.', 'req.', 'err.', 'error.', 'event.',
  'this.', 'super.', 'e.', 'ctx.', 'db.', 'sql.',
  'drizzle.', 'pool.', 'client.',
];

const FRAMEWORK_EXACT = new Set([
  'require', 'import', 'export', 'new', 'await', 'yield',
  'then', 'catch', 'finally', 'resolve', 'reject',
  'push', 'pop', 'shift', 'unshift', 'map', 'filter', 'reduce',
  'find', 'findIndex', 'forEach', 'some', 'every', 'includes',
  'join', 'slice', 'splice', 'sort', 'reverse', 'concat', 'flat',
  'entries', 'keys', 'values', 'get', 'set', 'has', 'delete', 'clear',
  'trim', 'split', 'replace', 'match', 'test', 'exec',
  'toString', 'valueOf', 'toJSON', 'toISOString',
  'on', 'off', 'emit', 'once', 'subscribe', 'unsubscribe',
]);

function isNoise(callee) {
  if (!callee || callee.length <= 2) return true;
  if (/^\d/.test(callee)) return true;
  if (/^[A-Z]{1,3}$/.test(callee)) return true; // single/double uppercase abbrev
  if (FRAMEWORK_EXACT.has(callee)) return true;
  if (FRAMEWORK_PREFIXES.some(p => callee.startsWith(p))) return true;
  // Must look like a user-defined identifier: starts with lower/upper, contains letter+digit mix
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{2,}/.test(callee)) return true;
  // Dot-chained calls with common stdlib roots
  if (/\.(json|log|error|warn|info|debug|then|catch|finally|from|of|is|assign|create|freeze|entries|keys|values|get|set|has|delete|push|pop|map|filter|reduce|find|some|every|join|split|slice|trim|replace|match|test|exec|toString|toISOString)\b/.test(callee)) return true;
  return false;
}

function normalizePath(p) {
  return p
    .replace(/\\/g, '/')
    .replace(/^.*deeds-web-app\//, '')
    .replace(/^.*deeds-web-app\\/, '');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Ingest CALLS → code_relations_v1 ═════════════════════════');
  console.log(`  Input:      ${INPUT}`);
  console.log(`  Mode:       ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);

  // Stream NDJSON and filter
  const rl = createInterface({ input: fs.createReadStream(INPUT) });
  const edges = [];
  let total = 0, skipped = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;
    try {
      const e = JSON.parse(line);
      if (isNoise(e.callee)) { skipped++; continue; }
      edges.push({
        source_file:   normalizePath(e.source_file ?? ''),
        target_symbol: e.callee ?? '',
        source_symbol: e.caller ?? '(module)',
        relation_type: 'CALLS',
        source_kind:   e.kind ?? e.type ?? 'function_call',
        weight:        1.0,
        line_num:      e.line_num ?? null,
      });
    } catch { skipped++; }
  }

  console.log(`\n  Total lines:  ${total}`);
  console.log(`  Filtered out: ${skipped} (framework noise)`);
  console.log(`  To ingest:    ${edges.length}`);

  if (!APPLY) {
    // Sample
    for (const e of edges.slice(0, 5)) {
      console.log(`  ${e.source_file} → ${e.target_symbol}`);
    }
    console.log('\n  [dry-run] Pass --apply to write.');
    return;
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Truncate existing CALLS rows to avoid duplicates on re-run
  await pool.query(`DELETE FROM code_relations_v1 WHERE relation_type = 'CALLS'`);
  console.log('\n  Cleared old CALLS rows.');

  let applied = 0;
  for (let i = 0; i < edges.length; i += BATCH_SIZE) {
    const batch = edges.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const e of batch) {
        await client.query(`
          INSERT INTO code_relations_v1
            (id, source_file, target_file, source_symbol, target_symbol,
             relation_type, source_kind, weight, metadata, discovered_at, last_seen_at)
          VALUES (
            gen_random_uuid(),
            $1, $1, $2, $3,
            'CALLS', $4, $5,
            jsonb_build_object('line_num', $6::int),
            now(), now()
          )
          ON CONFLICT DO NOTHING
        `, [
          e.source_file, e.source_symbol, e.target_symbol,
          e.source_kind, e.weight, e.line_num,
        ]);
      }
      await client.query('COMMIT');
      applied += batch.length;
      process.stdout.write(`\r  Applied: ${applied}/${edges.length}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('\n  ROLLBACK', i, err.message);
    } finally {
      client.release();
    }
  }

  const { rows } = await pool.query(`
    SELECT relation_type, COUNT(*) AS cnt
    FROM code_relations_v1 GROUP BY relation_type ORDER BY cnt DESC
  `);
  console.log('\n\n  code_relations_v1 summary:');
  for (const r of rows) console.log(`    ${r.relation_type}: ${r.cnt}`);

  await pool.end();
  console.log('\n  Done.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
