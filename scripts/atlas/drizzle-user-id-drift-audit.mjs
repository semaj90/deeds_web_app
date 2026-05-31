#!/usr/bin/env node
/**
 * drizzle-user-id-drift-audit.mjs
 *
 * Read-only audit. Compares every `user_id` / `uploaded_by` column declaration
 * in `sveltekit-frontend/src/lib/server/db/schema*.ts` and `schema/*.ts` against
 * the live Postgres `information_schema.columns` truth.
 *
 * Reports:
 *   - schema files that declare `uuid('user_id')` while DB column is `integer`
 *   - schema files that declare `integer('user_id')` while DB column is `uuid` (rare)
 *   - tables only present in DB (DB-only / sidecar)
 *   - tables only present in schema (declared but not migrated)
 *
 * Does NOT modify any file. Output:
 *   memory/exports/drizzle-user-id-drift.json
 *   memory/exports/drizzle-user-id-drift.md (human-readable)
 *
 * Usage:
 *   node scripts/atlas/drizzle-user-id-drift-audit.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

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

const SCHEMA_ROOT = path.join(ROOT, 'sveltekit-frontend', 'src', 'lib', 'server', 'db');
const JSON_REPORT = path.join(ROOT, 'memory', 'exports', 'drizzle-user-id-drift.json');
const MD_REPORT = path.join(ROOT, 'memory', 'exports', 'drizzle-user-id-drift.md');

// ─── Walk schema files ──────────────────────────────────────────────

function walkSchemaFiles() {
  const found = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith('.ts') && !ent.name.endsWith('.d.ts')) {
        found.push(full);
      }
    }
  }
  walk(SCHEMA_ROOT);
  return found;
}

// Parse `<tableName> = pgTable('<table_name>', { … });` and inside it look for
// `<col>: uuid('user_id')` / `integer('user_id')` etc.
const TABLE_RE = /(?:export\s+)?const\s+(\w+)\s*=\s*pgTable\s*\(\s*['"]([\w_]+)['"]\s*,\s*\{([\s\S]*?)\}\s*(?:,[\s\S]*?)?\)\s*;/g;
const COL_RE = /(\w+)\s*:\s*(uuid|integer|text|varchar|serial|bigserial|bigint|smallint)\s*\(\s*['"](user_id|uploaded_by)['"]\s*\)/g;

function extractDeclarations(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const decls = [];
  let m;
  TABLE_RE.lastIndex = 0;
  while ((m = TABLE_RE.exec(src))) {
    const tableName = m[2];
    const body = m[3];
    let c;
    COL_RE.lastIndex = 0;
    while ((c = COL_RE.exec(body))) {
      decls.push({
        file: path.relative(ROOT, filePath),
        table: tableName,
        column: c[3],
        declaredType: c[2],
        varName: c[1],
      });
    }
  }
  return decls;
}

// ─── DB truth ───────────────────────────────────────────────────────

async function loadDbColumns() {
  const pool = new pg.Pool(env.DATABASE_URL || env.PG_URL
    ? { connectionString: env.DATABASE_URL || env.PG_URL }
    : {
        host: env.POSTGRES_HOST || 'localhost',
        port: parseInt(env.POSTGRES_PORT || '5432', 10),
        user: env.POSTGRES_USER || 'legal_admin',
        password: env.POSTGRES_PASSWORD || 'legal_admin',
        database: env.POSTGRES_DB || 'legal_ai_db',
      });
  try {
    const { rows } = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE column_name IN ('user_id', 'uploaded_by') AND table_schema = 'public'
      ORDER BY table_name, column_name
    `);
    return rows;
  } finally {
    await pool.end();
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Drizzle user_id Drift Audit ══════════════════════════');

  // Schema declarations
  const schemaFiles = walkSchemaFiles();
  console.log(`  Schema files scanned: ${schemaFiles.length}`);

  const allDecls = [];
  for (const f of schemaFiles) {
    allDecls.push(...extractDeclarations(f));
  }
  console.log(`  Declarations found:   ${allDecls.length}`);

  // DB truth
  const dbColumns = await loadDbColumns();
  console.log(`  DB columns (user_id / uploaded_by): ${dbColumns.length}`);

  // Build maps
  const dbMap = new Map();
  for (const c of dbColumns) {
    const key = `${c.table_name}.${c.column_name}`;
    dbMap.set(key, c.data_type);
  }

  const declMap = new Map();
  for (const d of allDecls) {
    const key = `${d.table}.${d.column}`;
    if (!declMap.has(key)) declMap.set(key, []);
    declMap.get(key).push(d);
  }

  // Drift analysis
  const drifts = [];      // declared ≠ actual
  const dbOnly = [];      // in DB, not declared in Drizzle
  const declOnly = [];    // declared but not in DB

  for (const [key, dbType] of dbMap) {
    const decls = declMap.get(key);
    if (!decls) {
      dbOnly.push({ key, dbType });
      continue;
    }
    for (const d of decls) {
      const declared = d.declaredType.toLowerCase();
      const actual = dbType.toLowerCase();
      const normDecl = declared === 'serial' ? 'integer' : declared;
      const normActual = actual === 'character varying' ? 'varchar' : actual;
      if (normDecl !== normActual) {
        drifts.push({
          file: d.file,
          table: d.table,
          column: d.column,
          declaredType: declared,
          actualType: actual,
          severity: declared === 'uuid' && actual === 'integer' ? 'high' :
                    declared === 'integer' && actual === 'uuid' ? 'high' : 'low',
        });
      }
    }
  }

  for (const [key, decls] of declMap) {
    if (!dbMap.has(key)) declOnly.push({ key, declarations: decls.map((d) => d.file) });
  }

  // Aggregate
  const summary = {
    timestamp: new Date().toISOString(),
    schemaFilesScanned: schemaFiles.length,
    schemaDeclarations: allDecls.length,
    dbColumnsExamined: dbColumns.length,
    counts: {
      drifts: drifts.length,
      driftsHigh: drifts.filter((d) => d.severity === 'high').length,
      driftsLow: drifts.filter((d) => d.severity === 'low').length,
      dbOnlyTables: dbOnly.length,
      declOnlyTables: declOnly.length,
    },
    drifts,
    dbOnly,
    declOnly: declOnly.slice(0, 50),
  };

  // Write JSON
  fs.mkdirSync(path.dirname(JSON_REPORT), { recursive: true });
  fs.writeFileSync(JSON_REPORT, JSON.stringify(summary, null, 2), 'utf8');

  // Write Markdown
  const mdLines = [];
  mdLines.push('# Drizzle `user_id` Drift Audit');
  mdLines.push('');
  mdLines.push(`Generated ${summary.timestamp}`);
  mdLines.push('');
  mdLines.push('## Summary');
  mdLines.push('');
  mdLines.push(`- Schema files scanned: ${summary.schemaFilesScanned}`);
  mdLines.push(`- Schema declarations of \`user_id\` / \`uploaded_by\`: ${summary.schemaDeclarations}`);
  mdLines.push(`- Live DB columns with same names: ${summary.dbColumnsExamined}`);
  mdLines.push(`- **Drifts (declared ≠ DB)**: ${summary.counts.drifts} (high: ${summary.counts.driftsHigh}, low: ${summary.counts.driftsLow})`);
  mdLines.push(`- DB-only (not in any schema file): ${summary.counts.dbOnlyTables}`);
  mdLines.push(`- Declaration-only (in schema, not in DB): ${summary.counts.declOnlyTables}`);
  mdLines.push('');

  if (drifts.length > 0) {
    mdLines.push('## High-severity drifts (uuid ↔ integer mismatch)');
    mdLines.push('');
    mdLines.push('| File | Table | Column | Declared | Actual |');
    mdLines.push('|---|---|---|---|---|');
    for (const d of drifts.filter((x) => x.severity === 'high')) {
      mdLines.push(`| \`${d.file}\` | \`${d.table}\` | \`${d.column}\` | \`${d.declaredType}\` | \`${d.actualType}\` |`);
    }
    mdLines.push('');

    if (drifts.some((x) => x.severity === 'low')) {
      mdLines.push('## Low-severity drifts');
      mdLines.push('');
      mdLines.push('| File | Table | Column | Declared | Actual |');
      mdLines.push('|---|---|---|---|---|');
      for (const d of drifts.filter((x) => x.severity === 'low')) {
        mdLines.push(`| \`${d.file}\` | \`${d.table}\` | \`${d.column}\` | \`${d.declaredType}\` | \`${d.actualType}\` |`);
      }
      mdLines.push('');
    }
  } else {
    mdLines.push('## ✅ No drifts detected');
    mdLines.push('');
  }

  if (dbOnly.length > 0) {
    mdLines.push('## DB-only tables (no Drizzle declaration)');
    mdLines.push('');
    for (const o of dbOnly) {
      mdLines.push(`- \`${o.key}\` (${o.dbType})`);
    }
    mdLines.push('');
  }

  fs.writeFileSync(MD_REPORT, mdLines.join('\n'), 'utf8');

  // Console summary
  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Drifts found:    ${summary.counts.drifts}`);
  console.log(`    - high:        ${summary.counts.driftsHigh}`);
  console.log(`    - low:         ${summary.counts.driftsLow}`);
  console.log(`  DB-only tables:  ${summary.counts.dbOnlyTables}`);
  console.log(`  Decl-only:       ${summary.counts.declOnlyTables}`);
  console.log(`  📝 JSON → ${JSON_REPORT}`);
  console.log(`  📝 MD   → ${MD_REPORT}`);

  if (summary.counts.driftsHigh > 0) {
    console.log('\n  ⚠️  High-severity drifts present. See report for fix list.');
  } else {
    console.log('\n  ✅ No high-severity drifts.');
  }
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
