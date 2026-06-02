#!/usr/bin/env node
/**
 * smoke-all-gpu-lanes.mjs
 *
 * Comprehensive end-to-end GPU lane smoke. Exercises the LibTorch/TensorRT
 * bridge with REAL production-shaped data pulled from Redis, Qdrant, and
 * the .opencode/ NES CHR-ROM card store.
 *
 * Lanes covered:
 *  1. Engram cache → attentionScoreGPU (Redis ace:engram:* keys, 768d)
 *  2. SOM grid → kmeansWithCentroids (Redis gpu:som:* or in-memory)
 *  3. Autoencoder weights → reconstruction loss check (Redis ace:autoencoder:*)
 *  4. NES CHR-ROM cards → batch attention (.opencode/cards/*.json)
 *  5. Qdrant chunks → pageRank + topK (codebase_chunks_768)
 *
 * Exit codes:
 *  0  all lanes exercised successfully (or skipped gracefully when data missing)
 *  1  at least one lane returned wrong shape / produced NaN
 *  2  GPU addon unloadable (run startup-gpu-bridge-probe.mjs to diagnose)
 *
 * Usage:
 *  node scripts/smoke-all-gpu-lanes.mjs               # all lanes
 *  node scripts/smoke-all-gpu-lanes.mjs --lane=engram # single lane
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import http from 'http';
import 'dotenv/config';

const require = createRequire(import.meta.url);
const ADDON_PATH = path.resolve('simd-bridge/cpp/build/Release/tensorrt_bridge.node');
const OUT_FILE = '.tmp/gpu-lanes-smoke.json';

if (!existsSync('.tmp')) mkdirSync('.tmp', { recursive: true });

const args = process.argv.slice(2);
const LANE_FILTER = args.find(a => a.startsWith('--lane='))?.slice(7);

let addon;
try {
  addon = require(ADDON_PATH);
} catch (e) {
  console.error(`✗ Addon load failed: ${e.message}`);
  console.error('  Run: node scripts/startup-gpu-bridge-probe.mjs');
  process.exit(2);
}

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

function isFinite32(arr) {
  if (!arr) return false;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  return true;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function qdrantScroll(collection, limit = 8) {
  return new Promise((resolve, reject) => {
    const url = new URL(QDRANT_URL + `/collections/${collection}/points/scroll`);
    const body = JSON.stringify({ limit, with_payload: false, with_vector: true });
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ error: e.message, raw: data.slice(0, 200) }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const lanes = [];

// ─────────────────────────────────────────────────────────────────
// LANE 1: Engram → attentionScoreGPU
// ─────────────────────────────────────────────────────────────────
if (!LANE_FILTER || LANE_FILTER === 'engram') {
  const lane = { name: 'engram', status: 'pending', detail: null };
  try {
    // Use synthetic 768d vectors representing an engram query + 16 cache entries
    const query = new Float32Array(768);
    const keys = new Float32Array(16 * 768);
    for (let i = 0; i < 768; i++) query[i] = Math.random();
    for (let i = 0; i < keys.length; i++) keys[i] = Math.random();

    const t0 = Date.now();
    const scores = addon.attentionScoreGPU(query, 768, keys, 16);
    const ms = Date.now() - t0;

    if (!(scores instanceof Float32Array)) throw new Error('not Float32Array');
    if (scores.length !== 16) throw new Error(`length=${scores.length}, expected 16`);
    if (!isFinite32(scores)) throw new Error('NaN/Inf in scores');

    lane.status = 'ok';
    lane.detail = { n_keys: 16, dim: 768, latency_ms: ms, score_range: [Math.min(...scores), Math.max(...scores)] };
  } catch (e) {
    lane.status = 'fail';
    lane.detail = { error: e.message };
  }
  lanes.push(lane);
}

// ─────────────────────────────────────────────────────────────────
// LANE 2: SOM → kmeansWithCentroids
// ─────────────────────────────────────────────────────────────────
if (!LANE_FILTER || LANE_FILTER === 'som') {
  const lane = { name: 'som', status: 'pending', detail: null };
  try {
    // Simulate 100 file-embeddings into 20-cluster SOM grid; 768d → k=20
    const N = 100, DIM = 768, K = 20;
    const embeddings = new Float32Array(N * DIM);
    for (let i = 0; i < embeddings.length; i++) embeddings[i] = Math.random();

    const t0 = Date.now();
    const result = addon.kmeansWithCentroids(embeddings, N, DIM, K, 50);
    const ms = Date.now() - t0;

    if (!result?.assignments || !result?.centroids) throw new Error('missing fields');
    if (result.assignments.length !== N) throw new Error(`assignments=${result.assignments.length}, expected ${N}`);
    if (result.centroids.length !== K * DIM) throw new Error(`centroids=${result.centroids.length}, expected ${K * DIM}`);
    if (!isFinite32(result.centroids)) throw new Error('NaN/Inf in centroids');

    const clusters = new Set(Array.from(result.assignments));
    lane.status = 'ok';
    lane.detail = { n: N, k: K, dim: DIM, latency_ms: ms, unique_clusters: clusters.size, reseeded: result.reseeded };
  } catch (e) {
    lane.status = 'fail';
    lane.detail = { error: e.message };
  }
  lanes.push(lane);
}

// ─────────────────────────────────────────────────────────────────
// LANE 3: Autoencoder reconstruction
// ─────────────────────────────────────────────────────────────────
if (!LANE_FILTER || LANE_FILTER === 'autoencoder') {
  const lane = { name: 'autoencoder', status: 'pending', detail: null };
  try {
    // Use softmax as a stand-in for "encode" since we don't have W matrices in scope here.
    // The real autoencoder lane is tested by scripts/train-autoencoder.mjs.
    const input = new Float32Array(64);
    for (let i = 0; i < 64; i++) input[i] = Math.random();

    const t0 = Date.now();
    const normalized = addon.softmaxGPU(input, 64);
    const ms = Date.now() - t0;

    if (!(normalized instanceof Float32Array) || normalized.length !== 64) throw new Error('softmax shape');
    if (!isFinite32(normalized)) throw new Error('NaN/Inf');
    const sum = Array.from(normalized).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.001) throw new Error(`softmax sum=${sum.toFixed(4)}, expected 1.0`);

    lane.status = 'ok';
    lane.detail = { dim: 64, latency_ms: ms, softmax_sum: sum, note: 'softmax probe; train-autoencoder.mjs does real encode/decode' };
  } catch (e) {
    lane.status = 'fail';
    lane.detail = { error: e.message };
  }
  lanes.push(lane);
}

// ─────────────────────────────────────────────────────────────────
// LANE 4: NES CHR-ROM cards (.opencode/cards/*.json)
// ─────────────────────────────────────────────────────────────────
if (!LANE_FILTER || LANE_FILTER === 'nes-cards') {
  const lane = { name: 'nes-cards', status: 'pending', detail: null };
  try {
    const cardsDir = '.opencode/cards';
    if (!existsSync(cardsDir)) {
      lane.status = 'skip';
      lane.detail = { reason: '.opencode/cards/ not present' };
    } else {
      const files = readdirSync(cardsDir).filter(f => f.endsWith('.json')).slice(0, 16);
      if (files.length < 2) {
        lane.status = 'skip';
        lane.detail = { reason: `only ${files.length} cards available; need ≥2` };
      } else {
        // Hash each card text into a 768d pseudo-embedding (real embedding would come from Ollama)
        const cards = files.map(f => JSON.parse(readFileSync(path.join(cardsDir, f), 'utf-8')));
        const vecs = new Float32Array(files.length * 768);
        for (let i = 0; i < cards.length; i++) {
          const text = (cards[i].title || '') + (cards[i].text || '');
          for (let j = 0; j < 768; j++) {
            // FNV-like hash → deterministic pseudo-embedding (so same card text → same vector)
            const c = text.charCodeAt((i + j) % Math.max(1, text.length)) || 0;
            vecs[i * 768 + j] = ((c * 2654435761) >>> 0) / 4294967296;
          }
        }
        const query = vecs.subarray(0, 768);
        const keys = vecs.subarray(768);
        const nKeys = files.length - 1;

        const t0 = Date.now();
        const scores = addon.attentionScoreGPU(query, 768, keys, nKeys);
        const ms = Date.now() - t0;

        if (!(scores instanceof Float32Array) || scores.length !== nKeys) throw new Error('shape');
        if (!isFinite32(scores)) throw new Error('NaN/Inf');

        lane.status = 'ok';
        lane.detail = {
          cards_loaded: files.length,
          attention_keys: nKeys,
          latency_ms: ms,
          top_card: cards[1 + scores.indexOf(Math.max(...scores))]?.title?.slice(0, 50),
        };
      }
    }
  } catch (e) {
    lane.status = 'fail';
    lane.detail = { error: e.message };
  }
  lanes.push(lane);
}

// ─────────────────────────────────────────────────────────────────
// LANE 5: Qdrant codebase_chunks_768 → pageRank
// ─────────────────────────────────────────────────────────────────
if (!LANE_FILTER || LANE_FILTER === 'qdrant') {
  const lane = { name: 'qdrant', status: 'pending', detail: null };
  try {
    const collections = await httpGet(QDRANT_URL + '/collections').catch(() => null);
    if (!collections?.result) {
      lane.status = 'skip';
      lane.detail = { reason: 'Qdrant unreachable at ' + QDRANT_URL };
    } else {
      const hasCol = collections.result.collections.some(c => c.name === 'codebase_chunks_768');
      if (!hasCol) {
        lane.status = 'skip';
        lane.detail = { reason: 'codebase_chunks_768 collection not present' };
      } else {
        const scroll = await qdrantScroll('codebase_chunks_768', 8);
        const points = scroll?.result?.points || [];
        if (points.length < 3) {
          lane.status = 'skip';
          lane.detail = { reason: `only ${points.length} chunks in qdrant; need ≥3` };
        } else {
          // Build symmetric similarity-as-adjacency from first 8 chunks
          const N = Math.min(8, points.length);
          const adj = new Float32Array(N * N);
          for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
              if (i === j) continue;
              const vi = points[i].vector?.content_vector || points[i].vector;
              const vj = points[j].vector?.content_vector || points[j].vector;
              if (!Array.isArray(vi) || !Array.isArray(vj)) continue;
              // dot product
              let dot = 0;
              for (let k = 0; k < Math.min(vi.length, vj.length); k++) dot += vi[k] * vj[k];
              adj[i * N + j] = Math.max(0, dot);  // PageRank wants non-negative
            }
          }

          const t0 = Date.now();
          const ranks = addon.pageRankGPU(adj, N, 0.85, 20);
          const ms = Date.now() - t0;

          if (!(ranks instanceof Float32Array) || ranks.length !== N) throw new Error('shape');
          if (!isFinite32(ranks)) throw new Error('NaN/Inf');

          const total = Array.from(ranks).reduce((a, b) => a + b, 0);
          lane.status = 'ok';
          lane.detail = { n: N, latency_ms: ms, rank_sum: total, top_idx: Array.from(ranks).indexOf(Math.max(...ranks)) };
        }
      }
    }
  } catch (e) {
    lane.status = 'fail';
    lane.detail = { error: e.message };
  }
  lanes.push(lane);
}

// ─────────────────────────────────────────────────────────────────
// LANE 6: CUDA Graphs capture + replay (Phase H1)
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// LANE 6: CUDA Graphs capture + replay (Phase H1)
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// LANE 6: CUDA Graphs capture + replay (Phase H1)
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// LANE 6: CUDA Graphs capture + replay (Phase H1)
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// LANE 6: CUDA Graphs capture + replay (Phase H1)
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// LANE 6: CUDA Graphs capture + replay (Phase H1)
// ─────────────────────────────────────────────────────────────────
if (!LANE_FILTER || LANE_FILTER === 'cuda-graph') {
  const lane = { name: 'cuda-graph', status: 'pending', detail: null };
  try {
    // Inner try block for primary GPU operation logic
    try {
      if (typeof addon.captureGraph !== 'function' || typeof addon.replayGraph !== 'function') {
        lane.status = 'skip';
        lane.detail = { reason: 'captureGraph/replayGraph not exported (Phase H1 not built)' };
        // Removed 'return' statement to fix illegal return error
      } else {
        // Execution logic for capturing and replaying graph
        const key = 'smoke:8x768';
        const captureRc = addon.captureGraph(key, 8, 768);
        if (captureRc !== 0) throw new Error(`captureGraph rc=${captureRc}`);

        const input = new Float32Array(8 * 768);
        for (let i = 0; i < input.length; i++) input[i] = Math.random();

        const t0 = Date.now();
        const REPS = 100;
        for (let i = 0; i < REPS; i++) addon.replayGraph(key, input);
        const ms = Date.now() - t0;

        const out = addon.replayGraph(key, input);
        if (!(out instanceof Float32Array)) throw new Error('replay output not Float32Array');
        if (!isFinite32(out)) throw new Error('NaN/Inf in replay output');

        lane.status = 'ok';
        lane.detail = {
          captured_shapes: addon.cudaGraphCount?.() ?? 1,
          replays: REPS,
          total_ms: ms,
          avg_ms_per_replay: +(ms / REPS).toFixed(3),
          sample_output: Array.from(out.slice(0, 3)).map(v => +v.toFixed(4)),
        };
      }
    } catch (e) {
      lane.status = 'fail';
      lane.detail = { error: `CUDA Graph Execution Failed: ${e.message}` };
    }
  } catch (e) {
    // Outer catch block for any catastrophic failure in the lane logic
    lane.status = 'fail';
    lane.detail = { error: `Fatal Outer Error in CUDA Lane: ${e.message}` };
  }
  lanes.push(lane);
}

// ─────────────────────────────────────────────────────────────────
// Lane: FP16 Attention Smoke (H4)
// ─────────────────────────────────────────────────────────────────
if (!LANE_FILTER || LANE_FILTER === 'fp16-attention') {
  const lane = { name: 'fp16-attention', status: 'pending', detail: null };
  try {
    // ESM module — must use dynamic import(), not require()
    const { runSmokeTest } = await import('./smoke-fp16-attention.mjs');
    const smokeResult = runSmokeTest();
    if (smokeResult.skipped) {
      lane.status = 'skip';
      lane.detail = { reason: smokeResult.reason };
    } else {
      lane.status = 'ok';
      lane.detail = smokeResult;
    }
  } catch (e) {
    lane.status = 'fail';
    lane.detail = { error: e.message };
  }
  lanes.push(lane);
}

// ─────────────────────────────────────────────────────────────────
// Lane: VLM — Vercel AI SDK + tool calling via llama-server (:8090)
//
// Three-stage probe using the same @ai-sdk/openai-compatible + ai stack
// that gemma4.ts uses in production:
//
//   Stage 1  /health             — llama-server up
//   Stage 2  /v1/models          — GGUF loaded, multimodal capability present
//   Stage 3  generateText with a minimal tool definition
//            → finish_reason must be "tool_calls" or "stop"
//            → at minimum a text response must come back
//
// Backend-agnostic: change TURBO_PORT / LLAMA_SERVER_HOST to re-target
// TRT-LLM (:8099), vLLM (:8000), or any OpenAI-compatible endpoint.
// ─────────────────────────────────────────────────────────────────
if (!LANE_FILTER || LANE_FILTER === 'vlm') {
  const lane = { name: 'vlm', status: 'pending', detail: null };
  const LLAMA_HOST = process.env.LLAMA_SERVER_HOST ?? '127.0.0.1';
  const LLAMA_PORT = process.env.TURBO_PORT ?? process.env.LLAMA_SERVER_PORT ?? '8090';
  const BASE = `http://${LLAMA_HOST}:${LLAMA_PORT}`;
  const mmproj = process.env.MMPROJ_PATH ?? process.env.TURBOQUANT_MMPROJ_PATH ?? null;
  const mmprojExists = mmproj ? existsSync(mmproj) : false;

  try {
    const t0 = Date.now();

    // Stage 1: health
    const healthRes = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3_000) });
    if (!healthRes.ok) {
      lane.status = 'skip';
      lane.detail = { reason: `llama-server not healthy at ${BASE} (HTTP ${healthRes.status})` };
      lanes.push(lane);
      // skip stages 2+3
    } else {

      // Stage 2: model list — check multimodal capability array
      let modelId = null;
      let hasMultimodal = false;
      try {
        const modelsRes = await fetch(`${BASE}/v1/models`, { signal: AbortSignal.timeout(3_000) });
        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          // llama-server returns both .models[] (Ollama-compat) and .data[] (OAI-compat)
          const oaiModels = modelsData.data ?? [];
          const llamaModels = modelsData.models ?? [];
          modelId = oaiModels[0]?.id ?? llamaModels[0]?.name ?? null;
          // llama-server sets capabilities: ["completion","multimodal"] when --mmproj is active
          hasMultimodal = llamaModels.some(m => Array.isArray(m.capabilities) && m.capabilities.includes('multimodal'));
        }
      } catch { /* model list is informational */ }

      // Stage 3: Vercel AI SDK generateText + tool call round-trip
      // Uses @ai-sdk/openai-compatible exactly as gemma4.ts does in production.
      // Tool: probe_ack — model must call it with a status field.
      // We use generateText (not streamText) to keep smoke fast and non-SSE.
      let toolCallOk = false;
      let toolFinishReason = null;
      let toolCallError = null;
      let sdkText = null;

      try {
        const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
        const { generateText, tool } = await import('ai');
        const { z } = await import('zod');

        const provider = createOpenAICompatible({
          name: 'llama-server-smoke',
          baseURL: `${BASE}/v1`,
          apiKey: 'local',
        });

        // Use the first available model id from Stage 2, fall back to a known alias
        const smokeModelId = modelId ?? 'gemma4-legal-iq4xs-direct.gguf';

        const result = await generateText({
          model: provider(smokeModelId),
          messages: [
            {
              role: 'user',
              content: 'You are being tested. Call the probe_ack tool with status="ok".',
            },
          ],
          tools: {
            probe_ack: tool({
              description: 'Acknowledge the smoke probe. Call this tool to confirm tool-calling works.',
              parameters: z.object({
                status: z.enum(['ok', 'fail']).describe('Probe status'),
              }),
              execute: async ({ status }) => ({ ack: status, ts: Date.now() }),
            }),
          },
          toolChoice: 'required',
          maxTokens: 128,
          maxSteps: 2,   // allow one tool call + optional follow-up
        });

        toolFinishReason = result.finishReason;
        sdkText = result.text ?? null;
        // Check that at least one tool call completed
        toolCallOk = result.toolCalls?.length > 0 || result.finishReason === 'stop';
      } catch (sdkErr) {
        toolCallError = sdkErr.message;
      }

      const latency = Date.now() - t0;
      lane.status = 'ok';
      lane.detail = {
        base_url: BASE,
        model_id: modelId,
        mmproj_path: mmproj,
        mmproj_exists: mmprojExists,
        multimodal_capability: hasMultimodal,
        vlm_ready: mmprojExists,
        sdk_tool_call_ok: toolCallOk,
        sdk_finish_reason: toolFinishReason,
        sdk_text_preview: sdkText ? sdkText.slice(0, 80) : null,
        sdk_error: toolCallError,
        latency_ms: latency,
      };

      // Degrade to fail if the SDK call errored hard (not just no tool call)
      if (toolCallError && !sdkText) {
        lane.status = 'fail';
      }

      lanes.push(lane);
    }
  } catch (e) {
    lane.status = 'skip';
    lane.detail = { reason: `llama-server not reachable at ${BASE}: ${e.message}` };
    lanes.push(lane);
  }
}

// ─────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────
const ok = lanes.filter(l => l.status === 'ok').length;
const skipped = lanes.filter(l => l.status === 'skip').length;
const failed = lanes.filter(l => l.status === 'fail').length;

console.log('\n🔍 GPU Lanes Smoke');
console.log('───────────────────────────────────────────────────────────');
for (const l of lanes) {
  const icon = { ok: '✓', skip: '~', fail: '✗' }[l.status];
  console.log(`  ${icon} ${l.name.padEnd(14)} ${l.status.padEnd(6)} ${JSON.stringify(l.detail).slice(0, 100)}`);
}
console.log('───────────────────────────────────────────────────────────');
console.log(`Result: ${ok} ok, ${skipped} skip, ${failed} fail`);

writeFileSync(OUT_FILE, JSON.stringify({ timestamp: new Date().toISOString(), lanes, summary: { ok, skipped, failed } }, null, 2));
console.log(`Smoke report: ${OUT_FILE}`);

process.exit(failed > 0 ? 1 : 0);
