# Autoencoder → Qdrant cluster wire-in — Contract spec

**Status**: DESIGN ONLY — no code in this doc. Implementation lands in 4 phases (see Build order).
**Created**: 2026-05-11
**Companion**: `next_steps/active/2026-05-10_rotorquant-bitnet-cache-hierarchy.md` (Tier 0/1 cache lane)
**Trigger**: yesterday's autoencoder training (2026-05-10) produced real weights in Redis. Wire them through.

---

## 0. Verified prerequisites (read before reviewing)

| Asset | Path / key | Confirmed |
|---|---|---|
| Trained weights | Redis hash `ace:autoencoder:weights` | Fields `W1, b1, W2, b2, W3, b3, W4, b4` (csv f32). We use `W1, b1, W2, b2` only (encoder). Loss=0.0507, n=40607, RTX 3060 Ti, dim 768→256→64. |
| Training metadata | `sveltekit-frontend/logs/task-output/pipeline-test/autoencoder-train-latest.json` | PASS, 2026-05-10T08:23:53Z |
| Encode op | `src/lib/server/gpu/topology-projection.ts::autoencoderEncode(data, W, b, opts)` | Single linear+tanh layer; GPU via N-API, CPU fallback |
| N-API addon | `simd-bridge/cpp/pytorch_graph.cc::autoencoderEncode` | Exports `(input, n, inputDim, W, b, hidden) → Float32Array` |
| Qdrant collection | `codebase_chunks_768` | 768d `content` named vector + `som_cluster` int payload |
| SOM cluster count | 20 (per `karpathy:gpu` daily refresh) | Cluster IDs 0..19 |

**Constraint**: encoder is **two layers** (W1: [256, 768], W2: [64, 256]) — wire-in chains two `autoencoderEncode` calls with `tanh` between.

---

## 1. Architecture (ASCII)

```
              ┌────────────────────────────┐
              │ Redis ace:autoencoder:weights│  ← yesterday's training
              │   W1 (256×768) b1 (256)     │
              │   W2 (64×256)  b2 (64)      │
              └────────────────────────────┘
                         │ once at boot
                         ▼
              ┌────────────────────────────┐
              │ encode768to64(vec)         │
              │   z1 = tanh(vec @ W1ᵀ + b1)│  → 256d
              │   z2 = tanh(z1  @ W2ᵀ + b2)│  → 64d
              └────────────────────────────┘
                         │
              ┌──────────┴──────────┬───────────────────────┐
              ▼                     ▼                       ▼
   [Phase 1 BACKFILL]      [Phase 2 BACKFILL]      [Phase 3 RUNTIME]
   For each Qdrant chunk:  GROUP BY som_cluster:   At query time:
   encode 768→64 →         AVG(encoded_64) →       1. encode query → 64d
   upsert as named         write to Redis hash     2. cosine vs 20 centroids
   vector `encoded_64`     gpu:autoencoder:        → top-3 cluster IDs
                          centroids_64             3. Qdrant filter:
                                                      som_cluster IN top-3
                                                   4. then 768d ANN
                                                   5. then MARCO + LangExtract
                                                      + decision tree (f8)
```

---

## 2. Phase 1 — Backfill encode (one-time)

### 2.1 Contract: `scripts/autoencoder-backfill-qdrant.mjs`

```typescript
// CLI:
//   node scripts/autoencoder-backfill-qdrant.mjs \
//     --collection codebase_chunks_768 \
//     [--batch-size 256] [--dry-run] [--limit 1000]

interface BackfillOptions {
  /** Qdrant collection name. Default: 'codebase_chunks_768'. */
  collection?: 'codebase_chunks_768' | 'legal_documents' | 'evidence_items' | 'chat_messages';
  /** Points per scroll batch. Default: 256 (≈70KB/batch on 64d). */
  batchSize?: number;
  /** If true, log what would be encoded but don't write. */
  dryRun?: boolean;
  /** Cap on number of points processed; default: unlimited. */
  limit?: number;
  /** Force re-encode even if encoded_64 already present. Default: false. */
  force?: boolean;
}

interface BackfillResult {
  collection: string;
  totalScanned: number;
  encoded: number;        // points that received encoded_64 vector
  skipped: number;        // already had encoded_64 (when !force)
  failed: number;         // null content_embedding, etc.
  durationMs: number;
  gpuPath: boolean;       // true if N-API GPU was used (else CPU fallback)
  weightsVersion: string; // Redis HGET ace:autoencoder:meta version (ISO timestamp)
}

export async function backfillEncoded(opts: BackfillOptions): Promise<BackfillResult>;
```

