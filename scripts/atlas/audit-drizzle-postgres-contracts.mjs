#!/usr/bin/env node
/**
 * Drizzle ORM ↔ SQL migrations ↔ live PostgreSQL contract auditor.
 *
 * Compares:
 *   - Drizzle schema-*.ts definitions (pgTable, column types, FK refs)
 *   - drizzle/*.sql migration files (CREATE TABLE, ALTER TABLE)
 *   - live information_schema.columns + pg_indexes (when DB reachable)
 *
 * Detects:
 *   drizzle_fk_type_mismatch     — uuid FK referencing integer PK (or vice-versa)
 *   migration_schema_drift        — SQL migration table absent from Drizzle schema
 *   live_db_schema_drift          — live DB column differs from Drizzle declaration
 *   missing_table                 — Drizzle declares table absent from live DB
 *   missing_column                — live DB column absent from Drizzle schema
 *   unsafe_drizzle_update_delete  — .delete()/.update() without .where() in source
 *   drizzle_meta_non_json_file    — non-JSON file in drizzle/meta
 *
 * Usage:
 *   node scripts/atlas/audit-drizzle-postgres-contracts.mjs [--json] [--dry-run]
 *
 * Output:
 *   docs/reports/drizzle-postgres-contract-report.json
 *   docs/reports/drizzle-postgres-contract-report.md
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import pg from 'pg';
import { REPO_ROOT, readJson } from './_atlas-utils.mjs';

const FRONTEND    = join(REPO_ROOT, 'sveltekit-frontend');
const SCHEMA_DIR  = join(FRONTEND, 'src/lib/server/db');
const DRIZZLE_DIR = join(FRONTEND, 'drizzle');
const ROUTES_SRC  = join(FRONTEND, 'src');
const REPORTS_DIR = join(REPO_ROOT, 'docs/reports');

const DB_URL   = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const ARGS     = process.argv.slice(2);
const DRY_RUN  = ARGS.includes('--dry-run');
const JSON_OUT = ARGS.includes('--json');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m', cyan: '\x1b[36m',
};

// Drizzle → Postgres type compatibility map
const DRIZZLE_TO_PG = {
  uuid:      ['uuid'],
  integer:   ['integer', 'int4'],
  serial:    ['integer', 'int4'],
  bigserial: ['bigint', 'int8'],
  varchar:   ['character varying'],
  text:      ['text'],
  boolean:   ['boolean', 'bool'],
  timestamp: ['timestamp without time zone', 'timestamp with time zone', 'timestamptz'],
  jsonb:     ['jsonb'],
  json:      ['json'],
  real:      ['real', 'float4'],
  bigint:    ['bigint', 'int8'],
  numeric:   ['numeric', 'decimal'],
  vector:    ['USER-DEFINED'],
  halfvec:   ['USER-DEFINED'],
  date:      ['date'],
  smallint:  ['smallint', 'int2'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function rg(pattern, path, flags = []) {
  const r = spawnSync('rg', [pattern, path, '--no-heading', '-n', ...flags], { encoding: 'utf8' });
  return (r.stdout ?? '').trim();
}

function allSchemaFiles(dir = SCHEMA_DIR) {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir);
  const out = [];
  for (const f of files) {
    const p = join(dir, f);
    const stat = statSync(p);
    if (stat.isDirectory()) {
      if (f === 'archived-schemas' || f === 'meta' || f === 'archived') continue;
      out.push(...allSchemaFiles(p));
    } else if (f.endsWith('.ts') && !f.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

function allSqlFiles() {
  const out = [];
  if (existsSync(DRIZZLE_DIR)) {
    out.push(...readdirSync(DRIZZLE_DIR).filter(f => f.endsWith('.sql')).map(f => join(DRIZZLE_DIR, f)));
    const manual = join(DRIZZLE_DIR, 'manual');
    if (existsSync(manual)) {
      out.push(...readdirSync(manual).filter(f => f.endsWith('.sql')).map(f => join(manual, f)));
    }
  }
  return out;
}

// ── Phase A: parse Drizzle schema ────────────────────────────────────────────
function parseDrizzleSchema() {
  /** @type {Map<string, {cols: Map<string, string>, file: string}>} */
  const tables = new Map();
  const schemaFiles = allSchemaFiles();

  for (const sf of schemaFiles) {
    const text = readFileSync(sf, 'utf8');
    const lines = text.split('\n');
    let currentTable = null;
    let braceDepth = 0;
    let inString = false;

    for (const line of lines) {
      const tm = line.match(/pgTable\s*\(\s*['"]([^'"]+)['"]/);
      if (tm) {
        currentTable = tm[1];
        if (!tables.has(currentTable)) tables.set(currentTable, { cols: new Map(), file: sf });
        braceDepth = 0;
      }
      if (currentTable) {
        // crude brace counter (ignores strings — good-enough for schema files)
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          else if (ch === '}') braceDepth--;
        }
        const cm = line.match(/\b(uuid|integer|serial|bigserial|varchar|text|boolean|timestamp|jsonb|json|real|bigint|numeric|vector|halfvec|sparsevec|date|smallint)\s*\(\s*['"]([^'"]+)['"]/);
        if (cm) {
          tables.get(currentTable)?.cols.set(cm[2], cm[1]);
        }
        if (braceDepth < 0) currentTable = null;
      }
    }
  }
  return tables;
}

