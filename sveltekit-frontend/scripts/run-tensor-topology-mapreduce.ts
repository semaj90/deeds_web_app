/**
 * run-tensor-topology-mapreduce.ts
 *
 * Map stage of the tensor topology pipeline:
 *   1. Scroll Qdrant codebase_chunks_768 for stableKey + embedding + filePath
 *   2. For each uncached / changed chunk: classify topo_byte from filePath
 *   3. If GPU available: run pcaProject / autoencoderEncode to get manifold4
 *   4. Upsert tensor_analysis_cache in Postgres (batch 500)
 *   5. Patch Qdrant payloads: topo_byte, topo_hex, topo_class, manifold4
 *   6. Print summary
 *
 * Full GPU analysis (pca + centroid affinity + SOM boost) requires the
 * tensorrt_bridge.node addon.  When unavailable the script still runs in
 * "topo-only" mode: every file gets a topo_byte + empty manifold4.
 *
 * Usage:
 *   npm run tensor:classify           # full run
 *   npm run tensor:classify:dry       # dry-run (no writes)
 */

import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { createHash } from 'crypto';
import {
  buildTopoOnlyRecord,
  writeTensorAnalysisBatch,
  getTensorAnalysis,
} from '../src/lib/server/tensor/tensor-analysis-cache.js';
import { topoByteFromPath, unpackTopoByte, TOPO_CLASS_LABEL } from '../src/lib/server/tensor/topology-byte-mapper.js';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH   = 500;
const MAX_POINTS = 10_000;
const DIM = 768;

// ── Qdrant helpers ────────────────────────────────────────────────────────────

const QDRANT_URL        = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';

