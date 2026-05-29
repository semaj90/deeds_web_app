# Plan: ES Glyphs As Training Data

**Created:** 2026-05-28
**Scope:** Wire the existing GlyphRecord infrastructure into a QLoRA training pipeline that teaches Gemma Atlas concepts via compressed symbolic glyphs instead of raw text.
**Status:** Phase 0 (discovery) complete — ready to implement.

---

## Phase 0 Output: Existing Infrastructure (What Already Exists)

### Allowed APIs — verified file paths

| Component | File | Status |
|---|---|---|
| `GlyphRecord` schema (4-layer TypeScript) | `sveltekit-frontend/src/lib/server/types/glyph.ts` | ✅ exists |
| Glyph tile engine (NES 16×16, k-means + SOM BMU) | `sveltekit-frontend/src/lib/server/cartridge/glyph-tile-engine.ts` | ✅ exists |
| GRPO dataset generator (4400+ JSONL records) | `scripts/generate-qlora-datasets.mjs` | ✅ exists |
| LoRA adapter training script (rank 64, INT4 AWQ) | `scripts/train_lora_adapter.py` | ✅ exists |
| 14 Colab notebooks (GRPO, VLM, TensorRT export) | `scripts/unsloth-training/*.ipynb` | ✅ exists |
| Atlas pipeline phase lanes | `scripts/atlas/` | ✅ exists |
| Engram memory store + ACE packet | `.opencode/ace-packet.json` | ✅ exists |

### Key schema facts (do not re-derive)

```typescript
// GlyphRecord = 4 nested layers
GlyphSemanticLayer  — summary, tags, entities, section, kagNeighbors, dagPrev/Next
GlyphVectorLayer    — embedding768 (Float32Array), grpoRewardScore, centroidId
GlyphTopologyLayer  — somCluster, manifold4[4], gridX/Y (NES position)
GlyphRenderLayer    — cartridgeId, pageIndex, tileIndex, promptCacheKey, atlasKey
```

### What is missing (the 15% gap)

1. **`glyph_records` Postgres table** — no Drizzle schema, no migration. `GlyphRecord` TypeScript type exists but no durable storage.
2. **`glyphs-to-training-pairs.mjs`** — no script assembles `GlyphRecord` objects into `{prompt, completion}` JSONL pairs for LoRA training.
3. **GRPO signal collection pipeline** — `grpoRewardScore` field exists on `GlyphVectorLayer` but nothing writes it. The reward signal needs a computation path (cosine vs reference embedding).
4. **LoRA checkpoint versioning table** — no Drizzle table tracks adapter versions, training runs, or which glyph batch produced which checkpoint.
5. **Active learning sampler** — nothing picks which glyphs to train on next (low-reward first = highest signal).

### Anti-patterns to avoid

- **Do NOT** pass raw `Float32Array` `embedding768` directly into training JSONL — it's 768 floats per record. Use `centroidId` + `grpoRewardScore` as the compressed signal instead.
- **Do NOT** use `drizzle-kit push` to create the new table — follow the manual migration pattern (see project CLAUDE.md Drizzle Safety Rule).
- **Do NOT** write `glyph_records` rows from the SvelteKit request path — all glyph ingestion is an offline pipeline script, not a live API route.
- **Do NOT** put LoRA adapter weights in git — they go in SeaweedFS bucket `lora-adapters` and the checkpoint versioning table tracks the reference.

---

## Phase 1: Durable Storage — `glyph_records` Table + Ingestion Script

**Goal:** Give GlyphRecord a Postgres home and a script that populates it from the existing ACE packet cards.

### 1A — Drizzle schema entry

Add to `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`:

