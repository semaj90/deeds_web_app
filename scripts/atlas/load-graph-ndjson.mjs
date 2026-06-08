#!/usr/bin/env node
/**
 * load-graph-ndjson.mjs — canonical NDJSON → code_relations_v1 importer
 *
 * One importer, four edge types. All rows land with target_file = null.
 * Upsert key: (source_file, COALESCE(source_symbol,''), COALESCE(target_symbol,''), relation_type)
 * where target_file IS NULL  →  idx_code_relations_symbol_upsert
 *
 * Mapping:
 *   calls-edges-*.ndjson    callee        → CALLS    target_symbol=callee
 *   db-usage-edges.ndjson   table         → USES_DB   target_symbol=table  metadata.operation
 *   tool-usage-edges.ndjson endpoint/tool → USES_TOOL target_symbol=endpoint
 *   cache-usage-edges.ndjson endpoint     → USES_CACHE target_symbol=endpoint  metadata.cache_type
 *
 * Usage:
 *   node scripts/atlas/load-graph-ndjson.mjs --dry-run
 *   node scripts/atlas/load-graph-ndjson.mjs --apply
 *   node scripts/atlas/load-graph-ndjson.mjs --apply --only=db|tool|cache|calls
 */

import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');
const ONLY  = process.argv.find(a => a.startsWith('--only='))?.split('=')[1] ?? 'all';
const BATCH = 500;

const OUT = path.join(ROOT, 'scripts/atlas/out');

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

function normPath(p) {
  return (p ?? '')
    .replace(/\\/g, '/')
    .replace(/^[A-Z]:\/.*?deeds-web-app\//, '')
    .replace(/^.*deeds-web-app\//, '');
}

// ── calls_edges noise filter ──────────────────────────────────────────────────

const NOISE_PREFIXES = [
  '$state','$derived','$effect','$props','$bindable',
  'console.','JSON.','Object.','Array.','Promise.','Math.',
  'String.','Number.','Date.',
  'response.','res.','req.','err.','error.','event.',
  'this.','super.','ctx.','db.','sql.','pool.','client.',
];
const NOISE_EXACT = new Set([
  'require','import','export','await','yield','new',
  'then','catch','finally','resolve','reject',
  'push','pop','shift','map','filter','reduce','find','forEach',
  'some','every','includes','join','slice','splice','sort','concat',
  'trim','split','replace','match','test','exec',
  'toString','valueOf','toJSON','toISOString',
  'get','set','has','delete','clear',
  'on','off','emit','once','subscribe','unsubscribe',
]);
const STDLIB_DOT = /\.(json|log|error|warn|then|catch|from|of|is|assign|create|freeze|entries|keys|values|push|pop|map|filter|reduce|find|some|every|join|split|slice|trim|replace|toString|toISOString)\b/;

function isCallsNoise(callee) {
  if (!callee || callee.length <= 2) return true;
  if (/^\d/.test(callee)) return true;
  if (NOISE_EXACT.has(callee)) return true;
  if (NOISE_PREFIXES.some(p => callee.startsWith(p))) return true;
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{2,}/.test(callee)) return true;
  if (STDLIB_DOT.test(callee)) return true;
  return false;
}

// ── Stream NDJSON ─────────────────────────────────────────────────────────────

async function* readNdjson(file) {
  const rl = createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { yield JSON.parse(line); } catch { /* skip */ }
  }
}

// ── Canonical upsert into code_relations_v1 ───────────────────────────────────
// All rows have target_file = null. Uses idx_code_relations_symbol_upsert.

async function upsertRelations(pool, rows) {
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of batch) {
        await client.query(`
          INSERT INTO code_relations_v1
            (source_file, target_file, source_symbol, target_symbol,
             relation_type, source_kind, weight, metadata)
          VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (source_file, COALESCE(source_symbol,''), COALESCE(target_symbol,''), relation_type)
            WHERE target_file IS NULL
          DO UPDATE SET
            weight       = GREATEST(code_relations_v1.weight, EXCLUDED.weight),
            last_seen_at = now(),
            metadata     = code_relations_v1.metadata || EXCLUDED.metadata
        `, [
          r.source_file,
          r.source_symbol ?? null,
          r.target_symbol ?? null,
          r.relation_type,
          r.source_kind,
          r.weight ?? 1.0,
          JSON.stringify(r.metadata ?? {}),
        ]);
        upserted++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('  upsert ROLLBACK batch', i, err.message);
    } finally { client.release(); }
  }
  return upserted;
}

// ── Loaders ───────────────────────────────────────────────────────────────────

async function loadDbUsage(pool) {
  const file = path.join(OUT, 'db-usage-edges.ndjson');
  console.log('\n── USES_DB (db-usage-edges.ndjson) ──────────────────────────');
  if (!fs.existsSync(file)) { console.log('  File not found, skipping'); return 0; }

  const rows = [];
  for await (const e of readNdjson(file)) {
    const src = normPath(e.source_file ?? '');
    if (!src || !e.table) continue;
    rows.push({
      source_file:   src,
      source_symbol: e.caller ?? null,
      target_symbol: e.table,
      relation_type: 'USES_DB',
      source_kind:   e.type ?? 'drizzle',
      weight:        1.0,
      metadata:      { operation: e.operation ?? 'unknown', line_num: e.line_num ?? null },
    });
  }
  console.log(`  Read: ${rows.length}`);
  if (!APPLY) {
    rows.slice(0, 3).forEach(r => console.log(`  ${r.source_file} → ${r.target_symbol} (${r.metadata.operation})`));
    return rows.length;
  }
  const n = await upsertRelations(pool, rows);
  console.log(`  Upserted: ${n} → code_relations_v1 (USES_DB)`);
  return n;
}

