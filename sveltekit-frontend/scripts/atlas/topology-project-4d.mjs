#!/usr/bin/env node
/**
 * topology-project-4d.mjs
 *
 * Stage 9 of the HyperRAG 4D Topology Knowledge Layer.
 * Mathematical projector mapping chunk semantic categories, structural complexities,
 * graph connectedness, and sequence indexes into a unified 4D coordinate system (x, y, z, w).
 * Enriches every chunk record with absolute index and store identifiers.
 *
 * Coordinates:
 *   x = Semantic Focus Scale (Features = 1.0, Tools = 0.5, Stores = -0.5, Core/Other = 0.0)
 *   y = Technical Complexity Scale (Normalized Word Count, capped at 1.0)
 *   z = Graph Linkage Density Scale (Count of related file paths, normalized)
 *   w = Sequential Index Flow (Relative index of chunk within its file, 0.0 to 1.0)
 *
 * Usage:
 *   node scripts/atlas/topology-project-4d.mjs \
 *     --input tmp/chunks/parents-corpus-expanded.ndjson \
 *     --out tmp/chunks/parents-corpus-4d.ndjson
 */

import fs      from 'node:fs';
import path    from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv       = process.argv.slice(2);
const inputI     = argv.indexOf('--input');
const outI       = argv.indexOf('--out');
const DRY_RUN    = argv.includes('--dry-run');

const INPUT_PATH = inputI >= 0 ? argv[inputI + 1] : null;
const OUT_PATH   = outI   >= 0 ? argv[outI + 1]   : null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function chunkIdToQdrantId(chunkId) {
  const padded = chunkId.padEnd(32, '0');
  return `${padded.slice(0,8)}-${padded.slice(8,12)}-${padded.slice(12,16)}-${padded.slice(16,20)}-${padded.slice(20,32)}`;
}

function deriveFeatureKey(tags, sourcePath) {
  const featureTags = (tags ?? []).filter(t => t.startsWith('feature:')).map(t => t.replace('feature:', ''));
  if (featureTags.length > 0) return featureTags[0];
  return path.basename(sourcePath ?? 'unknown').replace(/\.[^.]+$/, '');
}

// ── 4D Math Projector ────────────────────────────────────────────────────────
function projectChunk4D(rec, indexInFile, totalInFile) {
  const tags = rec.tags ?? [];
  
  // 1. Semantic Focus (x)
  let x = 0.0;
  if (tags.some(t => t.startsWith('feature:'))) x = 1.0;
  else if (tags.some(t => t.startsWith('tool:'))) x = 0.5;
  else if (tags.some(t => t.startsWith('store:'))) x = -0.5;
  else if (tags.some(t => t.startsWith('error:'))) x = -1.0;

  // 2. Complexity (y)
  const wordCount = rec.word_count ?? 0;
  let y = Math.min(wordCount / 300, 1.0); // normalize up to 300 words

  // 3. Linkage Density (z)
  const linksCount = (rec.file_refs ?? []).length + (rec.rg_paths ?? []).length;
  let z = Math.min(linksCount / 10, 1.0); // normalize up to 10 unique files

  // 4. Sequential Flow (w)
  let w = totalInFile > 1 ? indexInFile / (totalInFile - 1) : 0.0;

  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    z: Number(z.toFixed(4)),
    w: Number(w.toFixed(4))
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!INPUT_PATH) {
    console.error('[topology-4d] --input required');
    process.exit(1);
  }

  const inputResolved = path.isAbsolute(INPUT_PATH) ? INPUT_PATH : path.join(ROOT, INPUT_PATH);
  const lines   = fs.readFileSync(inputResolved, 'utf8').trim().split('\n').filter(Boolean);
  const records = lines.map(l => JSON.parse(l));

  console.log(`[topology-4d] Loaded ${records.length} records from ${INPUT_PATH}`);

  // Group records by source path to calculate relative sequential flow
  const fileGroups = {};
  for (const r of records) {
    if (!fileGroups[r.source_path]) fileGroups[r.source_path] = [];
    fileGroups[r.source_path].push(r);
  }

  // Sort groups by chunk_index to ensure deterministic order
  for (const key of Object.keys(fileGroups)) {
    fileGroups[key].sort((a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0));
  }

  const projected = [];

  for (const r of records) {
    const group = fileGroups[r.source_path];
    const indexInFile = group.indexOf(r);
    const totalInFile = group.length;

    const featureKey = deriveFeatureKey(r.tags, r.source_path);
    const qPointId = chunkIdToQdrantId(r.chunk_id);
    const nNodeId = `neo4j:chunk:${r.chunk_id}`;
    
    // Cluster ID derived deterministically from the feature key hash
    const clusterId = `cluster:${featureKey.toLowerCase()}`;

    const topology = projectChunk4D(r, indexInFile, totalInFile);

    projected.push({
      ...r,
      feature_key: featureKey,
      cluster_id: clusterId,
      source_ref: r.source_path,
      qdrant_point_id: qPointId,
      neo4j_node_id: nNodeId,
      topology
    });
  }

  console.log(`[topology-4d] Projected ${projected.length} chunks into 4D coordinate system.`);

  if (DRY_RUN) {
    console.log('[topology-4d] DRY RUN — sample record:');
    console.log(JSON.stringify(projected[0] ?? {}, null, 2));
    return;
  }

  const ndjson = projected.map(r => JSON.stringify(r)).join('\n') + '\n';

  if (OUT_PATH) {
    const outResolved = path.isAbsolute(OUT_PATH) ? OUT_PATH : path.join(ROOT, OUT_PATH);
    fs.mkdirSync(path.dirname(outResolved), { recursive: true });
    fs.writeFileSync(outResolved, ndjson, 'utf8');
    console.log(`[topology-4d] ✅ Wrote ${projected.length} records → ${OUT_PATH}`);
  } else {
    process.stdout.write(ndjson);
  }
}

main().catch(err => {
  console.error('[topology-4d]', err.message);
  process.exit(1);
});
