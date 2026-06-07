#!/usr/bin/env node
/**
 * load-graph-ndjson.mjs
 *
 * Loads NDJSON graph files into Postgres flat tables:
 *   db-usage-edges.ndjson  → db_usage_calls
 *   calls-edges-*.ndjson   → calls_edges
 *
 * Usage:
 *   node scripts/atlas/load-graph-ndjson.mjs --dry-run
 *   node scripts/atlas/load-graph-ndjson.mjs --apply
 *   node scripts/atlas/load-graph-ndjson.mjs --apply --only=db   (db_usage_calls only)
 *   node scripts/atlas/load-graph-ndjson.mjs --apply --only=calls (calls_edges only)
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

const DB_USAGE_FILE  = path.join(ROOT, 'scripts/atlas/out/db-usage-edges.ndjson');
const CALLS_FILE     = path.join(ROOT, 'scripts/atlas/out/calls-edges-2026-05-29.ndjson');

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
    .replace(/^.*deeds-web-app\//, '')
    .replace(/^C:\/.*?deeds-web-app\//, '');
}

// ── calls_edges noise filter (same as ingest-calls-to-postgres) ───────────────

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

// ── Stream NDJSON file ────────────────────────────────────────────────────────

async function* readNdjson(file) {
  const rl = createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { yield JSON.parse(line); } catch { /* skip */ }
  }
}

// ── Loaders ───────────────────────────────────────────────────────────────────

async function loadDbUsage(pool) {
  console.log('\n── Loading db_usage_calls ───────────────────────────────────');

  const rows = [];
  for await (const e of readNdjson(DB_USAGE_FILE)) {
    rows.push({
      source_file: normPath(e.source_file ?? ''),
      caller:      e.caller ?? null,
      table_name:  e.table  ?? 'unknown',
      operation:   e.operation ?? 'unknown',
      call_type:   e.type   ?? null,
      line_num:    e.line_num ?? null,
    });
  }
  console.log(`  Read: ${rows.length} rows`);

  if (!APPLY) {
    for (const r of rows.slice(0, 3)) console.log(`  ${r.source_file} → ${r.table_name} (${r.operation})`);
    return rows.length;
  }

  await pool.query('TRUNCATE db_usage_calls');

  let applied = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of batch) {
        await client.query(`
          INSERT INTO db_usage_calls (source_file, caller, table_name, operation, call_type, line_num)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [r.source_file, r.caller, r.table_name, r.operation, r.call_type, r.line_num]);
      }
      await client.query('COMMIT');
      applied += batch.length;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('  ROLLBACK', i, err.message);
    } finally { client.release(); }
  }

  console.log(`  Inserted: ${applied} rows`);
  return applied;
}

async function loadCallsEdges(pool) {
  console.log('\n── Loading calls_edges ──────────────────────────────────────');

  // Stream + filter into deduped map: src|dst → {weight, line_num, src_kind}
  const dedup = new Map();
  let total = 0, noise = 0;

  for await (const e of readNdjson(CALLS_FILE)) {
    total++;
    const callee = e.callee ?? '';
    if (isCallsNoise(callee)) { noise++; continue; }
    const src = normPath(e.source_file ?? '');
    const key = `${src}|${callee}`;
    if (!dedup.has(key)) {
      dedup.set(key, {
        src,
        dst:      callee,
        src_kind: e.kind ?? e.type ?? 'function_call',
        line_num: e.line_num ?? null,
        weight:   1.0,
      });
    } else {
      dedup.get(key).weight += 0.1; // frequency boost
    }
  }

  const rows = [...dedup.values()];
  console.log(`  Total lines:   ${total}`);
  console.log(`  Noise filtered: ${noise}`);
  console.log(`  Unique edges:   ${rows.length}`);

  if (!APPLY) {
    for (const r of rows.slice(0, 3)) console.log(`  ${r.src} → ${r.dst}`);
    return rows.length;
  }

  await pool.query(`DELETE FROM calls_edges WHERE edge_type = 'CALLS'`);

  let applied = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of batch) {
        await client.query(`
          INSERT INTO calls_edges (src, dst, edge_type, src_kind, weight, line_num)
          VALUES ($1,$2,'CALLS',$3,$4,$5)
          ON CONFLICT (src, dst, edge_type) DO UPDATE
            SET weight = calls_edges.weight + 0.1,
                line_num = COALESCE(calls_edges.line_num, EXCLUDED.line_num)
        `, [r.src, r.dst, r.src_kind, r.weight, r.line_num]);
      }
      await client.query('COMMIT');
      applied += batch.length;
      process.stdout.write(`\r  Applied: ${applied}/${rows.length}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('\n  ROLLBACK', i, err.message);
    } finally { client.release(); }
  }
  console.log();

  return applied;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('══ Load Graph NDJSON → Postgres ═════════════════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}  Only: ${ONLY}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  let dbRows = 0, callsRows = 0;
  if (ONLY === 'all' || ONLY === 'db')    dbRows    = await loadDbUsage(pool);
  if (ONLY === 'all' || ONLY === 'calls') callsRows = await loadCallsEdges(pool);

  if (APPLY) {
    const { rows } = await pool.query(`
      SELECT 'db_usage_calls' AS tbl, COUNT(*) AS cnt FROM db_usage_calls
      UNION ALL
      SELECT 'calls_edges',          COUNT(*)          FROM calls_edges
      UNION ALL
      SELECT 'code_relations_v1',    COUNT(*)          FROM code_relations_v1
    `);
    console.log('\n  Final counts:');
    for (const r of rows) console.log(`    ${r.tbl}: ${r.cnt}`);

    // Provenance join check
    const { rows: prov } = await pool.query(`
      SELECT
        d.source_file,
        d.table_name,
        d.operation,
        COUNT(rp.id) AS packet_hits,
        COALESCE(AVG(rw.prior_reward), 0) AS avg_prior_reward
      FROM db_usage_calls d
      LEFT JOIN route_runtime_packets rp
        ON rp.source_refs::text ILIKE '%' || d.source_file || '%'
      LEFT JOIN route_packet_rewards rw ON rw.packet_uuid = rp.packet_uuid
      GROUP BY d.source_file, d.table_name, d.operation
      HAVING COUNT(rp.id) > 0
      ORDER BY packet_hits DESC
      LIMIT 5
    `);
    if (prov.length) {
      console.log('\n  Provenance joins (db_usage ↔ packets):');
      for (const r of prov) {
        console.log(`    ${r.source_file} → ${r.table_name}.${r.operation}  packets=${r.packet_hits} avg_reward=${Number(r.avg_prior_reward).toFixed(2)}`);
      }
    } else {
      console.log('\n  No provenance joins yet (needs live packet data).');
    }
  }

  await pool.end();
  console.log('\n  Done.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
