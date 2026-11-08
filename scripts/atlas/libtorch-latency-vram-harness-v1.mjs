// LibTorch-backed native export latency + VRAM harness (LIBTORCH-PARITY-01, performance half).
// Measures the 8 exports that already have correctness evidence (libtorch-parity-harness-v1.mjs) against a
// plain-JS CPU reference at the same shapes, and samples VRAM from OUTSIDE the process with nvidia-smi
// (cudaMemGetInfo overstates free VRAM on this WDDM host). Read-only: no service, database or file writes
// except one new receipt under .tmp/atlas/. It never stops or starts a service.
//
// Honest limits, recorded in the receipt:
//  - The addon reports build_type "debug_or_unoptimized" because binding.cc is compiled without NDEBUG
//    (the preset overrides CMAKE_CXX_FLAGS_RELEASE to "/O2 /arch:AVX2"). The code is /O2 and the CUDA files
//    use -O2 -DNDEBUG, but this is NOT a clean release-build proof.
//  - nvidia-smi sampling is ~50 ms: a transient allocation shorter than that can be missed, so the peak is a
//    lower bound. Only a delta over the pre-run baseline is reported.
//  - Fixtures are capped so the run fits next to the llama-server on :8090 (about 700 MiB free on this host).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADDON = process.env.TENSORRT_BRIDGE_PATH
  ? resolve(process.env.TENSORRT_BRIDGE_PATH)
  : resolve(ROOT, 'simd-bridge', 'cpp', 'build-x64-cuda', 'Release', 'tensorrt_bridge.node');
const WARMUP = 5;
const ITERS = 30;
const MIN_FREE_MIB = Number(process.env.LATENCY_MIN_FREE_MIB ?? 400);
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
  const m = new Float32Array(rows * dim);
  for (let i = 0; i < m.length; i++) m[i] = rng() * 2 - 1;
  return m;
}

// ---- CPU references (plain JS, float64 accumulation; same math the parity harness checks against) ----
const cpu = {
  cosine(query, dim, corpus, n) {
    let qn = 0; for (let d = 0; d < dim; d++) qn += query[d] * query[d]; qn = Math.sqrt(qn);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let dot = 0, cn = 0;
      for (let d = 0; d < dim; d++) { const c = corpus[i * dim + d]; dot += query[d] * c; cn += c * c; }
      out[i] = dot / (qn * Math.sqrt(cn));
    }
    return out;
  },
  attention(query, dim, keys, n) {
    const s = new Float64Array(n); let mx = -Infinity;
    for (let i = 0; i < n; i++) {
      let dot = 0; for (let d = 0; d < dim; d++) dot += query[d] * keys[i * dim + d];
      s[i] = dot / Math.sqrt(dim); if (s[i] > mx) mx = s[i];
    }
    let sum = 0; for (let i = 0; i < n; i++) { s[i] = Math.exp(s[i] - mx); sum += s[i]; }
    for (let i = 0; i < n; i++) s[i] /= sum;
    return s;
  },
  softmax(x, n) {
    let mx = -Infinity; for (let i = 0; i < n; i++) if (x[i] > mx) mx = x[i];
    const o = new Float64Array(n); let sum = 0;
    for (let i = 0; i < n; i++) { o[i] = Math.exp(x[i] - mx); sum += o[i]; }
    for (let i = 0; i < n; i++) o[i] /= sum;
    return o;
  },
  topK(scores, n, k) {
    return Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[b] - scores[a] || a - b).slice(0, k);
  },
  reward(gen, ref, n, dim) {
    const o = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let dot = 0, gn = 0, rn = 0;
      for (let d = 0; d < dim; d++) { const g = gen[i * dim + d], r = ref[i * dim + d]; dot += g * r; gn += g * g; rn += r * r; }
      o[i] = dot / (Math.sqrt(gn) * Math.sqrt(rn));
    }
    return o;
  },
  pca(data, n, dim, mean, comps, k) {
    const o = new Float64Array(n * k);
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) {
      let acc = 0; for (let d = 0; d < dim; d++) acc += (data[i * dim + d] - mean[d]) * comps[j * dim + d];
      o[i * k + j] = acc;
    }
    return o;
  },
};