### 2.2 Redis weight loader contract

```typescript
// src/lib/server/gpu/autoencoder-weights.ts (NEW, ~50 LoC)

interface AutoencoderWeights {
  W1: Float32Array;  // [256 × 768] row-major
  b1: Float32Array;  // [256]
  W2: Float32Array;  // [64 × 256]  row-major
  b2: Float32Array;  // [64]
  /** ISO timestamp of training run that produced these weights. */
  trainedAt: string;
  /** Loss at end of training; used by health checks to detect untrained-state. */
  bestLoss: number;
}

/** Loads from Redis `ace:autoencoder:weights` + `ace:autoencoder:meta`. */
export async function loadAutoencoderWeights(): Promise<AutoencoderWeights>;

/** In-process cache; only re-fetches if `trainedAt` ETag changes. */
export async function getCachedAutoencoderWeights(): Promise<AutoencoderWeights>;

/** Health probe — returns null if weights missing/corrupt. */
export async function probeAutoencoderWeights(): Promise<{
  ok:        boolean;
  trainedAt: string | null;
  loss:      number | null;
  shapeOk:   boolean;
  reason?:   string;
}>;
```

### 2.3 Encode chain contract

```typescript
// src/lib/server/gpu/encode-768-to-64.ts (NEW, ~40 LoC)

/**
 * Two-layer encoder: 768 → 256 → 64. Chains two autoencoderEncode calls.
 * Caches weights in-process; re-fetches when trainedAt changes.
 */
export async function encode768to64(
  vec: Float32Array,     // [768]  or [n × 768]
  opts?: { n?: number; preferGpu?: boolean }
): Promise<Float32Array>; // [64]   or [n × 64]

/** Batched variant for backfill — single GPU call per layer per batch. */
export async function encode768to64Batch(
  matrix: Float32Array,  // [n × 768]
  n: number,
  opts?: { preferGpu?: boolean }
): Promise<{ encoded: Float32Array; n: number; durationMs: number; gpuPath: boolean }>;
```

### 2.4 Qdrant upsert shape

```typescript
// Single point upsert into codebase_chunks_768 (preserves existing content vector):
{
  id:      <existing_uuid>,
  vector: {
    content:     [<existing 768d>],    // unchanged
    encoded_64:  [<new 64d>]           // ← new named vector
  },
  payload: <existing payload + encoded_at: ISO_TIMESTAMP>
}

// Collection schema change required (one-time):
//   PATCH /collections/codebase_chunks_768
//   { vectors: { encoded_64: { size: 64, distance: 'Cosine' } } }
```

**Idempotency**: backfill checks `payload.encoded_at` ≥ weights `trainedAt` → skip unless `--force`. Safe to re-run after each training refresh.

---

## 3. Phase 2 — Cluster centroids (one-time)

### 3.1 Contract: `scripts/autoencoder-centroids.mjs`

```typescript
interface CentroidOptions {
  collection?: string;
  /** Where to store centroids. Default: 'gpu:autoencoder:centroids_64'. */
  redisKey?: string;
  /** Min cluster size to include; smaller clusters get skipped. Default: 5. */
  minClusterSize?: number;
  dryRun?: boolean;
}

interface CentroidResult {
  collection:    string;
  clusterCount:  number;       // number of clusters with ≥minClusterSize points
  totalPoints:   number;       // sum of cluster member counts
  durationMs:    number;
  weightsVersion: string;      // matches the encode weights version
}

export async function computeCentroids(opts: CentroidOptions): Promise<CentroidResult>;
```

### 3.2 Redis centroid layout

```
HASH gpu:autoencoder:centroids_64
  field=cluster_0  → "<64 comma-separated f32>"
  field=cluster_1  → "..."
  ...
  field=cluster_19 → "..."
TTL: 24h (refreshed by daily karpathy:gpu cron)

HASH gpu:autoencoder:centroids_64_meta
  field=trainedAt    → ISO timestamp matching encode weights
  field=clusterCount → "20"
  field=totalPoints  → "40607"
  field=computedAt   → ISO
TTL: 24h
```

