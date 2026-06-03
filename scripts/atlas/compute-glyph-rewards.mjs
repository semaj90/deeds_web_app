#!/usr/bin/env node
/**
 * compute-glyph-rewards.mjs
 *
 * Phase 2 (Glyphs As Training Data) — compute GRPO reward scores for each
 * glyph in postgres.glyph_records using GPU cosine similarity.
 *
 * Pipeline:
 *   1. Load all glyphs from postgres.glyph_records
 *   2. For each glyph with `record_json.embedding` (768-dim):
 *      - Compute reward signal = blend(
 *          0.4 × intra_cluster_similarity   (cohesion with same som_cluster)
 *          0.3 × inter_cluster_distance     (separation from other clusters)
 *          0.2 × outcome_attribution        (matched outcome ledger reward)
 *          0.1 × topology_locality          (DAG neighbor agreement)
 *        )
 *   3. UPDATE glyph_records SET grpo_reward_score = ?
 *   4. Write report to memory/exports/glyph-rewards-report.json
 *
 * GPU acceleration via tensorrt_bridge.node (batchCosineSimilarity).
 * Falls back to JS Math if addon unreachable.
 *
 * Usage:
 *   node scripts/atlas/compute-glyph-rewards.mjs --dry-run
 *   node scripts/atlas/compute-glyph-rewards.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';

const require = createRequire(import.meta.url);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY        = argv.includes('--apply');
const VERBOSE      = argv.includes('--verbose');
const EMBED        = argv.includes('--embed');        // pre-pass: embed summaries → record_json.embedding
const FORCE_EMBED  = argv.includes('--force-embed');  // re-embed ALL glyphs, overwriting existing
const REPORT_PATH = path.join(ROOT, 'memory', 'exports', 'glyph-rewards-report.json');

const ONNX_MODEL_DIR = path.join(ROOT, 'sveltekit-frontend', 'static', 'embeddinggemma_300m_onnx');
const ONNX_MODEL_PATH = path.join(ONNX_MODEL_DIR, 'model.onnx');

// ─── ONNX embed (inline, mirrors onnx-embed.ts logic) ────────────────
const SK_ROOT = path.join(ROOT, 'sveltekit-frontend');

let _ort = null;
let _onnxSession = null;
let _tokenizer = null;

async function loadOnnxEmbed() {
  if (!fs.existsSync(ONNX_MODEL_PATH)) return false;
  try {
    // Resolve onnxruntime-node and @huggingface/transformers from sveltekit-frontend node_modules
    const ortPath = pathToFileURL(path.join(SK_ROOT, 'node_modules', 'onnxruntime-node', 'dist', 'index.js')).href;
    const hfPath  = pathToFileURL(path.join(SK_ROOT, 'node_modules', '@huggingface', 'transformers', 'dist', 'transformers.node.cjs')).href;
    _ort = await import(ortPath);
    const { AutoTokenizer } = await import(hfPath);
    _tokenizer = await AutoTokenizer.from_pretrained(ONNX_MODEL_DIR, { local_files_only: true });
    _onnxSession = await _ort.InferenceSession.create(ONNX_MODEL_PATH, {
      executionProviders: ['dml', 'cpu'],  // DirectML = DX12 GPU acceleration on Windows (RTX 3060 Ti)
    });
    return true;
  } catch (e) {
    console.warn('  ⚠ ONNX embed unavailable:', e.message);
    return false;
  }
}

function l2Norm(arr) {
  let sum = 0;
  for (const v of arr) sum += v * v;
  const mag = Math.sqrt(sum);
  return mag > 0 ? arr.map((v) => v / mag) : arr;
}

async function embedOnnxBatch(texts) {
  if (!_onnxSession || !_tokenizer) return null;
  const results = [];
  for (const text of texts) {
    try {
      const enc = await _tokenizer(text.slice(0, 512), { return_tensors: 'pt', padding: true, truncation: true, max_length: 128 });
      const inputIds = new _ort.Tensor('int64', BigInt64Array.from(Array.from(enc.input_ids.data).map(BigInt)), enc.input_ids.dims);
      const attMask  = new _ort.Tensor('int64', BigInt64Array.from(Array.from(enc.attention_mask.data).map(BigInt)), enc.attention_mask.dims);
      const feeds = { input_ids: inputIds, attention_mask: attMask };
      if (_onnxSession.inputNames.includes('token_type_ids')) {
        feeds.token_type_ids = new _ort.Tensor('int64', new BigInt64Array(inputIds.data.length), inputIds.dims);
      }
      const out = await _onnxSession.run(feeds);
      const hiddenKey = _onnxSession.outputNames.includes('last_hidden_state') ? 'last_hidden_state' : _onnxSession.outputNames[0];
      const hidden = out[hiddenKey].data;
      const [, seqLen, hidDim] = out[hiddenKey].dims;
      const mask = Array.from(enc.attention_mask.data);
      const pooled = new Float32Array(hidDim);
      let count = 0;
      for (let t = 0; t < seqLen; t++) {
        if (!mask[t]) continue;
        count++;
        for (let d = 0; d < hidDim; d++) pooled[d] += hidden[t * hidDim + d];
      }
      if (count > 0) for (let d = 0; d < hidDim; d++) pooled[d] /= count;
      results.push(l2Norm(Array.from(pooled)));
    } catch (e) {
      console.warn('  ⚠ ONNX embed error for text:', e.message);
      results.push(null);
    }
  }
  return results;
}

// ─── Env loader ────────────────────────────────────────────────────────

function loadEnv() {
  const e = { ...process.env };
  const p = path.join(ROOT, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !e[m[1]]) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return e;
}
const env = loadEnv();
const PG_URL = env.DATABASE_URL || 'postgres://legal_admin:postgres@localhost:5432/legal_ai_db';

// ─── GPU addon (best-effort) ──────────────────────────────────────────

function loadAddon() {
  try {
    return require(path.join(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'));
  } catch {
    return null;
  }
}

// CPU scalar fallback (used only when addon unavailable)
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// GPU batch cosine via addon (cuBLAS GEMM + pinned memory).
// Returns Float32Array of length n, or null if addon unavailable.
function gpuBatchCosine(addon, query, corpus2d) {
  if (!addon || corpus2d.length === 0) return null;
  const dim = query.length;
  const n = corpus2d.length;
  const q32 = Float32Array.from(query);
  const c32 = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) c32.set(corpus2d[i], i * dim);
  const out = new Float32Array(n);
  const rc = addon.batchCosineSimilarity(q32, dim, c32, n, out, n);
  return rc === 0 ? out : null;
}

// ─── Embed via /api/embed (Redis L1) with ONNX fallback ──────────────
// Tries the SvelteKit dev server first (Redis L1 cache → Ollama/ONNX chain).
// Falls back to inline ONNX when server is not running.
const DEV_SERVER = (process.env.VITE_SERVER_URL ?? 'http://localhost:5173').replace(/\/$/, '');

async function embedViaServer(texts) {
  try {
    const res = await fetch(`${DEV_SERVER}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': 'atlas-script' },
      body: JSON.stringify({ texts, model: 'embeddinggemma:latest' }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    // Use simdjson via addon if available (AVX-512 on this machine)
    const raw = await res.text();
    let data;
    try {
      const addon = loadAddon();
      data = addon?.simdJsonParse ? addon.simdJsonParse(raw) : JSON.parse(raw);
    } catch { data = JSON.parse(raw); }
    const vecs = data?.embeddings ?? data?.data?.map((d) => d.embedding);
    return Array.isArray(vecs) && vecs.length === texts.length ? vecs : null;
  } catch {
    return null;  // server not running — fall through to ONNX
  }
}

// ─── Reward computation (fully GPU-accelerated) ───────────────────────

function computeHeuristicReward(g) {
  let r = 0.5;
  const tagLen = Array.isArray(g.tags) ? g.tags.length : 0;
  const entLen = Array.isArray(g.record_json?.entities) ? g.record_json.entities.length : 0;
  const neighborLen = Array.isArray(g.record_json?.kag_neighbors) ? g.record_json.kag_neighbors.length : 0;
  const hasPrev = Array.isArray(g.dag_prev) && g.dag_prev.length > 0;
  const hasNext = Array.isArray(g.dag_next) && g.dag_next.length > 0;
  r += Math.min(0.15, tagLen * 0.03);
  r += Math.min(0.10, entLen * 0.02);
  r += Math.min(0.10, neighborLen * 0.02);
  if (hasPrev && hasNext) r += 0.05;
  else if (hasPrev || hasNext) r += 0.02;
  if (g.section && g.section !== 'UNKNOWN') r += 0.05;
  return { reward: Math.max(0, Math.min(1, r)), breakdown: { intra: 0, inter: 0, outcome: 0, topoAgree: 0, heuristic: r } };
}

// Pre-compute ALL rewards in one vectorised pass using cuBLAS batchCosineSimilarity.
// Returns Map<id, {reward, breakdown}>.
// CUDA graph key is stable per corpus shape so repeated runs replay the cached graph.
function computeAllRewardsGPU(glyphs, withEmb, addon) {
  const dim = 768;
  const results = new Map();

  // Build flat corpus of all embeddings with their glyph index
  const embGlyphs = withEmb.filter((g) => Array.isArray(g.record_json?.embedding) && g.record_json.embedding.length === dim);
  if (embGlyphs.length === 0) {
    for (const g of glyphs) results.set(g.id, computeHeuristicReward(g));
    return results;
  }

  // CUDA graph: capture once for this corpus shape, replay on every glyph
  const graphKey = `reward_${embGlyphs.length}_${dim}`;
  if (addon) {
    const capRc = addon.captureGraph(graphKey, embGlyphs.length, dim);
    if (VERBOSE) console.log(`    CUDA graph capture '${graphKey}': rc=${capRc}, total graphs=${addon.cudaGraphCount()}`);
  }

  // Build flat corpus Float32Array (sent to GPU once per glyph query via cuBLAS)
  const corpusEmbs = embGlyphs.map((g) => g.record_json.embedding);

  for (const g of glyphs) {
    const emb = g.record_json?.embedding;
    if (!Array.isArray(emb) || emb.length !== dim) {
      results.set(g.id, computeHeuristicReward(g));
      continue;
    }

    // ── Intra-cluster cohesion (cuBLAS GEMM) ─────────────────────────
    const sameIdx = embGlyphs.map((o, i) => o.id !== g.id && o.som_cluster === g.som_cluster ? i : -1).filter((i) => i >= 0);
    let intra = 0;
    if (sameIdx.length > 0 && addon) {
      const sameCorpus = sameIdx.map((i) => corpusEmbs[i]);
      const sims = gpuBatchCosine(addon, emb, sameCorpus);
      if (sims) { let s = 0; for (const v of sims) s += v; intra = s / sims.length; }
      else { for (const i of sameIdx) intra += cosineSim(emb, corpusEmbs[i]); intra /= sameIdx.length; }
    } else if (sameIdx.length > 0) {
      for (const i of sameIdx) intra += cosineSim(emb, corpusEmbs[i]);
      intra /= sameIdx.length;
    }

    // ── Inter-cluster separation (cuBLAS GEMM, sampled 50) ────────────
    const otherIdx = embGlyphs.map((o, i) => o.id !== g.id && o.som_cluster !== g.som_cluster ? i : -1).filter((i) => i >= 0).slice(0, 50);
    let inter = 0;
    if (otherIdx.length > 0 && addon) {
      const otherCorpus = otherIdx.map((i) => corpusEmbs[i]);
      const sims = gpuBatchCosine(addon, emb, otherCorpus);
      if (sims) { let s = 0; for (const v of sims) s += v; inter = 1 - s / sims.length; }
      else { for (const i of otherIdx) inter += cosineSim(emb, corpusEmbs[i]); inter = 1 - inter / otherIdx.length; }
    } else if (otherIdx.length > 0) {
      for (const i of otherIdx) inter += cosineSim(emb, corpusEmbs[i]);
      inter = 1 - inter / otherIdx.length;
    }

    // ── Outcome attribution ───────────────────────────────────────────
    const outcome = typeof g.record_json?.outcome_reward === 'number' ? g.record_json.outcome_reward : 0.5;

    // ── Topology locality ─────────────────────────────────────────────
    const prevTags = new Set((g.dag_prev || []).flatMap((p) => p.tags || []));
    const nextTags = new Set((g.dag_next || []).flatMap((n) => n.tags || []));
    const myTags = new Set(g.tags || []);
    let topoAgree = 0;
    if (myTags.size > 0) {
      let overlap = 0;
      for (const t of myTags) { if (prevTags.has(t)) overlap++; if (nextTags.has(t)) overlap++; }
      topoAgree = Math.min(1, overlap / (myTags.size * 2));
    }

    const reward = 0.4 * intra + 0.3 * inter + 0.2 * outcome + 0.1 * topoAgree;
    results.set(g.id, { reward: Math.max(0, Math.min(1, reward)), breakdown: { intra, inter, outcome, topoAgree } });
  }

  return results;
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Compute Glyph Rewards (Phase 2) ════════════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const addon = loadAddon();
  if (addon) {
    const free = new BigInt64Array(1), total = new BigInt64Array(1);
    addon.getCudaMemory(free, total);
    const simd = addon.simdJsonBackend?.() ?? 'n/a';
    console.log(`  GPU addon: ✅ CUDA=${addon.checkCudaAvailable()} simd=${simd} graphs=${addon.cudaGraphCount()} vram=${(Number(total[0])/1024**3).toFixed(1)}GB`);
  } else {
    console.log('  GPU addon: ⚠️  not loaded, using CPU cosine');
  }

  const pool = new pg.Pool({ connectionString: PG_URL });

  console.log('\n  Step 1: Load glyphs from postgres.glyph_records...');
  const { rows: glyphs } = await pool.query(`
    SELECT id, glyph_id, source_id, kind, section, som_cluster, centroid_id,
           grpo_reward_score, summary, tags, dag_prev, dag_next, record_json
    FROM glyph_records
  `);
  console.log(`  ✅ Loaded ${glyphs.length} glyphs`);

  let withEmb = glyphs.filter((g) => Array.isArray(g.record_json?.embedding) && g.record_json.embedding.length > 0);
  console.log(`  Step 2: Glyphs with embeddings: ${withEmb.length}/${glyphs.length}`);

  // Step 2b: Embed summaries if --embed flag and embeddings are missing (or --force-embed to overwrite all)
  if ((EMBED || FORCE_EMBED) && (FORCE_EMBED || withEmb.length < glyphs.length)) {
    const needEmbed = FORCE_EMBED ? glyphs : glyphs.filter((g) => !Array.isArray(g.record_json?.embedding) || g.record_json.embedding.length === 0);
    // Try /api/embed (Redis L1 → Ollama chain) first; fall back to inline ONNX
    const serverProbe = await embedViaServer(['probe']);
    const useServer = Array.isArray(serverProbe);
    if (useServer) {
      console.log(`\n  Step 2b: Embedding ${needEmbed.length} glyph summaries via ${DEV_SERVER}/api/embed (Redis L1 + server chain)…`);
    } else {
      console.log(`\n  Step 2b: Embedding ${needEmbed.length} glyph summaries via embeddinggemma ONNX (DirectML)…`);
      console.log(`  Model: ${ONNX_MODEL_PATH}`);
    }

    const onnxReady = useServer ? true : await loadOnnxEmbed();
    if (!useServer && !onnxReady) {
      console.warn('  ⚠ Neither server nor ONNX model available — skipping embed step');
    } else {
      if (!useServer) console.log('  ✅ ONNX session loaded (DirectML GPU)');
      const BATCH = useServer ? 16 : 8;
      let embedded = 0;
      for (let i = 0; i < needEmbed.length; i += BATCH) {
        const chunk = needEmbed.slice(i, i + BATCH);
        const texts = chunk.map((g) => `${g.section} ${g.kind} ${g.summary}`.slice(0, 512));
        try {
          let vecs = useServer ? await embedViaServer(texts) : await embedOnnxBatch(texts);
          // Server returned null mid-batch — fall back to ONNX for this chunk
          if (!vecs && useServer) {
            if (!onnxReady) await loadOnnxEmbed();
            vecs = await embedOnnxBatch(texts);
          }
          if (!vecs) { console.warn(`  ⚠ embed batch ${i} failed`); continue; }

          if (APPLY) {
            for (let j = 0; j < chunk.length; j++) {
              const emb = vecs[j];
              if (!emb) continue;
              await pool.query(`
                UPDATE glyph_records
                SET record_json = record_json || $1::jsonb, updated_at = NOW()
                WHERE id = $2
              `, [JSON.stringify({ embedding: emb }), chunk[j].id]);
              chunk[j].record_json = { ...(chunk[j].record_json ?? {}), embedding: emb };
            }
          } else {
            for (let j = 0; j < chunk.length; j++) {
              if (vecs[j]) chunk[j].record_json = { ...(chunk[j].record_json ?? {}), embedding: vecs[j] };
            }
          }
          embedded += chunk.length;
          process.stdout.write(`\r    embedded ${embedded}/${needEmbed.length}`);
        } catch (e) {
          console.warn(`\n  ⚠ embed error at batch ${i}: ${e.message}`);
        }
      }
      console.log(`\n  ✅ Embedded ${embedded} glyph summaries${APPLY ? ' (written to DB)' : ' (in-memory only — use --apply to persist)'}`);
      withEmb = glyphs.filter((g) => Array.isArray(g.record_json?.embedding) && g.record_json.embedding.length > 0);
      console.log(`  Updated embedding coverage: ${withEmb.length}/${glyphs.length}`);
    }
  }

  // Step 2c: GPU k-means → assign som_cluster + centroid_id to glyphs in-memory (and DB if --apply)
  const embGlyphsForKmeans = glyphs.filter((g) => Array.isArray(g.record_json?.embedding) && g.record_json.embedding.length === 768);
  if (embGlyphsForKmeans.length >= 4 && addon) {
    const K_GLYPH = Math.min(8, Math.floor(embGlyphsForKmeans.length / 2));
    console.log(`\n  Step 2c: GPU k-means on ${embGlyphsForKmeans.length} glyph embeddings (k=${K_GLYPH})...`);
    const dim = 768;
    const n = embGlyphsForKmeans.length;
    const flat = new Float32Array(n * dim);
    for (let i = 0; i < n; i++) flat.set(embGlyphsForKmeans[i].record_json.embedding, i * dim);
    try {
      const km = addon.kmeansWithCentroids(flat, n, dim, K_GLYPH, 100);
      if (km?.assignments && km?.centroids) {
        // Assign in-memory
        for (let i = 0; i < n; i++) {
          const c = km.assignments[i];
          embGlyphsForKmeans[i].som_cluster = c;
          embGlyphsForKmeans[i].centroid_id = c;
        }
        console.log(`  ✅ k-means done — ${K_GLYPH} clusters assigned`);
        // Persist to DB if --apply
        if (APPLY) {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            for (let i = 0; i < n; i++) {
              const c = km.assignments[i];
              await client.query(
                'UPDATE glyph_records SET som_cluster = $1, centroid_id = $2, updated_at = NOW() WHERE id = $3',
                [c, c, embGlyphsForKmeans[i].id]
              );
            }
            await client.query('COMMIT');
            console.log(`  ✅ Wrote som_cluster + centroid_id for ${n} glyphs`);
          } catch (e) { await client.query('ROLLBACK'); console.warn('  ⚠ k-means DB write failed:', e.message); }
          finally { client.release(); }
        }
      }
    } catch (e) { console.warn('  ⚠ GPU k-means failed:', e.message); }
  } else if (embGlyphsForKmeans.length >= 4) {
    // JS fallback k-means for cluster assignment
    const K_GLYPH = Math.min(8, Math.floor(embGlyphsForKmeans.length / 2));
    console.log(`\n  Step 2c: JS k-means fallback on ${embGlyphsForKmeans.length} glyph embeddings (k=${K_GLYPH})...`);
    const assignments = new Array(embGlyphsForKmeans.length);
    const dim = 768;
    // Simple random seeding + 20 iters
    const centroids = embGlyphsForKmeans.slice(0, K_GLYPH).map((g) => Float32Array.from(g.record_json.embedding));
    for (let iter = 0; iter < 20; iter++) {
      for (let i = 0; i < embGlyphsForKmeans.length; i++) {
        let best = 0, bestSim = -Infinity;
        const v = embGlyphsForKmeans[i].record_json.embedding;
        for (let c = 0; c < K_GLYPH; c++) { const s = cosineSim(v, centroids[c]); if (s > bestSim) { bestSim = s; best = c; } }
        assignments[i] = best;
      }
      const sums = Array.from({ length: K_GLYPH }, () => new Float32Array(dim));
      const counts = new Array(K_GLYPH).fill(0);
      for (let i = 0; i < embGlyphsForKmeans.length; i++) {
        const c = assignments[i]; counts[c]++;
        const v = embGlyphsForKmeans[i].record_json.embedding;
        for (let d = 0; d < dim; d++) sums[c][d] += v[d];
      }
      for (let c = 0; c < K_GLYPH; c++) if (counts[c] > 0) centroids[c] = sums[c].map((v) => v / counts[c]);
    }
    for (let i = 0; i < embGlyphsForKmeans.length; i++) {
      embGlyphsForKmeans[i].som_cluster = assignments[i];
      embGlyphsForKmeans[i].centroid_id = assignments[i];
    }
    console.log(`  ✅ JS k-means done — ${K_GLYPH} clusters assigned (in-memory only; re-run with GPU addon for persistence)`);
  }

  // Step 3: Compute rewards (vectorised GPU pass — cuBLAS GEMM + CUDA graph replay)
  console.log('\n  Step 3: Compute reward scores (GPU batch)...');
  const t0 = Date.now();
  const rewardMap = computeAllRewardsGPU(glyphs, withEmb, addon);
  const computeMs = Date.now() - t0;

  const updates = [];
  for (const g of glyphs) {
    const r = rewardMap.get(g.id);
    if (!r) continue;
    updates.push({ id: g.id, reward: r.reward, breakdown: r.breakdown });
    if (VERBOSE) console.log(`    ${g.glyph_id.slice(0, 32)} → ${r.reward.toFixed(3)} (intra=${r.breakdown.intra?.toFixed(2) ?? '-'} inter=${r.breakdown.inter?.toFixed(2) ?? '-'})`);
  }
  if (addon) console.log(`  GPU graphs active: ${addon.cudaGraphCount()} | simd: ${addon.simdJsonBackend?.() ?? 'n/a'}`);
  console.log(`  ✅ Computed ${updates.length} rewards in ${computeMs}ms`);

  // Step 4: Persist (if --apply)
  if (APPLY && updates.length > 0) {
    console.log('\n  Step 4: UPDATE glyph_records...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const u of updates) {
        await client.query(
          'UPDATE glyph_records SET grpo_reward_score = $1, updated_at = NOW() WHERE id = $2',
          [u.reward, u.id]
        );
      }
      await client.query('COMMIT');
      console.log(`  ✅ Updated ${updates.length} rows`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // Step 4b: Write reward hash to Redis gpu:glyph:rewards (keyed by source_id)
  // This lets turbovec-rerank look up GRPO reward scores in O(1) per query
  if (APPLY && updates.length > 0) {
    const REDIS_URL  = process.env.REDIS_URL  ?? 'redis://localhost:6379';
    const REDIS_PASS = process.env.REDIS_PASSWORD ?? 'redis';
    const redis = new Redis(REDIS_URL, {
      password: REDIS_PASS,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});
    let redisOk = false;
    try {
      await redis.connect();
      await redis.ping();
      redisOk = true;
    } catch { /* Redis unavailable — skip cache write */ }

    if (redisOk) {
      try {
        // Build hash: source_id → reward score string
        const hashEntries = [];
        for (const u of updates) {
          const g = glyphs.find((g) => g.id === u.id);
          if (g?.source_id) hashEntries.push(g.source_id, String(u.reward));
        }
        if (hashEntries.length >= 2) {
          const pipeline = redis.pipeline();
          pipeline.hset('gpu:glyph:rewards', ...hashEntries);
          pipeline.expire('gpu:glyph:rewards', 86400); // 24h TTL
          await pipeline.exec();
          console.log(`  ✅ Redis gpu:glyph:rewards → ${hashEntries.length / 2} entries (24h TTL)`);
        }
      } catch (e) {
        console.warn(`  ⚠ Redis write failed: ${e.message}`);
      }
      redis.disconnect();
    } else {
      console.log('  ℹ Redis unavailable — skipping gpu:glyph:rewards cache write');
    }
  }

  // Report
  const report = {
    timestamp: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    totalGlyphs: glyphs.length,
    withEmbedding: withEmb.length,
    rewardsComputed: updates.length,
    computeMs,
    gpuAvailable: !!addon,
    rewardStats: updates.length > 0 ? {
      avg: updates.reduce((s, u) => s + u.reward, 0) / updates.length,
      min: Math.min(...updates.map((u) => u.reward)),
      max: Math.max(...updates.map((u) => u.reward)),
    } : null,
    topGlyphs: updates.sort((a, b) => b.reward - a.reward).slice(0, 10).map((u) => ({ id: u.id, reward: u.reward })),
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n  📝 Report → ${REPORT_PATH}`);

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Glyphs:         ${glyphs.length}`);
  console.log(`  With embedding: ${withEmb.length}`);
  console.log(`  Rewards:        ${updates.length}`);
  if (report.rewardStats) {
    console.log(`  Avg reward:     ${report.rewardStats.avg.toFixed(3)}`);
    console.log(`  Range:          [${report.rewardStats.min.toFixed(3)}, ${report.rewardStats.max.toFixed(3)}]`);
  }
  console.log(`  Compute time:   ${computeMs}ms`);
  if (!APPLY) console.log('\n  [DRY-RUN] No updates persisted. Use --apply.');

  await pool.end();
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
