#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { canonicalFeatureId, canonicalSourceRef, normalizeSourceRef } from './lib/lineage-field-aliases.mjs';
import { deriveMaterializationProofDetail, deriveMaterializationProofStates } from './lib/materialization-proof-state.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_NDJSON = path.join(REPO_ROOT, '.tmp', 'parent-atlas-replayable-packets.ndjson');
const OUTPUT_MANIFEST = path.join(REPO_ROOT, '.tmp', 'parent-atlas-replayable-packets.manifest.json');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-replayable-packet-reader-writer.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-replayable-packet-reader-writer.md');

const DEFAULT_INPUTS = [
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.ndjson'),
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.validated.ndjson'),
  path.join(REPO_ROOT, '.tmp', 'parent_atlas_packets', 'parent-atlas-packets.ndjson'),
  path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-package-smoke.json'),
  path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-postgres-mirror-reconciliation.json'),
];

function loadEnvFiles(root = REPO_ROOT) {
  const candidates = [
    path.join(root, '.env'),
    path.join(root, '.env.local'),
    path.join(root, 'sveltekit-frontend', '.env'),
    path.join(root, 'sveltekit-frontend', '.env.local'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const parsed = dotenv.parse(fs.readFileSync(file));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined || process.env[key] === '') process.env[key] = value;
    }
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map((item) => stableJson(item));
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        const normalized = stableJson(value[key]);
        if (normalized !== undefined) acc[key] = normalized;
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableJson(value ?? null));
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function parseArgs(argv) {
  const input = [];
  let apply = false;
  let json = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') apply = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--json') json = true;
    else if (arg === '--input' && argv[i + 1]) {
      input.push(argv[++i]);
    } else if (arg.startsWith('--input=')) {
      input.push(arg.slice('--input='.length));
    }
  }
  return { input, apply, dryRun, json };
}

async function walkReplayInputs(entry) {
  const resolved = path.resolve(REPO_ROOT, entry);
  const stats = await fsPromises.stat(resolved).catch(() => null);
  if (!stats) return [];
  if (stats.isFile()) {
    return /\.(ndjson|jsonl)$/i.test(resolved) ? [resolved] : [];
  }
  const files = [];
  const stack = [resolved];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fsPromises.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const item of entries) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) {
        if (item.name === 'node_modules' || item.name === '.git') continue;
        stack.push(full);
      } else if (item.isFile() && /\.(ndjson|jsonl)$/i.test(item.name)) {
        files.push(full);
      }
    }
  }
  return files;
}

function readNdjsonFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const records = [];
  const parseErrors = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      records.push({ raw: JSON.parse(trimmed), lineNumber: index + 1 });
    } catch (error) {
      parseErrors.push({
        file: filePath,
        line: index + 1,
        message: error?.message || String(error),
      });
    }
  });
  return { records, parseErrors };
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean);
  const text = normalizeText(value);
  return text ? [text] : [];
}

function arrayFromAliases(row, aliases) {
  const values = [];
  for (const alias of aliases) {
    const value = row?.[alias];
    if (Array.isArray(value)) {
      values.push(...value.map((item) => normalizeText(item)).filter(Boolean));
      continue;
    }
    const text = normalizeText(value);
    if (text) values.push(text);
  }
  return [...new Set(values)];
}

