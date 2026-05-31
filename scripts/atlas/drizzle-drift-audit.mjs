#!/usr/bin/env node
/**
 * drizzle-drift-audit.mjs
 *
 * Read-only audit: compare Drizzle TypeScript schema declarations against
 * live PostgreSQL information_schema.columns. Focused on user_id / uuid drift.
 *
 * Does NOT modify any schema. Produces a report listing every (table, column)
 * pair where the Drizzle declaration disagrees with the live DB type.
 *
 * Usage:
 *   node scripts/atlas/drizzle-drift-audit.mjs
 *   node scripts/atlas/drizzle-drift-audit.mjs --focus user_id
 *   node scripts/atlas/drizzle-drift-audit.mjs --columns user_id,uploaded_by,case_id
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
function flagVal(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}
const COLUMNS_FLAG = flagVal('--columns', 'user_id,uploaded_by');
const TARGET_COLUMNS = COLUMNS_FLAG.split(',').map((c) => c.trim());

const REPORT_PATH = path.join(ROOT, 'memory', 'exports', 'drizzle-drift-audit.json');

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

// ─── 1. Find all Drizzle schema files ────────────────────────────────

function findSchemaFiles() {
  const dirs = [
    path.join(ROOT, 'sveltekit-frontend', 'src', 'lib', 'server', 'db'),
  ];
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && (ent.name.endsWith('.ts') || ent.name.endsWith('.js'))) {
        files.push(full);
      }
    }
  }
  for (const d of dirs) walk(d);
  return files;
}

// ─── 2. Extract column declarations from schema files ────────────────

const COLUMN_TYPES = ['integer', 'uuid', 'text', 'serial', 'bigint', 'varchar', 'timestamp'];

function extractDeclarationsFromFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const decls = [];

  // Match `pgTable('table_name', { ... })` blocks
  const tableRe = /pgTable\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*,\s*\{([\s\S]*?)^\}\s*[,)]/gm;
  let m;
  while ((m = tableRe.exec(src))) {
    const tableName = m[1];
    const body = m[2];

    // For each target column, look for `columnName: type('column_name'`
    for (const col of TARGET_COLUMNS) {
      const camel = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const re = new RegExp(`\\b${camel}\\s*:\\s*(${COLUMN_TYPES.join('|')})\\s*\\(\\s*['"]${col}['"]`, 'g');
      let cm;
      while ((cm = re.exec(body))) {
        decls.push({
          table: tableName,
          column: col,
          drizzleType: cm[1],
          file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
        });
      }
    }
  }
  return decls;
}

// ─── 3. Query live DB ─────────────────────────────────────────────────

async function getLiveColumns(pool) {
  const colList = TARGET_COLUMNS.map((c) => `'${c}'`).join(',');
  const { rows } = await pool.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE column_name IN (${colList})
      AND table_schema = 'public'
    ORDER BY table_name, column_name
  `);
  // Map: table.column → data_type
  const m = new Map();
  for (const r of rows) m.set(`${r.table_name}.${r.column_name}`, r.data_type);
  return m;
}

// ─── 4. Reconcile ─────────────────────────────────────────────────────

function reconcile(declarations, liveColumns) {
  const drift = [];
  const matches = [];
  const orphanDeclarations = []; // declared in Drizzle but missing from DB
  const orphanColumns = [];      // present in DB but never declared in Drizzle

  const declaredKeys = new Set();
  for (const d of declarations) {
    const key = `${d.table}.${d.column}`;
    declaredKeys.add(key);
    const liveType = liveColumns.get(key);
    if (!liveType) {
      orphanDeclarations.push({ ...d, reason: 'declared in Drizzle but column missing from DB' });
    } else if (d.drizzleType !== liveType) {
      drift.push({ ...d, liveType, conflict: `Drizzle says ${d.drizzleType}, DB has ${liveType}` });
    } else {
      matches.push({ ...d, liveType });
    }
  }

  for (const [key, liveType] of liveColumns) {
    if (!declaredKeys.has(key)) {
      const [tableName, col] = key.split('.');
      orphanColumns.push({ table: tableName, column: col, liveType, reason: 'present in DB, no Drizzle declaration' });
    }
  }

  return { drift, matches, orphanDeclarations, orphanColumns };
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Drizzle Drift Audit ════════════════════════════════════');
  console.log(`  Target columns: ${TARGET_COLUMNS.join(', ')}`);

  console.log('\n  Step 1: Scan Drizzle schema files...');
  const files = findSchemaFiles();
  console.log(`  ✅ ${files.length} schema files`);

  let allDecls = [];
  for (const f of files) {
    try {
      const decls = extractDeclarationsFromFile(f);
      allDecls = allDecls.concat(decls);
    } catch (e) {
      console.warn(`  [warn] failed to parse ${f}: ${e.message}`);
    }
  }
  console.log(`  ✅ ${allDecls.length} target-column declarations found`);

  console.log('\n  Step 2: Query live DB columns...');
  const pool = new pg.Pool(env.DATABASE_URL || env.PG_URL
    ? { connectionString: env.DATABASE_URL || env.PG_URL }
    : {
        host: env.POSTGRES_HOST || 'localhost',
        port: parseInt(env.POSTGRES_PORT || '5434', 10),
        user: env.POSTGRES_USER || 'legal_admin',
        password: env.POSTGRES_PASSWORD || 'legal_admin',
        database: env.POSTGRES_DB || 'legal_ai_db',
      });

  let liveColumns;
  try {
    liveColumns = await getLiveColumns(pool);
    console.log(`  ✅ ${liveColumns.size} live (table, column) pairs`);
  } finally {
    await pool.end();
  }

  console.log('\n  Step 3: Reconcile declarations vs live DB...');
  const { drift, matches, orphanDeclarations, orphanColumns } = reconcile(allDecls, liveColumns);

  // Distribution
  const liveTypeDistribution = {};
  for (const [, t] of liveColumns) liveTypeDistribution[t] = (liveTypeDistribution[t] || 0) + 1;

  const drizzleTypeDistribution = {};
  for (const d of allDecls) drizzleTypeDistribution[d.drizzleType] = (drizzleTypeDistribution[d.drizzleType] || 0) + 1;

  const report = {
    timestamp: new Date().toISOString(),
    targetColumns: TARGET_COLUMNS,
    counts: {
      schemaFilesScanned: files.length,
      drizzleDeclarations: allDecls.length,
      liveColumns: liveColumns.size,
      driftRows: drift.length,
      matchRows: matches.length,
      orphanDrizzleDeclarations: orphanDeclarations.length,
      orphanLiveColumns: orphanColumns.length,
    },
    distributions: {
      liveTypeDistribution,
      drizzleTypeDistribution,
    },
    drift: drift.slice(0, 100),  // truncate for readability
    orphanDeclarations: orphanDeclarations.slice(0, 50),
    orphanColumns: orphanColumns.slice(0, 100),
    fullDriftCount: drift.length,
    recommendation: drift.length === 0
      ? 'No drift detected for target columns. Schema declarations align with live DB.'
      : `${drift.length} drift rows detected. Run drizzle-kit introspect to regenerate canonical schema from live DB, then diff against schema-postgres.ts.`,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Drizzle declarations:  ${allDecls.length}`);
  console.log(`  Live columns:          ${liveColumns.size}`);
  console.log(`  Drift rows:            ${drift.length}`);
  console.log(`  Matches:               ${matches.length}`);
  console.log(`  Orphan Drizzle decls:  ${orphanDeclarations.length}`);
  console.log(`  Orphan live cols:      ${orphanColumns.length}`);
  console.log('');
  console.log('  Drizzle type breakdown:');
  for (const [t, n] of Object.entries(drizzleTypeDistribution).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(10)} ${n}`);
  }
  console.log('  Live DB type breakdown:');
  for (const [t, n] of Object.entries(liveTypeDistribution).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(10)} ${n}`);
  }
  console.log(`\n  📝 Report → ${REPORT_PATH}`);

  if (drift.length > 0) {
    console.log('\n  Top drift entries:');
    for (const d of drift.slice(0, 10)) {
      console.log(`    ${d.table}.${d.column}: Drizzle=${d.drizzleType} DB=${d.liveType} (${d.file})`);
    }
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
