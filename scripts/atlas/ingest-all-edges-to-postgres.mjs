#!/usr/bin/env node
/**
 * ingest-all-edges-to-postgres.mjs
 *
 * Loads db-usage-edges.ndjson and tool-usage-edges.ndjson into
 * code_relations_v1 as USES_DB and USES_TOOL relation types.
 *
 * Usage:
 *   node scripts/atlas/ingest-all-edges-to-postgres.mjs --dry-run
 *   node scripts/atlas/ingest-all-edges-to-postgres.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 500;

function loadEnv() {
  for (const p of [path.join(ROOT, 'sveltekit-frontend', '.env'), path.join(ROOT, '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function readNdjson(filePath) {
  const rows = [];
  const rl = createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return rows;
}

async function upsertBatch(pool, rows) {
  if (!rows.length) return;
  const values = rows.map((r, i) => {
    const base = i * 7;
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7})`;
  }).join(',');
  const params = rows.flatMap(r => [
    r.source_file, r.target_file ?? null, r.source_symbol ?? null,
    r.target_symbol ?? null, r.relation_type, r.source_kind ?? 'static',
    JSON.stringify(r.metadata ?? {}),
  ]);
  await pool.query(`
    INSERT INTO code_relations_v1
      (source_file, target_file, source_symbol, target_symbol, relation_type, source_kind, metadata)
    VALUES ${values}
    ON CONFLICT (source_file, target_file, relation_type, source_kind)
      WHERE target_file IS NOT NULL
    DO UPDATE SET
      last_seen_at = now(),
      metadata = EXCLUDED.metadata
  `, params);
}

async function ingestDbEdges(pool) {
  const file = path.join(ROOT, 'scripts/atlas/out/db-usage-edges.ndjson');
  const rows = await readNdjson(file);
  console.log(`  db-usage-edges: ${rows.length} rows`);
  if (!APPLY) return rows.length;

  const mapped = rows.map(r => ({
    source_file: r.source_file?.split('\\').join('/').replace(/^sveltekit-frontend\//, '') ?? '',
    target_file: null,
    source_symbol: r.caller ?? null,
    target_symbol: `${r.table}.${r.operation}`,
    relation_type: 'USES_DB',
    source_kind: r.type ?? 'drizzle',
    metadata: { table: r.table, operation: r.operation, line_num: r.line_num },
  })).filter(r => r.source_file);

  // Delete old USES_DB rows before re-inserting
  await pool.query(`DELETE FROM code_relations_v1 WHERE relation_type = 'USES_DB'`);
  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    await upsertBatch(pool, mapped.slice(i, i + BATCH_SIZE));
    process.stdout.write(`  USES_DB: ${Math.min(i + BATCH_SIZE, mapped.length)}/${mapped.length}\r`);
  }
  process.stdout.write('\n');
  return mapped.length;
}

async function ingestToolEdges(pool) {
  const file = path.join(ROOT, 'scripts/atlas/out/tool-usage-edges.ndjson');
  const rows = await readNdjson(file);
  console.log(`  tool-usage-edges: ${rows.length} rows`);
  if (!APPLY) return rows.length;

  const mapped = rows.map(r => ({
    source_file: r.source_file?.split('\\').join('/').replace(/^sveltekit-frontend\//, '') ?? '',
    target_file: r.target_file?.split('\\').join('/').replace(/^sveltekit-frontend\//, '') ?? null,
    source_symbol: r.source_symbol ?? null,
    target_symbol: r.target_symbol ?? null,
    relation_type: 'USES_TOOL',
    source_kind: r.source_kind ?? 'static',
    metadata: r.metadata ?? {},
  })).filter(r => r.source_file);

  await pool.query(`DELETE FROM code_relations_v1 WHERE relation_type = 'USES_TOOL'`);
  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    await upsertBatch(pool, mapped.slice(i, i + BATCH_SIZE));
    process.stdout.write(`  USES_TOOL: ${Math.min(i + BATCH_SIZE, mapped.length)}/${mapped.length}\r`);
  }
  process.stdout.write('\n');
  return mapped.length;
}

async function main() {
  console.log(`\n── Ingest All Edges → code_relations_v1 ────────────────`);
  console.log(`  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  const dbCount   = await ingestDbEdges(pool);
  const toolCount = await ingestToolEdges(pool);

  const summary = await pool.query(
    `SELECT relation_type, COUNT(*) AS n FROM code_relations_v1 GROUP BY relation_type ORDER BY n DESC`
  );
  console.log('\n── code_relations_v1 summary ───────────────────────────');
  for (const r of summary.rows) console.log(`  ${r.relation_type}: ${r.n}`);

  await pool.end();
  console.log(`\n  ✅ USES_DB: ${dbCount}  USES_TOOL: ${toolCount}`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