**Invalidation**: if `ace:autoencoder:weights` trainedAt changes → centroids stale; daily cron picks up the new weights and recomputes. Manual: `redis-cli DEL gpu:autoencoder:centroids_64`.

---

## 4. Phase 3 — Runtime prefilter (Stage A0)

### 4.1 Contract: `src/lib/server/retrieval/encoded-cluster-prefilter.ts`

```typescript
interface PrefilterOptions {
  /** Number of clusters to keep. Default: 3. */
  topK?: number;
  /** Skip prefilter when feature flag is off; returns null. Default: read ENV.ACE_ENCODED_PREFILTER_ENABLED. */
  forceEnable?: boolean;
}

interface PrefilterResult {
  /** Cluster IDs ordered by cosine similarity to query. */
  clusterIds:    number[];
  /** Cosine score per cluster, same order. */
  scores:        number[];
  /** Total scan duration. */
  durationMs:    number;
  /** True when prefilter ran; false when skipped (flag off / weights missing). */
  applied:       boolean;
  /** Diagnostic — null on success, error message on fallback. */
  fallbackReason?: string;
}

export async function encodedClusterPrefilter(
  queryEmbedding: Float32Array,    // [768]
  opts?: PrefilterOptions
): Promise<PrefilterResult>;
```

### 4.2 Stage A0 integration point

```typescript
// src/lib/server/ace/context-assembler.ts — Stage A0 modification

// EXISTING (line ≈210):
//   const topoCandidates = await getTopoCandidates(queryHash, queryEmbedding);
//   if (topoCandidates) return { source: 'topo-cache', candidates: topoCandidates };

// NEW LINE 1 (between topo cache check + Qdrant ANN):
//   const prefilter = await encodedClusterPrefilter(queryEmbedding, { topK: 3 });

// NEW LINE 2 (modify Qdrant search to use cluster filter when applied):
//   const qdrantFilter = prefilter.applied
//     ? { must: [{ key: 'som_cluster', match: { any: prefilter.clusterIds } }] }
//     : undefined;
//   const hits = await qdrant.search({ vector: queryEmbedding, filter: qdrantFilter, ... });

// NEW LINE 3 (emit trace span):
//   retrievalTrace.encodedPrefilter = {
//     applied:    prefilter.applied,
//     clusterIds: prefilter.clusterIds,
//     scores:     prefilter.scores,
//     durationMs: prefilter.durationMs,
//   };
```

**Flag**: `ACE_ENCODED_PREFILTER_ENABLED=false` by default. Flip to true after canary review.

---

## 5. Phase 4 — Decision-tree feature f8

```typescript
// src/lib/server/retrieval/decision-tree.ts (extends existing feature vector)

interface DecisionTreeFeatures {
  f1_cross_encoder:        number;   // 0..1 — existing
  f2_langextract_evidence: number;   // int   — existing
  f3_langextract_grounded: boolean;  // existing
  f4_cluster_authority:    number;   // 0..1 — existing (Karpathy blend)
  f5_topology_distance:    number;   // 0..1 — existing (manifold4 norm)
  f6_trust_tier:           'T1'|'T2'|'T3'; // existing
  f7_usage_score:          number;   // 0..1 — existing (RL aggregate)
  f8_encoded_similarity:   number;   // 0..1 — NEW (encoded_query · encoded_doc, 64d cosine)
}
```

The decision tree learner already accepts an arbitrary feature vector — adding f8 is a config change, not a code change. GRPO reward signal adds one boolean: `encoded_cluster_hit` (true when winning doc came from the top-3 prefiltered set).

---

## 6. Failure modes

| Failure | Symptom | Mitigation |
|---|---|---|
| Weights missing in Redis | `loadAutoencoderWeights` returns null | Backfill skips; prefilter returns `{ applied: false, fallbackReason: 'weights_missing' }`; system falls back to raw 768d ANN — same as today. |
| Weights stale (re-trained mid-flight) | Encoded vectors mismatch new weights | Each upsert tags `payload.encoded_at` with weights `trainedAt`. Backfill detects mismatch and re-encodes. Centroid script invalidates Redis hash. |
| Qdrant encoded_64 named vector missing | First-run scroll has no encoded_64 field | Backfill writes it; cron daily ensures all collections have it. |
| GPU N-API addon unavailable | `topology-projection.ts` falls back to CPU | Backfill slower (10× on 64d), but correct. Logged with `gpuPath: false`. |
| Cluster prefilter excludes the actual answer | True hit in cluster 11, but we picked top-3 = {3, 7, 12} | Decision-tree GRPO reward signal flags `encoded_cluster_hit = false` cases. After ~100 misses, raise `topK` from 3 → 4. Self-correcting. |

