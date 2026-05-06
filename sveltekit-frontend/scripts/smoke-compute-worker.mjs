#!/usr/bin/env node
/**
 * smoke-compute-worker.mjs
 *
 * End-to-end smoke test for compute-worker.mjs + gpu-worker.mjs.
 * Spawns real Worker instances (same as ComputePool) and validates
 * each task type produces the expected result shape.
 *
 * Tests:
 *   hash            → { hash: string }
 *   chunk           → Array<{ text, startLine, endLine, chunkIndex }>
 *   metadata        → { imports, exports, lineCount, language }
 *   qdrant_payload  → { path, relative_path, content, content_hash, chunk_index }
 *   kmeans          → { clusters, centroids, silhouetteScore, source }
 *   som             → { clusters, grid, quantizationError, source }
 *   forensics       → Array<{ type, severity }>
 *   similarity      → { scores, n, dim, source }  (SharedArrayBuffer path)
 *
 * Usage:
 *   node scripts/smoke-compute-worker.mjs
 *   node scripts/smoke-compute-worker.mjs --verbose
 */

import { Worker } from 'worker_threads';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir   = dirname(fileURLToPath(import.meta.url));
const ROOT    = resolve(__dir, '..');
const WORKER  = resolve(ROOT, 'src/lib/workers/compute-worker.mjs');
const VERBOSE = process.argv.includes('--verbose');

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

// ── Worker task dispatcher ────────────────────────────────────────────────────

let taskIdCounter = 0;

function runWorkerTask(workerPath, type, payload, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const taskId = taskIdCounter++;
    const worker = new Worker(workerPath);
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Task '${type}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    worker.on('message', (msg) => {
      clearTimeout(timer);
      worker.terminate();
      if (msg.taskId !== taskId) return; // shouldn't happen in one-shot mode
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.result);
    });

    worker.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    worker.postMessage({ taskId, type, payload });
  });
}

// ── Test helpers ─────────────────────────────────────────────────────────────

const results = [];

async function test(name, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    results.push({ name, pass: true, ms });
    console.log(`  ${c.green('✓')} ${name.padEnd(30)} ${c.dim(`${ms}ms`)}`);
    if (VERBOSE) console.log(`    ${c.dim(JSON.stringify(result).slice(0, 200))}`);
    return result;
  } catch (err) {
    const ms = Date.now() - t0;
    results.push({ name, pass: false, ms, error: err.message });
    console.log(`  ${c.red('✗')} ${name.padEnd(30)} ${c.dim(`${ms}ms`)}`);
    console.log(`    ${c.red(err.message.slice(0, 200))}`);
    return null;
  }
}

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_TEXT = `
import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';

export async function GET({ params, locals }) {
  if (!locals.user) throw error(401, 'Unauthorized');
  const [row] = await db.select().from(cases).where(eq(cases.id, params.id));
  return json(row ?? { error: 'Not found' });
}

export async function POST({ request, locals }) {
  const body = await request.json();
  const [created] = await db.insert(cases).values(body).returning();
  return json(created);
}
`.repeat(10); // ~130 lines — above the 120-line threshold for worker chunking

const SAMPLE_PATH = 'src/routes/api/cases/[id]/+server.ts';

const SMALL_EMBEDDINGS = Array.from({ length: 50 }, (_, i) =>
  Array.from({ length: 64 }, (_, d) => Math.sin(i * 0.1 + d * 0.05))
);

const FORENSICS_TEXT = `
This SETTLEMENT AGREEMENT involves plaintiff John Smith v. defendant ACME Corp.
The parties agree to ARBITRATION for all disputes. Settlement: $125,000.
SSN: 123-45-6789. CONFIDENTIAL — attorney-client privileged.
`;

// ── Run tests ─────────────────────────────────────────────────────────────────

console.log(`\n${c.bold(c.cyan('compute-worker smoke test'))}`);
console.log(`${c.dim(`Worker: ${WORKER}`)}\n`);

