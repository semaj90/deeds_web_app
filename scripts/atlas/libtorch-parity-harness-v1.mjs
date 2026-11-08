// LibTorch-backed native export parity harness (correctness, not performance).
// Compares tensorrt_bridge.node exports against seeded CPU references, records which backend served
// each call (addon execution counters), proves the harness can fail (self-test with faulty wrappers),
// and writes one new receipt under .tmp/atlas/. No service or database access.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADDON = process.env.TENSORRT_BRIDGE_PATH
  ? resolve(process.env.TENSORRT_BRIDGE_PATH)
  : resolve(ROOT, 'simd-bridge', 'cpp', 'build-x64-cuda', 'Release', 'tensorrt_bridge.node');

// float32 accumulation over dim <= 768 against a float64 reference. Observed errors are ~1e-8.
const TOL_COSINE = 1e-6;
const TOL_ATTENTION = 1e-6;
const TOL_CENTROID_MEAN = 1e-4;

const SHAPES = {
  batchCosineSimilarity: [[256, 64], [33, 64], [1, 64], [64, 768], [1000, 16]],
  attentionScoreGPU: [[128, 64], [33, 64], [1, 64], [64, 768]],
  kmeansWithCentroids: [[200, 16, 4], [201, 16, 5], [64, 8, 2]],
};

const COUNTER_KEYS = ['cuda_execution', 'cpu_fallback', 'stub_invocation', 'cuda_error_fallback', 'oom_fallback'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomMatrix(rng, rows, dim) {
  const out = new Float32Array(rows * dim);
  for (let i = 0; i < out.length; i++) out[i] = rng() * 2 - 1;
  return out;
}

function cpuCosine(query, dim, corpus, n) {
  let qn = 0;
  for (let d = 0; d < dim; d++) qn += query[d] * query[d];
  qn = Math.sqrt(qn);
  const scores = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let dot = 0, cn = 0;
    for (let d = 0; d < dim; d++) {
      const c = corpus[i * dim + d];
      dot += query[d] * c;
      cn += c * c;
    }
    scores[i] = dot / (qn * Math.sqrt(cn));
  }
  return scores;
}

function cpuAttention(query, dim, keys, n) {
  const scale = 1 / Math.sqrt(dim);
  const scores = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += query[d] * keys[i * dim + d];
    scores[i] = dot * scale;
  }
  let max = -Infinity;
  for (const s of scores) if (s > max) max = s;
  let sum = 0;
  const exp = new Float64Array(n);
  for (let i = 0; i < n; i++) { exp[i] = Math.exp(scores[i] - max); sum += exp[i]; }
  for (let i = 0; i < n; i++) exp[i] /= sum;
  return exp;
}

