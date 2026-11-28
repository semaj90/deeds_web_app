/**
 * EG2-ETA-01: time ~2,000 current code chunks on the TensorRT-RTX EPContext EG2 worker.
 * EXPERIMENT. Read-only against PostgreSQL; no vectors are persisted anywhere.
 * Starts its own worker on :18094, stops it, and writes only under .tmp/review/<run>/.
 * Run from the repo root: node scripts/atlas/time-eg2-rtx-epcontext-readonly-v1.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { Phase8ProgressTracker } from './lib/phase8_progress.mjs';

const ROOT = process.cwd();
const TARGET = 2000;
const CORPUS = 235_399; // chunks whose indexed file existed (measured 2026-11-28)
const BATCHES = [1, 4, 8];
const CALIBRATION = 64;
const MAIN_CAP_MS = 25 * 60_000;
const MIN_START_FREE_MIB = 2000;
const stamp = new Date().toISOString().replace(/[-:.]/g, '');
const RUN = path.join(ROOT, '.tmp/review', `eg2-rtx-timing-${stamp}`);
const CTX_DIR = path.join(ROOT, '.tmp/review/eg2-rtx-ep-context-20261127');
const MODEL = path.join(ROOT, 'models/embeddinggemma2/onnx-trt-rtx');
const SERVER = path.join(ROOT, 'scripts/atlas/gemma2-onnx-embed-server-v1.py');
const PYTHON = path.join(ROOT, '.venv-eg2-gpu/Scripts/python.exe');
const GPU = 'http://127.0.0.1:18094';
const CPU = 'http://127.0.0.1:8094';
const EP = 'NvTensorRTRTXExecutionProvider';
const CHILD = `
import runpy, sys, threading
import uvicorn
module = runpy.run_path(sys.argv[1])
server = uvicorn.Server(uvicorn.Config(module["app"], host="127.0.0.1", port=18094, access_log=False))
def stop():
    sys.stdin.buffer.read(1)
    server.should_exit = True
threading.Thread(target=stop, daemon=True).start()
server.run()
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n, d = 2) => Number(n.toFixed(d));

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const part of fs.createReadStream(file)) hash.update(part);
  return hash.digest('hex');
}

function vram() {
  const [used, free] = execFileSync('nvidia-smi', ['--query-gpu=memory.used,memory.free', '--format=csv,noheader,nounits'], { encoding: 'utf8' })
    .trim().split(',').map(Number);
  return { usedMiB: used, freeMiB: free };
}

const portOpen = (port) => new Promise((resolve) => {
  const socket = net.connect({ host: '127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});

async function http(url, body, timeoutMs = 120_000) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}: ${(await response.text()).slice(0, 400)}`);
  return response.json();
}

async function slotsBusy() {
  try {
    return (await http('http://127.0.0.1:8090/slots', null, 3000)).some((s) => s.is_processing !== false);
  } catch {
    return null;
  }
}

/** Deterministic pseudo-random sample; keeps only chunks whose text is still in the file on disk. */
function sampleCurrentChunks() {
  const sql = `BEGIN TRANSACTION READ ONLY;
    SELECT json_build_object('id', id, 'path', relative_path, 'content', content)
      FROM codebase_chunk_index
     WHERE content_embedding_768 IS NOT NULL AND btrim(content) <> ''
     ORDER BY md5(id::text || 'eg2-eta-01') LIMIT 8000;
    COMMIT;`;
  const out = execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const files = new Map();
  const read = (relative) => {
    if (!files.has(relative)) {
      let text = null;
      for (const base of [ROOT, path.join(ROOT, 'sveltekit-frontend')]) {
        try { text = fs.readFileSync(path.resolve(base, relative), 'utf8').replace(/\r\n/g, '\n'); break; } catch { /* try next base */ }
      }
      files.set(relative, text);
    }
    return files.get(relative);
  };
  const counts = { examined: 0, current: 0, fileMissing: 0, textChanged: 0, cappedAt8000Chars: 0 };
  const chunks = [];
  for (const line of out.split('\n')) {
    if (!line.startsWith('{')) continue;
    if (chunks.length >= TARGET) break;
    const row = JSON.parse(line);
    counts.examined += 1;
    const file = read(row.path);
    if (file === null) { counts.fileMissing += 1; continue; }
    if (!file.includes(row.content.replace(/\r\n/g, '\n').trim())) { counts.textChanged += 1; continue; }
    counts.current += 1;
    let text = `title: ${row.path} | text: ${row.content.trim()}`;
    if (text.length > 8000) { counts.cappedAt8000Chars += 1; text = text.slice(0, 8000); }
    chunks.push({ id: row.id, text });
  }
  return { chunks, counts };
}