// 1. hash
const hashResult = await test('hash (sha256)', () =>
  runWorkerTask(WORKER, 'hash', { text: SAMPLE_TEXT })
);
if (hashResult) {
  if (typeof hashResult.hash !== 'string' || hashResult.hash.length !== 64) {
    results.at(-1).pass = false;
    results.at(-1).error = `Expected 64-char hex, got ${typeof hashResult.hash} len=${hashResult.hash?.length}`;
  }
}

// 2. chunk
const chunkResult = await test('chunk (80-line windows)', () =>
  runWorkerTask(WORKER, 'chunk', { text: SAMPLE_TEXT, filePath: SAMPLE_PATH, maxLines: 80, overlap: 10 })
);
if (chunkResult) {
  if (!Array.isArray(chunkResult) || chunkResult.length === 0) {
    results.at(-1).pass = false;
    results.at(-1).error = 'Expected non-empty array of chunks';
  } else if (!('text' in chunkResult[0]) || !('startLine' in chunkResult[0])) {
    results.at(-1).pass = false;
    results.at(-1).error = 'Chunk missing text or startLine fields';
  } else {
    console.log(`    ${c.dim(`→ ${chunkResult.length} chunks produced`)}`);
  }
}

// 3. metadata
const metaResult = await test('metadata (regex extraction)', () =>
  runWorkerTask(WORKER, 'metadata', { text: SAMPLE_TEXT, filePath: SAMPLE_PATH })
);
if (metaResult) {
  if (!Array.isArray(metaResult.imports) || !Array.isArray(metaResult.exports)) {
    results.at(-1).pass = false;
    results.at(-1).error = 'Missing imports or exports arrays';
  } else if (metaResult.language !== 'typescript') {
    results.at(-1).pass = false;
    results.at(-1).error = `Expected language=typescript, got ${metaResult.language}`;
  } else {
    console.log(`    ${c.dim(`→ ${metaResult.imports.length} imports, ${metaResult.exports.length} exports, lang=${metaResult.language}`)}`);
  }
}

// 4. qdrant_payload (using first chunk + metadata)
if (chunkResult && metaResult) {
  const firstChunk = chunkResult[0];
  const payloadResult = await test('qdrant_payload (full payload build)', () =>
    runWorkerTask(WORKER, 'qdrant_payload', {
      chunk:       { text: firstChunk.text, startLine: firstChunk.startLine, endLine: firstChunk.endLine, chunkIndex: firstChunk.chunkIndex, filePath: SAMPLE_PATH },
      metadata:    metaResult,
      contentHash: hashResult?.hash ?? null,
    })
  );
  if (payloadResult) {
    const required = ['path', 'relative_path', 'content', 'content_hash', 'chunk_index', 'start_line', 'end_line', 'language'];
    const missing = required.filter(k => !(k in payloadResult));
    if (missing.length > 0) {
      results.at(-1).pass = false;
      results.at(-1).error = `Missing fields: ${missing.join(', ')}`;
    } else {
      console.log(`    ${c.dim(`→ ${Object.keys(payloadResult).length} fields, lang=${payloadResult.language}`)}`);
    }
  }
}

// 5. kmeans (small dataset — CPU JS or GPU if available)
const kmeansResult = await test('kmeans (k=5, n=50, dim=64)', () =>
  runWorkerTask(WORKER, 'kmeans', { embeddings: SMALL_EMBEDDINGS, k: 5, maxIterations: 30 })
);
if (kmeansResult) {
  if (!Array.isArray(kmeansResult.clusters) || kmeansResult.clusters.length !== 50) {
    results.at(-1).pass = false;
    results.at(-1).error = `Expected 50 cluster assignments, got ${kmeansResult.clusters?.length}`;
  } else {
    console.log(`    ${c.dim(`→ k=${kmeansResult.centroids?.length}, source=${kmeansResult.source}, sil=${kmeansResult.silhouetteScore?.toFixed(3)}`)}`);
  }
}