function maxAbsDiff(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

function snap(addon) {
  const c = addon.getExecutionCounters();
  return Object.fromEntries(COUNTER_KEYS.map((k) => [k, Number(c[k] ?? 0)]));
}

function backendVerdict(before, after) {
  const delta = Object.fromEntries(COUNTER_KEYS.map((k) => [k, after[k] - before[k]]));
  const ok = delta.cuda_execution >= 1 && delta.cpu_fallback === 0 && delta.stub_invocation === 0
    && delta.cuda_error_fallback === 0 && delta.oom_fallback === 0;
  return { delta, ok };
}

// Every check runs through here so a silent CPU fallback cannot pass.
function runChecked(addon, check, ...args) {
  const before = snap(addon);
  let result;
  try {
    result = check(addon, ...args);
  } catch (err) {
    result = { name: check.name.replace(/^check/, ''), status: 'FAIL', error: String(err.message).slice(0, 200) };
  }
  const backend = backendVerdict(before, snap(addon));
  result.backend = backend;
  if (!backend.ok) {
    result.status = 'FAIL';
    result.failReason = (result.failReason ? result.failReason + '; ' : '') + 'BACKEND_NOT_CUDA_OR_FALLBACK_OBSERVED';
  }
  return result;
}

function checkBatchCosine(addon, rng, [n, dim]) {
  const query = randomMatrix(rng, 1, dim);
  const corpus = randomMatrix(rng, n, dim);
  const scores = new Float32Array(n);
  const rc = addon.batchCosineSimilarity(query, dim, corpus, n, scores, n);
  const diff = maxAbsDiff(scores, cpuCosine(query, dim, corpus, n));
  return { name: 'batchCosineSimilarity', n, dim, returnCode: rc, maxAbsDiff: diff, tolerance: TOL_COSINE,
    status: rc === 0 && diff <= TOL_COSINE ? 'PASS' : 'FAIL' };
}

function checkAttention(addon, rng, [n, dim]) {
  const query = randomMatrix(rng, 1, dim);
  const keys = randomMatrix(rng, n, dim);
  const weights = addon.attentionScoreGPU(query, dim, keys, n);
  const diff = maxAbsDiff(weights, cpuAttention(query, dim, keys, n));
  let sum = 0;
  for (const w of weights) sum += w;
  const sumToOne = Math.abs(sum - 1) <= 1e-5;
  return { name: 'attentionScoreGPU', n, dim, maxAbsDiff: diff, sumToOne, tolerance: TOL_ATTENTION,
    status: diff <= TOL_ATTENTION && sumToOne ? 'PASS' : 'FAIL' };
}

function checkKmeans(addon, rng, [n, dim, k]) {
  const emb = randomMatrix(rng, n, dim);
  const res = addon.kmeansWithCentroids(emb, n, dim, k, 50);
  const { assignments, centroids } = res;
  const shapeOk = assignments.length === n && centroids.length === k * dim;
  const rangeOk = Array.from(assignments).every((a) => Number.isInteger(a) && a >= 0 && a < k);
  let nearestViolations = 0;
  for (let i = 0; i < n && shapeOk && rangeOk; i++) {
    const d2 = (j) => {
      let s = 0;
      for (let d = 0; d < dim; d++) {
        const diff = emb[i * dim + d] - centroids[j * dim + d];
        s += diff * diff;
      }
      return s;
    };
    let best = Infinity;
    for (let j = 0; j < k; j++) best = Math.min(best, d2(j));
    if (d2(assignments[i]) - best > 1e-5) nearestViolations++;
  }
  // Centroids must equal the mean of their assigned points (non-empty clusters).
  let centroidMeanMaxDiff = 0, emptyClusters = 0;
  if (shapeOk && rangeOk) {
    for (let j = 0; j < k; j++) {
      const sums = new Float64Array(dim);
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (assignments[i] !== j) continue;
        count++;
        for (let d = 0; d < dim; d++) sums[d] += emb[i * dim + d];
      }
      if (count === 0) { emptyClusters++; continue; }
      for (let d = 0; d < dim; d++) {
        centroidMeanMaxDiff = Math.max(centroidMeanMaxDiff, Math.abs(sums[d] / count - centroids[j * dim + d]));
      }
    }
  }
  const meanOk = centroidMeanMaxDiff <= TOL_CENTROID_MEAN;
  return { name: 'kmeansWithCentroids', n, dim, k, shapeOk, rangeOk, nearestCentroidViolations: nearestViolations,
    centroidMeanMaxDiff, centroidMeanTolerance: TOL_CENTROID_MEAN, emptyClusters, reseeded: res.reseeded ?? null,
    status: shapeOk && rangeOk && nearestViolations === 0 && meanOk ? 'PASS' : 'FAIL' };
}

const CHECKS = [
  ['batchCosineSimilarity', checkBatchCosine],
  ['attentionScoreGPU', checkAttention],
  ['kmeansWithCentroids', checkKmeans],
];