async function loadToolUsage(pool) {
  const file = path.join(OUT, 'tool-usage-edges.ndjson');
  console.log('\n── USES_TOOL (tool-usage-edges.ndjson) ──────────────────────');
  if (!fs.existsSync(file)) { console.log('  File not found, skipping'); return 0; }

  const rows = [];
  for await (const e of readNdjson(file)) {
    const src = normPath(e.source_file ?? '');
    const target = e.endpoint ?? e.tool ?? null;
    if (!src || !target) continue;
    rows.push({
      source_file:   src,
      source_symbol: e.caller ?? null,
      target_symbol: target,
      relation_type: 'USES_TOOL',
      source_kind:   e.type ?? 'api_route',
      weight:        1.0,
      metadata:      { tool: e.tool ?? null, line_num: e.line_num ?? null },
    });
  }
  console.log(`  Read: ${rows.length}`);
  if (!APPLY) {
    rows.slice(0, 3).forEach(r => console.log(`  ${r.source_file} → ${r.target_symbol}`));
    return rows.length;
  }
  const n = await upsertRelations(pool, rows);
  console.log(`  Upserted: ${n} → code_relations_v1 (USES_TOOL)`);
  return n;
}

async function loadCacheUsage(pool) {
  const file = path.join(OUT, 'cache-usage-edges.ndjson');
  console.log('\n── USES_CACHE (cache-usage-edges.ndjson) ─────────────────────');
  if (!fs.existsSync(file)) { console.log('  File not found, skipping'); return 0; }

  const rows = [];
  for await (const e of readNdjson(file)) {
    const src = normPath(e.source_file ?? '');
    const target = e.endpoint ?? null;
    if (!src || !target) continue;
    rows.push({
      source_file:   src,
      source_symbol: null,
      target_symbol: target,
      relation_type: 'USES_CACHE',
      source_kind:   'cache_op',
      weight:        1.0,
      metadata:      { cache_type: e.cache_type ?? 'unknown', operation: e.operation ?? 'unknown', line_num: e.line_num ?? null },
    });
  }
  console.log(`  Read: ${rows.length}`);
  if (!APPLY) {
    rows.slice(0, 3).forEach(r => console.log(`  ${r.source_file} → ${r.target_symbol} (${r.metadata.cache_type})`));
    return rows.length;
  }
  const n = await upsertRelations(pool, rows);
  console.log(`  Upserted: ${n} → code_relations_v1 (USES_CACHE)`);
  return n;
}

async function loadCallsEdges(pool) {
  const files = fs.existsSync(OUT)
    ? fs.readdirSync(OUT).filter(f => f.startsWith('calls-edges')).sort().reverse()
    : [];
  if (!files.length) { console.log('\n── CALLS: no calls-edges file found, skipping'); return 0; }
  const file = path.join(OUT, files[0]);
  console.log(`\n── CALLS (${files[0]}) ─────────────────────────────────────`);

  const dedup = new Map();
  let total = 0, noise = 0;
  for await (const e of readNdjson(file)) {
    total++;
    const callee = e.callee ?? '';
    if (isCallsNoise(callee)) { noise++; continue; }
    const src = normPath(e.source_file ?? '');
    if (!src) continue;
    const caller = e.caller && e.caller !== '(module)' ? e.caller : null;
    const key = `${src}|||${caller ?? ''}|||${callee}`;
    if (!dedup.has(key)) {
      dedup.set(key, {
        source_file:   src,
        source_symbol: caller,
        target_symbol: callee,
        relation_type: 'CALLS',
        source_kind:   e.kind ?? e.type ?? 'function_call',
        weight:        1.0,
        metadata:      { line_num: e.line_num ?? null },
      });
    } else {
      dedup.get(key).weight = Math.min(dedup.get(key).weight + 0.1, 5.0);
    }
  }
  const rows = [...dedup.values()];
  console.log(`  Total: ${total}  Noise: ${noise}  Unique: ${rows.length}`);
  if (!APPLY) {
    rows.slice(0, 3).forEach(r => console.log(`  ${r.source_file} → ${r.target_symbol}`));
    return rows.length;
  }

  const n = await upsertRelations(pool, rows);
  console.log(`  Upserted: ${n} → code_relations_v1 (CALLS)`);
  return n;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('══ import-code-relations-ndjson → code_relations_v1 ════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}  Only: ${ONLY}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

  if (ONLY === 'all' || ONLY === 'db')    await loadDbUsage(pool);
  if (ONLY === 'all' || ONLY === 'tool')  await loadToolUsage(pool);
  if (ONLY === 'all' || ONLY === 'cache') await loadCacheUsage(pool);
  if (ONLY === 'all' || ONLY === 'calls') await loadCallsEdges(pool);

  if (APPLY) {
    const { rows } = await pool.query(`
      SELECT relation_type, COUNT(*) AS cnt
      FROM code_relations_v1
      WHERE target_file IS NULL
      GROUP BY relation_type
      ORDER BY cnt DESC
    `);
    console.log('\n  code_relations_v1 (null target_file):');
    for (const r of rows) console.log(`    ${r.relation_type}: ${r.cnt}`);
  }

  await pool.end();
  console.log('\n  Done.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
