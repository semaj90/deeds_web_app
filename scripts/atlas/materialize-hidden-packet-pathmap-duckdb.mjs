#!/usr/bin/env node
/**
 * Materialize the hidden packet pathmap surfaces into DuckDB.
 *
 * The script keeps the join/report lane bounded:
 *   feature_labels.jsonl
 *   kanban_tasks.jsonl
 *   missing_feature_todos.jsonl
 *
 * It normalizes those hidden packet files into one replay surface and writes
 * a DuckDB mirror plus a report artifact. Default is dry-run; pass --write to
 * materialize the DuckDB file.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, REPO_ROOT } from './connection-config.mjs';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = REPO_ROOT || path.resolve(__dirname, '../..');
const { frontendTmpRoot: FRONTEND_TMP_ROOT } = resolveAtlasPaths(import.meta.url);
const DUCKDB = process.env.DUCKDB_BIN || 'C:\\Users\\james\\AppData\\Local\\Programs\\DuckDB\\duckdb.exe';
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || !args.has('--write');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'hidden-packet-pathmap-duckdb-report.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'hidden-packet-pathmap-duckdb-report.md');
const DB_PATH = path.join(ROOT, 'docs', 'reports', 'hidden-packet-pathmap.duckdb');
const NORMALIZED_NDJSON = path.join(ROOT, '.tmp', 'offline-synthesis', 'hidden-packet-pathmap.ndjson');
const PATHMAP = path.join(ROOT, 'docs', 'graph', 'missing-features-path-map.json');

const INPUTS = [
  {
    key: 'feature_labels',
    requestedPath: '.tmp/feature_labels.jsonl',
    fallbackPaths: [path.relative(ROOT, path.join(FRONTEND_TMP_ROOT, 'feature_labels.jsonl')).replace(/\\/g, '/')],
  },
  {
    key: 'kanban_tasks',
    requestedPath: '.tmp/kanban_tasks.jsonl',
    fallbackPaths: [path.relative(ROOT, path.join(FRONTEND_TMP_ROOT, 'kanban_tasks.jsonl')).replace(/\\/g, '/')],
  },
  {
    key: 'missing_feature_todos',
    requestedPath: '.tmp/missing_feature_todos.jsonl',
    fallbackPaths: [path.relative(ROOT, path.join(FRONTEND_TMP_ROOT, 'missing_feature_todos.jsonl')).replace(/\\/g, '/')],
  },
];

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function resolveInput(input) {
  const candidates = [input.requestedPath, ...(input.fallbackPaths ?? [])].map((p) => path.join(ROOT, p));
  const selected = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).size > 0) ?? null;
  return {
    ...input,
    requestedAbs: path.join(ROOT, input.requestedPath),
    selectedAbs: selected,
    selectedPath: selected ? rel(selected) : null,
    usedFallback: Boolean(selected && rel(selected) !== input.requestedPath.replace(/\\/g, '/')),
    exists: Boolean(selected),
    bytes: selected ? fs.statSync(selected).size : 0,
  };
}

function normalizePathLike(value) {
  return String(value ?? '')
    .trim()
    .replace(/^file:\/\/\/?/i, '')
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):\/Users\/james\/Videos\/deeds-web-app\//, '')
    .replace(/^(\.\.\/)+/, '')
    .replace(/^\.\/+/, '')
    .replace(/^sveltekit-frontend\//, '')
    .replace(/#line:/, '#L')
    .replace(/#L(\d+)$/, '#L$1');
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && String(item).trim() !== '');
  if (value === null || value === undefined || String(value).trim() === '') return [];
  return [value];
}

function extractSourceRefs(row) {
  const refs = [...asArray(row.sourceRefs), ...asArray(row.source_ref), ...asArray(row.sourceRef), ...asArray(row.source)];
  if (row.file) refs.push(row.file);
  if (row.path) refs.push(row.path);
  return [...new Set(refs.map(normalizePathLike).filter(Boolean))];
}

function extractFeatureIds(row) {
  const features = [...asArray(row.feature_id), ...asArray(row.featureId), ...asArray(row.featureKey), ...asArray(row.feature), ...asArray(row.topFeature)];
  if (Array.isArray(row.features)) {
    for (const feature of row.features) {
      if (typeof feature === 'string') features.push(feature);
      else if (feature?.name) features.push(feature.name);
      else if (feature?.feature_id) features.push(feature.feature_id);
    }
  }
  return [...new Set(features.map((feature) => String(feature).trim()).filter(Boolean))];
}

function extractStableIds(row) {
  return [...asArray(row.id), ...asArray(row.task_id), ...asArray(row.packet_id), ...asArray(row.alias_id)]
    .map((id) => String(id).trim())
    .filter(Boolean);
}

function loadRows(absPath) {
  if (!absPath) return [];
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(absPath) });
  return new Promise((resolve, reject) => {
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        rows.push(JSON.parse(trimmed));
      } catch {
        // ignore malformed lines; the audit report already tracks them
      }
    });
    rl.on('close', () => resolve(rows));
    rl.on('error', reject);
  });
}

function bucketForSourceRef(sourceRef, roots = []) {
  const normalized = normalizePathLike(sourceRef);
  for (const root of roots.map(normalizePathLike)) {
    if (root && normalized.startsWith(root)) return root;
  }
  if (normalized.startsWith('todo:')) return 'todo';
  if (normalized.startsWith('src/')) return 'src/';
  if (normalized.startsWith('scripts/')) return 'scripts/';
  if (normalized.startsWith('docs/')) return 'docs/';
  if (normalized.startsWith('.tmp/')) return '.tmp/';
  return normalized.split('/')[0] || 'unknown';
}

function normalizeRow(kind, row, pathmap) {
  const sourceRefs = extractSourceRefs(row);
  const featureIds = extractFeatureIds(row);
  const stableIds = extractStableIds(row);
  const primarySourceRef = sourceRefs[0] ?? null;
  const primaryFeatureId = featureIds[0] ?? null;
  return {
    packet_kind: kind,
    stable_id: stableIds[0] ?? null,
    source_ref: primarySourceRef,
    source_refs: JSON.stringify(sourceRefs),
    feature_id: primaryFeatureId,
    feature_ids: JSON.stringify(featureIds),
    feature_key: String(row.featureKey ?? row.feature_key ?? row.topFeature ?? row.feature ?? primaryFeatureId ?? '').trim() || null,
    title: row.title ?? row.description ?? row.file ?? row.path ?? null,
    description: row.description ?? null,
    status: row.status ?? null,
    section: row.section ?? null,
    source: row.source ?? null,
    file: row.file ?? null,
    path: row.path ?? null,
    line_number: row.line_number ?? row.lineNumber ?? null,
    task_id: row.task_id ?? null,
    bucket: primarySourceRef ? bucketForSourceRef(primarySourceRef, pathmap.roots ?? []) : 'unknown',
    pathmap_root: primarySourceRef
      ? (pathmap.roots ?? []).find((root) => normalizePathLike(primarySourceRef).startsWith(normalizePathLike(root))) ?? null
      : null,
  };
}

function runDuckdb(dbPath, sql) {
  const res = spawnSync(DUCKDB, [dbPath, '-c', sql], { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error((res.stderr || res.stdout || '').trim() || `duckdb exited ${res.status}`);
  return (res.stdout || '').trim();
}

function runDuckdbJson(dbPath, sql) {
  const res = spawnSync(DUCKDB, [dbPath, '-json', '-c', sql], { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error((res.stderr || res.stdout || '').trim() || `duckdb exited ${res.status}`);
  return JSON.parse(res.stdout || '[]');
}

function renderMarkdown(report) {
  const lines = [
    '# Hidden Packet Pathmap DuckDB Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.summary.applied ? 'WRITE' : 'DRY-RUN'}`,
    '',
    '## Summary',
    `- input rows: ${report.summary.inputRows}`,
    `- normalized rows: ${report.summary.normalizedRows}`,
    `- duckdb rows: ${report.summary.duckdbRows}`,
    `- joins with sourceRef + feature_id: ${report.summary.joinedRows}`,
    `- stable-id joins: ${report.summary.stableIdJoins}`,
    `- sourceRef joins: ${report.summary.sourceRefJoins}`,
    `- missing-feature todos with todo sourceRef: ${report.summary.todoSourceRefRows}`,
    '',
    '## Inputs',
    '| key | selected | rows | fallback |',
    '|---|---|---:|---|',
    ...report.inputs.map((input) => `| ${input.key} | ${input.selectedPath ?? 'missing'} | ${input.rows} | ${input.usedFallback} |`),
    '',
    '## Top Buckets',
    '| bucket | rows |',
    '|---|---:|',
    ...report.topBuckets.map((row) => `| ${row.bucket} | ${row.rows} |`),
    '',
    '## Notes',
    '- This materialization turns hidden packet JSONL surfaces into a queryable DuckDB join table.',
    '- The canonical join spine remains sourceRef + feature_id, with stable_id available for task and packet reconciliation.',
    '- The DuckDB table is an offline artifact; it does not mutate Postgres, Qdrant, Redis, or Neo4j.',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const env = loadRepoEnv(process.env);
  const pathmap = readJson(PATHMAP, { roots: [], fieldAlignment: {} });
  const resolvedInputs = INPUTS.map(resolveInput);
  const rows = {};
  for (const input of resolvedInputs) {
    const abs = input.selectedAbs;
    rows[input.key] = abs ? await loadRows(abs) : [];
  }

  const normalizedRows = [];
  for (const input of resolvedInputs) {
    for (const row of rows[input.key]) normalizedRows.push(normalizeRow(input.key, row, pathmap));
  }

  const joinedRows = normalizedRows.filter((row) => row.source_ref && row.feature_id);
  const stableIdJoins = normalizedRows.filter((row) => row.stable_id).length;
  const sourceRefJoins = normalizedRows.filter((row) => row.source_ref).length;
  const todoSourceRefRows = rows.missing_feature_todos.filter((row) => extractSourceRefs(row).some((sourceRef) => sourceRef.startsWith('todo:'))).length;

  const normalizedNdjson = normalizedRows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  const normalizedNdjsonExists = normalizedRows.length > 0;

  const summary = {
    inputRows: rows.feature_labels.length + rows.kanban_tasks.length + rows.missing_feature_todos.length,
    normalizedRows: normalizedRows.length,
    duckdbRows: normalizedRows.length,
    joinedRows: joinedRows.length,
    stableIdJoins,
    sourceRefJoins,
    todoSourceRefRows,
    applied: false,
  };

  if (!DRY_RUN && normalizedNdjsonExists) {
    fs.mkdirSync(path.dirname(NORMALIZED_NDJSON), { recursive: true });
    fs.writeFileSync(NORMALIZED_NDJSON, normalizedNdjson, 'utf8');

    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const sql = `
      INSTALL json;
      LOAD json;
      CREATE OR REPLACE TABLE hidden_packet_pathmap AS
        SELECT * FROM read_ndjson_auto('${NORMALIZED_NDJSON.replace(/\\/g, '/').replace(/'/g, "''")}');
      CREATE OR REPLACE TABLE hidden_packet_pathmap_summary AS
        SELECT
          count(*)::BIGINT AS duckdb_rows,
          count(*) FILTER (WHERE source_ref IS NOT NULL AND feature_id IS NOT NULL)::BIGINT AS joined_rows,
          count(*) FILTER (WHERE stable_id IS NOT NULL)::BIGINT AS stable_id_joins,
          count(*) FILTER (WHERE source_ref IS NOT NULL)::BIGINT AS source_ref_joins,
          count(*) FILTER (WHERE bucket IS NOT NULL)::BIGINT AS bucket_rows,
          count(*) FILTER (WHERE packet_kind = 'missing_feature_todos' AND source_ref LIKE 'todo:%')::BIGINT AS todo_source_ref_rows
        FROM hidden_packet_pathmap;
      PRAGMA database_size;
    `;
    runDuckdb(DB_PATH, sql);
    const metaRows = runDuckdbJson(DB_PATH, 'SELECT * FROM hidden_packet_pathmap_summary;');
    const meta = metaRows[0] ?? summary;
    summary.duckdbRows = Number(meta.duckdb_rows ?? 0);
    summary.joinedRows = Number(meta.joined_rows ?? 0);
    summary.stableIdJoins = Number(meta.stable_id_joins ?? 0);
    summary.sourceRefJoins = Number(meta.source_ref_joins ?? 0);
    summary.todoSourceRefRows = Number(meta.todo_source_ref_rows ?? 0);
    summary.applied = true;
  }

  const buckets = Object.entries(
    normalizedRows.reduce((acc, row) => {
      acc[row.bucket] = (acc[row.bucket] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([bucket, rows]) => ({ bucket, rows }))
    .sort((a, b) => b.rows - a.rows || a.bucket.localeCompare(b.bucket));

  const report = {
    schema: 'hidden_packet_pathmap_duckdb.v1',
    generatedAt: new Date().toISOString(),
    readOnly: DRY_RUN,
    pathmap: {
      path: rel(PATHMAP),
      roots: pathmap.roots ?? [],
      fieldAlignment: pathmap.fieldAlignment ?? {},
      targets: pathmap.targets ?? [],
    },
    inputs: resolvedInputs.map((input) => ({
      key: input.key,
      requestedPath: input.requestedPath,
      selectedPath: input.selectedPath,
      exists: input.exists,
      usedFallback: input.usedFallback,
      rows: rows[input.key].length,
    })),
    summary,
    topBuckets: buckets.slice(0, 20),
    sample: normalizedRows.slice(0, 20),
    outputs: {
      duckdb: rel(DB_PATH),
      normalizedNdjson: rel(NORMALIZED_NDJSON),
      reportJson: rel(REPORT_JSON),
      reportMd: rel(REPORT_MD),
    },
    env: {
      duckdbBin: DUCKDB,
      repo: env.NODE_ENV ? String(env.NODE_ENV) : null,
    },
  };

  await fsp.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fsp.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await fsp.writeFile(REPORT_MD, renderMarkdown(report), 'utf8');

  console.log('Hidden packet pathmap DuckDB report written:');
  console.log(`  ${REPORT_JSON}`);
  console.log(`  ${REPORT_MD}`);
  console.log(`  ${DB_PATH}`);
  console.log(`Normalized rows: ${report.summary.normalizedRows}`);
  console.log(`Joined rows: ${report.summary.joinedRows}`);
  console.log(`Stable-id joins: ${report.summary.stableIdJoins}`);
  console.log(`SourceRef joins: ${report.summary.sourceRefJoins}`);
  if (DRY_RUN) console.log('Dry run only — DuckDB not written.');
}

main().catch((err) => {
  console.error('[hidden-packet-pathmap-duckdb] fatal:', err);
  process.exit(1);
});
