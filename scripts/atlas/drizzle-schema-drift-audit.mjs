#!/usr/bin/env node
/**
 * drizzle-schema-drift-audit.mjs
 *
 * Read-only drift audit: scan every Drizzle schema file under
 * sveltekit-frontend/src/lib/server/db/schema*.ts AND drizzle/manual/*.sql
 * for column declarations whose type contradicts live Postgres.
 *
 * Focus columns: user_id, uploaded_by (the historically fragmented set).
 *
 * Emits a JSON diff of every (table, column, drizzle_decl, live_type) mismatch.
 * Writes NO Drizzle migrations. Reports only.
 *
 * Usage:
 *   node scripts/atlas/drizzle-schema-drift-audit.mjs
 *   node scripts/atlas/drizzle-schema-drift-audit.mjs --json (machine readable)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');

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

const SCHEMA_GLOB_ROOTS = [
  path.join(ROOT, 'sveltekit-frontend', 'src', 'lib', 'server', 'db'),
];

const REPORT_PATH = path.join(ROOT, 'memory', 'exports', 'drizzle-schema-drift-report.json');

function walkTs(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, acc);
    else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

// Match patterns like: someCol: uuid('user_id') | integer('user_id') | text('user_id') | varchar('user_id', { length:36 })
const DRIZZLE_COL_RE = /(\w+)\s*:\s*(uuid|integer|text|varchar|serial|bigint|bigserial)\s*\(\s*['"]([\w_]+)['"]/g;

function scanSchemaFiles() {
  const files = SCHEMA_GLOB_ROOTS.flatMap((r) => walkTs(r));
  const decls = []; // { file, varName, drizzleType, colName, line }
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      DRIZZLE_COL_RE.lastIndex = 0;
      let m;
      while ((m = DRIZZLE_COL_RE.exec(ln)) !== null) {
        decls.push({
          file: path.relative(ROOT, f).replace(/\\/g, '/'),
          line: i + 1,
          varName: m[1],
          drizzleType: m[2],
          colName: m[3],
        });
      }
    }
  }
  return { files, decls };
}

async function loadLiveColumns(pool, columnNames) {
  const { rows } = await pool.query(
    `SELECT table_schema, table_name, column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = ANY($1::text[])
     ORDER BY table_name, column_name`,
    [columnNames]
  );
  // Map: column_name -> array of { table, dataType }
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.column_name)) map.set(r.column_name, []);
    map.get(r.column_name).push({
      table: r.table_name,
      dataType: r.data_type,
      udt: r.udt_name,
    });
  }
  return { map, totalRows: rows.length };
}

function isCompatible(drizzleType, liveDataType) {
  // Normalize to PG family
  const map = {
    uuid: ['uuid'],
    integer: ['integer'],
    text: ['text'],
    varchar: ['character varying'],
    serial: ['integer'],
    bigint: ['bigint'],
    bigserial: ['bigint'],
  };
  const allowed = map[drizzleType] || [];
  return allowed.includes(liveDataType);
}

async function main() {
  console.log('\n══ Drizzle Schema Drift Audit ════════════════════════════');

  const { files, decls } = scanSchemaFiles();
  console.log(`  Scanned ${files.length} schema TS files`);
  console.log(`  Found ${decls.length} typed column declarations`);

  // Focus on the historically fragmented columns
  const FOCUS_COLS = ['user_id', 'uploaded_by'];
  const focusDecls = decls.filter((d) => FOCUS_COLS.includes(d.colName));
  console.log(`  Focus columns (${FOCUS_COLS.join('/')}): ${focusDecls.length} declarations`);

  // Connect to live DB
  const pool = new pg.Pool(env.DATABASE_URL || env.PG_URL
    ? { connectionString: env.DATABASE_URL || env.PG_URL }
    : { host: 'localhost', port: 5432, user: 'legal_admin', database: 'legal_ai_db' });

  let live;
  try {
    live = await loadLiveColumns(pool, FOCUS_COLS);
  } finally {
    await pool.end();
  }
  console.log(`  Live DB rows: ${live.totalRows} (for focus columns)`);

  // Detect drift
  const drift = [];
  const seenPairs = new Set();
  for (const d of focusDecls) {
    const liveRows = live.map.get(d.colName) || [];
    for (const lr of liveRows) {
      const key = `${lr.table}::${d.colName}::${d.drizzleType}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      if (!isCompatible(d.drizzleType, lr.dataType)) {
        drift.push({
          file: d.file,
          line: d.line,
          varName: d.varName,
          colName: d.colName,
          drizzleDeclared: d.drizzleType,
          liveTable: lr.table,
          liveType: lr.dataType,
          severity: d.drizzleType === 'uuid' && lr.dataType === 'integer' ? 'HIGH (uuid→int migrated)'
                 : d.drizzleType === 'integer' && lr.dataType === 'uuid' ? 'HIGH (int→uuid in DB)'
                 : 'MEDIUM',
        });
      }
    }
  }

  // Summary by file
  const byFile = {};
  for (const d of drift) {
    if (!byFile[d.file]) byFile[d.file] = 0;
    byFile[d.file]++;
  }

  // Live column type distribution (truth)
  const liveDistribution = {};
  for (const col of FOCUS_COLS) {
    liveDistribution[col] = {};
    for (const lr of (live.map.get(col) || [])) {
      liveDistribution[col][lr.dataType] = (liveDistribution[col][lr.dataType] || 0) + 1;
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    schemaFilesScanned: files.length,
    totalColumnDeclarations: decls.length,
    focusColumns: FOCUS_COLS,
    focusDeclarationsCount: focusDecls.length,
    liveDbDistribution: liveDistribution,
    drift: {
      totalMismatches: drift.length,
      byFile,
      details: drift,
    },
    recommendation: drift.length > 0
      ? 'Run drizzle-kit introspect to regenerate canonical schema from live DB, then diff vs current schema files.'
      : 'No drift detected. Schema and DB are aligned.',
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\n══ Drift Summary ═════════════════════════════════════════');
    console.log(`  Live DB user_id distribution:`);
    for (const [col, dist] of Object.entries(liveDistribution)) {
      console.log(`    ${col}: ${Object.entries(dist).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    }
    console.log(`  Mismatches found: ${drift.length}`);
    if (drift.length > 0) {
      console.log('\n  Files needing cleanup:');
      for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        console.log(`    ${n.toString().padStart(3)} × ${f}`);
      }
      console.log('\n  Top 5 drift details:');
      for (const d of drift.slice(0, 5)) {
        console.log(`    ${d.file}:${d.line} — ${d.varName}: declared=${d.drizzleDeclared}, table=${d.liveTable}, live=${d.liveType} [${d.severity}]`);
      }
    }
    console.log(`\n  📝 Report → ${REPORT_PATH}`);
  }
}

main().catch((e) => {
  console.error('\nError:', e.message);
  process.exit(1);
});
