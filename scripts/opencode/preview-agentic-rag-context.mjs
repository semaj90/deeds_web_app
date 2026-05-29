#!/usr/bin/env node
// Preview agentic RAG context based on retrieval-loop and rerank outputs
// Usage: node scripts/opencode/preview-agentic-rag-context.mjs "query" [--topK N]

import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('Usage: node scripts/opencode/preview-agentic-rag-context.mjs "query" [--topK N]');
  process.exit(2);
}

const query = argv[0];
const topKArg = (() => {
  const idx = argv.findIndex(a => a === '--topK');
  if (idx !== -1 && argv[idx+1]) return Number(argv[idx+1]);
  const m = argv.find(a => a.startsWith('--topK='));
  if (m) return Number(m.split('=')[1]);
  return 10;
})();

const root = process.cwd();
const paths = {
  retrieval: path.join(root, '.tmp', 'atlas-retrieval-loop.jsonl'),
  phase18: path.join(root, '.tmp', 'phase18-xgboost-rerank.jsonl'),
  clusters: path.join(root, 'memory', 'exports', 'cluster-cards.jsonl'),
  pathways: path.join(root, 'memory', 'exports', 'pathway-cards.jsonl'),
  acePacket: path.join(root, '.opencode', 'ace-packet.json'),
  outJson: path.join(root, '.tmp', 'agentic-rag-preview.json'),
  outMd: path.join(root, '.tmp', 'agentic-rag-preview.md')
};

function safeRead(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
}

function parseJsonl(text) {
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}

const retrievalLines = parseJsonl(safeRead(paths.retrieval));
const phase18 = parseJsonl(safeRead(paths.phase18));
const clusters = parseJsonl(safeRead(paths.clusters));
const pathways = parseJsonl(safeRead(paths.pathways));
let acePacket = null;
try { const ap = safeRead(paths.acePacket); if (ap) acePacket = JSON.parse(ap); } catch (e) { acePacket = null; }

// find retrieval row by query or take last
let retrieval = retrievalLines.find(r => r.query === query) || retrievalLines[retrievalLines.length -1] || null;
if (!retrieval) {
  console.error('No retrieval loop rows found');
  process.exit(1);
}

// Build card previews
const selected = retrieval.selectedCardIds || [];
const cardPreviews = [];
for (const id of selected.slice(0, topKArg)) {
  // attempt to find cluster that lists this file in topFiles
  const cluster = clusters.find(c => Array.isArray(c.topFiles) && c.topFiles.includes(id));
  const inPhase18 = phase18.find(p => (p.selected && p.selected.includes(id)) || (p.topK && p.topK.includes(id)));
  const reasons = [];
  if (cluster) reasons.push(`topFile in cluster ${cluster.clusterId || cluster.id}`);
  if (inPhase18) reasons.push('appears in phase18 rerank output');
  if (retrieval.tool) reasons.push(`selected by ${retrieval.tool}`);
  if (reasons.length === 0) reasons.push('selected by retrieval loop');

  cardPreviews.push({
    id,
    clusterId: cluster ? (cluster.clusterId || cluster.id) : null,
    clusterTags: cluster ? cluster.tags || [] : [],
    reasons,
    sample: null
  });
}

// Pathway hints: include any pathway cards whose pathwayId appears in retrieval.sourceRefs or nearby
const pathwayPreviews = [];
for (const p of pathways.slice(0, 50)) {
  const match = (retrieval.sourceRefs || []).some(ref => (p.sourceRefs || []).includes(ref)) || false;
  // simple heuristic: include top pathways up to topKArg
  if (pathwayPreviews.length < topKArg) {
    pathwayPreviews.push({ pathwayId: p.pathwayId || p.id || null, summary: p.summary || p.description || null });
  }
}

const preview = {
  query: retrieval.query,
  intent: retrieval.intent || 'unknown',
  domain: retrieval.domain || 'unknown',
  sourceRefs: retrieval.sourceRefs || [],
  rerankScore: retrieval.rerankScore || retrieval.score || null,
  tool: retrieval.tool || null,
  outcome: retrieval.outcome || null,
  selectedCount: selected.length,
  topK: topKArg,
  cards: cardPreviews,
  pathways: pathwayPreviews,
  generatedAt: new Date().toISOString()
};

// Write outputs (read-only in the sense of not touching Redis/Qdrant)
try {
  fs.mkdirSync(path.dirname(paths.outJson), { recursive: true });
  fs.writeFileSync(paths.outJson, JSON.stringify(preview, null, 2), 'utf8');

  // Markdown summary
  const mdLines = [];
  mdLines.push(`# Agentic RAG Preview\n`);
  mdLines.push(`**Query:** ${preview.query}`);
  mdLines.push(`**Intent:** ${preview.intent}`);
  mdLines.push(`**Domain:** ${preview.domain}`);
  mdLines.push(`**Source refs:** ${preview.sourceRefs.join(', ') || 'none'}`);
  mdLines.push(`**Rerank score:** ${preview.rerankScore}`);
  mdLines.push(`**Tool:** ${preview.tool}`);
  mdLines.push(`\n## Top ${preview.topK} Selected Cards (${preview.selectedCount} total)`);
  for (const c of preview.cards) {
    mdLines.push(`- **${c.id}**`);
    mdLines.push(`  - cluster: ${c.clusterId || 'unknown'}`);
    mdLines.push(`  - tags: ${Array.isArray(c.clusterTags)? c.clusterTags.join(', '): ''}`);
    mdLines.push(`  - reasons: ${c.reasons.join('; ')}`);
  }
  mdLines.push(`\n## Pathways (top ${preview.pathways.length})`);
  for (const p of preview.pathways) mdLines.push(`- ${p.pathwayId}: ${p.summary}`);

  fs.writeFileSync(paths.outMd, mdLines.join('\n'), 'utf8');

  console.log('Wrote preview JSON ->', paths.outJson);
  console.log('Wrote preview MD   ->', paths.outMd);
} catch (e) {
  console.error('Failed to write preview:', e);
  process.exitCode = 1;
}

console.log(JSON.stringify(preview, null, 2));

export default preview;
