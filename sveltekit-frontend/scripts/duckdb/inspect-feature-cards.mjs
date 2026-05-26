#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');
const REPORTS_DIR = join(ROOT, 'docs', 'reports');
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

function runDuckdbText(duckdbBin, sql, dbPath = null) {
  const args = [];
  if (dbPath) args.push(dbPath);
  args.push('-c', sql);
  const result = spawnSync(duckdbBin, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `duckdb exited ${result.status}`);
  }
  return (result.stdout || '').trim();
}

function main() {
  const duckdbBin = resolveDuckdbBin();
  const exists = existsSync(DUCKDB_DB_PATH);
  const report = {
    generatedAt: new Date().toISOString(),
    duckdb: {
      bin: duckdbBin,
      dbPath: DUCKDB_DB_PATH,
      exists,
    },
    table: null,
    termsTable: null,
    columns: [],
    counts: null,
    termsCounts: null,
    labelCounts: [],
    preview: [],
  };

  if (!exists) {
    report.note = 'feature-card.duckdb not found';
  } else {
    const tables = runDuckdbJson(duckdbBin, 'SHOW TABLES;', DUCKDB_DB_PATH);
    const hasTable = tables.some((row) => String(row.name ?? row.table_name ?? '').toLowerCase() === 'feature_cards');
    const hasTermsTable = tables.some((row) => String(row.name ?? row.table_name ?? '').toLowerCase() === 'feature_card_terms');
    report.table = { name: 'feature_cards', exists: hasTable };
    report.termsTable = { name: 'feature_card_terms', exists: hasTermsTable };
    if (hasTable) {
      const columnRows = runDuckdbJson(duckdbBin, "PRAGMA table_info('feature_cards');", DUCKDB_DB_PATH);
      report.columns = columnRows.map((row) => ({
        cid: row.cid,
        name: row.name,
        type: row.type,
        notnull: row.notnull,
        dflt_value: row.dflt_value,
        pk: row.pk,
      }));

      const countRows = runDuckdbJson(duckdbBin, `
        SELECT
          count(*) AS rows,
          sum(CASE WHEN kind = 'feature' THEN 1 ELSE 0 END) AS feature_rows
        FROM feature_cards;
      `, DUCKDB_DB_PATH);
      report.counts = {
        rows: Number(countRows[0]?.rows ?? 0),
        featureRows: Number(countRows[0]?.feature_rows ?? 0),
      };

      if (hasTermsTable) {
        const termsCountRows = runDuckdbJson(duckdbBin, `
          SELECT term_type, COUNT(*) AS rows
          FROM feature_card_terms
          GROUP BY 1
          ORDER BY 2 DESC, 1 ASC;
        `, DUCKDB_DB_PATH);
        report.termsCounts = termsCountRows.map((row) => ({
          termType: row.term_type,
          rows: Number(row.rows ?? 0),
        }));
      }

      try {
        const labelRows = runDuckdbJson(duckdbBin, `
          SELECT label, COUNT(*) AS count
          FROM feature_cards, UNNEST(labels) AS t(label)
          GROUP BY 1
          ORDER BY 2 DESC, 1 ASC
          LIMIT 20;
        `, DUCKDB_DB_PATH);
        report.labelCounts = labelRows.map((row) => ({ label: row.label, count: Number(row.count ?? 0) }));
      } catch {
        report.labelCounts = [];
      }

      try {
        const previewRows = runDuckdbJson(duckdbBin, `
          SELECT id, kind, summary, score_rank, score_authority, score_recency
          FROM feature_cards
          ORDER BY score_rank DESC, score_authority DESC, id
          LIMIT 10;
        `, DUCKDB_DB_PATH);
        report.preview = previewRows.map((row) => ({
          id: row.id,
          kind: row.kind,
          summary: row.summary,
          score_rank: Number(row.score_rank ?? 0),
          score_authority: Number(row.score_authority ?? 0),
          score_recency: Number(row.score_recency ?? 0),
        }));
      } catch {
        report.preview = [];
      }
    }
  }

  const jsonPath = join(REPORTS_DIR, 'feature-card-duckdb-inspect.json');
  const mdPath = join(REPORTS_DIR, 'feature-card-duckdb-inspect.md');
  writeJson(jsonPath, report);
  writeText(mdPath, [
    '# Feature Card DuckDB Inspect',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `DuckDB: ${report.duckdb.bin}`,
    `DB: ${report.duckdb.dbPath}`,
    `Exists: ${report.duckdb.exists ? 'yes' : 'no'}`,
    '',
    `Table: ${report.table?.exists ? 'feature_cards' : 'missing'}`,
    `Terms table: ${report.termsTable?.exists ? 'feature_card_terms' : 'missing'}`,
    `Rows: ${report.counts?.rows ?? 0}`,
    '',
    '## Term Counts',
    ...((report.termsCounts ?? []).map((row) => `- ${row.termType}: ${row.rows}`)),
    '',
    '## Top Labels',
    ...report.labelCounts.slice(0, 15).map((row) => `- ${row.label}: ${row.count}`),
    '',
    '## Preview',
    ...report.preview.map((row) => `- ${row.id} (${row.kind}) [rank ${row.score_rank}] ${row.summary}`),
  ].join('\n'));

  console.log(JSON.stringify({
    ok: true,
    report: { jsonPath, mdPath },
    duckdb: report.duckdb,
    counts: report.counts,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[duckdb:feature-cards:inspect] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
