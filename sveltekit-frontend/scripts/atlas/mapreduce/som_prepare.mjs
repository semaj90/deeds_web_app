#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// Resolve project root by walking up until package.json is found
function findProjectRoot(start=process.cwd()){
  let cur = path.resolve(start);
  for (let i=0;i<10;i++){
    if (fs.existsSync(path.join(cur,'package.json'))) return cur;
    const up = path.dirname(cur);
    if (up===cur) break;
    cur = up;
  }
  // fallback to script relative location
  return path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..'));
}

const projectRoot = findProjectRoot();
const repoRoot = path.resolve(projectRoot, '..');
const root = projectRoot;
const tmpDir = path.join(root, '.tmp');

const FEATURE_LABEL_CANDIDATES = [
  '.tmp/feature_labels.jsonl',
  'sveltekit-frontend/.tmp/feature_labels.jsonl',
  '.tmp/ingest/feature_labels.jsonl',
  '.tmp/ingest/lanes/feature_labels.jsonl',
  'memory/exports/feature_labels.jsonl',
  'docs/graph/feature_labels.jsonl'
];

const DRIZZLE_AUDIT_CANDIDATES = [
  '.tmp/drizzle-introspect/drizzle-temporal-audit.latest.json',
  'sveltekit-frontend/.tmp/drizzle-introspect/drizzle-temporal-audit.latest.json',
  'drizzle-temporal-audit.latest.json',
  'sveltekit-frontend/drizzle-temporal-audit.latest.json'
];

function firstExisting(base, candidates){
  for (const rel of candidates){
    const full = path.resolve(base, rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

const featureLabelsPath =
  firstExisting(projectRoot, FEATURE_LABEL_CANDIDATES) ||
  firstExisting(repoRoot, FEATURE_LABEL_CANDIDATES);
const temporalAuditPath =
  firstExisting(projectRoot, DRIZZLE_AUDIT_CANDIDATES) ||
  firstExisting(repoRoot, DRIZZLE_AUDIT_CANDIDATES);

if (!featureLabelsPath){
  throw new Error(`Missing feature_labels.jsonl. Tried:\n${FEATURE_LABEL_CANDIDATES.join('\n')}`);
}
const outPairs = path.join(root, '.tmp', 'som_training_pairs.jsonl');
const outManifest = path.join(root, '.tmp', 'som_training_manifest.json');

function readJsonl(p){
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
}

function safeReadJson(p){
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p,'utf8'));
}

console.log('MapReduce: SOM prepare — reading inputs');
const features = readJsonl(featureLabelsPath);
const audit = safeReadJson(temporalAuditPath);

if (features.length===0){
  console.warn('No feature labels found at', featureLabelsPath, '- nothing to join.');
}

const auditMap = {};
if (audit && audit.results){
  for (const r of audit.results) auditMap[r.table || r.name || r.id] = r;
}

// Build join pairs: for every feature label, attach audit classification if available.
const pairs = [];
for (const f of features){
  // expected feature shape: { id, type, source, meta }
  const id = f.id || f.key || f.table || f.file || null;
  const source = f.source || f.table || f.file || f.id || 'unknown';
  const label = f.label || f.feature || f.kind || null;
  const auditEntry = auditMap[source] || auditMap[id] || null;
  const classification = auditEntry ? auditEntry.classification : null;
  const pair = {
    id: id || `feature:${Math.random().toString(36).slice(2,9)}`,
    source,
    label,
    feature: f,
    audit: auditEntry ? { table: auditEntry.table, classification: auditEntry.classification, estimated_rows: auditEntry.estimated_rows||0 } : null,
    created_at: new Date().toISOString()
  };
  pairs.push(pair);
}

// Write pairs JSONL
fs.mkdirSync(tmpDir, { recursive: true });
fs.writeFileSync(outPairs, pairs.map(p=>JSON.stringify(p)).join('\n') + '\n');

// Write manifest
const manifest = {
  generated_at: new Date().toISOString(),
  input_feature_count: features.length,
  output_pair_count: pairs.length,
  sample_pair: pairs[0] || null
};
fs.writeFileSync(outManifest, JSON.stringify(manifest, null, 2));

console.log('Wrote', outPairs, '(', pairs.length, 'pairs )');
console.log('Wrote', outManifest);
console.log('MapReduce SOM prepare complete. Next: run SOM train using', outPairs);

process.exit(0);
