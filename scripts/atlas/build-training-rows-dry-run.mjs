#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { REPO_ROOT, writeJson, writeMarkdown, toPosixPath } from './_atlas-utils.mjs';
import { normalizeRef, sha256hex } from './normalize-source-ref-id.mjs';

const OUT_DIR = path.join(REPO_ROOT, 'memory', 'exports', 'atlas');
const BUNDLE_MANIFEST = path.join(OUT_DIR, 'parent-atlas-export-bundle-manifest.json');
const SCHEMA_MAP = path.join(OUT_DIR, 'drizzle-schema-map.jsonl');
const NORMALIZED_PREVIEW = path.join(REPO_ROOT, '.tmp', 'source-ref-normalization-preview.jsonl');
const AUDIT_REPORT = path.join(REPO_ROOT, 'docs', 'reports', 'duckdb-parent-atlas-audit.json');
const OUT_JSONL = path.join(OUT_DIR, 'training-rows.jsonl');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'training-rows-dry-run-report.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'training-rows-dry-run-report.md');
const RELEVANT_KINDS = new Set(['code_file', 'doc_chunk', 'generated_report', 'memory_export', 'neschrom_card']);

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { _raw: line };
      }
    });
}

function classifySourceRef(ref) {
  const s = String(ref ?? '').replace(/\\/g, '/');
  if (s.includes('#chunk-')) return 'doc_chunk';
  if (s.startsWith('src/') || s.startsWith('$lib/') || s.startsWith('sveltekit-frontend/src/')) return 'code_file';
  if (s.startsWith('docs/reports/') || s.startsWith('reports/')) return 'generated_report';
  if (s.startsWith('memory/exports/')) return 'memory_export';
  if (s.startsWith('neschrom97/cards/')) return 'neschrom_card';
  return 'unknown';
}