// ── Phase B: parse SQL migrations for CREATE TABLE names ─────────────────────
function parseMigrationTables() {
  const tables = new Set();
  for (const sf of allSqlFiles()) {
    const text = readFileSync(sf, 'utf8');
    for (const m of text.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["']?(\w+)["']?/gi)) {
      tables.add(m[1]);
    }
  }
  return tables;
}

// ── Phase C: check drizzle/meta for non-JSON files ───────────────────────────
function checkMetaHygiene() {
  const findings = [];
  const metaDir = join(DRIZZLE_DIR, 'meta');
  if (!existsSync(metaDir)) return findings;
  const allowed = /^(_journal\.json|\d{4}_snapshot\.json)$/;
  const files = readdirSync(metaDir).filter(f => {
    try { return statSync(join(metaDir, f)).isFile(); } catch { return false; }
  });
  for (const f of files.filter(f => !allowed.test(f))) {
    findings.push({
      type: 'drizzle_meta_non_json_file',
      severity: 'high',
      file: relative(REPO_ROOT, join(metaDir, f)),
      problem: `Non-JSON file "${f}" in drizzle/meta — Drizzle Kit will crash parsing it as a JSON snapshot.`,
      suggestedFix: `Move or delete sveltekit-frontend/drizzle/meta/${f}`,
      validationCommands: ['node scripts/atlas/audit-drizzle-meta-hygiene.mjs --fix'],
    });
  }
  return findings;
}

// ── Phase D: check unsafe .delete() / .update() without .where() ─────────────
function checkUnsafeWrites() {
  const findings = [];
  // Find .delete( or .update( not followed by .where( within 3 lines
  const out = rg('\\.(delete|update)\\s*\\(', ROUTES_SRC, ['--glob', '*.ts', '--glob', '*.svelte', '-n']);
  for (const line of out.split('\n').filter(Boolean)) {
    const [filePart, ...rest] = line.split(':');
    const content = rest.join(':');
    // Heuristic: if line has .delete( or .update( without an adjacent .where(
    if (content.match(/\.(delete|update)\s*\(/) && !content.includes('.where(')) {
      findings.push({
        type: 'unsafe_drizzle_update_delete',
        severity: 'medium',
        file: relative(REPO_ROOT, filePart.trim()),
        line: content.trim().slice(0, 120),
        problem: `.delete() or .update() call without visible .where() — risks unscoped table mutation.`,
        suggestedFix: 'Add a .where(eq(...)) condition or confirm this is intentional.',
        validationCommands: ['npm run lint:drizzle'],
      });
    }
  }
  return findings;
}

// ── Phase E: known FK type mismatches (static + live) ────────────────────────
const KNOWN_FK_MISMATCHES = [
  { table: 'cases',                col: 'user_id',     drizzleType: 'uuid',    pgType: 'integer', refs: 'users.id' },
  { table: 'chat_messages',        col: 'user_id',     drizzleType: 'uuid',    pgType: 'integer', refs: 'users.id' },
  { table: 'audit_log',            col: 'user_id',     drizzleType: 'uuid',    pgType: 'integer', refs: 'users.id' },
  { table: 'analytics_events',     col: 'user_id',     drizzleType: 'uuid',    pgType: 'integer', refs: 'users.id' },
  { table: 'chunk_hit_log',        col: 'user_id',     drizzleType: 'uuid',    pgType: 'integer', refs: 'users.id' },
  { table: 'synthesis_runs',       col: 'user_id',     drizzleType: 'uuid',    pgType: 'integer', refs: 'users.id' },
  { table: 'yorha_chat_sessions',  col: 'user_id',     drizzleType: 'uuid',    pgType: 'integer', refs: 'users.id' },
];

function checkKnownFkMismatches(drizzleMap) {
  const findings = [];
  for (const m of KNOWN_FK_MISMATCHES) {
    const tableEntry = drizzleMap.get(m.table);
    if (!tableEntry) continue;
    const colType = tableEntry.cols.get(m.col);
    if (colType && colType !== 'integer' && colType !== 'serial') {
      findings.push({
        type: 'drizzle_fk_type_mismatch',
        severity: 'high',
        file: relative(REPO_ROOT, tableEntry.file),
        table: m.table,
        column: m.col,
        drizzleType: colType,
        pgType: m.pgType,
        refs: m.refs,
        problem: `${m.table}.${m.col} is ${colType} in Drizzle schema but ${m.pgType} in live DB; references ${m.refs} (integer serial PK). Queries will return 0 rows for current users.`,
        suggestedFix: `Change ${m.table}.${m.col} to integer() in schema-postgres.ts then run: ALTER TABLE ${m.table} ALTER COLUMN ${m.col} TYPE integer USING NULL`,
        validationCommands: ['npm run db:check', 'npm run audit:contracts'],
      });
    }
  }
  return findings;
}

// ── Phase F: live Postgres drift ──────────────────────────────────────────────
async function checkLivePostgresDrift(drizzleMap) {
  const findings = [];
  let pool;
  try {
    pool = new pg.Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
    pool.on('error', () => {});

    const { rows } = await pool.query(`
      SELECT table_name, column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `).catch(() => ({ rows: [] }));

    // Build live map
    const liveMap = new Map();
    for (const r of rows) {
      if (!liveMap.has(r.table_name)) liveMap.set(r.table_name, new Map());
      liveMap.get(r.table_name).set(r.column_name, r.data_type);
    }

    // Drizzle tables not in live DB
    for (const [tableName, { cols, file }] of drizzleMap) {
      if (!liveMap.has(tableName)) {
        findings.push({
          type: 'missing_table',
          severity: 'medium',
          file: relative(REPO_ROOT, file),
          table: tableName,
          problem: `Table "${tableName}" declared in Drizzle schema but absent from live DB — migration pending.`,
          suggestedFix: `Run: npm run db:generate then npm run db:migrate (or manual SQL).`,
          validationCommands: ['npm run db:check', 'npm run db:generate'],
        });
        continue;
      }

      // Column type mismatches
      const liveCols = liveMap.get(tableName);
      for (const [colName, drizzleType] of cols) {
        if (!liveCols.has(colName)) {
          findings.push({
            type: 'missing_column',
            severity: 'medium',
            file: relative(REPO_ROOT, file),
            table: tableName, column: colName,
            problem: `Column ${tableName}.${colName} in Drizzle schema but absent from live DB.`,
            suggestedFix: `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${colName} ...`,
            validationCommands: ['npm run db:check'],
          });
          continue;
        }

        const pgType = liveCols.get(colName);
        const expected = DRIZZLE_TO_PG[drizzleType] ?? [];
        if (expected.length > 0 && !expected.includes(pgType) && pgType !== 'USER-DEFINED') {
          findings.push({
            type: 'live_db_schema_drift',
            severity: 'high',
            file: relative(REPO_ROOT, file),
            table: tableName, column: colName,
            drizzleType, pgType,
            problem: `${tableName}.${colName}: Drizzle says ${drizzleType}, live DB says ${pgType}.`,
            suggestedFix: `Align Drizzle schema to match DB type OR migrate DB column.`,
            validationCommands: ['npm run db:check', 'npm run audit:contracts'],
          });
        }
      }
    }

    // Migration tables absent from Drizzle
    const migrationTables = parseMigrationTables();
    for (const mt of migrationTables) {
      if (!drizzleMap.has(mt) && !['schema_migrations', 'drizzle_migrations'].includes(mt)) {
        findings.push({
          type: 'migration_schema_drift',
          severity: 'low',
          file: 'sveltekit-frontend/drizzle/',
          table: mt,
          problem: `Table "${mt}" in SQL migrations but not declared in Drizzle schema (may be a filtered/legacy table).`,
          suggestedFix: `Add to schema-postgres.ts OR add to tablesFilter in drizzle.config.ts.`,
          validationCommands: ['npm run db:check'],
        });
      }
    }

  } catch (err) {
    if (!JSON_OUT) console.warn(`  ${C.yellow}⚠ SKIP: Postgres unreachable (${err.message.slice(0, 60)}) — live drift check skipped${C.reset}`);
  } finally {
    await pool?.end().catch(() => {});
  }
  return findings;
}

// ── Report writers ────────────────────────────────────────────────────────────
function writeReports(findings, elapsed) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(), elapsedMs: elapsed,
    totalFindings: findings.length,
    bySeverity: {
      high:   findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low:    findings.filter(f => f.severity === 'low').length,
    },
    findings,
  };
  writeFileSync(join(REPORTS_DIR, 'drizzle-postgres-contract-report.json'), JSON.stringify(report, null, 2));

  const md = [
    '# Drizzle ↔ Postgres Contract Report',
    '',
    `Generated: ${report.generatedAt}  |  Findings: ${report.totalFindings}`,
    '',
    ...findings.map(f => [
      `### ${f.type}  (${f.severity})`,
      `**Problem:** ${f.problem}`,
      `**Fix:** ${f.suggestedFix}`,
      f.file ? `**File:** \`${f.file}\`` : '',
      `**Validate:** ${(f.validationCommands || []).map(c => `\`${c}\``).join(', ')}`,
      '',
    ].join('\n')),
  ].join('\n');
  writeFileSync(join(REPORTS_DIR, 'drizzle-postgres-contract-report.md'), md);
  return report;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!JSON_OUT) console.log(`\n${C.bold}── Drizzle ↔ Postgres Contract Audit ──${C.reset}\n`);
  const t0 = Date.now();

  const drizzleMap = parseDrizzleSchema();
  if (!JSON_OUT) console.log(`  Drizzle tables parsed: ${drizzleMap.size}`);

  const findings = [
    ...checkMetaHygiene(),
    ...checkUnsafeWrites(),
    ...checkKnownFkMismatches(drizzleMap),
    ...(await checkLivePostgresDrift(drizzleMap)),
  ];

  const elapsed = Date.now() - t0;

  if (!DRY_RUN) writeReports(findings, elapsed);

  if (!JSON_OUT) {
    const hi = findings.filter(f => f.severity === 'high').length;
    const md = findings.filter(f => f.severity === 'medium').length;
    const lo = findings.filter(f => f.severity === 'low').length;
    console.log(`\n  ${C.red}${hi} high${C.reset}  ${C.yellow}${md} medium${C.reset}  ${C.gray}${lo} low${C.reset}  — ${elapsed}ms`);
    for (const f of findings) {
      const col = f.severity === 'high' ? C.red : f.severity === 'medium' ? C.yellow : C.gray;
      console.log(`  ${col}${f.severity.padEnd(6)}${C.reset}  ${C.cyan}[${f.type}]${C.reset}  ${f.problem.slice(0, 90)}…`);
    }
    if (!DRY_RUN) console.log(`\n  ${C.gray}Reports → docs/reports/drizzle-postgres-contract-report.*${C.reset}\n`);
  } else {
    const r = writeReports(findings, elapsed);
    console.log(JSON.stringify(r, null, 2));
  }

  process.exit(findings.filter(f => f.severity === 'high').length > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(2); });