function firstDefined(row, aliases) {
  for (const alias of aliases) {
    const value = row?.[alias];
    if (Array.isArray(value)) {
      const item = value.find((entry) => normalizeText(entry));
      if (item !== undefined) return item;
      continue;
    }
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return undefined;
}

function normalizeReplayRecord(raw, { sourceFile, lineNumber }) {
  const packetKey = normalizeText(firstDefined(raw, ['packet_key', 'packetKey']));
  const sourceRef = normalizeSourceRef(canonicalSourceRef(raw) || firstDefined(raw, ['source_ref', 'sourceRef', 'file_path', 'filePath', 'path']) || '');
  const featureId = canonicalFeatureId(raw);
  const titleId = normalizeText(firstDefined(raw, ['title_id', 'titleId']));
  const treeNodeId = normalizeText(firstDefined(raw, ['tree_node_id', 'treeNodeId']));
  const qdrantPointId = normalizeText(firstDefined(raw, ['qdrant_point_id', 'qdrantPointId', 'point_id', 'pointId']));
  const contentHash = normalizeText(firstDefined(raw, ['content_hash', 'contentHash']));
  const summary = normalizeText(firstDefined(raw, ['summary', 'summary_text', 'summaryText']));
  const summaryType = normalizeText(firstDefined(raw, ['summary_type', 'summaryType', 'summary_level', 'summaryLevel']));
  const domainClass = normalizeText(firstDefined(raw, ['domain_class', 'domainClass', 'domain']));
  const ontologyLabel = normalizeText(firstDefined(raw, ['ontology_label', 'ontologyLabel']));
  const topologyLabel = normalizeText(firstDefined(raw, ['topology_label', 'topologyLabel']));
  const somCluster = normalizeText(firstDefined(raw, ['som_cluster', 'somCluster', 'cluster_id', 'clusterId']));
  const communityId = normalizeText(firstDefined(raw, ['community_id', 'communityId']));
  const metadataVersion = normalizeText(firstDefined(raw, ['metadata_version', 'metadataVersion']));
  const repositoryId = normalizeText(firstDefined(raw, ['repository_id', 'repositoryId']));
  const symbolKind = normalizeText(firstDefined(raw, ['symbol_kind', 'symbolKind']));
  const contractVersion = normalizeText(firstDefined(raw, ['contract_version', 'contractVersion']));
  const keywords = arrayFromAliases(raw, ['keywords']);
  const concepts = arrayFromAliases(raw, ['concepts', 'concept_ids', 'used_concepts']);
  const tags = arrayFromAliases(raw, ['tags']);

  const missingIdentity = [];
  if (!packetKey) missingIdentity.push('packet_key');
  if (!sourceRef) missingIdentity.push('source_ref');
  if (!featureId) missingIdentity.push('feature_id');

  return {
    status: missingIdentity.length > 0 ? 'skipped' : 'accepted',
    source_file: sourceFile,
    source_line: lineNumber,
    packet_key: packetKey || null,
    source_ref: sourceRef || null,
    canonical_source_ref: sourceRef || null,
    feature_id: featureId || null,
    title_id: titleId || null,
    tree_node_id: treeNodeId || null,
    qdrant_point_id: qdrantPointId || null,
    content_hash: contentHash || null,
    summary: summary || null,
    summary_type: summaryType || null,
    domain_class: domainClass || null,
    ontology_label: ontologyLabel || null,
    topology_label: topologyLabel || null,
    som_cluster: somCluster || null,
    community_id: communityId || null,
    metadata_version: metadataVersion || null,
    repository_id: repositoryId || null,
    symbol_kind: symbolKind || null,
    keywords,
    concepts,
    tags,
    contract_version: contractVersion || null,
    missing_identity_fields: missingIdentity,
  };
}

function buildReplayReport({ inputs, acceptedRows, skippedRows, parseErrors, generatedAt = new Date().toISOString() }) {
  const coverageFields = [
    'packet_key',
    'source_ref',
    'feature_id',
    'title_id',
    'tree_node_id',
    'qdrant_point_id',
    'summary_type',
    'domain_class',
    'ontology_label',
    'topology_label',
    'som_cluster',
    'community_id',
    'metadata_version',
    'repository_id',
    'symbol_kind',
    'contract_version',
  ];

  const counts = acceptedRows.reduce((acc, row) => {
    for (const field of coverageFields) {
      if (row[field] !== null && row[field] !== undefined && normalizeText(row[field])) acc[field] += 1;
    }
    return acc;
  }, Object.fromEntries(coverageFields.map((field) => [field, 0])));

  const manifest = {
    schema_version: 1,
    generated_at: generatedAt,
    input_files: inputs.map((item) => item.path),
    accepted_rows: acceptedRows.length,
    skipped_rows: skippedRows.length,
    parse_errors: parseErrors.length,
    accepted_identity_hash: hashText(stableStringify(acceptedRows.map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      content_hash: row.content_hash,
      source_file: row.source_file,
      source_line: row.source_line,
    })))),
  };

  const totals = {
    files: inputs.length,
    accepted_rows: acceptedRows.length,
    skipped_rows: skippedRows.length,
    parse_errors: parseErrors.length,
    unique_packet_keys: new Set(acceptedRows.map((row) => row.packet_key)).size,
    unique_source_refs: new Set(acceptedRows.map((row) => row.source_ref)).size,
  };

  const status = acceptedRows.length === 0
    ? 'FAIL'
    : parseErrors.length > 0 || skippedRows.length > 0
      ? 'PASS_WITH_WARNINGS'
      : 'PASS';

  const proof = deriveMaterializationProofDetail({
    materializedRows: acceptedRows.length,
    missingQdrantPointId: skippedRows.filter((row) => !row.qdrant_point_id).length,
    missingQdrantCollection: 0,
    missingFeatureId: skippedRows.filter((row) => !row.feature_id).length,
    missingCanonicalSourceRef: skippedRows.filter((row) => !row.canonical_source_ref).length,
  }, {
    fullMaterializationProven: false,
    resumeSemanticsProven: false,
    atomicPublicationProven: false,
    qdrantMirrorProven: false,
  });

  return {
    generated_at: generatedAt,
    status,
    manifest,
    proof,
    proofStates: deriveMaterializationProofStates(proof),
    totals,
    coverage: Object.fromEntries(coverageFields.map((field) => [field, {
      count: counts[field],
      pct: acceptedRows.length > 0 ? Number(((counts[field] / acceptedRows.length) * 100).toFixed(2)) : 0,
    }])),
    inputs,
    parse_errors: parseErrors,
    skipped_rows: skippedRows.slice(0, 50),
    accepted_sample: acceptedRows.slice(0, 20),
  };
}