// ---- Cases: each returns { gpu: () => void, cpuRef: (() => void) | null }, built once per shape ----
const CASES = [
  { name: 'batchCosineSimilarity', shapes: [[1000, 768], [20000, 768]], build(a, rng, [n, dim]) {
    const q = randomMatrix(rng, 1, dim), c = randomMatrix(rng, n, dim), out = new Float32Array(n);
    return { gpu: () => a.batchCosineSimilarity(q, dim, c, n, out, n), cpuRef: () => cpu.cosine(q, dim, c, n) }; } },
  { name: 'attentionScoreGPU', shapes: [[1000, 768], [20000, 768]], build(a, rng, [n, dim]) {
    const q = randomMatrix(rng, 1, dim), k = randomMatrix(rng, n, dim);
    return { gpu: () => a.attentionScoreGPU(q, dim, k, n), cpuRef: () => cpu.attention(q, dim, k, n) }; } },
  { name: 'softmaxGPU', shapes: [[4096], [262144]], build(a, rng, [n]) {
    const x = randomMatrix(rng, 1, n).map((v) => v * 8);
    return { gpu: () => a.softmaxGPU(x, n), cpuRef: () => cpu.softmax(x, n) }; } },
  { name: 'topKIndicesGPU', shapes: [[4096, 64], [262144, 64]], build(a, rng, [n, k]) {
    const s = randomMatrix(rng, 1, n);
    return { gpu: () => a.topKIndicesGPU(s, n, k), cpuRef: () => cpu.topK(s, n, k) }; } },
  { name: 'rewardScoreGPU', shapes: [[1000, 768], [8000, 768]], build(a, rng, [n, dim]) {
    const g = randomMatrix(rng, n, dim), r = randomMatrix(rng, n, dim);
    return { gpu: () => a.rewardScoreGPU(g, r, n, dim), cpuRef: () => cpu.reward(g, r, n, dim) }; } },
  { name: 'pcaProject', shapes: [[1000, 768, 64], [4096, 768, 64]], build(a, rng, [n, dim, k]) {
    const d = randomMatrix(rng, n, dim), m = randomMatrix(rng, 1, dim), c = randomMatrix(rng, k, dim);
    return { gpu: () => a.pcaProject(d, n, dim, m, c, k), cpuRef: () => cpu.pca(d, n, dim, m, c, k) }; } },
  { name: 'batchCosineTopK', shapes: [[1000, 768, 10], [20000, 768, 10]], build(a, rng, [n, dim, k]) {
    const q = randomMatrix(rng, 1, dim), c = randomMatrix(rng, n, dim);
    return { gpu: () => a.batchCosineTopK(q, c, n, dim, k), cpuRef: () => cpu.topK(cpu.cosine(q, dim, c, n), n, k) }; } },
  { name: 'kmeansWithCentroids', shapes: [[2000, 64, 8]], build(a, rng, [n, dim, k]) {
    const e = randomMatrix(rng, n, dim);
    return { gpu: () => a.kmeansWithCentroids(e, n, dim, k, 20), cpuRef: null }; } },
];

// ---- timing and stats ----
function timeMs(fn) { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; }
function pct(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; }
function stats(samples) {
  const s = [...samples].sort((x, y) => x - y);
  return { n: s.length, p50: pct(s, 0.5), p95: pct(s, 0.95), max: s[s.length - 1], min: s[0] };
}

