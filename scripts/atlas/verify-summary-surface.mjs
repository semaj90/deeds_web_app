#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PACKAGE_DIST = path.join(ROOT, 'packages', 'parent-atlas', 'dist', 'index.js');
const LEGACY_SHIM = path.join(ROOT, 'scripts', 'atlas', 'lib', 'summary-context-map.mjs');
const GEMMA4_NDJSON = path.join(ROOT, '.tmp', 'gemma4-summary-packets.ndjson');
const CHROM97_NDJSON = path.join(ROOT, '.tmp', 'chrom97-summary-packets.ndjson');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'summary-surface-proof.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'summary-surface-proof.md');

function exists(filePath) {
  return fs.existsSync(filePath);
}

function readFirstJsonLine(filePath) {
  if (!exists(filePath)) return null;
  const line = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).find((item) => item.trim());
  if (!line) return null;
  return JSON.parse(line);
}

function countLines(filePath) {
  if (!exists(filePath)) return 0;
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter((line) => line.trim()).length;
}

function fieldStatus(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

const pkg = await import(pathToFileURL(PACKAGE_DIST).href);
const shim = await import(pathToFileURL(LEGACY_SHIM).href);

const packageExports = {
  buildSummaryContext: typeof pkg.buildSummaryContext === 'function',
  classifyDomain: typeof pkg.classifyDomain === 'function',
  classifyOntology: typeof pkg.classifyOntology === 'function',
  classifyTopology: typeof pkg.classifyTopology === 'function',
  formatSummaryContext: typeof pkg.formatSummaryContext === 'function',
  makeGemma4SummaryPacket: typeof pkg.makeGemma4SummaryPacket === 'function',
  makeChrom97Packet: typeof pkg.makeChrom97Packet === 'function',
  toNdjsonLine: typeof pkg.toNdjsonLine === 'function',
};

const shimExports = {
  buildSummaryContext: typeof shim.buildSummaryContext === 'function',
  classifyDomain: typeof shim.classifyDomain === 'function',
  classifyOntology: typeof shim.classifyOntology === 'function',
  classifyTopology: typeof shim.classifyTopology === 'function',
  formatSummaryContext: typeof shim.formatSummaryContext === 'function',
};

const sampleRow = {
  packet_key: 'packet-1',
  source_ref: 'src/routes/api/foo.ts',
  canonical_source_ref: 'repo:src/routes/api/foo.ts',
  feature_id: 'feature.search.foo',
  feature_label: 'Foo Search',
  summary: 'Foo summary',
  domain_class: 'retrieval',
  ontology_label: 'api_route',
  topology_label: 'retrieval_layer',
  summary_packet_key: 'packet-1:summary',
  tags: ['retrieval'],
};

const packageContext = pkg.buildSummaryContext(sampleRow);
const shimContext = shim.buildSummaryContext(sampleRow);
const gemma4Packet = pkg.makeGemma4SummaryPacket(sampleRow);
const chrom97Packet = pkg.makeChrom97Packet(sampleRow);

const report = {
  generated_at: new Date().toISOString(),
  status: 'PASS',
  files: {
    package_dist: { path: path.relative(ROOT, PACKAGE_DIST).replace(/\\/g, '/'), exists: exists(PACKAGE_DIST) },
    legacy_shim: { path: path.relative(ROOT, LEGACY_SHIM).replace(/\\/g, '/'), exists: exists(LEGACY_SHIM) },
    gemma4_ndjson: { path: path.relative(ROOT, GEMMA4_NDJSON).replace(/\\/g, '/'), exists: exists(GEMMA4_NDJSON), rows: countLines(GEMMA4_NDJSON) },
    chrom97_ndjson: { path: path.relative(ROOT, CHROM97_NDJSON).replace(/\\/g, '/'), exists: exists(CHROM97_NDJSON), rows: countLines(CHROM97_NDJSON) },
  },
  exports: {
    package: packageExports,
    shim: shimExports,
  },
  sample: {
    package_context_fields: {
      packet_key: fieldStatus(packageContext.packet_key),
      source_ref: fieldStatus(packageContext.source_ref),
      feature_id: fieldStatus(packageContext.feature_id),
      feature_label: fieldStatus(packageContext.feature_label),
      domain_class: fieldStatus(packageContext.domain_class),
      ontology_label: fieldStatus(packageContext.ontology_label),
      topology_label: fieldStatus(packageContext.topology_label),
    },
    shim_context_fields: {
      packet_key: fieldStatus(shimContext.packet_key),
      source_ref: fieldStatus(shimContext.source_ref),
      feature_id: fieldStatus(shimContext.feature_id),
      feature_label: fieldStatus(shimContext.feature_label),
      domain_class: fieldStatus(shimContext.domain_class),
      ontology_label: fieldStatus(shimContext.ontology_label),
      topology_label: fieldStatus(shimContext.topology_label),
    },
    gemma4_packet: {
      packet_key: gemma4Packet.packet_key,
      feature_id: gemma4Packet.feature_id,
      summary_packet_key: gemma4Packet.summary_packet_key,
    },
    chrom97_packet: {
      packet_key: chrom97Packet.packet_key,
      feature_id: chrom97Packet.feature_id,
      summary_packet_key: chrom97Packet.summary_packet_key,
      canonical_source_ref: chrom97Packet.canonical_source_ref,
    },
  },
  proof: {
    package_export_surface: Object.values(packageExports).every(Boolean),
    legacy_shim_surface: Object.values(shimExports).every(Boolean),
    sample_identity_preserved:
      fieldStatus(chrom97Packet.packet_key) &&
      fieldStatus(chrom97Packet.source_ref) &&
      fieldStatus(chrom97Packet.canonical_source_ref) &&
      fieldStatus(chrom97Packet.feature_id) &&
      fieldStatus(chrom97Packet.summary_packet_key),
    ndjson_ready: exists(GEMMA4_NDJSON) && exists(CHROM97_NDJSON),
  },
};

if (!report.proof.package_export_surface || !report.proof.legacy_shim_surface || !report.proof.sample_identity_preserved) {
  report.status = 'WARN';
}

fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
fs.writeFileSync(
  REPORT_MD,
  [
    '# Summary Surface Proof',
    '',
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    '',
    '## Files',
    '',
    `- package dist: ${report.files.package_dist.exists ? 'PASS' : 'FAIL'} (${report.files.package_dist.path})`,
    `- legacy shim: ${report.files.legacy_shim.exists ? 'PASS' : 'FAIL'} (${report.files.legacy_shim.path})`,
    `- gemma4 ndjson: ${report.files.gemma4_ndjson.exists ? `PASS (${report.files.gemma4_ndjson.rows} rows)` : 'FAIL'}`,
    `- chrom97 ndjson: ${report.files.chrom97_ndjson.exists ? `PASS (${report.files.chrom97_ndjson.rows} rows)` : 'FAIL'}`,
    '',
    '## Proof',
    '',
    `- package export surface: ${report.proof.package_export_surface ? 'PASS' : 'WARN'}`,
    `- legacy shim surface: ${report.proof.legacy_shim_surface ? 'PASS' : 'WARN'}`,
    `- sample identity preserved: ${report.proof.sample_identity_preserved ? 'PASS' : 'WARN'}`,
    `- ndjson ready: ${report.proof.ndjson_ready ? 'PASS' : 'WARN'}`,
  ].join('\n'),
  'utf8',
);

console.log(`Wrote ${path.relative(ROOT, REPORT_JSON).replace(/\\/g, '/')}`);
console.log(`Wrote ${path.relative(ROOT, REPORT_MD).replace(/\\/g, '/')}`);