// 6. som (small dataset)
const somResult = await test('som (5×5 grid, n=50, dim=64)', () =>
  runWorkerTask(WORKER, 'som', { embeddings: SMALL_EMBEDDINGS, gridWidth: 5, gridHeight: 5, maxIterations: 20 })
);
if (somResult) {
  if (!Array.isArray(somResult.clusters) || somResult.clusters.length !== 50) {
    results.at(-1).pass = false;
    results.at(-1).error = `Expected 50 BMU assignments`;
  } else {
    console.log(`    ${c.dim(`→ source=${somResult.source}, QE=${somResult.quantizationError?.toFixed(4)}`)}`);
  }
}

// 7. forensics
const forensicsResult = await test('forensics (PII + legal keywords)', () =>
  runWorkerTask(WORKER, 'forensics', { text: FORENSICS_TEXT })
);
if (forensicsResult) {
  if (!Array.isArray(forensicsResult)) {
    results.at(-1).pass = false;
    results.at(-1).error = 'Expected array of flags';
  } else {
    const types = forensicsResult.map(f => f.type);
    console.log(`    ${c.dim(`→ ${forensicsResult.length} flags: ${types.join(', ')}`)}`);
    if (!types.includes('PII_SSN')) {
      results.at(-1).pass = false;
      results.at(-1).error = 'Expected PII_SSN flag to be detected';
    }
  }
}

// 8. similarity (SharedArrayBuffer zero-copy path)
await test('similarity (SharedArrayBuffer, n=50, dim=64)', async () => {
  const dim = 64;
  const n   = 50;
  // Build flat query + corpus directly (no Worker dispatch needed for the SAB path —
  // we simulate exactly what ComputePool.runBatchSimilarity does)
  const sharedQuery  = new SharedArrayBuffer(dim * 4);
  const sharedCorpus = new SharedArrayBuffer(n * dim * 4);
  const sharedScores = new SharedArrayBuffer(n * 4);

  const qArr = new Float32Array(sharedQuery);
  const cArr = new Float32Array(sharedCorpus);
  for (let d = 0; d < dim; d++) qArr[d] = Math.sin(d * 0.1);
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < dim; d++) {
      cArr[i * dim + d] = Math.sin((i + 1) * 0.1 + d * 0.05);
    }
  }

  const result = await runWorkerTask(WORKER, 'similarity', { sharedQuery, sharedCorpus, sharedScores, n, dim });

  const scores = new Float32Array(sharedScores);
  const allValid = Array.from(scores).every(s => s >= -1.0001 && s <= 1.0001);
  if (!allValid) throw new Error('Scores out of [-1, 1] range — cosine invariant violated');
  if (!result?.shared) throw new Error('Expected shared=true for SAB path');
  return { n: scores.length, source: result.source, sampleScore: scores[0].toFixed(4) };
});

// 9. silhouette (uses previously computed kmeans)
if (kmeansResult) {
  await test('silhouette (n=50, k=5)', () =>
    runWorkerTask(WORKER, 'silhouette', {
      embeddings: SMALL_EMBEDDINGS,
      assignments: kmeansResult.clusters,
      k: 5,
    })
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
const totalMs = results.reduce((s, r) => s + r.ms, 0);

console.log(`\n${'─'.repeat(50)}`);
console.log(`${c.bold('Results:')} ${c.green(`${passed} passed`)}  ${failed > 0 ? c.red(`${failed} failed`) : c.dim('0 failed')}  ${c.dim(`${totalMs}ms total`)}`);

if (failed > 0) {
  console.log(`\n${c.red('Failed tests:')}`);
  results.filter(r => !r.pass).forEach(r => {
    console.log(`  ✗ ${r.name}: ${r.error}`);
  });
  process.exit(1);
} else {
  console.log(`${c.green('All compute-worker task types operational.')}\n`);
  process.exit(0);
}
