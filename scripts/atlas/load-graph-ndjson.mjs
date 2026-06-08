#!/usr/bin/env node
/**
 * load-graph-ndjson.mjs
 *
 * Loads NDJSON graph files into Postgres flat tables + code_relations_v1:
 *   db-usage-edges.ndjson    → db_usage_calls   + code_relations_v1 (DB_CALL)
 *   calls-edges-*.ndjson     → calls_edges      + code_relations_v1 (CALLS)
 *   tool-usage-edges.ndjson  → tool_usage_calls + code_relations_v1 (TOOL_CALL)
 *   cache-usage-edges.ndjson → cache_usage_calls+ code_relations_v1 (CACHE_READ/WRITE)
 *
 * Usage:
 *   node scripts/atlas/load-graph-ndjson.mjs --dry-run
 *   node scripts/atlas/load-graph-ndjson.mjs --apply
 *   node scripts/atlas/load-graph-ndjson.mjs --apply --only=db
 *   node scripts/atlas/load-graph-ndjson.mjs --apply --only=calls
 *   node scripts/atlas/load-graph-ndjson.mjs --apply --only=tool
 *   node scripts/atlas/load-graph-ndjson.mjs --apply --only=cache
 *   node scripts/atlas/load-graph-ndjson.mjs --apply --only=relations  (sync only)
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
const DB_USAGE_FILE    = path.join(OUT, 'db-usage-edges.ndjson');
const TOOL_USAGE_FILE  = path.join(OUT, 'tool-usage-edges.ndjson');
const CACHE_USAGE_FILE = path.join(OUT, 'cache-usage-edges.ndjson');

// Find latest calls-edges file
const CALLS_FILE = (() => {
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('calls-edges')).sort().reverse();
  return files.length ? path.join(OUT, files[0]) : null;
})();

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

// ── DDL guards ────────────────────────────────────────────────────────────────

async function ensureTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_edges (
      id        bigserial PRIMARY KEY,
      src       text NOT NULL,
      dst       text NOT NULL,
      edge_type text NOT NULL DEFAULT 'CALLS',
      src_kind  text,
      weight    real NOT NULL DEFAULT 1.0,
      line_num  integer,
      UNIQUE (src, dst, edge_type)
    );
    CREATE TABLE IF NOT EXISTS tool_usage_calls (
      id          bigserial PRIMARY KEY,
      source_file text NOT NULL,
      caller      text,
      tool        text NOT NULL,
      endpoint    text,
      call_type   text,
      line_num    integer
    );
    CREATE TABLE IF NOT EXISTS cache_usage_calls (
      id          bigserial PRIMARY KEY,
      source_file text NOT NULL,
      cache_type  text NOT NULL,
      operation   text NOT NULL,
      endpoint    text,
      line_num    integer
    );
  `);
}

// ── Batch upsert into code_relations_v1 ───────────────────────────────────────

async function upsertRelations(pool, rows) {
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
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (source_file, target_file, relation_type, source_kind)
            WHERE target_file IS NOT NULL
          DO UPDATE SET
            weight      = GREATEST(code_relations_v1.weight, EXCLUDED.weight),
            last_seen_at = now(),
            metadata    = code_relations_v1.metadata || EXCLUDED.metadata
        `, [
          r.source_file, r.target_file,
          r.source_symbol ?? null, r.target_symbol ?? null,
          r.relation_type, r.source_kind,
          r.weight ?? 1.0,
          JSON.stringify(r.metadata ?? {}),
        ]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('  relations ROLLBACK batch', i, err.message);
    } finally { client.release(); }
  }
}

// ── Loaders ───────────────────────────────────────────────────────────────────

async function loadDbUsage(pool) {
  console.log('\n── db_usage_calls ───────────────────────────────────────────');
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
        await client.query(
          `INSERT INTO db_usage_calls (source_file, caller, table_name, operation, call_type, line_num)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [r.source_file, r.caller, r.table_name, r.operation, r.call_type, r.line_num]);
      }
      await client.query('COMMIT');
      applied += batch.length;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('  ROLLBACK', i, err.message);
    } finally { client.release(); }
  }
  console.log(`  Inserted: ${applied}`);

  // Sync into code_relations_v1
  const relRows = rows.map(r => ({
    source_file:   r.source_file,
    target_file:   `db:${r.table_name}`,
    source_symbol: r.caller,
    target_symbol: r.operation,
    relation_type: 'DB_CALL',
    source_kind:   r.call_type ?? 'drizzle',
    weight:        1.0,
    metadata:      { line_num: r.line_num, operation: r.operation },
  }));
  await upsertRelations(pool, relRows);
  console.log(`  Synced ${relRows.length} → code_relations_v1 (DB_CALL)`);
  return applied;
}

async function loadToolUsage(pool) {
  console.log('\n── tool_usage_calls ─────────────────────────────────────────');
  const rows = [];
  for await (const e of readNdjson(TOOL_USAGE_FILE)) {
    rows.push({
      source_file: normPath(e.source_file ?? ''),
      caller:      e.caller ?? null,
      tool:        e.tool ?? e.endpoint ?? 'unknown',
      endpoint:    e.endpoint ?? null,
      call_type:   e.type ?? null,
      line_num:    e.line_num ?? null,
    });
  }
  console.log(`  Read: ${rows.length} rows`);
  if (!APPLY) {
    for (const r of rows.slice(0, 3)) console.log(`  ${r.source_file} → ${r.tool}`);
    return rows.length;
  }

  await pool.query('TRUNCATE tool_usage_calls');
  let applied = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of batch) {
        await client.query(
          `INSERT INTO tool_usage_calls (source_file, caller, tool, endpoint, call_type, line_num)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [r.source_file, r.caller, r.tool, r.endpoint, r.call_type, r.line_num]);
      }
      await client.query('COMMIT');
      applied += batch.length;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('  ROLLBACK', i, err.message);
    } finally { client.release(); }
  }
  console.log(`  Inserted: ${applied}`);

  const relRows = rows.map(r => ({
    source_file:   r.source_file,
    target_file:   r.endpoint ?? `tool:${r.tool}`,
    source_symbol: r.caller,
    target_symbol: r.tool,
    relation_type: 'TOOL_CALL',
    source_kind:   r.call_type ?? 'api_route',
    weight:        1.0,
    metadata:      { line_num: r.line_num, endpoint: r.endpoint },
  }));
  await upsertRelations(pool, relRows);
  console.log(`  Synced ${relRows.length} → code_relations_v1 (TOOL_CALL)`);
  return applied;
}

async function loadCacheUsage(pool) {
  console.log('\n── cache_usage_calls ────────────────────────────────────────');
  const rows = [];
  for await (const e of readNdjson(CACHE_USAGE_FILE)) {
    rows.push({
      source_file: normPath(e.source_file ?? ''),
      cache_type:  e.cache_type ?? 'unknown',
      operation:   e.operation ?? 'unknown',
      endpoint:    e.endpoint ?? null,
      line_num:    e.line_num ?? null,
    });
  }
  console.log(`  Read: ${rows.length} rows`);
  if (!APPLY) {
    for (const r of rows.slice(0, 3)) console.log(`  ${r.source_file} → ${r.cache_type} (${r.operation})`);
    return rows.length;
  }

  await pool.query('TRUNCATE cache_usage_calls');
  let applied = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of batch) {
        await client.query(
          `INSERT INTO cache_usage_calls (source_file, cache_type, operation, endpoint, line_num)
           VALUES ($1,$2,$3,$4,$5)`,
          [r.source_file, r.cache_type, r.operation, r.endpoint, r.line_num]);
      }
      await client.query('COMMIT');
      applied += batch.length;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('  ROLLBACK', i, err.message);
    } finally { client.release(); }
  }
  console.log(`  Inserted: ${applied}`);

  const relType = (op) => op === 'write' ? 'CACHE_WRITE' : 'CACHE_READ';
  const relRows = rows.map(r => ({
    source_file:   r.source_file,
    target_file:   r.endpoint ?? `cache:${r.cache_type}`,
    source_symbol: null,
    target_symbol: r.cache_type,
    relation_type: relType(r.operation),
    source_kind:   'cache_op',
    weight:        1.0,
    metadata:      { line_num: r.line_num, operation: r.operation },
  }));
  await upsertRelations(pool, relRows);
  console.log(`  Synced ${relRows.length} → code_relations_v1 (CACHE_READ/WRITE)`);
  return applied;
}

async function loadCallsEdges(pool) {
  if (!CALLS_FILE) { console.log('\n── calls_edges: no file found, skipping'); return 0; }
  console.log(`\n── calls_edges (${path.basename(CALLS_FILE)}) ──────────────────`);

  const dedup = new Map();
  let total = 0, noise = 0;
  for await (const e of readNdjson(CALLS_FILE)) {
    total++;
    const callee = e.callee ?? '';
    if (isCallsNoise(callee)) { noise++; continue; }
    const src = normPath(e.source_file ?? '');
    const key = `${src}|${callee}`;
    if (!dedup.has(key)) {
      dedup.set(key, { src, dst: callee, src_kind: e.kind ?? e.type ?? 'function_call', line_num: e.line_num ?? null, weight: 1.0 });
    } else {
      dedup.get(key).weight += 0.1;
    }
  }
  const rows = [...dedup.values()];
  console.log(`  Total: ${total}  Noise: ${noise}  Unique: ${rows.length}`);
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
            SET weight   = calls_edges.weight + 0.1,
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

  // Sync signal edges into code_relations_v1 (cap at 50k to avoid bloat)
  const relRows = rows.slice(0, 50_000)
    .filter(r => r.src && r.dst && r.src !== r.dst)
    .map(r => ({
      source_file:   r.src,
      target_file:   null,   // callee is a symbol, not a file
      source_symbol: null,
      target_symbol: r.dst,
      relation_type: 'CALLS',
      source_kind:   r.src_kind,
      weight:        r.weight,
      metadata:      { line_num: r.line_num },
    }));
  // CALLS with no target_file use a separate upsert (no unique constraint applies)
  for (let i = 0; i < relRows.length; i += BATCH) {
    const batch = relRows.slice(i, i + BATCH);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of batch) {
        await client.query(`
          INSERT INTO code_relations_v1
            (source_file, target_file, source_symbol, target_symbol,
             relation_type, source_kind, weight, metadata)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT DO NOTHING
        `, [
          r.source_file, r.target_file,
          r.source_symbol, r.target_symbol,
          r.relation_type, r.source_kind,
          r.weight, JSON.stringify(r.metadata),
        ]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
    } finally { client.release(); }
  }
  console.log(`  Synced ${relRows.length} → code_relations_v1 (CALLS)`);
  return applied;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('══ Load Graph NDJSON → Postgres ═════════════════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}  Only: ${ONLY}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

  if (APPLY) await ensureTables(pool);

  if (ONLY === 'all' || ONLY === 'db')        await loadDbUsage(pool);
  if (ONLY === 'all' || ONLY === 'tool')      await loadToolUsage(pool);
  if (ONLY === 'all' || ONLY === 'cache')     await loadCacheUsage(pool);
  if (ONLY === 'all' || ONLY === 'calls')     await loadCallsEdges(pool);

  if (APPLY) {
    const { rows } = await pool.query(`
      SELECT tbl, cnt FROM (
        SELECT 'db_usage_calls'    AS tbl, COUNT(*) AS cnt FROM db_usage_calls    UNION ALL
        SELECT 'tool_usage_calls'  AS tbl, COUNT(*) AS cnt FROM tool_usage_calls  UNION ALL
        SELECT 'cache_usage_calls' AS tbl, COUNT(*) AS cnt FROM cache_usage_calls UNION ALL
        SELECT 'calls_edges'       AS tbl, COUNT(*) AS cnt FROM calls_edges       UNION ALL
        SELECT 'code_relations_v1' AS tbl, COUNT(*) AS cnt FROM code_relations_v1
      ) t ORDER BY tbl
    `);
    console.log('\n  Final counts:');
    for (const r of rows) console.log(`    ${r.tbl}: ${r.cnt}`);

    // Provenance join: which source files have both DB usage AND live packets?
    const { rows: prov } = await pool.query(`
      SELECT
        d.source_file,
        d.table_name,
        d.operation,
        COUNT(DISTINCT rp.id)        AS packet_hits,
        ROUND(AVG(rw.prior_reward)::numeric, 3) AS avg_reward
      FROM db_usage_calls d
      JOIN route_runtime_packets rp
        ON rp.source_refs::text ILIKE '%' || d.source_file || '%'
      LEFT JOIN route_packet_rewards rw ON rw.packet_uuid = rp.packet_uuid
      GROUP BY d.source_file, d.table_name, d.operation
      ORDER BY packet_hits DESC
      LIMIT 8
    `);
    if (prov.length) {
      console.log('\n  Provenance joins (db_usage ↔ packets):');
      for (const r of prov) {
        console.log(`    ${r.source_file} → ${r.table_name}.${r.operation}  hits=${r.packet_hits} avg_reward=${r.avg_reward ?? 'null'}`);
      }
    } else {
      console.log('\n  No provenance joins yet (route_runtime_packets source_refs not matching db_usage paths).');
    }
  }

  await pool.end();
  console.log('\n  Done.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