```typescript
export const glyphRecords = pgTable('glyph_records', {
  id:            uuid('id').defaultRandom().primaryKey(),
  sourceRef:     text('source_ref').notNull(),          // file:line or card title
  glyphKind:     text('glyph_kind').notNull(),           // GlyphKind enum value
  section:       text('section').notNull(),              // GlyphSection enum value
  recordJson:    jsonb('record_json').notNull().$type<SerializedGlyphRecord>(),
  // vector layer scalars (queryable without unpacking JSONB)
  centroidId:    integer('centroid_id'),
  grpoRewardScore: real('grpo_reward_score'),
  somCluster:    integer('som_cluster'),
  // metadata
  embeddingModel: text('embedding_model').notNull().default('embeddinggemma:latest'),
  batchId:       text('batch_id'),                       // links to lora_training_runs
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Note: `embedding768` is stored in Qdrant `codebase_chunks_768` (already operational) — do NOT duplicate 768 floats in Postgres. `recordJson` stores everything except the raw float vector.

### 1B — Manual SQL migration

Write `sveltekit-frontend/drizzle/manual/20260529_glyph_records.sql`:

```sql
CREATE TABLE IF NOT EXISTS glyph_records (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_ref      text NOT NULL,
  glyph_kind      text NOT NULL,
  section         text NOT NULL,
  record_json     jsonb NOT NULL,
  centroid_id     integer,
  grpo_reward_score real,
  som_cluster     integer,
  embedding_model text NOT NULL DEFAULT 'embeddinggemma:latest',
  batch_id        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS glyph_records_source_ref_idx ON glyph_records(source_ref);
CREATE INDEX IF NOT EXISTS glyph_records_glyph_kind_idx ON glyph_records(glyph_kind);
CREATE INDEX IF NOT EXISTS glyph_records_centroid_id_idx ON glyph_records(centroid_id);
CREATE INDEX IF NOT EXISTS glyph_records_batch_id_idx    ON glyph_records(batch_id);
CREATE INDEX IF NOT EXISTS glyph_records_record_json_gin ON glyph_records USING GIN(record_json);
```

Apply: `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/20260529_glyph_records.sql`

### 1C — ACE cards → GlyphRecord ingestion script

Create `scripts/atlas/ingest-ace-cards-to-glyphs.mjs`:

**Logic:**
1. Read `.opencode/ace-packet.json` (existing ACE packet, 78+ cards)
2. For each card, construct a `GlyphRecord` with:
   - `semantic.summary = card.summary`, `semantic.tags = card.tags`, `semantic.section` from card domain keyword → `hmmStateToGlyphSection()`
   - `vector.embedding768` = fetch from Qdrant `codebase_chunks_768` by `sourceRef` (already indexed)
   - `vector.centroidId` = card's existing cluster assignment from Qdrant payload `som_cluster`
   - `vector.grpoRewardScore = null` (computed in Phase 2)
   - `topology.somCluster`, `topology.gridX/Y` from Qdrant payload
3. Upsert into `glyph_records` ON CONFLICT (source_ref) DO UPDATE
4. Report: N rows written, N existing skipped

**npm alias** (add to root `package.json`):
```json
"atlas:ingest-glyphs": "node scripts/atlas/ingest-ace-cards-to-glyphs.mjs"
```

### Phase 1 verification checklist

- [ ] `docker exec legal-ai-postgres psql ... -c "SELECT count(*) FROM glyph_records"` → N > 0
- [ ] `SELECT glyph_kind, count(*) FROM glyph_records GROUP BY glyph_kind` → non-empty distribution
- [ ] `SELECT source_ref FROM glyph_records LIMIT 5` → recognisable file paths or card titles
- [ ] Drizzle `$inferSelect` compiles without error: `type GlyphRecord = typeof glyphRecords.$inferSelect`

---

## Phase 2: GRPO Reward Signal + Training Pair Assembly

**Goal:** Compute `grpoRewardScore` for each glyph and emit `{prompt, completion}` JSONL files that teach Gemma Atlas patterns.

### 2A — GRPO reward score computation

The reward is cosine similarity between a glyph's embedding and a "reference" embedding representing a known-good answer for that glyph's domain. This is the same signal `glyph-tile-engine.ts` already computes for tile clustering — reuse it.

Create `scripts/atlas/compute-glyph-rewards.mjs`:

1. Load all `glyph_records` rows where `grpo_reward_score IS NULL`
2. For each glyph:
   a. Fetch embedding from Qdrant `codebase_chunks_768` by `source_ref`
   b. Fetch domain centroid embedding (k-means centroid for that glyph's `centroid_id`) from Redis `gpu:karpathy:encoded`
   c. Compute cosine similarity via `attentionScoreGPU` (N-API, `simd-bridge/cpp/build/Release/tensorrt_bridge.node`) — or fallback to TypeScript dot-product if GPU unavailable
3. `UPDATE glyph_records SET grpo_reward_score = $score WHERE id = $id`
4. Emit summary: mean reward per `glyph_kind`, reward distribution histogram

**npm alias:** `"atlas:compute-rewards": "node scripts/atlas/compute-glyph-rewards.mjs"`

### 2B — Glyph → training pair assembly script

Create `scripts/atlas/glyphs-to-training-pairs.mjs`:

**Training pair format** (extends existing `scripts/training-datasets/*.jsonl` convention):

```jsonl
{"prompt":"<glyph:retrieval_pipeline>\ncomponents: qdrant, neo4j, bm25, reranker\nsection: FACTS\ntags: retrieval, pipeline, ace\n</glyph>","completion":"The retrieval pipeline fuses Qdrant ANN (semantic) with BM25 (sparse) via RRF,hwsw? multi-hopping kmeans som, marco? to matmul cuda kernel distilled table postgresl 18 aio memory swapping lora adapter chrom97 nes card glyphs ontologically related with graph analysis dag from kag stores (mapreduce, couchdb, duckdb, langfuse, bitfrost redis ingestions later storing into shaders gpu vram to bypass drizzle-orm using sharedarraybuffer indexdb and webgpu cpu (com 1992 quic udp n-api rotorquant turbovec l1-l3 cache cpu-ram memory registry using sveltekit 2 runes for wasm like nes card swapping determinstically caching for variance of ux from "did you mean" user recommendation engine rabbitmq -> tricubic cuvs cublas something...memory swapping with token remapping json to jsonb json rpc from c/c++ look into, ecmascript binary bitencoding glyph renders data stores in cache. updates,like texture streaming lod from compressed (vae encoders rnn policy pca 4d transforms, tensor = rtx = redis cache = bitfrost? =binary cpu = gpu stored through webgpu? with lod fallbacks for llm engrams fetching, think google search 2000 ram/cpu (google, jeff dean greedy prefetching given inverse [] past user logs updating tricubic to predict attention mcp-json rpc 2.0)))) reranks using the Karpathy authority blend (0.4·PageRank + 0.3·attention + 0.3·authority), and stores compressed glyphs in the ACE packet for next-turn context injection.","reward":0.91}
```

**Construction:**
1. Load `glyph_records` WHERE `grpo_reward_score IS NOT NULL` ORDER BY `grpo_reward_score DESC`
2. High-reward glyphs (score ≥ 0.75): emit `{prompt, completion}` pair with full semantic content — these teach "what is correct"
3. Mid-reward glyphs (0.4–0.75): emit contrastive pair: the glyph as prompt + corrective completion that addresses gaps
4. Low-reward glyphs (< 0.4): skip or emit as negative examples for DPO training (future Phase 3)
5. Write to `scripts/training-datasets/glyph-pairs-YYYY-MM-DD.jsonl`

**JSONL schema fields**: `prompt`, `completion`, `reward` (float), `glyph_kind`, `section`, `source_ref`, `batch_id`

### 2C — LoRA checkpoint versioning table

Add to `schema-postgres.ts`:

```typescript
export const loraTrainingRuns = pgTable('lora_training_runs', {
  id:           uuid('id').defaultRandom().primaryKey(),
  batchId:      text('batch_id').notNull().unique(),    // e.g. "glyphs-2026-05-29"
  adapterPath:  text('adapter_path'),                    // SeaweedFS key
  baseModel:    text('base_model').notNull(),             // "gemma4-rotorquant:latest"
  loraRank:     integer('lora_rank').notNull().default(64),
  glyphCount:   integer('glyph_count').notNull(),
  meanReward:   real('mean_reward'),
  status:       text('status').notNull().default('pending'), // pending/training/done/failed
  startedAt:    timestamp('started_at', { withTimezone: true }),
  finishedAt:   timestamp('finished_at', { withTimezone: true }),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Manual SQL migration: `sveltekit-frontend/drizzle/manual/20260529_lora_training_runs.sql`

### Phase 2 verification checklist

- [ ] `SELECT count(*) FROM glyph_records WHERE grpo_reward_score IS NOT NULL` → > 0
- [ ] `SELECT min(grpo_reward_score), max(grpo_reward_score), avg(grpo_reward_score) FROM glyph_records` → plausible 0–1 range, not all 1.0
- [ ] JSONL exists: `ls scripts/training-datasets/glyph-pairs-*.jsonl`
- [ ] JSONL valid: `head -5 scripts/training-datasets/glyph-pairs-*.jsonl | jq .reward`
- [ ] Drizzle `loraTrainingRuns` table compiles without error

---

## Phase 3: Nightly Pipeline Integration + Active Learning Sampler

**Goal:** Wire the glyph→training pipeline into the existing heavy-lane startup policy so it runs automatically, and add an active learning sampler that picks the most informative glyphs for the next training batch.

### 3A — Heavy-lane wiring

`config/startup-ace-policy.json` already defines the heavy lane sequence. Add two new steps after `karpathy:gpu`:

```json
"atlas:ingest-glyphs",
"atlas:compute-rewards"
```

This ensures every nightly ACE rebuild also refreshes `glyph_records` and their reward scores.

### 3B — Active learning sampler

Create `scripts/atlas/sample-glyphs-for-training.mjs`:

**Strategy: uncertainty + diversity sampling**

1. **Uncertainty sampling**: select glyphs where `grpo_reward_score` is in the 0.3–0.6 range — these are the most uncertain and gain the most from training
2. **Diversity sampling**: cluster the selected glyphs by `centroid_id` and ensure each cluster contributes at most `floor(budget / num_clusters)` glyphs — prevents over-representing popular topics
3. **Budget**: configurable via `--budget N` flag (default 500 pairs per training run)
4. Output: `scripts/training-datasets/active-sample-YYYY-MM-DD.jsonl`

**npm alias:** `"atlas:sample-training": "node scripts/atlas/sample-glyphs-for-training.mjs"`

### 3C — Training run record

When `scripts/train_lora_adapter.py` completes, it should:
1. Upload the adapter weights to SeaweedFS bucket `lora-adapters` under key `gemma4/{batch_id}/adapter_model.safetensors`
2. `UPDATE lora_training_runs SET status='done', adapter_path=..., mean_reward=..., finished_at=now() WHERE batch_id=...`

Add a thin Node.js post-training hook `scripts/atlas/record-lora-checkpoint.mjs` that the Python script calls via `subprocess.run(['node', 'scripts/atlas/record-lora-checkpoint.mjs', '--batch-id', batch_id, '--path', s3_key, '--mean-reward', str(mean_reward)])`.

### Phase 3 verification checklist

- [ ] `SELECT status, count(*) FROM lora_training_runs GROUP BY status` → at least one `done` row
- [ ] `SELECT adapter_path FROM lora_training_runs WHERE status='done' LIMIT 1` → SeaweedFS key
- [ ] Active sample JSONL has ≤ budget rows and covers ≥ 3 distinct `glyph_kind` values
- [ ] Reward distribution in active sample concentrates around 0.3–0.6 (uncertainty band)

---

## Final Phase: Verification

### Smoke tests

**Schema smoke** (add to `scripts/opencode/smoke-tool-schema.mjs` or create `scripts/atlas/smoke-glyph-pipeline.mjs`):

```bash
node scripts/atlas/smoke-glyph-pipeline.mjs
```

Checks (all must pass):
1. `glyph_records` table exists and has rows
2. At least one row has non-null `grpo_reward_score`
3. At least one JSONL training file exists in `scripts/training-datasets/`
4. JSONL rows have required fields: `prompt`, `completion`, `reward`
5. `lora_training_runs` table exists
6. Redis `gpu:karpathy:scores` has entries (Karpathy blend pre-condition)

**Anti-pattern grep checks**:
```bash
# Must be 0 — no raw float arrays in JSONL
grep -c "embedding768" scripts/training-datasets/glyph-pairs-*.jsonl

# Must be 0 — no hardcoded localhost in new scripts
grep -rn "localhost\|127\.0\.0\.1" scripts/atlas/ | grep -v node_modules
```

### Colab validation

1. Upload latest `glyph-pairs-YYYY-MM-DD.jsonl` to Colab runtime
2. Run `scripts/unsloth-training/gemma4-qlora-glyph.ipynb` (create from existing GRPO notebook, swap dataset)
3. Eval: generate 10 glyph-to-explanation completions, check that outputs reference real Atlas components (qdrant/neo4j/karpathy blend) — not hallucinated names
4. If mean eval reward ≥ 0.70: store checkpoint in SeaweedFS + update `lora_training_runs`

### npm aliases summary

Add all of these to root `package.json` `scripts`:

```json
"atlas:ingest-glyphs":   "node scripts/atlas/ingest-ace-cards-to-glyphs.mjs",
"atlas:compute-rewards": "node scripts/atlas/compute-glyph-rewards.mjs",
"atlas:sample-training": "node scripts/atlas/sample-glyphs-for-training.mjs",
"atlas:build-pairs":     "node scripts/atlas/glyphs-to-training-pairs.mjs",
"atlas:smoke-glyphs":    "node scripts/atlas/smoke-glyph-pipeline.mjs",
"atlas:train":           "node scripts/atlas/sample-glyphs-for-training.mjs && python scripts/train_lora_adapter.py --dataset scripts/training-datasets/active-sample-latest.jsonl"
```

---

## Build order summary

```
Phase 1  (1–2h)
  └── glyph_records table SQL + Drizzle schema entry
  └── ingest-ace-cards-to-glyphs.mjs

Phase 2  (2–3h)
  └── compute-glyph-rewards.mjs  (GRPO cosine reward)
  └── glyphs-to-training-pairs.mjs  (JSONL assembly)
  └── lora_training_runs table SQL + Drizzle schema entry

Phase 3  (1–2h)
  └── sample-glyphs-for-training.mjs  (active learning)
  └── record-lora-checkpoint.mjs  (post-training hook)
  └── startup-ace-policy.json wiring

Final  (1h)
  └── smoke-glyph-pipeline.mjs
  └── Colab eval notebook (adapt existing GRPO notebook)
```

**Total estimated effort:** 5–8 hours across the 4 phases.
**Blocker:** Phase 1 must apply the Postgres migration before any later phase runs — check Docker is up first.
