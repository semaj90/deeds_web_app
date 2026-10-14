#!/usr/bin/env node
/**
 * benchmark-graph-cpu-workers.mjs
 * Parent Atlas — Graph CPU Worker Qualification Benchmark.
 *
 * Implements deterministic single-thread reference CSR construction and
 * a bounded Node.js worker_threads pool (1, 2, 4 workers) using transferable
 * TypedArrays (Uint32Array). Verifies 100% checksum parity between single-thread
 * and worker pool executions.
 */

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'graph-cpu-worker-qualification-2026-10-13.json');

function sha256Buffer(buffer) {
  return createHash('sha256').update(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength)).digest('hex');
}

function sha256String(str) {
  return createHash('sha256').update(str).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────
// Worker Thread Logic
// ─────────────────────────────────────────────────────────────────────
if (!isMainThread) {
  const { nodeCount, edgesSlice } = workerData;
  // edgesSlice is a flat Uint32Array [src0, dst0, src1, dst1, ...]
  const numEdges = edgesSlice.length / 2;
  const degrees = new Uint32Array(nodeCount);

  for (let i = 0; i < numEdges; i++) {
    const src = edgesSlice[i * 2];
    degrees[src]++;
  }

  // Transfer degree counts back to main thread
  parentPort.postMessage({ degrees }, [degrees.buffer]);
}

// ─────────────────────────────────────────────────────────────────────
// Main Thread Benchmark
// ─────────────────────────────────────────────────────────────────────
if (isMainThread) {
  async function run() {
    console.log('[CPU-BENCH] Starting Parent Atlas Graph CPU Worker Qualification...');

    // 1. Generate deterministic synthetic graph (50,000 nodes, 150,000 directed edges)
    const NUM_NODES = 50_000;
    const NUM_EDGES = 150_000;
    const GRAPH_REVISION = 'graph:qual-fixture-v1';

    console.log(`[CPU-BENCH] Generating deterministic test graph: ${NUM_NODES} nodes, ${NUM_EDGES} edges...`);
    const flatEdges = new Uint32Array(NUM_EDGES * 2);
    // Pseudo-random deterministic LCG
    let seed = 123456789;
    function nextRand() {
      seed = (1103515245 * seed + 12345) & 0x7fffffff;
      return seed;
    }

    for (let i = 0; i < NUM_EDGES; i++) {
      const src = nextRand() % NUM_NODES;
      const dst = nextRand() % NUM_NODES;
      flatEdges[i * 2] = src;
      flatEdges[i * 2 + 1] = dst;
    }

    // 2. Single-thread Baseline Reference
    console.log('[CPU-BENCH] Running single-thread CSR baseline...');
    const memBeforeSingle = process.memoryUsage().heapUsed;
    const t0Single = performance.now();

    const refRowOffsets = new Uint32Array(NUM_NODES + 1);
    for (let i = 0; i < NUM_EDGES; i++) {
      const src = flatEdges[i * 2];
      refRowOffsets[src + 1]++;
    }
    // Prefix sum
    for (let i = 0; i < NUM_NODES; i++) {
      refRowOffsets[i + 1] += refRowOffsets[i];
    }

    const refColIndices = new Uint32Array(NUM_EDGES);
    const currentOffsets = new Uint32Array(refRowOffsets.subarray(0, NUM_NODES));
    for (let i = 0; i < NUM_EDGES; i++) {
      const src = flatEdges[i * 2];
      const dst = flatEdges[i * 2 + 1];
      const pos = currentOffsets[src]++;
      refColIndices[pos] = dst;
    }

    const t1Single = performance.now();
    const elapsedSingleMs = t1Single - t0Single;
    const memAfterSingle = process.memoryUsage().heapUsed;

    const rowOffsetsChecksumRef = sha256Buffer(refRowOffsets);
    const colIndicesChecksumRef = sha256Buffer(refColIndices);

    console.log(`[CPU-BENCH] Single-thread Baseline: ${elapsedSingleMs.toFixed(2)} ms`);
    console.log(`[CPU-BENCH] Ref RowOffsets Hash: ${rowOffsetsChecksumRef}`);

    // 3. Worker Pool Challenger Function
    async function benchmarkWorkerPool(workerCount) {
      const t0 = performance.now();
      const memBefore = process.memoryUsage().heapUsed;

      const edgesPerWorker = Math.floor(NUM_EDGES / workerCount);
      const workerPromises = [];

      for (let w = 0; w < workerCount; w++) {
        const startEdge = w * edgesPerWorker;
        const endEdge = (w === workerCount - 1) ? NUM_EDGES : (w + 1) * edgesPerWorker;
        const slice = flatEdges.slice(startEdge * 2, endEdge * 2);

        const promise = new Promise((resolve, reject) => {
          const worker = new Worker(__filename, {
            workerData: { nodeCount: NUM_NODES, edgesSlice: slice }
          });
          worker.on('message', (msg) => resolve(msg.degrees));
          worker.on('error', reject);
          worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
          });
        });
        workerPromises.push(promise);
      }

      const degreeArrays = await Promise.all(workerPromises);

      // Merge degrees into rowOffsets
      const mergedRowOffsets = new Uint32Array(NUM_NODES + 1);
      for (const degs of degreeArrays) {
        for (let i = 0; i < NUM_NODES; i++) {
          mergedRowOffsets[i + 1] += degs[i];
        }
      }
      // Prefix sum
      for (let i = 0; i < NUM_NODES; i++) {
        mergedRowOffsets[i + 1] += mergedRowOffsets[i];
      }

      const t1 = performance.now();
      const elapsedMs = t1 - t0;
      const memAfter = process.memoryUsage().heapUsed;

      const rowOffsetsChecksum = sha256Buffer(mergedRowOffsets);
      const isParity = (rowOffsetsChecksum === rowOffsetsChecksumRef);

      return {
        workerCount,
        elapsedMs: parseFloat(elapsedMs.toFixed(2)),
        speedup: parseFloat((elapsedSingleMs / elapsedMs).toFixed(2)),
        peakHeapMb: parseFloat(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
        checksum: rowOffsetsChecksum,
        parityWithReference: isParity
      };
    }

    // Benchmark 1, 2, and 4 workers
    console.log('[CPU-BENCH] Benchmarking 1 worker...');
    const result1 = await benchmarkWorkerPool(1);
    console.log(`[CPU-BENCH] 1 Worker: ${result1.elapsedMs} ms | Parity: ${result1.parityWithReference}`);

    console.log('[CPU-BENCH] Benchmarking 2 workers...');
    const result2 = await benchmarkWorkerPool(2);
    console.log(`[CPU-BENCH] 2 Workers: ${result2.elapsedMs} ms (Speedup: ${result2.speedup}x) | Parity: ${result2.parityWithReference}`);

    console.log('[CPU-BENCH] Benchmarking 4 workers...');
    const result4 = await benchmarkWorkerPool(4);
    console.log(`[CPU-BENCH] 4 Workers: ${result4.elapsedMs} ms (Speedup: ${result4.speedup}x) | Parity: ${result4.parityWithReference}`);

    const receipt = {
      schema: 'atlas.graph-cpu-worker-qualification.v1',
      generatedAt: new Date().toISOString(),
      benchmarkParameters: {
        numNodes: NUM_NODES,
        numEdges: NUM_EDGES,
        graphRevision: GRAPH_REVISION,
      },
      referenceSingleThread: {
        elapsedMs: parseFloat(elapsedSingleMs.toFixed(2)),
        rowOffsetsChecksum: rowOffsetsChecksumRef,
        colIndicesChecksum: colIndicesChecksumRef,
      },
      workerResults: [result1, result2, result4],
      verdict: {
        parityConfirmed: result1.parityWithReference && result2.parityWithReference && result4.parityWithReference,
        status: !(result1.parityWithReference && result2.parityWithReference && result4.parityWithReference)
          ? 'PARITY_FAILED'
          : (Math.max(result1.speedup, result2.speedup, result4.speedup) > 1 ? 'PARITY_OK_SPEEDUP_OBSERVED' : 'PARITY_OK_NO_SPEEDUP'),
        recommendation: Math.max(result1.speedup, result2.speedup, result4.speedup) > 1
          ? 'Workers matched the reference and were faster on this synthetic graph; re-benchmark on a real snapshot before enabling.'
          : 'Do not enable workers: they matched the reference checksum but were slower than single-thread on this synthetic 50k/150k graph (thread start-up dominates). Re-test only with a persistent pool on a much larger real snapshot.',
        scope: 'SYNTHETIC_GRAPH_DEGREE_COUNT_ONLY (row offsets; column indices not parallelised or compared)',
        firstFailedGate: null,
      }
    };

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
    console.log(`[CPU-BENCH] Qualification receipt written to: ${REPORT_PATH}`);
  }

  run().catch((err) => {
    console.error('[CPU-BENCH] Error:', err);
    process.exit(1);
  });
}
