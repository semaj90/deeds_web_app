#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnvFiles } from '../atlas/lib/redis-valkey.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(ROOT, 'sveltekit-frontend');
const DOCS_DIR = path.join(ROOT, 'docs', 'reports');
const INPUT_JSON = path.join(DOCS_DIR, 'repo-function-registry.json');
const REPORT_JSON = path.join(DOCS_DIR, 'repo-function-registry-backfill.json');
const REPORT_MD = path.join(DOCS_DIR, 'repo-function-registry-backfill.md');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERIFY = argv.includes('--verify');
const LIMIT_ARG = argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split('=')[1] ?? 0) || 0) : Infinity;

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map((item) => stableJson(item));
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      const next = stableJson(value[key]);
      if (next !== undefined) acc[key] = next;
      return acc;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableJson(value ?? null));
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function loadEnv() {
  const rootEnv = await loadAtlasEnvFiles(ROOT);
  const frontendEnv = await loadAtlasEnvFiles(FRONTEND_ROOT);
  return Object.assign({}, rootEnv, frontendEnv, process.env);
}

function buildRow(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    source_ref: normalizeText(row.source_ref),
    file_path: normalizeText(row.file_path),
    symbol: normalizeText(row.symbol),
    kind: normalizeText(row.kind),
    feature_id: normalizeText(row.feature_id),
    feature_label: normalizeText(row.feature_label),
    runtime_lane: normalizeText(row.runtime_lane),
    workflow_lane: normalizeArray(row.workflow_lane),
    permission_lane: normalizeText(row.permission_lane),
    keywords: normalizeArray(row.keywords),
    summary: normalizeText(row.summary),
    copy_merge_use: normalizeText(row.copy_merge_use),
    metadata: {
      ...metadata,
      backfill_source: 'repo-function-registry.json',
      backfill_version: 'repo-function-registry-v1',
      source_ref: normalizeText(row.source_ref),
      feature_id: normalizeText(row.feature_id),
      kind: normalizeText(row.kind),
    },
  };
}

async function ensureTable(pool) {
  const { rows } = await pool.query(`select to_regclass('public.repo_function_registry') as table_name`);
  return Boolean(rows?.[0]?.table_name);
}

async function loadExistingRows(pool) {
  const { rows } = await pool.query(`
    select source_ref, file_path, symbol, kind, feature_id, feature_label,
           runtime_lane, workflow_lane, permission_lane, keywords, summary,
           copy_merge_use, metadata
    from repo_function_registry
    order by source_ref asc
  `);
  return rows;
}

function compareRows(sourceRows, dbRows) {
  const sourceByRef = new Map(sourceRows.map((row) => [row.source_ref, row]));
  const dbByRef = new Map(dbRows.map((row) => [row.source_ref, row]));
  let matched = 0;
  let missing = 0;
  let stale = 0;

  for (const [sourceRef, sourceRow] of sourceByRef) {
    const dbRow = dbByRef.get(sourceRef);
    if (!dbRow) {
      missing += 1;
      continue;
    }
    const sourceStable = stableStringify(sourceRow);
    const dbStable = stableStringify(buildRow(dbRow));
    if (sourceStable === dbStable) matched += 1;
    else stale += 1;
  }

  return { matched, missing, stale, totalSource: sourceRows.length, totalDb: dbRows.length };
}