async function qdrantScroll(offset: string | null, limit: number): Promise<{
  points: Array<{ id: string; payload: Record<string, unknown>; vector?: unknown }>;
  next: string | null;
}> {
  const body = { limit, with_payload: true, with_vector: true, ...(offset ? { offset } : {}) };
  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status}`);
  const data = await res.json() as { result: { points: unknown[]; next_page_offset: string | null } };
  return {
    points: data.result?.points as Array<{ id: string; payload: Record<string, unknown>; vector?: unknown }> ?? [],
    next:   data.result?.next_page_offset ?? null,
  };
}

async function qdrantSetPayload(points: Array<{ id: string; payload: Record<string, unknown> }>): Promise<void> {
  // Qdrant set_payload accepts one point at a time in community edition;
  // batch via overwrite_payload for efficiency.
  for (let i = 0; i < points.length; i += 100) {
    const slice = points.slice(i, i + 100);
    await Promise.all(slice.map(pt =>
      fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: pt.payload, points: [pt.id] }),
      }).then(r => { if (!r.ok) console.warn(`  ⚠ payload patch failed for ${pt.id}`); })
    ));
  }
}

// ── GPU helpers (optional) ────────────────────────────────────────────────────

let pcaProjectFn: ((vecs: Float32Array, n: number, dim: number, k: number) => Float32Array) | null = null;

async function tryLoadGpu(): Promise<boolean> {
  try {
    const addonPath = path.resolve('../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const addon = req(addonPath);
    if (typeof addon.pcaProject === 'function') {
      pcaProjectFn = addon.pcaProject as typeof pcaProjectFn;
      return true;
    }
  } catch { /* addon unavailable */ }
  return false;
}

function gpuProjectManifold4(embeddings: Float32Array[], filePaths: string[]): Array<[number, number, number, number]> {
  if (!pcaProjectFn || embeddings.length === 0) {
    return embeddings.map(() => [0, 0, 0, 0]);
  }
  const n   = embeddings.length;
  const dim = DIM;
  const flat = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) flat.set(embeddings[i], i * dim);

  // 4D PCA projection
  const proj = pcaProjectFn(flat, n, dim, 4);

  // Normalize per-dim to [0, 1]
  const mins = [Infinity, Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < 4; d++) {
      mins[d] = Math.min(mins[d], proj[i * 4 + d]);
      maxs[d] = Math.max(maxs[d], proj[i * 4 + d]);
    }
  }
  return Array.from({ length: n }, (_, i) =>
    [0, 1, 2, 3].map(d => {
      const range = maxs[d] - mins[d];
      return range > 0 ? (proj[i * 4 + d] - mins[d]) / range : 0;
    }) as [number, number, number, number]
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔬 Tensor Topology MapReduce${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const gpuAvailable = await tryLoadGpu();
  console.log(`   GPU (pcaProject): ${gpuAvailable ? '✓ available' : '✗ topo-only mode'}`);

  let offset: string | null = null;
  let totalProcessed = 0;
  let totalWritten   = 0;
  let totalSkipped   = 0;
  const classBreakdown: Record<string, number> = {};

  while (totalProcessed < MAX_POINTS) {
    const { points, next } = await qdrantScroll(offset, BATCH);
    if (points.length === 0) break;

    // Collect embeddings + metadata
    const toAnalyze: Array<{
      id:        string;
      stableKey: string;
      filePath:  string;
      hash:      string;
      vec:       Float32Array | null;
    }> = [];

    for (const pt of points) {
      const p = pt.payload ?? {};
      const filePath = (
        (p['relativePath'] ?? p['file_path'] ?? p['path'] ?? p['stable_key']) as string | undefined
      ) ?? String(pt.id);

      const stableKey = (p['stable_key'] as string | undefined) ?? `qdrant:${pt.id}`;
      const content   = (p['chunk_text'] ?? p['content'] ?? filePath) as string;
      const hash      = createHash('sha256').update(content).digest('hex').slice(0, 16);

      // Check if already cached with this hash
      const cached = await getTensorAnalysis(stableKey, hash).catch(() => null);
      if (cached) { totalSkipped++; continue; }

      let vec: Float32Array | null = null;
      if (Array.isArray(pt.vector)) {
        vec = new Float32Array(pt.vector as number[]);
      } else if (pt.vector && typeof pt.vector === 'object') {
        const map = pt.vector as Record<string, number[]>;
        const arr = map['content'] ?? Object.values(map)[0];
        if (arr) vec = new Float32Array(arr);
      }

      toAnalyze.push({ id: pt.id, stableKey, filePath, hash, vec });
    }

    if (toAnalyze.length > 0) {
      // GPU projections for this batch
      const embeddings = toAnalyze.map(x => x.vec ?? new Float32Array(DIM));
      const manifold4s = gpuAvailable
        ? gpuProjectManifold4(embeddings, toAnalyze.map(x => x.filePath))
        : toAnalyze.map((): [number, number, number, number] => [0, 0, 0, 0]);

      const records = toAnalyze.map((item, idx) => {
        const byte = topoByteFromPath(item.filePath);
        const { topoClass, hex } = unpackTopoByte(byte);
        const label = TOPO_CLASS_LABEL[topoClass];
        classBreakdown[label] = (classBreakdown[label] ?? 0) + 1;

        return {
          stableKey:           item.stableKey,
          contentHash:         item.hash,
          topoByte:            byte,
          topoHex:             hex,
          topoClass:           label,
          manifold4:           manifold4s[idx],
          centroidKey:         null,
          somCluster:          null,
          graphAuthorityScore: 0,
          tensorAffinityScore: 0,
          tensorJson:          {},
          qdrantPayload: {
            topo_byte:  byte,
            topo_hex:   hex,
            topo_class: label,
            manifold4:  manifold4s[idx],
          },
          outputMeta: { source: gpuAvailable ? 'cuda-pca' : 'topo-only', filePath: item.filePath },
        };
      });

      if (!DRY_RUN) {
        await writeTensorAnalysisBatch(records);
        // Patch Qdrant payloads
        await qdrantSetPayload(toAnalyze.map((item, idx) => ({
          id:      item.id,
          payload: records[idx].qdrantPayload,
        })));
        totalWritten += records.length;
      } else {
        totalWritten += records.length;
      }
    }

    totalProcessed += points.length;
    process.stdout.write(`\r   Processed: ${totalProcessed}  Written: ${totalWritten}  Skipped: ${totalSkipped}`);

    if (!next || points.length < BATCH) break;
    offset = next;
  }

  console.log(`\n\n✅ Done`);
  console.log(`   Total processed : ${totalProcessed}`);
  console.log(`   Written          : ${totalWritten}`);
  console.log(`   Skipped (cached) : ${totalSkipped}`);
  console.log(`\n   Class breakdown:`);
  for (const [label, count] of Object.entries(classBreakdown).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${label.padEnd(25)} ${count}`);
  }
}

main().catch(err => {
  console.error('\n❌ MapReduce failed:', err);
  process.exit(1);
});
