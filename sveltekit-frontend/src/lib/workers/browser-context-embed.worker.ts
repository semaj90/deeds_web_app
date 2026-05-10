/**
 * browser-context-embed.worker.ts
 *
 * Web Worker that ranks browser-history hits + snippets locally using
 * Transformers.js feature-extraction. Runs on the operator's device — no
 * data leaves the browser until the orchestrator POSTs the sanitized
 * snapshot to /api/browser-context/snapshot.
 *
 * Does NOT generate text. Embedding only. Final reasoning still happens
 * on the SvelteKit server via Gemma4 / TurboQuant.
 *
 * Device preference: webgpu → wasm → degraded (no scoring, returns input).
 * Quantization: prefers q4 dtype where the model supports it.
 *
 * Wire-up:
 *   const w = new Worker(new URL('$lib/workers/browser-context-embed.worker.ts', import.meta.url),
 *                       { type: 'module' });
 *   w.postMessage({ kind: 'rank', query: 'redis offline', candidates: [...] });
 *   w.onmessage = (e) => { … e.data.scored … };
 */

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

type RankRequest = {
  kind: 'rank';
  /** Free-text question / current Copilot query. */
  query: string;
  /** Each candidate has an `id` (caller-controlled) + `text` to embed. */
  candidates: Array<{ id: string; text: string }>;
  /** Optional model override; default stays small for first-paint latency. */
  model?: string;
};

type RankResponse = {
  kind: 'rank-result';
  scored: Array<{ id: string; score: number }>;
  device: 'webgpu' | 'wasm' | 'cpu' | 'unavailable';
  model:  string | null;
  durationMs: number;
};

type ProbeRequest = { kind: 'probe' };
type ProbeResponse = {
  kind: 'probe-result';
  webgpu: boolean;
  transformersAvailable: boolean;
};

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
let extractor: unknown = null;
let extractorModel: string | null = null;
let extractorDevice: RankResponse['device'] = 'unavailable';

async function detectWebGpu(): Promise<boolean> {
  try {
    // @ts-expect-error — navigator.gpu exists on WebGPU-capable browsers.
    const gpu = (self.navigator as Navigator & { gpu?: unknown }).gpu;
    if (!gpu) return false;
    // @ts-expect-error — requestAdapter is the standard WebGPU API.
    const adapter = await gpu.requestAdapter?.();
    return !!adapter;
  } catch {
    return false;
  }
}

async function getExtractor(model: string) {
  if (extractor && extractorModel === model) return extractor;
  // Dynamic import so worker spin-up doesn't block on Transformers.js
  // package resolution if it's not installed.
  let pipeline: unknown;
  try {
    const t = await import('@huggingface/transformers' as string);
    pipeline = (t as { pipeline?: unknown }).pipeline;
  } catch {
    extractorDevice = 'unavailable';
    extractor = null;
    extractorModel = null;
    return null;
  }
  if (typeof pipeline !== 'function') {
    extractorDevice = 'unavailable';
    return null;
  }

  const wantWebgpu = await detectWebGpu();
  const tries: Array<{ device: RankResponse['device']; opts: Record<string, unknown> }> = [];
  if (wantWebgpu) tries.push({ device: 'webgpu', opts: { device: 'webgpu', dtype: 'q4' } });
  tries.push({ device: 'wasm', opts: { device: 'wasm' } });
  tries.push({ device: 'cpu',  opts: {} });

  for (const t of tries) {
    try {
      // @ts-expect-error — pipeline is `(task, model, opts) => Promise<Pipeline>`.
      const p = await pipeline('feature-extraction', model, t.opts);
      extractor = p;
      extractorModel = model;
      extractorDevice = t.device;
      return p;
    } catch {
      continue;
    }
  }
  extractorDevice = 'unavailable';
  return null;
}

function cosine(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i], y = b[i];
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embed(extractor: unknown, text: string): Promise<Float32Array | null> {
  try {
    // @ts-expect-error — pipeline call shape.
    const out = await extractor(text, { pooling: 'mean', normalize: true });
    // out.data is a Float32Array; out can be a Tensor wrapper.
    const data = (out as { data?: Float32Array }).data;
    if (data instanceof Float32Array) return data;
    return null;
  } catch {
    return null;
  }
}

async function handleRank(msg: RankRequest): Promise<RankResponse> {
  const t0 = Date.now();
  const model = msg.model ?? DEFAULT_MODEL;
  const ext = await getExtractor(model);
  if (!ext) {
    // Degraded: return candidates with zero scores so the caller still
    // gets back an array of {id, score}.
    return {
      kind: 'rank-result',
      scored: msg.candidates.map(c => ({ id: c.id, score: 0 })),
      device: 'unavailable',
      model:  null,
      durationMs: Date.now() - t0,
    };
  }
  const queryVec = await embed(ext, msg.query);
  if (!queryVec) {
    return {
      kind: 'rank-result',
      scored: msg.candidates.map(c => ({ id: c.id, score: 0 })),
      device: extractorDevice,
      model:  extractorModel,
      durationMs: Date.now() - t0,
    };
  }
  const scored: Array<{ id: string; score: number }> = [];
  for (const c of msg.candidates) {
    const v = await embed(ext, c.text);
    scored.push({ id: c.id, score: v ? Math.max(0, Math.min(1, (cosine(queryVec, v) + 1) / 2)) : 0 });
  }
  scored.sort((a, b) => b.score - a.score);
  return {
    kind: 'rank-result',
    scored,
    device: extractorDevice,
    model:  extractorModel,
    durationMs: Date.now() - t0,
  };
}

async function handleProbe(): Promise<ProbeResponse> {
  let transformersAvailable = false;
  try {
    await import('@huggingface/transformers' as string);
    transformersAvailable = true;
  } catch { /* swallow */ }
  return {
    kind: 'probe-result',
    webgpu: await detectWebGpu(),
    transformersAvailable,
  };
}

self.onmessage = async (ev: MessageEvent<RankRequest | ProbeRequest>) => {
  const data = ev.data;
  if (!data || typeof (data as { kind?: unknown }).kind !== 'string') return;
  if (data.kind === 'rank')  return self.postMessage(await handleRank(data));
  if (data.kind === 'probe') return self.postMessage(await handleProbe());
};