let peakUsedMiB = 0;
let minFreeMiB = Infinity;
function observeVram() {
  const now = vram();
  peakUsedMiB = Math.max(peakUsedMiB, now.usedMiB);
  minFreeMiB = Math.min(minFreeMiB, now.freeMiB);
}

async function embed(url, texts, timeoutMs) {
  const body = await http(`${url}/embed`, { texts, dims: [768] }, timeoutMs);
  const vectors = body.embeddings['768'];
  if (vectors.length !== texts.length || vectors.some((v) => v.length !== 768 || v.some((x) => !Number.isFinite(x)))) {
    throw new Error('INVALID_EMBEDDING_RESPONSE');
  }
  return { vectors, truncated: body.truncated_count, workerMs: body.elapsed_ms };
}

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / Math.sqrt(na * nb);
};

async function main() {
  fs.mkdirSync(path.join(RUN, 'runtime-cache'), { recursive: true });
  const receiptPath = path.join(RUN, 'receipt.json');
  const receipt = {
    schema: 'atlas.eg2-rtx-epcontext-timing.v1',
    startedAt: new Date().toISOString(),
    command: 'node scripts/atlas/time-eg2-rtx-epcontext-readonly-v1.mjs',
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    canonicalAuthority: false,
    writesPerformed: false,
    recipe: 'title: {relative_path} | text: {content.trim()} (capped 8000 chars, 512 tokens)',
  };
  const save = () => fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  let worker = null;
  let workerExit = null;
  let sampler = null;
  let phase = 'preflight';
  try {
    if (await portOpen(18094)) throw new Error('PORT_18094_IN_USE');
    receipt.slotsBusyBefore = await slotsBusy();
    if (receipt.slotsBusyBefore !== false) throw new Error('LLAMA_8090_NOT_CONFIRMED_IDLE');
    receipt.vramBefore = vram();
    if (receipt.vramBefore.freeMiB < MIN_START_FREE_MIB) throw new Error(`INSUFFICIENT_FREE_VRAM:${receipt.vramBefore.freeMiB}`);

    phase = 'artifact-pin';
    const compiled = JSON.parse(fs.readFileSync(path.join(CTX_DIR, 'receipt.json'), 'utf8'));
    const pinned = compiled.artifacts.filter((a) => a.path.endsWith('.engine') || a.path === 'model_trt_ctx.onnx');
    if (compiled.status !== 'PASS' || pinned.length !== 2) throw new Error('COMPILE_RECEIPT_UNUSABLE');
    for (const artifact of pinned) {
      if (await sha256(path.join(CTX_DIR, artifact.path)) !== artifact.sha256) throw new Error(`ARTIFACT_SHA_MISMATCH:${artifact.path}`);
    }
    receipt.artifacts = pinned;

    phase = 'sample';
    const { chunks, counts } = sampleCurrentChunks();
    receipt.sample = { target: TARGET, ...counts };
    if (chunks.length < TARGET) throw new Error(`SAMPLE_SHORT:${chunks.length}`);
    console.log(`[eg2] sample ${JSON.stringify(counts)}`);

    phase = 'worker-start';
    const log = fs.openSync(path.join(RUN, 'worker.log'), 'w');
    const started = performance.now();
    worker = spawn(PYTHON, ['-c', CHILD, SERVER], {
      stdio: ['pipe', log, log],
      windowsHide: true,
      env: {
        ...process.env,
        GEMMA2_ONNX_FILE: path.join(CTX_DIR, 'model_trt_ctx.onnx'),
        GEMMA2_ONNX_DIR: MODEL,
        GEMMA2_MODEL_ID: `embeddinggemma-2:fp32-trt-epcontext:${pinned.find((a) => a.path === 'model_trt_ctx.onnx').sha256}`,
        ORT_PROVIDER_MODE: 'tensorrt_rtx',
        ORT_FALLBACK_TO_CPU: '0',
        ORT_DISABLE_GRAPH_OPTIMIZATION: '1',
        ORT_WORKERS: '1',
        ORT_INTRA_THREADS: '2',
        ORT_TRT_CACHE_DIR: path.join(RUN, 'runtime-cache'),
        ORT_PROFILE_PREFIX: path.join(RUN, 'ort-profile'),
        GEMMA2_MAX_TOKENS: '512',
        GEMMA2_MAX_BATCH: String(Math.max(...BATCHES)),
      },
    });
    workerExit = new Promise((resolve) => worker.once('exit', (code) => resolve(code)));
    let health = null;
    while (performance.now() - started < 240_000) {
      if (worker.exitCode !== null) throw new Error(`WORKER_EXITED:${worker.exitCode} (see worker.log)`);
      try { health = await http(`${GPU}/health`, null, 2000); } catch { health = null; }
      if (health?.load_error) throw new Error(health.load_error);
      if (health?.status === 'ok') break;
      await sleep(500);
    }
    if (health?.status !== 'ok') throw new Error('WORKER_NOT_READY');
    if (JSON.stringify(health.providers).includes('CPUExecutionProvider') && health.providers[0] !== EP) throw new Error('WORKER_ON_CPU');
    receipt.worker = { startupMs: round(performance.now() - started), providers: health.providers, ortVersion: health.ort_version, engineVersion: health.trt_rtx_engine_version };
    console.log(`[eg2] worker ready in ${receipt.worker.startupMs} ms ${health.providers}`);
    observeVram();
    sampler = setInterval(observeVram, 2000);

    phase = 'calibration';
    receipt.calibration = [];
    const calibrationSet = chunks.slice(0, CALIBRATION).map((c) => c.text);
    for (const size of BATCHES) {
      try {
        await embed(GPU, calibrationSet.slice(0, size), 240_000);
        const t0 = performance.now();
        for (let i = 0; i < calibrationSet.length; i += size) await embed(GPU, calibrationSet.slice(i, i + size), 240_000);
        observeVram();
        const row = { batch: size, chunks: calibrationSet.length, chunksPerSecond: round(calibrationSet.length / ((performance.now() - t0) / 1000)) };
        receipt.calibration.push(row);
        console.log(`[eg2] calibration ${JSON.stringify(row)} freeMiB=${vram().freeMiB}`);
      } catch (error) {
        receipt.calibration.push({ batch: size, error: String(error.message).slice(0, 300) });
        console.log(`[eg2] calibration batch ${size} failed: ${error.message}`);
        break;
      }
    }
    const best = receipt.calibration.filter((r) => r.chunksPerSecond).sort((a, b) => b.chunksPerSecond - a.chunksPerSecond)[0];
    if (!best) throw new Error('NO_BATCH_SIZE_WORKED');
    receipt.chosenBatch = best.batch;

    phase = 'parity';
    // 16 inputs spread evenly across the length distribution, longest included.
    const byLength = [...chunks].sort((a, b) => a.text.length - b.text.length);
    const probes = Array.from({ length: 16 }, (_, i) => byLength[Math.round((i * (byLength.length - 1)) / 15)].text);
    const similarities = [];
    for (let i = 0; i < probes.length; i += best.batch) {
      const group = probes.slice(i, i + best.batch);
      const gpu = await embed(GPU, group, 240_000);
      const cpu = await embed(CPU, group, 600_000);
      gpu.vectors.forEach((v, k) => similarities.push(cosine(v, cpu.vectors[k])));
    }
    receipt.parity = {
      reference: 'CPU :8094 q8 (different artifact, not same-graph FP32)',
      inputs: probes.length, charRange: [probes[0].length, probes.at(-1).length],
      minCosine: Math.min(...similarities), meanCosine: similarities.reduce((a, b) => a + b, 0) / similarities.length,
      threshold: 0.999,
    };
    receipt.parity.pass = receipt.parity.minCosine >= 0.999;
    console.log(`[eg2] parity min=${receipt.parity.minCosine.toFixed(6)} mean=${receipt.parity.meanCosine.toFixed(6)}`);
    if (!receipt.parity.pass) throw new Error(`PARITY_BELOW_THRESHOLD:${receipt.parity.minCosine}`);

    phase = 'timed-run';
    const tracker = new Phase8ProgressTracker(`eg2-eta-${stamp}`);
    const latencies = [];
    let completed = 0, truncated = 0, busySamples = 0, slotSamples = 0, nextReport = 200;
    const t0 = performance.now();
    process.chdir(RUN); // the tracker writes cwd-relative .tmp/phase8/; keep it inside this run
    try {
      for (let i = 0; i < chunks.length && performance.now() - t0 < MAIN_CAP_MS; i += best.batch) {
        const group = chunks.slice(i, i + best.batch).map((c) => c.text);
        const sent = performance.now();
        const result = await embed(GPU, group, 240_000);
        latencies.push(performance.now() - sent);
        completed += group.length;
        truncated += result.truncated;
        if (completed >= nextReport || completed === chunks.length) {
          nextReport += 200;
          const busy = await slotsBusy();
          if (busy !== null) { slotSamples += 1; busySamples += busy ? 1 : 0; }
          const elapsed = (performance.now() - t0) / 1000;
          const rate = completed / elapsed;
          tracker.writeEvent({
            schema_version: 'atlas-progress-v1', run_id: tracker.runId, pipeline: 'phase8', step_id: 'eg2_timing',
            step_index: 1, step_count: 1, state: completed === chunks.length ? 'SUCCEEDED' : 'RUNNING',
            completed, total: chunks.length, percent: Math.round((completed / chunks.length) * 100),
            rate_per_second: round(rate), elapsed_seconds: round(elapsed),
            eta_seconds: Math.round((chunks.length - completed) / rate), last_artifact_id: null,
            heartbeat_at: new Date().toISOString(),
          });
          console.log(`[eg2] ${completed}/${chunks.length} ${rate.toFixed(2)}/s eta=${Math.round((chunks.length - completed) / rate)}s freeMiB=${vram().freeMiB}`);
        }
      }
    } finally {
      process.chdir(ROOT);
    }
    const seconds = (performance.now() - t0) / 1000;
    const rate = completed / seconds;
    latencies.sort((a, b) => a - b);
    const pct = (p) => round(latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))]);
    receipt.timedRun = {
      completed, complete: completed === chunks.length, seconds: round(seconds), chunksPerSecond: round(rate),
      requestMs: { p50: pct(0.5), p95: pct(0.95), max: pct(1) }, truncatedTo512Tokens: truncated,
      llamaBusySamples: `${busySamples}/${slotSamples}`,
    };
    receipt.projection = {
      corpusChunks: CORPUS, hours: round(CORPUS / rate / 3600),
      excludes: ['re-chunking', 'database writes', 'vector indexing', 'worker startup', 'retries'],
    };
    receipt.status = receipt.timedRun.complete ? 'PASS' : 'PARTIAL_TIME_CAP';
  } catch (error) {
    receipt.status = 'FAIL';
    receipt.phase = phase;
    receipt.error = String(error.message).slice(0, 1000);
    process.exitCode = 1;
  } finally {
    if (sampler) clearInterval(sampler);
    if (worker) {
      if (worker.exitCode === null) {
        try { worker.stdin.end('x'); } catch { /* already gone */ }
        const code = await Promise.race([workerExit, sleep(30_000).then(() => 'timeout')]);
        if (code === 'timeout') { worker.kill(); await Promise.race([workerExit, sleep(10_000)]); }
      }
      await sleep(3000);
      receipt.teardown = { workerExitCode: worker.exitCode, portReleased: !(await portOpen(18094)) };
      const profile = fs.readdirSync(RUN).find((f) => f.startsWith('ort-profile') && f.endsWith('.json'));
      if (profile) {
        try {
          const events = {};
          for (const event of JSON.parse(fs.readFileSync(path.join(RUN, profile), 'utf8'))) {
            const provider = event.cat === 'Node' ? event.args?.provider : null;
            if (provider) events[provider] = (events[provider] ?? 0) + 1;
          }
          receipt.providerEvents = events;
        } catch (error) {
          receipt.providerEventsError = String(error.message);
        }
      }
    }
    receipt.vram = { peakUsedMiB: peakUsedMiB || null, minFreeMiB: Number.isFinite(minFreeMiB) ? minFreeMiB : null, after: vram(), note: 'whole-GPU readings every 2 s, including :8090 and desktop' };
    receipt.slotsBusyAfter = await slotsBusy();
    receipt.finishedAt = new Date().toISOString();
    save();
    console.log(JSON.stringify(receipt, null, 2));
    console.log(`[eg2] receipt ${receiptPath}`);
  }
}

await main();
