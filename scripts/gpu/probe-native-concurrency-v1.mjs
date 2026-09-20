#!/usr/bin/env node

/**
 * Read-only worker-thread proof for the native LibTorch bridge.
 * It validates two independent query/corpus jobs concurrently through the
 * existing gpu-worker protocol. It does not write model, cache, or corpus data.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const addonPath = resolve(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');
const workerScriptPath = resolve(ROOT, 'sveltekit-frontend/src/lib/workers/gpu-worker.mjs');
const libPath = 'C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib';
const DIM = 768;
const N = 64;
const JOBS = 2;

let state = 0x13579bdf;
function random() {
  state = (Math.imul(state ^ (state >>> 16), 2246822519) + 3266489917) >>> 0;
  return state / 0x100000000;
}

function makeInput(job) {
  const query = new Float32Array(DIM);
  const corpus = new Float32Array(N * DIM);
  for (let i = 0; i < DIM; i++) query[i] = random() * 2 - 1 + job * 0.001;
  for (let i = 0; i < corpus.length; i++) corpus[i] = random() * 2 - 1 + job * 0.001;
  return { query, corpus };
}

function checksum(value) {
  return createHash('sha256').update(Buffer.from(value.buffer, value.byteOffset, value.byteLength)).digest('hex');
}

function cpuScores(query, corpus) {
  let qNorm = 0;
  for (const value of query) qNorm += value * value;
  qNorm = Math.sqrt(qNorm);
  const scores = new Float32Array(N);
  for (let row = 0; row < N; row++) {
    let dot = 0;
    let norm = 0;
    const offset = row * DIM;
    for (let i = 0; i < DIM; i++) {
      const value = corpus[offset + i];
      dot += query[i] * value;
      norm += value * value;
    }
    scores[row] = dot / (qNorm * Math.sqrt(norm));
  }
  return scores;
}

function runWorker({ query, corpus }) {
  const queryBuffer = query.buffer.slice(0);
  const corpusBuffer = corpus.buffer.slice(0);
  return new Promise((resolvePromise, reject) => {
    const worker = new Worker(workerScriptPath, {
      workerData: {
        fn: 'batchCosineSimilarity',
        addonPath,
        libPath,
        args: [new Float32Array(queryBuffer), DIM, new Float32Array(corpusBuffer), N],
      },
      transferList: [queryBuffer, corpusBuffer],
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('native worker timed out'));
    }, 120000);
    worker.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once('message', (message) => {
      clearTimeout(timer);
      worker.terminate();
      if (!message.ok) reject(new Error(message.error));
      else resolvePromise(message.result);
    });
  });
}

const inputs = Array.from({ length: JOBS }, (_, job) => makeInput(job));
const startedAt = Date.now();
const results = await Promise.all(inputs.map(runWorker));
const wallMs = Date.now() - startedAt;

const jobs = results.map((nativeScores, index) => {
  const expected = cpuScores(inputs[index].query, inputs[index].corpus);
  let maxAbsDelta = 0;
  let meanAbsDelta = 0;
  for (let i = 0; i < N; i++) {
    const delta = Math.abs(nativeScores[i] - expected[i]);
    maxAbsDelta = Math.max(maxAbsDelta, delta);
    meanAbsDelta += delta;
  }
  meanAbsDelta /= N;
  return {
    job: index,
    inputChecksum: `sha256:${checksum(inputs[index].corpus)}`,
    outputChecksum: `sha256:${checksum(nativeScores)}`,
    maxAbsDelta,
    meanAbsDelta,
    rowCount: N,
    dimensions: DIM,
  };
});

const report = {
  schema: 'atlas.native-concurrency-proof.v1',
  status: 'NAPI_WORKER_CONCURRENCY_FIXTURE_PROVEN',
  executor: 'native_libtorch_bridge',
  workerProtocol: 'gpu-worker.mjs',
  jobs,
  concurrency: { requestedJobs: JOBS, completedJobs: results.length, wallMs },
  canonicalAuthority: false,
  writesPerformed: false,
  tensorsPersisted: false,
  liveCorpus: false,
  promotionAuthorized: false,
};

const reportPath = resolve(ROOT, 'docs/reports/native-concurrency-proof-v1.json');
mkdirSync(resolve(ROOT, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, ...report }, null, 2));