function renderMarkdown(report) {
  return [
    '# Repo Function Registry Backfill',
    '',
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Table exists: ${report.table_exists ? 'yes' : 'no'}`,
    `Source rows: ${report.summary.source_rows}`,
    `DB rows before: ${report.summary.db_rows_before}`,
    `DB rows after: ${report.summary.db_rows_after}`,
    `Applied rows: ${report.summary.applied_rows}`,
    `Matched rows: ${report.summary.matched_rows}`,
    `Missing rows: ${report.summary.missing_rows}`,
    `Stale rows: ${report.summary.stale_rows}`,
    '',
    '## Samples',
    '',
    ...(report.samples.length
      ? report.samples.map((sample) => `- ${sample.source_ref} | ${sample.kind} | ${sample.feature_id}`)
      : ['- none']),
    '',
  ].join('\n');
}

async function main() {
  await fs.mkdir(DOCS_DIR, { recursive: true });

  const env = await loadEnv();
  const databaseUrl =
    env.DATABASE_URL ||
    env.ADMIN_DATABASE_URL ||
    'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  const sourcePayload = await readJson(INPUT_JSON);
  const sourceRows = Array.isArray(sourcePayload?.rows) ? sourcePayload.rows.map(buildRow) : [];
  const rows = sourceRows.slice(0, Number.isFinite(LIMIT) ? LIMIT : sourceRows.length);

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const tableExists = await ensureTable(pool);

  let dbRowsBefore = [];
  let appliedRows = 0;
  let dbRowsAfter = [];
  let status = 'DRY_RUN';

  if (tableExists) {
    dbRowsBefore = await loadExistingRows(pool);
  }

  if (APPLY && tableExists) {
    for (const row of rows) {
      const result = await pool.query(
        `
        INSERT INTO repo_function_registry (
          source_ref, file_path, symbol, kind, feature_id, feature_label,
          runtime_lane, workflow_lane, permission_lane, keywords,
          summary, copy_merge_use, metadata, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8::text[], $9, $10::text[],
          $11, $12, $13::jsonb, NOW()
        )
        ON CONFLICT (source_ref) DO UPDATE SET
          file_path = EXCLUDED.file_path,
          symbol = EXCLUDED.symbol,
          kind = EXCLUDED.kind,
          feature_id = EXCLUDED.feature_id,
          feature_label = EXCLUDED.feature_label,
          runtime_lane = EXCLUDED.runtime_lane,
          workflow_lane = EXCLUDED.workflow_lane,
          permission_lane = EXCLUDED.permission_lane,
          keywords = EXCLUDED.keywords,
          summary = EXCLUDED.summary,
          copy_merge_use = EXCLUDED.copy_merge_use,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        `,
        [
          row.source_ref,
          row.file_path,
          row.symbol,
          row.kind,
          row.feature_id,
          row.feature_label,
          row.runtime_lane,
          row.workflow_lane,
          row.permission_lane,
          row.keywords,
          row.summary,
          row.copy_merge_use,
          JSON.stringify(row.metadata),
        ],
      );
      if (result.rowCount > 0) appliedRows += 1;
    }
    dbRowsAfter = await loadExistingRows(pool);
    status = 'APPLIED';
  } else if (VERIFY && tableExists) {
    dbRowsAfter = dbRowsBefore;
    status = 'VERIFIED';
  }

  await pool.end();

  const comparison = tableExists ? compareRows(rows, dbRowsBefore) : { matched: 0, missing: rows.length, stale: 0, totalSource: rows.length, totalDb: 0 };
  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : VERIFY ? 'verify' : 'dry-run',
    status: tableExists ? status : 'TABLE_MISSING',
    input: path.relative(ROOT, INPUT_JSON).replace(/\\/g, '/'),
    table_exists: tableExists,
    table_name: 'repo_function_registry',
    summary: {
      source_rows: rows.length,
      db_rows_before: dbRowsBefore.length,
      db_rows_after: dbRowsAfter.length || dbRowsBefore.length,
      applied_rows: appliedRows,
      matched_rows: comparison.matched,
      missing_rows: comparison.missing,
      stale_rows: comparison.stale,
    },
    samples: rows.slice(0, 12).map((row) => ({
      source_ref: row.source_ref,
      kind: row.kind,
      feature_id: row.feature_id,
      feature_label: row.feature_label,
    })),
  };

  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  await fs.writeFile(REPORT_JSON, reportJson, 'utf8');
  await fs.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');

  console.log(JSON.stringify(report.summary, null, 2));
  if (!tableExists) {
    console.warn('repo_function_registry table is missing — apply the manual SQL migration first.');
    process.exitCode = 1;
  } else if (APPLY && appliedRows === 0 && rows.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