function renderMarkdown(report) {
  const lines = [
    '# Parent Atlas Replayable Packet Reader / Writer',
    '',
    `- Generated: ${report.generated_at}`,
    `- Status: ${report.status}`,
    `- Accepted rows: ${report.totals.accepted_rows}`,
    `- Skipped rows: ${report.totals.skipped_rows}`,
    `- Parse errors: ${report.totals.parse_errors}`,
    `- Manifest hash: \`${report.manifest.accepted_identity_hash}\``,
    '',
    '## Proof',
    '',
    `- batching logic: ${report.proof.batchingLogic}`,
    `- full materialization: ${report.proof.fullMaterialization}`,
    `- resume semantics: ${report.proof.resumeSemantics}`,
    `- atomic publication: ${report.proof.atomicPublication}`,
    `- qdrant mirror: ${report.proof.qdrantMirror}`,
    `- identity coverage: ${report.proof.identityCoverage}`,
    `- proof states: ${report.proofStates.join(', ')}`,
    '',
    '## Coverage',
  ];
  for (const [field, stat] of Object.entries(report.coverage)) {
    lines.push(`- ${field}: ${stat.count} (${stat.pct}%)`);
  }
  lines.push('', '## Inputs');
  for (const input of report.inputs) {
    lines.push(`- ${input.kind}: ${input.path} (${input.accepted_rows} accepted / ${input.skipped_rows} skipped / ${input.parse_errors} parse errors)`);
  }
  if (report.parse_errors.length > 0) {
    lines.push('', '## Parse errors');
    for (const error of report.parse_errors.slice(0, 20)) {
      lines.push(`- ${error.file}:${error.line} — ${error.message}`);
    }
  }
  if (report.skipped_rows.length > 0) {
    lines.push('', '## Skipped rows');
    for (const row of report.skipped_rows.slice(0, 20)) {
      lines.push(`- ${row.source_file}:${row.source_line} — missing ${row.missing_identity_fields.join(', ')}`);
    }
  }
  return lines.join('\n');
}

