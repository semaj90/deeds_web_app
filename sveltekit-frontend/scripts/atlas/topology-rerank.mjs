#!/usr/bin/env node
/**
 * topology-rerank.mjs
 *
 * Stage 10 of the HyperRAG 4D Topology Knowledge Layer.
 * Reranks retrieved chunks based on their 4D Euclidean distance to a target 
 * query's coordinates inside the feature-state topology.
 *
 * Usage:
 *   node scripts/atlas/topology-rerank.mjs \
 *     --input tmp/chunks/parents-corpus-4d.ndjson \
 *     --query "how does the kmeans-worker handle errors" \
 *     --limit 5
 */

import fs      from 'node:fs';
import path    from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv       = process.argv.slice(2);
const inputI     = argv.indexOf('--input');
const queryI     = argv.indexOf('--query');
const limitI     = argv.indexOf('--limit');

const INPUT_PATH = inputI >= 0 ? argv[inputI + 1] : null;
const QUERY_STR  = queryI >= 0 ? argv[queryI + 1] : 'kmeans worker';
const LIMIT      = limitI >= 0 ? Number(argv[limitI + 1]) : 5;

// ── 4D Coordinate Inference for Query ────────────────────────────────────────
function projectQuery4D(queryText) {
  const qt = queryText.toLowerCase();
  
  // 1. Semantic Focus (x)
  let x = 0.0;
  if (qt.includes('feature') || qt.includes('architecture')) x = 1.0;
  else if (qt.includes('tool') || qt.includes('script')) x = 0.5;
  else if (qt.includes('store') || qt.includes('redis') || qt.includes('postgres') || qt.includes('qdrant')) x = -0.5;
  else if (qt.includes('error') || qt.includes('bug') || qt.includes('fail')) x = -1.0;

  // 2. Target Complexity (y)
  // Queries seeking comprehensive/deep info target higher complexity
  let y = 0.5;
  if (qt.includes('why') || qt.includes('deep') || qt.includes('explain')) y = 0.8;
  if (qt.includes('what is') || qt.includes('simple')) y = 0.2;

  // 3. Target Linkage Density (z)
  // Queries asking for connections/imports/dependencies target dense hubs
  let z = 0.5;
  if (qt.includes('path') || qt.includes('import') || qt.includes('depend') || qt.includes('call')) z = 0.9;
  if (qt.includes('isolated') || qt.includes('single')) z = 0.1;

  // 4. Sequence Context Flow (w)
  // By default, query searches generally target introduction blocks (w=0.0) unless looking for recovery/deployment
  let w = 0.0;
  if (qt.includes('rebuild') || qt.includes('deployment') || qt.includes('final')) w = 0.9;

  return { x, y, z, w };
}

// ── 4D Euclidean Distance ────────────────────────────────────────────────────
function calculateDistance4D(c, q) {
  return Math.sqrt(
    Math.pow(c.x - q.x, 2) +
    Math.pow(c.y - q.y, 2) +
    Math.pow(c.z - q.z, 2) +
    Math.pow(c.w - q.w, 2)
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!INPUT_PATH) {
    console.error('[topology-rerank] --input required');
    process.exit(1);
  }

  const inputResolved = path.isAbsolute(INPUT_PATH) ? INPUT_PATH : path.join(ROOT, INPUT_PATH);
  const lines   = fs.readFileSync(inputResolved, 'utf8').trim().split('\n').filter(Boolean);
  const records = lines.map(l => JSON.parse(l));

  console.log(`[topology-rerank] Loaded ${records.length} projected chunks.`);
  console.log(`[topology-rerank] Query: "${QUERY_STR}"`);
  
  const qCoord = projectQuery4D(QUERY_STR);
  console.log(`[topology-rerank] Query 4D Coordinate: x=${qCoord.x}, y=${qCoord.y}, z=${qCoord.z}, w=${qCoord.w}`);

  const scored = records.map(r => {
    const dist = calculateDistance4D(r.topology, qCoord);
    return {
      ...r,
      topological_distance: Number(dist.toFixed(4))
    };
  });

  // Sort ascending: closest in 4D space is best match
  scored.sort((a, b) => a.topological_distance - b.topological_distance);

  console.log(`\n🏆 Top ${LIMIT} Topologically Reranked Context Chunks:`);
  console.log('=' .repeat(80));

  const results = scored.slice(0, LIMIT);
  results.forEach((r, idx) => {
    console.log(`[Rank ${idx + 1}] Distance: ${r.topological_distance} | Key: ${r.feature_key} | Source: ${r.source_ref}`);
    console.log(`  4D Coord: x=${r.topology.x}, y=${r.topology.y}, z=${r.topology.z}, w=${r.topology.w}`);
    console.log(`  Text: "${r.text.slice(0, 160)}..."`);
    console.log('-' .repeat(80));
  });
}

main().catch(err => {
  console.error('[topology-rerank]', err.message);
  process.exit(1);
});
