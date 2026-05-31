#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function findProjectRoot(start=process.cwd()){
  let cur = path.resolve(start);
  for (let i=0;i<10;i++){
    if (fs.existsSync(path.join(cur,'package.json'))) return cur;
    const up = path.dirname(cur); if (up===cur) break; cur = up;
  }
  return path.resolve(start);
}

const projectRoot = findProjectRoot();
const repoRoot = path.resolve(projectRoot, '..');

const CANDIDATE_RELS = [
  '.tmp/feature_labels.jsonl',
  'sveltekit-frontend/.tmp/feature_labels.jsonl',
  '.tmp/ingest/feature_labels.jsonl',
  '.tmp/ingest/lanes/feature_labels.jsonl',
  'memory/exports/feature_labels.jsonl',
  '.tmp/feature-labels.ndjson',
  '.tmp/feature-labels.jsonl',
  '.tmp/ingest/feature-labels.jsonl',
  '.tmp/feature_labels.jsonl'
];

function firstExistingRoot(rootBase, rels){
  for (const rel of rels){
    const full = path.resolve(rootBase, rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

const inPath = firstExistingRoot(projectRoot, CANDIDATE_RELS) || firstExistingRoot(repoRoot, CANDIDATE_RELS);
const root = projectRoot;
if (!inPath){
  console.error('No input feature labels found. Tried:', candidates.join('\n'));
  process.exit(1);
}

const outDir = path.join(root,'.tmp','ingest');
fs.mkdirSync(outDir,{ recursive:true });
const outFile = path.join(outDir,'parent-atlas-hypergraph.jsonl');

function sha256Hex(s){ return crypto.createHash('sha256').update(s).digest('hex'); }

const streamIn = fs.readFileSync(inPath,'utf8').split(/\r?\n/).filter(Boolean);
let count = 0;
for (const line of streamIn){
  let rec;
  try{ rec = JSON.parse(line); } catch(e){ continue; }
  const source_ref = rec.source_ref || rec.source || rec.file || rec.path || null;
  const feature_id = rec.id || rec.feature_id || rec.key || rec.label || null;
  const workspace_task_id = rec.task_id || rec.workspace_task_id || null;
  const index_version = rec.index_version || 1;
  const record_id = sha256Hex(`${source_ref||''}|${feature_id||''}|${workspace_task_id||''}|${index_version}`);
  const row = {
    record_id,
    source_ref: source_ref||'unknown',
    feature_id: feature_id||null,
    workspace_task_id: workspace_task_id||null,
    lane_id: rec.lane_id || rec.cluster || null,
    cluster_id: rec.cluster_id || null,
    parent_cluster_id: null,
    semantic_path: rec.semantic_path || null,
    record_type: rec.record_type || 'feature',
    payload: rec,
    embedding: rec.embedding || null,
    embedding_model: rec.embedding_model || null,
    embedding_status: rec.embedding ? 'real' : 'missing',
    index_version: index_version,
    created_at: new Date().toISOString(),
    supersedes_id: null
  };
  fs.appendFileSync(outFile, JSON.stringify(row) + '\n');
  count++;
}

console.log('Appended', count, 'records to', outFile);
process.exit(0);
