#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CAPABILITIES } from './lib/capability-catalog-v1.mjs';

const root = path.resolve(process.argv[2] || '.');
const reportsDir = path.resolve(process.argv[3] || path.join(root, 'docs/reports'));
const out = path.resolve(process.argv[4] || path.join(reportsDir, 'parent-atlas-capability-census-v1.json'));
const maxFiles = Number(process.env.ATLAS_CAPABILITY_MAX_FILES || 50000);
const maxBytes = Number(process.env.ATLAS_CAPABILITY_MAX_FILE_BYTES || 1024 * 1024);
const SKIP = new Set(['node_modules', '.git', '.svelte-kit', 'build', 'dist', '.venv', 'venv', '__pycache__', '.tmp']);

function walk(dir, acc = []) {
  if (acc.length >= maxFiles) return acc;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const entry of entries) {
    if (acc.length >= maxFiles) break;
    if (SKIP.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, acc);
    else if (entry.isFile()) acc.push(file);
  }
  return acc;
}

const files = walk(root);
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const textCache = new Map();
function fileText(file) {
  if (textCache.has(file)) return textCache.get(file);
  let text = '';
  try {
    if (fs.statSync(file).size <= maxBytes) text = fs.readFileSync(file, 'utf8');
  } catch { /* unreadable files remain non-matches */ }
  text = text.toLowerCase();
  textCache.set(file, text);
  return text;
}

const reportFiles = fs.existsSync(reportsDir) ? walk(reportsDir, []) : [];
const aggregateReport = /capability-census|execution-controller|blocker-audit|workboard|implementation-order|portfolio/i;
const reportText = reportFiles
  .map((file) => ({ relative: rel(file), text: fileText(file) }))
  .filter(({ relative }) => !aggregateReport.test(relative));
let runtimeReadiness = null;
try {
  const readinessPath = path.join(reportsDir, 'atlas-runtime-readiness-v1.json');
  runtimeReadiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
} catch { /* runtime readiness is optional evidence */ }
const runtimeGateByCapability = {
  CANONICAL_SOURCE_AUTHORITY: 'CANONICAL_LINEAGE_READY',
  FTS_CANONICAL_JOINBACK: 'CANONICAL_LINEAGE_READY',
  QDRANT_COLLECTION_SCHEMA: 'QDRANT_COLLECTION_SCHEMA_PROVEN',
  QDRANT_LINEAGE_PAYLOAD_INDEX: 'QDRANT_LINEAGE_TAGS_PROVEN',
  ANN03_LIVE_PARITY: 'ANN03_LIVE_PARITY_PROVEN',
  VALKEY_CENTROID_CACHE: 'VALKEY_CENTROID_CACHE_PROVEN',
  BITFROST_BUCKET_WARMING: 'BITFROST_BUCKET_WARMING_PROVEN',
  ACE_PACKET_V1: 'ACE_PACKET_READINESS_PROVEN',
  CONTEXT_MANIFEST_V1: 'CONTEXT_MANIFEST_CONTRACT_PRESENT',
  PREFILL_SYNTHESIS_READY: 'PREFILL_SYNTHESIS_READY',
  ACP_RUNTIME: 'ACP_ADAPTER_PROVEN',
  A2A_RUNTIME: 'A2A_ADAPTER_PROVEN',
  HITL_RECEIPTS: 'HUMAN_DECISION_RECEIPTS_PROVEN',
  PYTORCH_SHADOW_LEARNING: 'PYTORCH_LEARNING_LANE_PROVEN',
  DIRECTORY_FILE_GRAPH: 'DIRECTORY_GRAPH_AUDIT_PRESENT',
};
const runtimeGates = new Map((runtimeReadiness?.gates || []).map((gate) => [gate.key, gate]));
function classify(capability) {
  const hints = capability.fileHints.map((hint) => hint.toLowerCase());
  const matchingFiles = [];
  for (const file of files) {
    const relative = rel(file).toLowerCase();
    if (hints.some((hint) => relative.includes(hint) || fileText(file).includes(hint))) {
      matchingFiles.push(rel(file));
      if (matchingFiles.length >= 30) break;
    }
  }
  const proofHints = capability.proofHints.map((hint) => hint.toLowerCase());
  const qualifyingReports = reportText
    .filter(({ text }) => proofHints.every((hint) => text.includes(hint)))
    .filter(({ text }) => /proven|passed|healthy|readback|parity|receipt|ready/.test(text))
    .filter(({ text }) => !/blocked|unproven|not_proven|promotion.*false/.test(text))
    .slice(0, 10)
    .map(({ relative }) => relative);
  let state = 'UNPROVEN';
  if (capability.criticality === 'OPTIONAL_DEFERRED') state = 'OPTIONAL_DEFERRED';
  if (matchingFiles.length && state !== 'OPTIONAL_DEFERRED') state = 'PRESENT_CONTRACT';
  if (qualifyingReports.length) state = 'PROVEN';
  const blockerBlob = reportText
    .filter(({ relative }) => /blocker|critical-path|readiness/i.test(relative))
    .map(({ text }) => text)
    .join('\n');
  if (state !== 'PROVEN' && capability.proofHints.some((hint) => blockerBlob.includes(hint.toLowerCase())) && /waiting|blocked/.test(blockerBlob)) {
    state = 'WAITING';
  }
  const runtimeGate = runtimeGates.get(runtimeGateByCapability[capability.id]);
  if (runtimeGate) {
    if (runtimeGate.state === 'PROVEN') state = 'PROVEN';
    else if (runtimeGate.state === 'WAITING') state = 'WAITING';
    else if (runtimeGate.state === 'PARTIAL') state = 'PRESENT_CONTRACT';
    else if (runtimeGate.state === 'UNPROVEN') state = 'UNPROVEN';
  }
  return { ...capability, state, matchingFiles, qualifyingReports, runtimeGate: runtimeGate?.key || null };
}