function makeId(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

function schemaRowsToTrainingRows(schemaRows) {
  return schemaRows.map((row) => ({
    training_id: makeId(['schema', row.table, row.file]),
    task: 'schema_projection',
    sourceRef: row.file,
    sourceRefId: sha256hex(normalizeRef(row.file, REPO_ROOT) || row.file),
    feature_id: row.table,
    feature_label: row.table.replace(/_/g, ' '),
    input: `Table ${row.table} columns: ${row.columns.map((column) => `${column.dbName}:${column.type}`).join(', ')}`,
    expected_output: row.table,
    positive_sourceRefs: [row.file],
    negative_sourceRefs: [],
    reward: 1,
    outcome: 'dry-run',
    created_at: new Date().toISOString(),
  }));
}

function sourceRefRowsToTrainingRows(sourceRows, inventory, { relevantOnly = false, maxRows = 500 } = {}) {
  const rows = [];
  for (const row of sourceRows) {
    if (!row.normalized) continue;
    const sourceKind = classifySourceRef(row.originalRef);
    if (relevantOnly && !RELEVANT_KINDS.has(sourceKind)) continue;
    const matched = inventory.has(row.normalized);
    rows.push({
      training_id: makeId(['source-ref', row.originalRef, row.normalized]),
      task: matched ? 'source_ref_alignment' : 'source_ref_resolution',
      sourceRef: row.originalRef,
      sourceRefKind: sourceKind,
      sourceRefId: row.sourceRefId ?? sha256hex(row.normalized),
      feature_id: row.normalized.split('/').slice(-2, -1)[0] ?? row.normalized.split('/').pop() ?? 'unknown',
      feature_label: row.normalized.split('/').pop() ?? row.normalized,
      input: row.normalized,
      expected_output: matched ? row.normalized : '',
      positive_sourceRefs: matched ? [row.normalized] : [],
      negative_sourceRefs: matched ? [] : [row.originalRef],
      reward: matched ? 1 : 0.2,
      outcome: matched ? 'matched' : 'unmatched',
      created_at: new Date().toISOString(),
    });
    if (rows.length >= maxRows) break;
  }
  return rows;
}

function main() {
  const args = new Set(process.argv.slice(2));
  let maxRows = 500;
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--limit' || process.argv[i] === '--source-limit') {
      const next = Number(process.argv[i + 1]);
      if (Number.isFinite(next) && next > 0) maxRows = Math.floor(next);
    }
    if (String(process.argv[i] ?? '').startsWith('--limit=')) {
      const next = Number(String(process.argv[i]).split('=')[1]);
      if (Number.isFinite(next) && next > 0) maxRows = Math.floor(next);
    }
    if (String(process.argv[i] ?? '').startsWith('--source-limit=')) {
      const next = Number(String(process.argv[i]).split('=')[1]);
      if (Number.isFinite(next) && next > 0) maxRows = Math.floor(next);
    }
  }
  const bundle = readJson(BUNDLE_MANIFEST, { files: [] });
  const schemaRows = readJsonl(SCHEMA_MAP);
  const normalizedRows = readJsonl(NORMALIZED_PREVIEW);
  const audit = readJson(AUDIT_REPORT, { matchedRows: 0, unmatchedRows: 0, ambiguousRows: 0 });
  const relevantOnly = args.has('--relevant-only');

  const inventory = new Map((bundle.files ?? []).map((file) => [file.normalizedPath, file]));
  const trainingRows = [
    ...schemaRowsToTrainingRows(schemaRows),
    ...sourceRefRowsToTrainingRows(normalizedRows, inventory, { relevantOnly, maxRows }),
  ];

  const sourceRefRows = normalizedRows.length;
  const relevantSourceRefRows = normalizedRows.filter((row) => RELEVANT_KINDS.has(classifySourceRef(row.originalRef))).length;
  const skippedSourceRefRows = sourceRefRows - relevantSourceRefRows;
  const laneScopedRows = relevantOnly
    ? normalizedRows.filter((row) => RELEVANT_KINDS.has(classifySourceRef(row.originalRef)))
    : normalizedRows;
  const laneScopedMatchedRows = laneScopedRows.filter((row) => row.normalized && inventory.has(row.normalized)).length;
  const laneScopedUnmatchedRows = laneScopedRows.length - laneScopedMatchedRows;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSONL, trainingRows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    rows: trainingRows.length,
    schemaRows: schemaRows.length,
    sourceRefRows,
    relevantSourceRefRows,
    skippedSourceRefRows,
    relevantOnly,
    maxRows,
    matchedRows: laneScopedMatchedRows,
    unmatchedRows: laneScopedUnmatchedRows,
    auditMatchedRows: audit.matchedRows ?? 0,
    auditUnmatchedRows: audit.unmatchedRows ?? 0,
    ambiguousRows: audit.ambiguousRows ?? 0,
    sampleTaskKinds: [...new Set(trainingRows.map((row) => row.task))],
  };
  writeJson(REPORT_JSON, report);
  writeMarkdown(REPORT_MD, [
    '# Training Rows Dry Run Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Training rows: ${report.rows}`,
    `- Schema rows: ${report.schemaRows}`,
    `- SourceRef rows: ${report.sourceRefRows}`,
    `- Relevant sourceRef rows: ${report.relevantSourceRefRows}`,
    `- Skipped sourceRef rows: ${report.skippedSourceRefRows}`,
    `- SourceRef cap: ${report.maxRows}`,
    `- Matched rows: ${report.matchedRows}`,
    `- Unmatched rows: ${report.unmatchedRows}`,
    `- Audit matched rows: ${report.auditMatchedRows}`,
    `- Audit unmatched rows: ${report.auditUnmatchedRows}`,
    `- Ambiguous rows: ${report.ambiguousRows}`,
    `- Relevant only: ${report.relevantOnly ? 'yes' : 'no'}`,
    '',
    '## Task Kinds',
    '',
    ...report.sampleTaskKinds.map((kind) => `- ${kind}`),
    '',
    '## Notes',
    '',
    '- Dry-run only. No DB, Qdrant, or Neo4j writes were performed.',
    '- Schema rows produce table projection examples; sourceRef rows produce alignment examples.',
  ].join('\n'));

  console.log(`Wrote ${OUT_JSONL}`);
  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
}

main();
