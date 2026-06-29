#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const STORAGE_SCRIPT = path.join(ROOT, 'scripts', 'atlas', 'verify-summary-storage.mjs');
const STORAGE_JSON = path.join(ROOT, 'docs', 'reports', 'summary-storage-proof.json');
const SURFACE_JSON = path.join(ROOT, 'docs', 'reports', 'summary-surface-proof.json');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'summary-storage-proof-validation.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'summary-storage-proof-validation.md');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(
    REPORT_MD,
    [
      '# Summary Storage Proof Validation',
      '',
      `Generated: ${report.generated_at}`,
      `Status: ${report.status}`,
      '',
      '## Commands',
      '',
      `- storage proof script: ${report.commands.storage_script}`,
      '',
      '## Assertions',
      '',
      `- storage report exists: ${report.assertions.storage_report_exists ? 'PASS' : 'FAIL'}`,
      `- surface report exists: ${report.assertions.surface_report_exists ? 'PASS' : 'FAIL'}`,
      `- atlas_packets present: ${report.assertions.atlas_packets_present ? 'PASS' : 'FAIL'}`,
      `- atlas_summary_layers present: ${report.assertions.atlas_summary_layers_present ? 'PASS' : 'FAIL'}`,
      `- summary rows present: ${report.assertions.summary_rows_present ? 'PASS' : 'FAIL'}`,
      `- summary metadata present: ${report.assertions.summary_metadata_present ? 'PASS' : 'FAIL'}`,
      `- packet JSONB present: ${report.assertions.packet_jsonb_present ? 'PASS' : 'FAIL'}`,
      '',
      '## Counts',
      '',
      `- atlas_packets rows: ${report.counts.atlas_packets_rows}`,
      `- atlas_summary_layers rows: ${report.counts.atlas_summary_layers_rows}`,
      `- summary surface ndjson rows: ${report.counts.summary_surface_rows}`,
      '',
      '## Coverage',
      '',
      `- atlas_packets.metadata: ${report.coverage.atlas_packets_metadata_pct}%`,
      `- atlas_packets.topology: ${report.coverage.atlas_packets_topology_pct}%`,
      `- atlas_packets.vectors: ${report.coverage.atlas_packets_vectors_pct}%`,
      `- atlas_summary_layers.metadata: ${report.coverage.atlas_summary_layers_metadata_pct}%`,
    ].join('\n'),
    'utf8',
  );
}

const run = spawnSync(process.execPath, [STORAGE_SCRIPT], { cwd: ROOT, stdio: 'inherit' });
if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

const storage = fs.existsSync(STORAGE_JSON) ? readJson(STORAGE_JSON) : null;
const surface = fs.existsSync(SURFACE_JSON) ? readJson(SURFACE_JSON) : null;

const report = {
  generated_at: new Date().toISOString(),
  status: 'PASS',
  commands: {
    storage_script: 'node scripts/atlas/verify-summary-storage.mjs',
  },
  assertions: {
    storage_report_exists: Boolean(storage),
    surface_report_exists: Boolean(surface),
    atlas_packets_present: Boolean(storage?.tables?.atlas_packets?.exists),
    atlas_summary_layers_present: Boolean(storage?.tables?.atlas_summary_layers?.exists),
    summary_rows_present: Boolean(storage?.proof?.summary_rows),
    summary_metadata_present: Boolean(storage?.proof?.summary_metadata),
    packet_jsonb_present: Boolean(storage?.proof?.packet_jsonb),
  },
  counts: {
    atlas_packets_rows: Number(storage?.tables?.atlas_packets?.rows ?? 0),
    atlas_summary_layers_rows: Number(storage?.tables?.atlas_summary_layers?.rows ?? 0),
    summary_surface_rows: Number(surface?.files?.gemma4_ndjson?.rows ?? 0),
  },
  coverage: {
    atlas_packets_metadata_pct: Number(storage?.coverage?.atlas_packets_metadata_pct ?? 0),
    atlas_packets_topology_pct: Number(storage?.coverage?.atlas_packets_topology_pct ?? 0),
    atlas_packets_vectors_pct: Number(storage?.coverage?.atlas_packets_vectors_pct ?? 0),
    atlas_summary_layers_metadata_pct: Number(storage?.coverage?.atlas_summary_layers_metadata_pct ?? 0),
  },
};

if (
  !report.assertions.storage_report_exists ||
  !report.assertions.surface_report_exists ||
  !report.assertions.atlas_packets_present ||
  !report.assertions.atlas_summary_layers_present ||
  !report.assertions.summary_rows_present ||
  !report.assertions.summary_metadata_present ||
  !report.assertions.packet_jsonb_present
) {
  report.status = 'WARN';
}

writeReport(report);
console.log(`Wrote ${path.relative(ROOT, REPORT_JSON).replace(/\\/g, '/')}`);
console.log(`Wrote ${path.relative(ROOT, REPORT_MD).replace(/\\/g, '/')}`);