const capabilities = CAPABILITIES.map(classify);
const summary = {};
for (const capability of capabilities) summary[capability.state] = (summary[capability.state] || 0) + 1;
const groups = {};
for (const capability of capabilities) (groups[capability.group] ||= []).push(capability.id);
const semantic = {
  schema: 'atlas.parent-capability-census.v1',
  scope: {
    root: rel(root) || '.',
    filesScanned: files.length,
    maxFiles,
    scanTruncated: files.length >= maxFiles,
  },
  summary,
  groups,
  critical: {
    p10: capabilities.filter((c) => c.criticality === 'P10_CRITICAL').map((c) => ({ id: c.id, state: c.state })),
    utility: capabilities.filter((c) => c.criticality === 'UTILITY_REQUIRED').map((c) => ({ id: c.id, state: c.state })),
    optional: capabilities.filter((c) => ['CHALLENGER_OPTIONAL', 'OPTIONAL_DEFERRED'].includes(c.criticality)).map((c) => ({ id: c.id, state: c.state })),
  },
  capabilities,
};
const semanticChecksum = crypto.createHash('sha256').update(JSON.stringify(semantic)).digest('hex');
const result = {
  ...semantic,
  generatedAt: new Date().toISOString(),
  policy: 'READ_ONLY_CAPABILITY_CENSUS_NO_AUTHORITY_MUTATION',
  semanticChecksum,
  writesPerformed: false,
  notes: [
    'PRESENT_CONTRACT is not live proof.',
    'scanTruncated=true means the file inventory reached maxFiles and is not exhaustive.',
    'KMeans/SOM/manifold/visual encodings are advisory challengers only.',
    'Parent Atlas ACE residency and cuVS CAGRA ACE (Augmented Core Extraction) are separate concepts and must use distinct identifiers.',
    'Only controller/receipt evidence may change task eligibility or promotion state.',
  ],
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ report: out, filesScanned: files.length, summary, semanticChecksum }, null, 2));