async function collectReplayInputs(argvInputs) {
  const candidates = argvInputs.length > 0 ? argvInputs : DEFAULT_INPUTS;
  const discovered = [];
  for (const entry of candidates) {
    const files = await walkReplayInputs(entry);
    if (files.length > 0) {
      for (const file of files) {
        discovered.push({
          path: file,
          kind: path.extname(file).slice(1).toLowerCase() || 'ndjson',
        });
      }
      continue;
    }
    const resolved = path.resolve(REPO_ROOT, entry);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      discovered.push({
        path: resolved,
        kind: path.extname(resolved).slice(1).toLowerCase() || 'ndjson',
      });
    }
  }
  return discovered.filter((item, index, array) => array.findIndex((candidate) => candidate.path === item.path) === index);
}

async function main(argv = process.argv.slice(2)) {
  loadEnvFiles();
  const flags = parseArgs(argv);
  const inputs = await collectReplayInputs(flags.input);

  const parseErrors = [];
  const acceptedRows = [];
  const skippedRows = [];

  for (const input of inputs) {
    const { records, parseErrors: fileErrors } = readNdjsonFile(input.path);
    parseErrors.push(...fileErrors);
    for (const record of records) {
      const normalized = normalizeReplayRecord(record.raw, {
        sourceFile: input.path,
        lineNumber: record.lineNumber,
      });
      if (normalized.status === 'accepted') acceptedRows.push(normalized);
      else skippedRows.push(normalized);
    }
  }

  acceptedRows.sort((a, b) =>
    String(a.packet_key || '').localeCompare(String(b.packet_key || '')) ||
    String(a.source_ref || '').localeCompare(String(b.source_ref || '')) ||
    String(a.feature_id || '').localeCompare(String(b.feature_id || '')) ||
    String(a.source_file || '').localeCompare(String(b.source_file || '')) ||
    Number(a.source_line || 0) - Number(b.source_line || 0)
  );

  const report = buildReplayReport({ inputs, acceptedRows, skippedRows, parseErrors });

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(REPORT_MD, renderMarkdown(report), 'utf8');

  const shouldWrite = flags.apply && !flags.dryRun;
  if (shouldWrite) {
    fs.mkdirSync(path.dirname(OUTPUT_NDJSON), { recursive: true });
    const ndjson = acceptedRows.map((row) => JSON.stringify(row)).join('\n') + (acceptedRows.length > 0 ? '\n' : '');
    fs.writeFileSync(OUTPUT_NDJSON, ndjson, 'utf8');
    fs.writeFileSync(OUTPUT_MANIFEST, JSON.stringify(report.manifest, null, 2), 'utf8');
  }

  if (!flags.json) {
    console.log('\n═══ Parent Atlas Replayable Packet Reader / Writer ═══════════');
    console.log(`Status: ${report.status}`);
    console.log(`Inputs: ${report.inputs.length}`);
    console.log(`Accepted rows: ${report.totals.accepted_rows}`);
    console.log(`Skipped rows: ${report.totals.skipped_rows}`);
    console.log(`Parse errors: ${report.totals.parse_errors}`);
    console.log(`Manifest: ${report.manifest.accepted_identity_hash}`);
    if (shouldWrite) {
      console.log(`Wrote: ${path.relative(REPO_ROOT, OUTPUT_NDJSON)}`);
      console.log(`Wrote: ${path.relative(REPO_ROOT, OUTPUT_MANIFEST)}`);
    } else {
      console.log('Dry-run only; no output NDJSON written.');
    }
    console.log(`Report: ${path.relative(REPO_ROOT, REPORT_JSON)}`);
  } else {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }

  process.exitCode = report.status === 'FAIL' ? 1 : 0;
  return report;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(`❌ Fatal: ${error?.message || String(error)}`);
    process.exit(1);
  });
}

export {
  buildReplayReport,
  collectReplayInputs,
  loadEnvFiles,
  main,
  normalizeReplayRecord,
  renderMarkdown as renderReplayMarkdown,
  readNdjsonFile,
};
