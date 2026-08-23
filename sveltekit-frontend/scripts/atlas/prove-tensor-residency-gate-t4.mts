// Gate T4 proof: ACE decides which logical tile is resident; CUDA allocators
// choose physical addresses. This script is the ACE side of that split -- it
// scores candidate tiles with the real ace-residency-policy.ts utility
// function, ranks eviction order under a simulated memory budget, and writes
// a decision manifest that a Python step (prove_tensor_residency_gate_t4.py)
// consumes to drive the real GpuTileCache and report whether the actual GPU
// eviction outcome matches ACE's prediction.
//
// Usage: npx tsx scripts/atlas/prove-tensor-residency-gate-t4.mts <out.json>

import { writeFile } from 'node:fs/promises';
import {
  tileUtility,
  rankEvictionCandidates,
  DEFAULT_ACE_WEIGHTS,
  type AceTileSignals
} from '../../src/lib/server/atlas/tensors/ace-residency-policy.js';
import type { TensorTileManifest } from '../../src/lib/server/atlas/tensors/tile-directory.js';

const outPath = process.argv[2];
if (!outPath) {
  console.error('usage: npx tsx scripts/atlas/prove-tensor-residency-gate-t4.mts <out.json>');
  process.exit(2);
}

// 5 synthetic candidate tiles with deliberately varied signals so the
// utility ranking is non-trivial (not just "first wins" or "biggest wins").
const rows = 200;
const dims = 768;
const bytesPerTile = rows * dims * 4; // float32

const candidates: Array<{ signals: AceTileSignals; tileKey: string }> = [
  {
    tileKey: 'semantic_768:tile-hot-auth',
    signals: { relevance: 0.95, authority: 0.8, executionUtility: 0.7, predictedReuse: 0.9, memoryBytes: bytesPerTile, transferCost: 0.2, recomputeCost: 0.3 }
  },
  {
    tileKey: 'semantic_768:tile-cold-legacy',
    signals: { relevance: 0.1, authority: 0.15, executionUtility: 0.05, predictedReuse: 0.05, memoryBytes: bytesPerTile, transferCost: 0.2, recomputeCost: 0.1 }
  },
  {
    tileKey: 'semantic_768:tile-warm-retrieval',
    signals: { relevance: 0.6, authority: 0.5, executionUtility: 0.55, predictedReuse: 0.5, memoryBytes: bytesPerTile, transferCost: 0.2, recomputeCost: 0.2 }
  },
  {
    tileKey: 'semantic_768:tile-hot-graph',
    signals: { relevance: 0.85, authority: 0.7, executionUtility: 0.65, predictedReuse: 0.8, memoryBytes: bytesPerTile, transferCost: 0.2, recomputeCost: 0.25 }
  },
  {
    tileKey: 'semantic_768:tile-cold-archive',
    signals: { relevance: 0.05, authority: 0.05, executionUtility: 0.02, predictedReuse: 0.02, memoryBytes: bytesPerTile, transferCost: 0.2, recomputeCost: 0.05 }
  }
];

const now = 1000; // fixed logical clock, avoids Date.now() (forbidden in workflow scripts, and unnecessary here)
const tiles: TensorTileManifest[] = candidates.map((c, i) => ({
  tileId: `t4-proof:${i}`,
  tileKey: c.tileKey,
  artifactId: 't4-proof-artifact',
  artifactRevision: 'sha256:t4-proof',
  recordBatchIndex: 0,
  rowCount: rows,
  dtype: 'float32',
  byteLength: bytesPerTile,
  contentHash: `sha256:synthetic-${i}`,
  hostState: 'PINNED',
  gpuState: 'ABSENT',
  utility: tileUtility(c.signals, DEFAULT_ACE_WEIGHTS),
  lastUsedAt: now - i, // deterministic recency spread
  pinCount: 0
}));

// Memory budget deliberately fits only ~2 tiles resident at once, forcing
// real eviction pressure so Gate T4's promote/evict decision is exercised,
// not just a promote-everything happy path.
const gpuBudgetBytes = Math.floor(bytesPerTile * 2.2);

const rankedForEviction = rankEvictionCandidates(tiles);
const evictionOrderTileKeys = rankedForEviction.map((t) => t.tileKey);

const decision = {
  schema: 'atlas.tensor-residency-gate-t4-decision.v1',
  weights: DEFAULT_ACE_WEIGHTS,
  gpuBudgetBytes,
  bytesPerTile,
  tiles: tiles
    .map((t) => ({ tileKey: t.tileKey, utility: t.utility, lastUsedAt: t.lastUsedAt }))
    .sort((a, b) => b.utility - a.utility),
  acePredictedEvictionOrder: evictionOrderTileKeys,
  acePredictedResidentAfterBudget: tiles
    .slice()
    .sort((a, b) => b.utility - a.utility)
    .slice(0, Math.floor(gpuBudgetBytes / bytesPerTile))
    .map((t) => t.tileKey)
};

await writeFile(outPath, JSON.stringify(decision, null, 2), 'utf-8');
console.log(JSON.stringify({ status: 'PASS', outPath, tileCount: tiles.length, gpuBudgetBytes }, null, 2));
