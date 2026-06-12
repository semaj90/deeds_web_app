#!/usr/bin/env node
/**
 * Batch memory/exports/*.json report objects into deterministic LD-JSON.
 *
 * Read-only by default. Use --apply to write:
 *   - memory/exports/reports.ndjson
 *   - memory/exports/reports.manifest.json
 *
 * Also writes a human-readable batch report under docs/reports/.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const EXPORT_DIR = path.join(ROOT, 'memory', 'exports');
const OUT_NDJSON = path.join(EXPORT_DIR, 'reports.ndjson');
const OUT_MANIFEST = path.join(EXPORT_DIR, 'reports.manifest.json');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'memory-exports-ldjson-batch-report.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'memory-exports-ldjson-batch-report.md');

const APPLY = process.argv.includes('--apply');

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pick(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function countFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidateKeys = [
    'rows',
    'totalRows',
    'totalCount',
    'count',
    'packet_count',
    'exportCount',
    'nodeCount',
    'edgeCount',
    'input_count',
    'written_count',
    'feature_count',
    'packetCount',
    'sampleCount',
  ];
  for (const key of candidateKeys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return Array.isArray(payload) ? `array(${payload.length})` : 'non-object payload';
  }

  const parts = [];
  const status = pick(payload.status, payload.overall, payload.promotionState);
  if (status) parts.push(`status=${status}`);

  const count = countFromPayload(payload);
  if (count !== null) parts.push(`count=${count}`);

  const coverage = pick(payload.completionEstimatePct, payload.replayRatePct, payload.passRatePct, payload.hitRate, payload.coverage);
  if (coverage) parts.push(`coverage=${coverage}`);

  const generatedAt = pick(payload.generatedAt, payload.generated_at, payload.ts, payload.timestamp, payload.created_at);
  if (generatedAt) parts.push(`generatedAt=${generatedAt}`);

  const note = pick(payload.notes, payload.note, payload.summary, payload.description);
  if (note) parts.push(`note=${note.slice(0, 160)}`);

  return parts.length ? parts.join(' | ') : `keys=${Object.keys(payload).slice(0, 10).join(', ')}`;
}

function listInputFiles() {
  if (!fs.existsSync(EXPORT_DIR)) return [];
  return fs
    .readdirSync(EXPORT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => path.join(EXPORT_DIR, entry.name))
    .filter((filePath) => {
      const base = path.basename(filePath);
      return !['reports.manifest.json', 'graph-refresh-manifest.json'].includes(base);
    })
    .sort((a, b) => rel(a).localeCompare(rel(b)));
}

function buildRow(filePath, payload) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  const reportId = path.basename(filePath, ext);
  return {
    report_id: reportId,
    source_path: rel(filePath),
    source_hash: sha256(raw),
    report_type: payload?.schema ?? payload?.type ?? payload?.kind ?? null,
    title: pick(payload?.title, payload?.name, payload?.label, payload?.topic, reportId),
    generated_at: pick(payload?.generatedAt, payload?.generated_at, payload?.timestamp, payload?.ts, payload?.created_at),
    status: pick(payload?.status, payload?.overall, payload?.promotionState),
    summary: summarizePayload(payload),
    top_level_keys: payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload).sort() : [],
    payload,
  };
}

function main() {
  const inputFiles = listInputFiles();
  const rows = [];
  const seenIds = new Map();
  const byType = new Map();
  let skippedInvalidJson = 0;

  for (const filePath of inputFiles) {
    let payload = null;
    try {
      payload = readJson(filePath);
    } catch {
      skippedInvalidJson += 1;
      continue;
    }

    const row = buildRow(filePath, payload);
    rows.push(row);

    seenIds.set(row.report_id, (seenIds.get(row.report_id) ?? 0) + 1);
    const typeKey = row.report_type ?? 'unknown';
    byType.set(typeKey, (byType.get(typeKey) ?? 0) + 1);
  }

  const duplicateReportIds = [...seenIds.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b));

  const ndjson = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  const outputSha256 = rows.length ? sha256(ndjson) : null;
  const manifest = {
    schema: 'memory_exports_reports_manifest.v1',
    generatedAt: new Date().toISOString(),
    input_count: inputFiles.length,
    written_count: rows.length,
    skipped_invalid_json: skippedInvalidJson,
    duplicate_report_ids: duplicateReportIds,
    duplicate_report_count: duplicateReportIds.length,
    output_sha256: outputSha256,
    ordered_by: 'source_path asc',
    source_dir: rel(EXPORT_DIR),
    ndjson_path: rel(OUT_NDJSON),
    created_at: new Date().toISOString(),
    report_types: Object.fromEntries([...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
  };

  const report = {
    generatedAt: manifest.generatedAt,
    sourceDir: rel(EXPORT_DIR),
    applyRequested: APPLY,
    applied: false,
    inputCount: inputFiles.length,
    writtenCount: rows.length,
    skippedInvalidJson,
    duplicateReportIds,
    outputSha256,
    outputNdjsonPath: rel(OUT_NDJSON),
    outputManifestPath: rel(OUT_MANIFEST),
    orderedBy: 'source_path asc',
    completionEstimatePct: inputFiles.length ? Math.round((rows.length / inputFiles.length) * 1000) / 10 : 0,
    reportTypeCounts: Object.fromEntries([...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    sampleRows: rows.slice(0, 8).map((row) => ({
      report_id: row.report_id,
      source_path: row.source_path,
      report_type: row.report_type,
      status: row.status,
      summary: row.summary,
    })),
    note: APPLY
      ? 'Deterministic report batch materialized as LD-JSON.'
      : 'Dry run only; use --apply to write LD-JSON and manifest outputs.',
  };

  if (APPLY) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    fs.writeFileSync(OUT_NDJSON, ndjson, 'utf8');
    fs.writeFileSync(OUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    report.applied = true;
  }

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(REPORT_MD, [
    '# Memory Exports LD-JSON Batch Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- apply requested: ${report.applyRequested}`,
    `- applied: ${report.applied}`,
    `- input JSON reports: ${report.inputCount}`,
    `- written LD-JSON rows: ${report.writtenCount}`,
    `- skipped invalid JSON: ${report.skippedInvalidJson}`,
    `- duplicate report IDs: ${report.duplicateReportIds.length}`,
    `- completion estimate: ${report.completionEstimatePct}%`,
    `- output NDJSON: ${report.outputNdjsonPath}`,
    `- output manifest: ${report.outputManifestPath}`,
    '',
    '## Report Type Counts',
    '',
    ...Object.entries(report.reportTypeCounts).map(([type, count]) => `- ${type}: ${count}`),
    '',
    '## Sample Rows',
    '',
    ...report.sampleRows.map((row) => `- ${row.report_id} (${row.status ?? 'n/a'}) ${row.summary}`),
    '',
    '## Notes',
    '',
    report.note,
    '',
  ].join('\n'), 'utf8');

  console.log(JSON.stringify({
    applied: report.applied,
    inputCount: report.inputCount,
    writtenCount: report.writtenCount,
    skippedInvalidJson: report.skippedInvalidJson,
    duplicateReportIds: report.duplicateReportIds.length,
    completionEstimatePct: report.completionEstimatePct,
    outputSha256: report.outputSha256,
  }, null, 2));
}

main();
