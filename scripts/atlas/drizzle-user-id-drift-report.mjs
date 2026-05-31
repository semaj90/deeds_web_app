#!/usr/bin/env node
/**
 * drizzle-user-id-drift-report.mjs
 *
 * Read-only audit: for every Drizzle schema file under sveltekit-frontend/src/lib/server/db/,
 * find user_id / userId column declarations and compare their declared type
 * (uuid vs integer vs text) against the live DB column type.
 *
 * Produces:
 *   memory/exports/drizzle-user-id-drift-report.json
 *   memory/exports/drizzle-user-id-drift-report.md
 *
 * Does NOT mutate any schema file or DB. Use this to drive a follow-up
 * migration commit that the operator approves manually.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const SCHEMA_DIR = path.join(ROOT, 'sveltekit-frontend', 'src', 'lib', 'server', 'db');
const REPORT_JSON = path.join(ROOT, 'memory', 'exports', 'drizzle-user-id-drift-report.json');
const REPORT_MD = path.join(ROOT, 'memory', 'exports', 'drizzle-user-id-drift-report.md');

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

// Walk schema files
function walkSchemaFiles() {
  const files = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (ent.isDirectory()) walk(path.join(dir, ent.name));
      else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.d.ts')) files.push(path.join(dir, ent.name));
    }
  }
  walk(SCHEMA_DIR);
  return files;
}

// Extract pgTable(name, {...}) blocks and their user_id-ish column declarations
const PG_TABLE_RE = /pgTable\(\s*['"]([^'"]+)['"]\s*,\s*\{([\s\S]*?)\}\s*(?:,|\))/g;
const USER_ID_DECL_RE = /\b(\w*[Uu]ser_?[Ii]d|uploaded_?by|owner_?id|user_uuid)\s*:\s*(uuid|integer|text|bigint|serial|varchar)\s*\(\s*['"]([^'"]+)['"]/g;

function parseSchemaFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const decls = [];
  let tmatch;
  while ((tmatch = PG_TABLE_RE.exec(src)) !== null) {
    const tableName = tmatch[1];
    const body = tmatch[2];
    let cmatch;
    USER_ID_DECL_RE.lastIndex = 0;
    while ((cmatch = USER_ID_DECL_RE.exec(body)) !== null) {
      const [, jsName, drizzleType, dbName] = cmatch;
      decls.push({
        file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
        table: tableName,
        jsField: jsName,
        dbColumn: dbName,
        declaredType: drizzleType,
      });
    }
  }
  return decls;
}

async function getLiveColumnTypes(pool) {
  const { rows } = await pool.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE column_name IN ('user_id','uploaded_by','owner_id','user_uuid')
      AND table_schema='public'
    ORDER BY table_name, column_name
  `);
  // Map: "tableName.columnName" → data_type
  const map = new Map();
  for (const r of rows) map.set(`${r.table_name}.${r.column_name}`, r.data_type);
  return map;
}

function normalizeDeclared(t) {
  if (t === 'serial' || t === 'bigint') return 'integer';
  if (t === 'varchar') return 'text';
  return t;
}

async function main() {
  console.log('\n══ Drizzle user_id Drift Report ══════════════════════════');

  // Load schema declarations
  const files = walkSchemaFiles();
  console.log(`  Schema files scanned: ${files.length}`);

  const allDecls = [];
  for (const f of files) {
    const decls = parseSchemaFile(f);
    if (decls.length) allDecls.push(...decls);
  }
  console.log(`  user_id-ish declarations: ${allDecls.length}`);

  // Live DB
  const pool = new pg.Pool(env.DATABASE_URL || env.PG_URL
    ? { connectionString: env.DATABASE_URL || env.PG_URL }
    : {
        host: env.POSTGRES_HOST || 'localhost',
        port: parseInt(env.POSTGRES_PORT || '5432', 10),
        user: env.POSTGRES_USER || 'legal_admin',
        password: env.POSTGRES_PASSWORD || 'legal_admin',
        database: env.POSTGRES_DB || 'legal_ai_db',
      });
  let liveMap;
  try {
    liveMap = await getLiveColumnTypes(pool);
  } finally {
    await pool.end();
  }
  console.log(`  Live DB columns matched: ${liveMap.size}`);

  // Cross-reference
  const drift = [];
  const aligned = [];
  const missingInDb = [];

  for (const d of allDecls) {
    const key = `${d.table}.${d.dbColumn}`;
    const liveType = liveMap.get(key);
    if (!liveType) {
      missingInDb.push({ ...d, status: 'missing_in_db' });
      continue;
    }
    const decl = normalizeDeclared(d.declaredType);
    if (decl === liveType) {
      aligned.push({ ...d, liveType, status: 'aligned' });
    } else {
      drift.push({
        ...d,
        liveType,
        status: 'drift',
        recommendation: `Drizzle says ${d.declaredType}, DB says ${liveType}. Change schema to ${liveType}('${d.dbColumn}').`,
      });
    }
  }

  // Live columns with no schema declaration (DB-only)
  const dbOnly = [];
  const declaredKeys = new Set(allDecls.map((d) => `${d.table}.${d.dbColumn}`));
  for (const [key, type] of liveMap.entries()) {
    if (!declaredKeys.has(key)) dbOnly.push({ key, liveType: type, status: 'db_only' });
  }

  const summary = {
    timestamp: new Date().toISOString(),
    schemaFilesScanned: files.length,
    totalDeclarations: allDecls.length,
    liveColumnsMatched: liveMap.size,
    aligned: aligned.length,
    drift: drift.length,
    missingInDb: missingInDb.length,
    dbOnly: dbOnly.length,
    counts: {
      declaredAsUuid: allDecls.filter((d) => d.declaredType === 'uuid').length,
      declaredAsInteger: allDecls.filter((d) => ['integer', 'serial', 'bigint'].includes(d.declaredType)).length,
      declaredAsText: allDecls.filter((d) => ['text', 'varchar'].includes(d.declaredType)).length,
    },
    drift,
    aligned: aligned.slice(0, 20), // sample only — full list could be 100s
    missingInDb,
    dbOnly,
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  // Markdown report
  const md = [
    `# Drizzle user_id Drift Report`,
    ``,
    `**Generated:** ${summary.timestamp}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Schema files scanned | ${summary.schemaFilesScanned} |`,
    `| Total user_id declarations | ${summary.totalDeclarations} |`,
    `| Live DB columns matched | ${summary.liveColumnsMatched} |`,
    `| ✅ Aligned | ${summary.aligned} |`,
    `| ❌ Drift | ${summary.drift} |`,
    `| ⚠️ Declared but missing in DB | ${summary.missingInDb} |`,
    `| 🔵 DB-only (no Drizzle declaration) | ${summary.dbOnly} |`,
    ``,
    `## Declaration breakdown`,
    ``,
    `- Declared as **uuid**: ${summary.counts.declaredAsUuid}`,
    `- Declared as **integer/serial/bigint**: ${summary.counts.declaredAsInteger}`,
    `- Declared as **text/varchar**: ${summary.counts.declaredAsText}`,
    ``,
  ];

  if (drift.length > 0) {
    md.push(`## ❌ Drift entries (${drift.length})`, ``);
    md.push(`| File | Table | JS field | DB column | Declared | Live | Recommendation |`);
    md.push(`|---|---|---|---|---|---|---|`);
    for (const d of drift) {
      md.push(`| \`${d.file}\` | ${d.table} | ${d.jsField} | ${d.dbColumn} | ${d.declaredType} | **${d.liveType}** | ${d.recommendation} |`);
    }
    md.push(``);
  }

  if (missingInDb.length > 0) {
    md.push(`## ⚠️ Declared but missing in DB (${missingInDb.length})`, ``);
    for (const d of missingInDb) md.push(`- \`${d.file}\` → ${d.table}.${d.dbColumn} (${d.declaredType})`);
    md.push(``);
  }

  if (dbOnly.length > 0) {
    md.push(`## 🔵 DB-only columns (no Drizzle declaration) (${dbOnly.length})`, ``);
    for (const d of dbOnly) md.push(`- \`${d.key}\` → ${d.liveType}`);
    md.push(``);
  }

  fs.writeFileSync(REPORT_MD, md.join('\n'), 'utf8');

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Aligned:         ${summary.aligned} ✅`);
  console.log(`  Drift:           ${summary.drift} ${drift.length === 0 ? '✅' : '❌'}`);
  console.log(`  Missing in DB:   ${summary.missingInDb}`);
  console.log(`  DB-only:         ${summary.dbOnly}`);
  console.log(`  📝 JSON → ${REPORT_JSON}`);
  console.log(`  📝 MD   → ${REPORT_MD}`);

  process.exit(drift.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