// ---- VRAM sampling from outside the process ----
function smiUsedMiB() {
  return Number(execFileSync('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8' })
    .trim().split(',')[0]);
}
function smiTotalMiB() {
  return Number(execFileSync('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8' }).trim());
}
function startPoller() {
  const samples = []; // { t (epoch ms), used (MiB) }
  const child = spawn('nvidia-smi', ['--query-gpu=timestamp,memory.used', '--format=csv,noheader,nounits', '-lms', '50'], { stdio: ['ignore', 'pipe', 'ignore'] });
  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/); buf = lines.pop();
    for (const line of lines) {
      const [ts, used] = line.split(',').map((x) => x.trim());
      const m = ts && ts.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
      if (m && Number.isFinite(Number(used))) samples.push({ t: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]).getTime(), used: Number(used) });
    }
  });
  return { samples, stop: () => child.kill() };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function counters(addon) {
  const c = addon.getExecutionCounters();
  return Object.fromEntries(COUNTER_KEYS.map((k) => [k, Number(c[k] ?? 0)]));
}

async function slotsIdle() {
  try {
    const res = await fetch('http://127.0.0.1:8090/slots', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { checked: true, idle: null, note: `HTTP ${res.status}` };
    const slots = await res.json();
    return { checked: true, idle: Array.isArray(slots) && slots.every((s) => s.is_processing === false) };
  } catch (e) {
    return { checked: false, idle: null, note: 'llama-server :8090 not reachable (read-only probe)' };
  }
}

async function main() {
  const require = createRequire(import.meta.url);
  const addon = require(ADDON);
  const info = addon.getBackendInfo ? addon.getBackendInfo() : {};
  const total = smiTotalMiB();
  const baseUsed = smiUsedMiB();
  const free = total - baseUsed;
  const receipt = {
    schema: 'atlas.libtorch-latency-vram.v1',
    generatedAt: new Date().toISOString(),
    addon: ADDON,
    backendInfo: { build_type: info.build_type, cuda_compiled: info.cuda_compiled, libtorch_built: info.libtorch_built },
    buildTypeCaveat: 'build_type is derived from NDEBUG, which this build does not define; the code is /O2 and the CUDA files are -O2 -DNDEBUG. Not a clean release-build proof.',
    vram: { totalMiB: total, usedBeforeMiB: baseUsed, freeBeforeMiB: free, minFreeRequiredMiB: MIN_FREE_MIB,
      method: 'nvidia-smi sampled every ~50 ms from a separate process; peak is a lower bound' },
    llamaServerSlots: await slotsIdle(),
    warmup: WARMUP, iterations: ITERS,
    results: [], status: 'PASS', writesPerformed: false, canonicalAuthority: false,
  };
  if (free < MIN_FREE_MIB) {
    receipt.status = 'BLOCKED_VRAM';
    receipt.reason = `only ${free} MiB free, need ${MIN_FREE_MIB}; this harness never stops a service`;
    return finish(receipt);
  }
  if (receipt.llamaServerSlots.idle === false) {
    receipt.status = 'BLOCKED_LLAMA_SERVER_BUSY';
    receipt.reason = ':8090 is processing; timings would be skewed. Re-run when /slots is idle.';
    return finish(receipt);
  }

  const rng = mulberry32(0x1a7e9c);
  const poller = startPoller();
  await sleep(2500); // idle window: measures how much the whole-GPU reading moves with nothing of ours running
  const idle = poller.samples.map((x) => x.used);
  const noiseMin = Math.min(...idle), noiseMax = Math.max(...idle);
  receipt.vram.idleNoise = { samples: idle.length, minMiB: noiseMin, maxMiB: noiseMax, spreadMiB: noiseMax - noiseMin,
    note: 'nvidia-smi reports the whole card (other processes included); a per-export figure is only claimed when the peak exceeds the idle maximum' };
  for (const c of CASES) {
    for (const shape of c.shapes) {
      let built;
      try { built = c.build(addon, rng, shape); } catch (e) { receipt.results.push({ name: c.name, shape, status: 'FAIL', error: String(e.message).slice(0, 160) }); receipt.status = 'FAIL'; continue; }
      const before = counters(addon);
      const winStart = Date.now();
      const gpuMs = [];
      let err = null;
      try {
        for (let i = 0; i < WARMUP; i++) built.gpu();
        for (let i = 0; i < ITERS; i++) gpuMs.push(timeMs(built.gpu));
      } catch (e) { err = String(e.message).slice(0, 160); }
      const winEnd = Date.now();
      await sleep(150); // let late poller lines arrive after the synchronous burst
      const after = counters(addon);
      const delta = Object.fromEntries(COUNTER_KEYS.map((k) => [k, after[k] - before[k]]));
      const backendOk = !err && delta.cuda_execution >= WARMUP + ITERS && delta.cpu_fallback === 0 && delta.stub_invocation === 0
        && delta.cuda_error_fallback === 0 && delta.oom_fallback === 0;
      const win = poller.samples.filter((s) => s.t >= winStart - 60 && s.t <= winEnd + 60).map((s) => s.used);
      const peak = win.length ? Math.max(...win) : null;
      const row = { name: c.name, shape, status: backendOk ? 'PASS' : 'FAIL', backendDelta: delta,
        gpuMs: gpuMs.length ? stats(gpuMs) : null,
        vram: { samplesInWindow: win.length, peakUsedMiB: peak,
          conclusive: peak != null && peak > noiseMax,
          atLeastAboveIdleMaxMiB: peak != null && peak > noiseMax ? peak - noiseMax : null,
          verdict: peak == null ? 'NO_SAMPLES' : peak > noiseMax ? 'RISE_ABOVE_IDLE_NOISE' : 'NOT_DISTINGUISHABLE_FROM_NOISE' } };
      if (err) row.error = err;
      if (!backendOk) { row.failReason = err ?? 'BACKEND_NOT_CUDA_OR_FALLBACK_OBSERVED'; receipt.status = 'FAIL'; }
      if (built.cpuRef) {
        const cpuMs = [];
        for (let i = 0; i < 3; i++) cpuMs.push(timeMs(built.cpuRef));
        row.cpuRefMs = stats(cpuMs);
        row.speedupVsCpuRefP50 = row.gpuMs ? row.cpuRefMs.p50 / row.gpuMs.p50 : null;
      } else { row.cpuRefMs = null; row.note = 'no CPU reference in this harness'; }
      receipt.results.push(row);
    }
  }
  poller.stop();
  receipt.vram.allocatorNote = 'LibTorch caching allocator keeps memory across cases, so per-case VRAM figures are cumulative card-level readings, not per-export peaks. Trust only the run-level peak and the retained delta.';
  receipt.vram.runPeakUsedMiB = Math.max(...receipt.results.map((r) => r.vram?.peakUsedMiB ?? 0));
  receipt.timingNote = 'Single run. Repeat runs of the same case differed by up to ~2x (shared GPU with :8090, clocks, first-run effects); treat p50 as indicative, not a stable benchmark.';
  const finalUsed = smiUsedMiB();
  receipt.vram.usedAfterMiB = finalUsed;
  receipt.vram.retainedDeltaMiB = finalUsed - baseUsed; // LibTorch caching allocator may keep memory
  return finish(receipt);
}

function finish(receipt) {
  const dir = resolve(ROOT, '.tmp', 'atlas');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const out = resolve(dir, `libtorch-latency-vram-v1.${stamp}.json`);
  writeFileSync(out, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(`${receipt.status} -> ${out}`);
  if (receipt.reason) console.log(`  ${receipt.reason}`);
  for (const r of receipt.results) {
    const g = r.gpuMs ? `gpu p50 ${r.gpuMs.p50.toFixed(3)} ms p95 ${r.gpuMs.p95.toFixed(3)}` : 'gpu n/a';
    const c = r.cpuRefMs ? ` | cpu p50 ${r.cpuRefMs.p50.toFixed(2)} ms | x${(r.speedupVsCpuRefP50 ?? 0).toFixed(1)}` : '';
    const v = r.vram ? ` | vram ${r.vram.conclusive ? '>= +' + r.vram.atLeastAboveIdleMaxMiB + ' MiB over idle max' : r.vram.verdict} (${r.vram.samplesInWindow} samples)` : '';
    console.log(`  ${r.status} ${r.name} [${r.shape.join(',')}] ${g}${c}${v}`);
  }
  process.exit(receipt.status === 'PASS' ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
