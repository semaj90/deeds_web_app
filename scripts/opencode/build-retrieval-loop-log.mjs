#!/usr/bin/env node
// Build a retrieval loop JSONL for token-card-weight-updater consumption
// Usage: node scripts/opencode/build-retrieval-loop-log.mjs "query text" [--publish]

import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('Usage: node scripts/opencode/build-retrieval-loop-log.mjs "query text" [--publish]');
  process.exit(2);
}

const query = argv[0];
const publish = argv.includes('--publish');

const root = process.cwd();
const paths = {
  phase18: path.join(root, '.tmp', 'phase18-xgboost-rerank.jsonl'),
  acePacket: path.join(root, '.opencode', 'ace-packet.json'),
  clusters: path.join(root, 'memory', 'exports', 'cluster-cards.jsonl'),
  pathways: path.join(root, 'memory', 'exports', 'pathway-cards.jsonl'),
  rerankDiff: path.join(root, '.tmp', 'rerank-diff.json'),
  out: path.join(root, '.tmp', 'atlas-retrieval-loop.jsonl')
};

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return null;
  }
}

function parseJsonl(text) {
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch (e) { return null; }
  }).filter(Boolean);
}

// Load inputs
const phase18Text = safeReadFile(paths.phase18);
const phase18 = parseJsonl(phase18Text);

const acePacketText = safeReadFile(paths.acePacket);
let acePacket = null;
if (acePacketText) {
  try { acePacket = JSON.parse(acePacketText); } catch (e) { acePacket = null; }
}

const clustersText = safeReadFile(paths.clusters);
const clusterCards = parseJsonl(clustersText);

const pathwaysText = safeReadFile(paths.pathways);
const pathwayCards = parseJsonl(pathwaysText);

const rerankDiffText = safeReadFile(paths.rerankDiff);
let rerankDiff = null;
if (rerankDiffText) {
  try { rerankDiff = JSON.parse(rerankDiffText); } catch (e) { rerankDiff = null; }
}

// Heuristic: find a phase18 entry that matches the query, else pick the last entry
let chosen = null;
if (phase18.length > 0) {
  chosen = phase18.find(e => e.query && e.query === query) || phase18[phase18.length - 1];
}

// Build a minimal retrieval-loop row
const now = new Date().toISOString();

const row = {
  timestamp: now,
  query,
  intent: (acePacket && acePacket.intent) || (chosen && chosen.intent) || 'unknown',
  domain: (acePacket && acePacket.domain) || (chosen && chosen.domain) || 'unknown',
  sourceRefs: [],
  selectedCardIds: [],
  rerankScore: (chosen && (chosen.rerankScore || chosen.score || null)) || null,
  tool: (chosen && chosen.tool) || 'xgboost_rerank',
  outcome: 'dry_run',
  feedback: 'pending'
};

// Preserve sourceRefs from ace-packet or phase18 entry or rerank-diff
if (acePacket && Array.isArray(acePacket.sourceRefs)) row.sourceRefs.push(...acePacket.sourceRefs);
if (chosen && Array.isArray(chosen.sourceRefs)) row.sourceRefs.push(...chosen.sourceRefs);
if (rerankDiff && Array.isArray(rerankDiff.sourceRefs)) row.sourceRefs.push(...rerankDiff.sourceRefs);

// Normalize unique sourceRefs
row.sourceRefs = Array.from(new Set(row.sourceRefs));

// selectedCardIds: try chosen.selected || chosen.topK || rerank-diff moved/after
if (chosen) {
  if (Array.isArray(chosen.selected)) row.selectedCardIds.push(...chosen.selected);
  if (Array.isArray(chosen.topK)) row.selectedCardIds.push(...chosen.topK);
  if (Array.isArray(chosen.selectedCardIds)) row.selectedCardIds.push(...chosen.selectedCardIds);
}

if (rerankDiff) {
  // rerank-diff may have { before:[], after:[] }
  if (Array.isArray(rerankDiff.after)) row.selectedCardIds.push(...rerankDiff.after.slice(0, 20));
  if (Array.isArray(rerankDiff.moved)) row.selectedCardIds.push(...rerankDiff.moved.map(m => m.id || m.cardId).filter(Boolean));
}

// Dedupe
row.selectedCardIds = Array.from(new Set(row.selectedCardIds));

// If still empty, try to infer from cluster-cards topFiles for a matching cluster in acePacket
if (row.selectedCardIds.length === 0 && acePacket && acePacket.clusterId) {
  const match = clusterCards.find(c => c.clusterId === acePacket.clusterId || c.id === acePacket.clusterId);
  if (match && Array.isArray(match.topFiles)) {
    row.selectedCardIds.push(...match.topFiles.slice(0, 8));
  }
}

// Final fallback: take first N cluster topFiles
if (row.selectedCardIds.length === 0 && clusterCards.length > 0) {
  const sample = clusterCards[0];
  if (sample && Array.isArray(sample.topFiles)) row.selectedCardIds.push(...sample.topFiles.slice(0, 6));
}

// Prepare output directory
try {
  fs.mkdirSync(path.dirname(paths.out), { recursive: true });
} catch (e) {}

// Write temp then rename for safety
const tmpOut = paths.out + '.tmp';
try {
  fs.writeFileSync(tmpOut, JSON.stringify(row) + '\n', { encoding: 'utf8' });
  fs.renameSync(tmpOut, paths.out);
  console.log('Wrote (dry-run) retrieval loop to', paths.out);
  if (publish) console.log('--publish requested, but this script does not write Redis/Qdrant; implement publish path separately.');
} catch (err) {
  console.error('Failed to write retrieval loop file:', err);
  process.exitCode = 1;
}

// Print a brief summary
console.log('Retrieval loop row:');
console.log(JSON.stringify(row, null, 2));

export default row;
