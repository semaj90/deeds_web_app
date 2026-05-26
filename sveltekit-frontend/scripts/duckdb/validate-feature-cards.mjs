#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');
const REPORTS_DIR = join(ROOT, 'docs', 'reports');
const NDJSON_PATH = join(REPORTS_DIR, 'feature-card-duckdb-ready.ndjson');
const DUCKDB_DB_PATH = join(REPORTS_DIR, 'feature-card.duckdb');
const DUCKDB_CANDIDATES = [
  process.env.DUCKDB_BIN,
  'C:\\Users\\james\\AppData\\Local\\Programs\\DuckDB\\duckdb.exe',
  'duckdb',
].filter(Boolean);

function writeJson(pathname, value) {
  mkdirSync(join(pathname, '..'), { recursive: true });
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(pathname, value) {
  mkdirSync(join(pathname, '..'), { recursive: true });
  writeFileSync(pathname, value, 'utf8');
}

function resolveDuckdbBin() {
  for (const candidate of DUCKDB_CANDIDATES) {
    if (candidate === 'duckdb') return candidate;
    if (existsSync(candidate)) return candidate;
  }
  return 'duckdb';
}

function runDuckdbJson(duckdbBin, sql, dbPath = null) {
  const args = [];
  if (dbPath) args.push(dbPath);
  args.push('-json', '-c', sql);
  const result = spawnSync(duckdbBin, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `duckdb exited ${result.status}`);
  }
  return JSON.parse(result.stdout || '[]');
}

function countNdjson(pathname) {
  if (!existsSync(pathname)) return 0;
  const raw = readFileSync(pathname, 'utf8').trim();
  if (!raw) return 0;
  return raw.split(/\r?\n/).length;
}

function main() {
  const duckdbBin = resolveDuckdbBin();
  const ndjsonRows = countNdjson(NDJSON_PATH);
  const duckdbExists = existsSync(DUCKDB_DB_PATH);
  let dbRows = 0;
  let columns = [];
  let termsRows = 0;
  let expectedColumns = [
    'id',
    'kind',
    'labels',
    'summary',
    'sourceRefs',
    'score_rank',
    'score_authority',
    'score_recency',
    'payload',
  ];
  let status = 'missing';
  let issues = [];

  if (!existsSync(NDJSON_PATH)) {
    issues.push('missing_ndjson_export');
  }

  if (!duckdbExists) {
    issues.push('missing_duckdb_database');
  } else {
    const tables = runDuckdbJson(duckdbBin, 'SHOW TABLES;', DUCKDB_DB_PATH);
    const hasTable = tables.some((row) => String(row.name ?? row.table_name ?? '').toLowerCase() === 'feature_cards');
    const hasTermsTable = tables.some((row) => String(row.name ?? row.table_name ?? '').toLowerCase() === 'feature_card_terms');
    if (!hasTable) {
      issues.push('missing_feature_cards_table');
    } else {
      const countRows = runDuckdbJson(duckdbBin, 'SELECT count(*) AS rows FROM feature_cards;', DUCKDB_DB_PATH);
      dbRows = Number(countRows[0]?.rows ?? 0);
      const columnRows = runDuckdbJson(duckdbBin, "PRAGMA table_info('feature_cards');", DUCKDB_DB_PATH);
      columns = columnRows.map((row) => String(row.name));
      const required = expectedColumns.filter((name) => !columns.includes(name));
      if (required.length > 0) issues.push(`missing_columns:${required.join(',')}`);
      if (ndjsonRows !== dbRows) issues.push(`row_mismatch:${ndjsonRows}:${dbRows}`);
      if (!hasTermsTable) {
        issues.push('missing_feature_card_terms_table');
      } else {
        const termsCountRows = runDuckdbJson(duckdbBin, 'SELECT count(*) AS rows FROM feature_card_terms;', DUCKDB_DB_PATH);
        termsRows = Number(termsCountRows[0]?.rows ?? 0);
        if (termsRows <= 0) issues.push('feature_card_terms_empty');
      }
      status = issues.length > 0 ? 'degraded' : 'pass';
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    status,
    duckdb: {
      bin: duckdbBin,
      dbPath: DUCKDB_DB_PATH,
      exists: duckdbExists,
    },
    source: {
      ndjsonPath: NDJSON_PATH,
      rows: ndjsonRows,
    },
    database: {
      rows: dbRows,
      termsRows,
      columns,
    },
    expectedColumns,
    issues,
  };

  const jsonPath = join(REPORTS_DIR, 'feature-card-duckdb-validation.json');
  const mdPath = join(REPORTS_DIR, 'feature-card-duckdb-validation.md');
  writeJson(jsonPath, report);
  writeText(mdPath, [
    '# Feature Card DuckDB Validation',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Status: ${report.status}`,
    `DuckDB: ${report.duckdb.bin}`,
    `DB: ${report.duckdb.dbPath}`,
    `NDJSON rows: ${report.source.rows}`,
    `DB rows: ${report.database.rows}`,
    '',
    '## Issues',
    ...(report.issues.length > 0 ? report.issues.map((issue) => `- ${issue}`) : ['- none']),
    '',
    '## Columns',
    ...report.database.columns.map((column) => `- ${column}`),
  ].join('\n'));

  console.log(JSON.stringify({
    ok: report.status === 'pass',
    report: { jsonPath, mdPath },
    status: report.status,
    rows: report.database.rows,
    issues: report.issues,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[duckdb:feature-cards:validate] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