---

## 7. Test strategy

| Layer | Tool | Asserts |
|---|---|---|
| Unit | Vitest | `loadAutoencoderWeights` parses Redis csv correctly; `encode768to64` chains two calls; output L2 norm reasonable (~0.5-1.5) |
| Unit | Vitest | `encodedClusterPrefilter` returns deterministic top-K for fixed query + centroids |
| Integration | Vitest + happy-dom | Backfill writes `encoded_64` named vector to Qdrant test collection |
| Integration | Vitest | Stage A0 modification produces the qdrantFilter object when flag is on |
| E2E | Playwright (one query) | `/api/chat/stream` with flag on → response has `yorha.retrievalTrace.encodedPrefilter.applied = true` |
| E2E | Playwright (regression) | Same query with flag off vs on → top-1 result is identical OR new result has higher decision-tree score (no degradation) |

---

## 8. Build order

| Phase | Deliverable | Effort | Gate |
|---|---|---|---|
| **P1** | `autoencoder-weights.ts` + `encode-768-to-64.ts` | 2h | Vitest unit tests pass; loss-roundtrip check (re-encode decoded ≈ original within MSE 0.1) |
| **P2** | `autoencoder-backfill-qdrant.mjs` + Qdrant schema patch | 4h | Dry-run reports correct count; full run encodes all 40607 chunks in <2min |
| **P3** | `autoencoder-centroids.mjs` | 1h | Centroid hash has 20 fields, each parseable; computedAt freshness check |
| **P4** | `encoded-cluster-prefilter.ts` + Stage A0 edit | 3h | Flag-on canary: 100 queries, no degradation; Langfuse spans visible |
| **P5** | Decision tree f8 + GRPO reward signal | 2h | New feature in feature vector; reward signal logged; offline replay shows positive correlation with f8 |

Total: ~12 hours of focused work. Parallelizable: P1 ↔ P2 (different files), P4 ↔ P5 (P5 reads P4 output).

---

## 9. What this does NOT do

- **Does NOT replace 768d ANN.** Encoded vectors prefilter the candidate set; the actual relevance score still comes from 768d cosine + MARCO + LangExtract.
- **Does NOT change the cross-encoder reranker.** MARCO scoring is downstream of the encoded prefilter; same model, smaller input set.
- **Does NOT add a new MCP tool.** Wire-in is internal to ACE Stage A0; the model never sees encoded vectors directly.
- **Does NOT add a Postgres table.** All state lives in Qdrant (encoded_64 named vector) + Redis (weights + centroids hashes).
- **Does NOT modify the training script.** `train-autoencoder.py` continues writing to `ace:autoencoder:weights` as today; backfill just READs from there.
- **Does NOT block on P0** (`cases.user_id` decision). Different lane.
- **Does NOT touch the autoencoder decoder weights** (W3, W4). Decoding is not used in retrieval — only encode. Decoder kept in Redis for potential future use (regenerating training data, verifying weight integrity).

---

## 10. Cross-references

- `scripts/train-autoencoder.py` — produces the weights this design consumes
- `src/lib/server/gpu/topology-projection.ts` — owns the GPU encode op
- `src/lib/server/gpu/autoencoder-bridge.ts` — low-level addon wrapper
- `src/lib/server/ace/context-assembler.ts` — Stage A0 (insertion point at §4.2)
- `scripts/karpathy-gpu-enrich.mjs` — daily cron that also reads `ace:autoencoder:weights`
- CLAUDE.md §"Karpathy GPU Authority Blend + Redis ACE Cache" — explains how the encoded cache key relates to `gpu:karpathy:encoded`
- `next_steps/active/2026-05-10_production-mental-model.md` — Lane 0 (Inference) + Lane 3 (Retrieval)
- `next_steps/active/2026-05-10_rotorquant-bitnet-cache-hierarchy.md` — Tier-0 VRAM cache context

---

**Doc length**: ~310 lines. Reads cold: anyone landing on `train-autoencoder.py` should follow the cross-ref here to know where the weights end up.