// Faulty wrappers: the harness must report FAIL for each. Proves the checks can fail.
function faultyAddon(real, mode) {
  return {
    batchCosineSimilarity(q, dim, c, n, s, len) {
      const rc = real.batchCosineSimilarity(q, dim, c, n, s, len);
      if (mode === 'perturb-output') s[0] += 1e-3;
      return rc;
    },
    attentionScoreGPU(q, dim, k, n) {
      const w = real.attentionScoreGPU(q, dim, k, n);
      if (mode === 'perturb-output') w[0] += 1e-3;
      return w;
    },
    kmeansWithCentroids(e, n, dim, k, it) {
      const r = real.kmeansWithCentroids(e, n, dim, k, it);
      if (mode === 'perturb-output') r.centroids[0] += 0.5;
      return r;
    },
    // 'no-cuda-counter' simulates a silent fallback: the counter never advances.
    getExecutionCounters: mode === 'no-cuda-counter' ? () => ({ cuda_execution: 0, cpu_fallback: 0 }) : () => real.getExecutionCounters(),
  };
}

function selfTest(real) {
  const out = [];
  for (const mode of ['perturb-output', 'no-cuda-counter']) {
    const faulty = faultyAddon(real, mode);
    const rng = mulberry32(7);
    for (const [name, check] of CHECKS) {
      const res = runChecked(faulty, check, rng, SHAPES[name][0]);
      out.push({ fault: mode, check: name, detected: res.status === 'FAIL' });
    }
  }
  return { cases: out, allFaultsDetected: out.every((c) => c.detected) };
}

async function main() {
  const receipt = {
    schema: 'atlas.libtorch-parity-harness.v2',
    generatedAt: new Date().toISOString(),
    addonPath: ADDON,
    seed: 20261107,
    tolerances: { cosine: TOL_COSINE, attention: TOL_ATTENTION, centroidMean: TOL_CENTROID_MEAN },
    canonicalAuthority: false,
    databaseWritesPerformed: false,
    localArtifactsWritten: true,
    purpose: 'correctness parity against seeded CPU references; not a performance, VRAM or removal decision',
    notCovered: ['latency', 'VRAM', 'release build', 'zero/NaN inputs', 'exports other than the three checked'],
    results: [],
  };

  let addon;
  try {
    addon = createRequire(import.meta.url)(ADDON);
  } catch (err) {
    receipt.status = 'BLOCKED';
    receipt.reason = `ADDON_LOAD_FAILED: ${String(err.message).slice(0, 200)}`;
    return finish(receipt);
  }
  receipt.backend = { simdJsonBackend: addon.simdJsonBackend?.() ?? null, buildInfo: addon.getBackendInfo?.() ?? null };

  receipt.selfTest = selfTest(addon);
  if (!receipt.selfTest.allFaultsDetected) {
    receipt.status = 'BLOCKED';
    receipt.reason = 'SELF_TEST_FAILED: harness did not detect a deliberately faulty output';
    return finish(receipt);
  }

  const rng = mulberry32(receipt.seed);
  for (const [name, check] of CHECKS) {
    for (const shape of SHAPES[name]) receipt.results.push(runChecked(addon, check, rng, shape));
  }
  receipt.status = receipt.results.every((r) => r.status === 'PASS') ? 'PASS' : 'FAIL';
  return finish(receipt);
}

function finish(receipt) {
  const dir = resolve(ROOT, '.tmp', 'atlas');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const out = resolve(dir, `libtorch-parity-v2.${stamp}.json`);
  receipt.receiptSha256Basis = 'sha256 of this JSON with the receiptSha256 field removed';
  receipt.receiptSha256 = createHash('sha256').update(JSON.stringify(receipt, null, 2)).digest('hex');
  writeFileSync(out, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(`${receipt.status}${receipt.reason ? ' (' + receipt.reason + ')' : ''} -> ${out}`);
  if (receipt.selfTest) console.log(`  self-test: ${receipt.selfTest.allFaultsDetected ? 'all faults detected' : 'MISSED FAULTS'}`);
  for (const r of receipt.results) {
    console.log(`  ${r.status} ${r.name} n=${r.n} dim=${r.dim}${r.k ? ' k=' + r.k : ''}`
      + `${r.maxAbsDiff !== undefined ? ' maxAbsDiff=' + r.maxAbsDiff.toExponential(2) : ''}${r.failReason ? ' [' + r.failReason + ']' : ''}`);
  }
  process.exitCode = receipt.status === 'PASS' ? 0 : 1;
}

main();
