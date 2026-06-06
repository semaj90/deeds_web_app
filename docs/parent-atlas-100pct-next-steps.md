# Parent Atlas — What Happens at 100% and What's Next

**Date:** 2026-06-04  
**Current state:** cleanup / coverage mode. Parent Atlas core is about 90% complete; architecture plumbing is no longer the blocker.

Current practical completion:
- Parent Atlas core: ~90%
- Production topology coverage: active production SOM 100.0%, active production Qdrant 100.0%
- Raw inventory topology: 10,487 / 14,465 SOM, 10,997 / 14,465 Qdrant
- Active production Qdrant-without-SOM: 0
- Active production without Qdrant: 0
- Summary lane: 0 missing in the active-production summary check
- Graph truth / traversal: complete enough for recommendations
- Recommendation -> pickup queue: working
- Route runtime packets / ACE replay: working; JSONB audit rows and Redis LOD0 packets preserve `source_ref` provenance
- Route runtime observability: working; report and self-healing recommendation feedback are wired
- Production-readiness audit: working; 53 PASS / 1 WARN / 0 FAIL across Drizzle, Postgres, Redis, Qdrant, Neo4j, NDJSON, DuckDB, and GPU bridge artifacts
- GPU bridge detail: the native export surface still does not expose a generic `matmul` symbol, but the real LibTorch GEMM path exists in `simd-bridge/cpp/libtorch_graph_impl.cpp`, `simd-bridge/cpp/pytorch_graph.cc`, and `simd-bridge/cpp/pytorch_graph_fp16.cc` via `torch::mm()`; `simd-bridge/cpp/CMakeLists.txt` explicitly notes cuBLASLt dispatch
- EmbeddingGemma `:8081`: healthy and faster than Ollama on bounded head-to-head eval

Important command correction:
- `npm run atlas:synthesize` is **not** the Parent Atlas synthesized-map rebuild. It points at `synthesize-context-chunks.mjs` and requires `--input`.
- Use `npm run atlas:feature-map:synthesize:apply` from `sveltekit-frontend`, or run `node ..\scripts\atlas\build-synthesized-map.mjs` directly.

---

## What "100%" Means

100% means every source file in `atlas_feature_map` has:
- `qdrant_point_id` — vector indexed in `codebase_chunks_768`
- `som_cluster` — assigned to one of the 20 GPU k-means clusters
- `centroid_id` — nearest cluster centroid ID
- `feature_id` — mapped to a feature lane (auth, atlas, ace, etc.)

At 100%, the ACE context-assembler can score *every* file for relevance to any query using the full 5-field blend: `semantic × 0.60 + tag × 0.12 + ast_graph × 0.10 + som_boost × 0.08 + hyperedge × 0.10`. Files without SOM assignments currently receive `som_boost = 0`, silently underscoring them.

---

## Remaining Steps to 100%

### Step 1 — Scripts lane ingest (DONE)
The scripts ingestion succeeded:
- 26,752 chunks processed
- 22,062 new vectors
- 4,690 cached vectors
- 0 errors

Parent Atlas grew from 6,109 to 12,666 `atlas_feature_map` rows. Qdrant grew from roughly 53k to 76k vectors.

### Step 2 — Qdrant sync + re-cluster after scripts/ completes (DONE)
```bash
npm run atlas:sync-qdrant
npm run graphify:semantic-cluster:force
npm run atlas:sync-qdrant          # second pass to pick up new cluster IDs
```
Current raw topology:
- `atlas_feature_map`: 14,465 rows
- `som_cluster`: 10,487 rows
- `qdrant_point_id`: 10,997 rows
- `qdrant_point_id` without `som_cluster`: 1,492 rows

Current production-filtered topology:
- production rows: 4,808
- production with SOM: 4,808
- production with Qdrant: 4,808
- production Qdrant without SOM: 0

### Step 3 — Rebuild synthesized map
```bash
npm run atlas:feature-map:synthesize:apply
# equivalent direct command:
node ../scripts/atlas/build-synthesized-map.mjs
```
This now rebuilds `atlas_feature_map_synthesized` from the canonical `atlas_feature_map` rows. Do not use `npm run atlas:synthesize` for this lane.

### Step 4 — Confirm production Qdrant-without-SOM stays closed
```bash
npm run atlas:coverage:qdrant-no-som -- --limit=50
```
The report writes:
- `docs/reports/production-qdrant-no-som-report.json`
- `docs/reports/production-qdrant-no-som-report.md`

The current report distinguishes raw inventory from active production. Use the active-production section as the health signal:
- active production Qdrant-without-SOM: 0
- raw inventory Qdrant-without-SOM: 1,492

The active-production topology delta is closed. Remaining raw-inventory gaps are excluded from profile cards and are storage/indexing audit items, not dashboard health items.

### Step 4b — Focus the remaining no-Qdrant rows (DONE)
```bash
npm run atlas:coverage:no-qdrant -- --limit=50
```
The report writes:
- `docs/reports/production-no-qdrant-report.json`
- `docs/reports/production-no-qdrant-report.md`

The bounded sourceRef-backed ingest closed this gap. Current active-production no-Qdrant count is 0.

### Step 5 — LLM summaries via Gemma4 (DONE)
```bash
npx tsx ../scripts/atlas/gemma4-parent-atlas-summaries.mjs --cache --apply --limit=100
```
Current summary backlog is tracked against the non-vendor active-production set. The latest active-production summary check returned 3,799 / 3,799 with summaries and 0 missing.
The latest cached batch report on disk now shows 35 queued / 35 succeeded with 0 failed, and the audit script treats that batch report as a live validation checkpoint for the summary lane.
Fills `parent_atlas_documents.summary` — unlocks:
- Richer profile card descriptions
- Summary-aware ACE prompt injection
- CouchDB source cards with human-readable descriptions

### Step 6 — Regenerate profile cards with summaries (DONE)
```bash
npm run docs:file-cards:apply
```

### Step 7 — Route runtime packets / ACE replay gate (DONE)
```bash
npx tsx ../scripts/tests/smoke-route-runtime-packets.mjs
npx tsx ../scripts/tests/smoke-runtime-packet-replay.mjs
```

The replay gate now keeps the responsibilities split cleanly:
- `route_runtime_packets` is Postgres JSONB audit telemetry, not a matmul/GPU lane.
- Redis `ace:telemetry:{id}:lod0` is the compact NES-style replay packet.
- SourceRef normalization drops placeholder paths like `unknown`, preserves repo-root sourceRefs, and repairs stale Redis source dictionaries from Postgres.

Latest validation:
- route telemetry row inserted exactly once
- `source_refs` > 0
- `feature_ids` > 0
- `qdrant_hits` > 0
- Redis hot key present
- decompressed sourceRefs resolve to `parent_atlas_documents.source_ref_id`
- replay smoke restores the Redis Qdrant pointer and runs Neo4j traversal

### Step 8 — Runtime packet observability and feedback (DONE)
```bash
npm run atlas:runtime-packets:report
npm run atlas:runtime-packets:recommend
npm run atlas:runtime-packets:recommend:apply
npm run recommendations:tasks
node scripts/atlas/create-agent-pickup-packets.mjs --from .opencode/recommendations/tasks.ndjson
node scripts/opencode/bootstrap-workspace-tasks.mjs --apply
```

Current report:
- route runtime packets: 30
- runtime packets with sourceRefs: 27 / 30
- runtime packets with Qdrant hits: 29 / 30
- Redis LOD0 coverage: 25 / 30 recent packets

The feedback lane produced 5 runtime-packet recommendations and the workspace task bootstrap now has 17 active tasks. Next ready task: `task_d2dad154`.

### Step 8b — Production-readiness packet/index audit (DONE, read-only)
```bash
npm run atlas:production-readiness
```

The audit writes:
- `docs/reports/parent-atlas-production-readiness-report.json`
- `docs/reports/parent-atlas-production-readiness-report.md`

Latest result:
- checks: 48 PASS / 1 WARN / 0 FAIL
- `parent_atlas_documents`: 5,253 rows
- active non-vendor Parent Atlas summaries: 3,799 / 3,799
- `atlas_feature_map`: 14,465 rows
- `atlas_feature_map_synthesized`: 14,465 rows
- active production SOM: 4,808 / 4,808
- active production Qdrant: 4,808 / 4,808
- `nes_chrom_packets`: 27 rows
- `nes_chrom_kag_dag_hits`: 32 rows
- NES/CHROM packets with sourceRef: 27 / 27
- NES/CHROM packets matching Parent Atlas sourceRefs: 22 / 27
- `route_runtime_packets`: 30 rows
- Redis LOD0 runtime packet coverage: 25 / 30
- Qdrant `codebase_chunks_768`: 76,261 points
- Neo4j: 25,269 `CodebaseFile` nodes, 1,701 `ParentAtlasFeature` nodes, 165,005 `SIMILAR_TOPOLOGY` edges
- `rg -uuu` NDJSON inventory: 127 files, excluding generated dependency folders
- Live-service env gate: `npm run atlas:live-service-env` is the read-only preflight that separates `SERVICE_STOPPED` from `ENV_MISMATCH` before Qdrant backfill work.

This audit is intentionally report-only. It does not run migrations, `drizzle-kit push`, Qdrant writes, graph writes, file archive moves, or database pruning.

### Step 8c — Hidden packet pathmap audit (DONE, read-only)
```bash
node scripts/atlas/audit-hidden-packet-pathmap.mjs
```

The audit writes:
- `docs/reports/hidden-packet-pathmap-report.json`
- `docs/reports/hidden-packet-pathmap-report.md`

Current result:
- hidden packet inputs resolved: 3/3
- total packet rows: 6,353
- rows with both `sourceRef` and `feature_id`: 6,353
- kanban rows matched to feature labels by stable id: 3,106/3,106
- kanban rows matched by `sourceRef + feature`: 3,106/3,106
- missing-feature todo rows with todo `sourceRef`: 135/141

This is now a replay/join surface, not just a visible artifact list. The next follow-on is to feed the same spine into the offline DuckDB join lane so the pathmap, feature labels, kanban tasks, and missing-feature todo packets stay aligned in one bounded report.

### Step 8d — Hidden packet DuckDB materialization (DONE)
```bash
node scripts/atlas/materialize-hidden-packet-pathmap-duckdb.mjs --write
```

This step turns the normalized hidden packet rows into a DuckDB-backed join surface and writes:
- `docs/reports/hidden-packet-pathmap.duckdb`
- `docs/reports/hidden-packet-pathmap-duckdb-report.json`
- `docs/reports/hidden-packet-pathmap-duckdb-report.md`

Treat `docs/reports/hidden-packet-pathmap-duckdb-report.md` as the canonical replay/join report for the `sourceRef + feature_id + stable_id` spine.

Use the DuckDB report to inspect the combined `sourceRef + feature_id + stable_id` spine before any broader offline promotion.
Current result:
- normalized rows: 6,353
- joined rows: 6,353
- stable-id joins: 6,353
- sourceRef joins: 6,353

The next follow-on is to keep this same join surface in sync with the offline synthesis lane so the packet pathmap remains a bounded replay artifact instead of drifting into a separate ad hoc report.

### Directory-by-directory checkpoints
- `scripts/atlas/`: batch summaries are validated by the cached Phase 101 report, and the production-readiness audit now surfaces the summary lane explicitly.
- `scripts/atlas/ndjson-mapreduce-join.mjs` / `scripts/atlas/materialize-mapreduce-duckdb.mjs`: the offline NDJSON MapReduce and DuckDB materialization lane is present and audited as read-only.
- `scripts/atlas/audit-hidden-packet-pathmap.mjs`: the hidden `.tmp` packet surfaces are now audited as a replay/join surface with `sourceRef` and `feature_id` coverage.
- `scripts/atlas/create-agent-pickup-packets.mjs`: now uses the shared connection config for Postgres and Redis so the pickup queue does not drift back to local-auth defaults.
- `sveltekit-frontend/scripts/atlas/audit-feature-lineage.mjs`: use `atlas:feature-lineage:fast` for smoke/CI, `atlas:feature-lineage:medium` for bounded review, and `atlas:feature-lineage` for the exhaustive manual scan.
- `sveltekit-frontend/src/lib/server/gpu/`: the canonical autoencoder lane remains `768→256→64`; generic `matmul` is still absent from the native bridge and is tracked as a warning, not a blocker.
- `sveltekit-frontend/src/lib/server/db/`: Drizzle barrels continue to mirror the NES/CHROM and route runtime packet schemas.

### Step 9 — Embed head-to-head eval (DONE, bounded)
```bash
node scripts/evals/embed-head-to-head.mjs --queries 10 --k 10 --vector-name content --out docs/reports/embed-head-to-head-runtime-2026-06-04.json
```

Current bounded result:
- Ollama `embeddinggemma:latest`: MRR@10 0.6835, p50 196ms, p95 309ms
- llama-server `:8081`: MRR@10 0.6844, p50 76ms, p95 88ms
- overlap: 93.0%
- verdict: llama-server is equivalent quality and faster; keep `:8081` as canonical embedding lane when healthy

### Open Lanes TODO
The remaining open lanes are tracked in [reports/parent-atlas-open-lanes-todo.md](../reports/parent-atlas-open-lanes-todo.md).

Use that file for the finish order when working in the regular OpenCode terminal. It keeps the runtime path separate from the optional bootstrap priming pass.
The Engram lane is now tracked explicitly in `sveltekit-frontend/docs/reports/engram-adapter-decision-report.md` and `npm run atlas:engram-adapter:decision`.

---

## What Unlocks at 100%

### 1. Full ACE Retrieval Accuracy
The `som_boost` weight (0.08) currently contributes 0 for ~36% of files. At 100%:
- Every file gets a cluster centroid distance score
- The `hyperedge × 0.10` lane can fire on SOM-grid adjacency for all files
- `SIMILAR_TOPOLOGY` Neo4j edges are only written for files with SOM coords → more graph edges = deeper neighborhood expansion

### 2. Recommendation Engine (Phase 2 from docs/6_3_26)
The recommendation engine reads `atlas_feature_map_synthesized` to suggest:
- "Files similar to what you're editing right now" (SOM-grid neighbors)
- "Files in the same feature lane that are unlinked" (feature_id + missing Neo4j edges)
- "High-complexity files missing Zod/auth" (health_status=critical)

Without 100% SOM, ~36% of the codebase is invisible to cluster-based recommendations.

### 3. Karpathy Blend Scores for All Files
`karpathy:gpu` reads `gpu:karpathy:scores` Redis hash — populated by `attentionScoreGPU` against Qdrant vectors. Files without Qdrant points get `attn = 0` in the blend (`0.4·PR + 0.3·attn + 0.3·authority`). At 100%, every file gets a real attention score. Run:
```bash
npm run karpathy:gpu
```

### 4. Embed Head-to-Head Eval (from docs/6_3_26)
Once retrieval baseline is stable, run the eval recommended in the 6/3 note:
```bash
node scripts/evals/embed-head-to-head.mjs
```
Compares Ollama embeddinggemma (:11434) vs GGUF llama-server (:8081) on the same Atlas cards.
Output: MRR, NDCG@10, Top-10 overlap. Decides whether :8081 is worth the VRAM.

### 5. :8081 Embed Server Fix
From the 38 PASS / 1 WARN reconciliation: `:8081/health` fails. Fix:
```bash
# Check if llama-server is running with --embeddings flag
curl http://127.0.0.1:8081/health
# If dead, restart with:
# llama-server.exe -m embeddinggemma-300m-f16.gguf --embeddings --port 8081 -ngl 99
```
Until fixed, the embedding lane falls back to Ollama :11434 automatically.

### 6. Neo4j `SIMILAR_TOPOLOGY` Edge Density
Current: SOM coords written for 4,778 / 7,422 files. Neo4j only creates `SIMILAR_TOPOLOGY` edges for files that have `som_bmu_row/col`. At 100%:
```bash
npm run graphify:topology    # writes SIMILAR_TOPOLOGY edges for all SOM-adjacent files
```
This makes the hypergraph navigator (G32 gate) fully dense.

### 7. PageRank Freshness
`scripts/run-pagerank.ts` uses the `link_matrix` from CouchDB (now 9,526 docs — up from ~5,000). Run:
```bash
npm run graphify:pagerank
```
Refreshes `couchdb:pagerank_scores` Redis hash (6h TTL) with the full link graph. Higher-coverage PageRank → more accurate Karpathy authority blend.

---

## Priority Order (Post-100%)

| Priority | Action | Why |
|----------|--------|-----|
| P1 | route runtime packets / ACE write path | Done: JSONB audit row + Redis LOD0 replay packet + sourceRef restore smoke pass |
| P2 | Fix :8081 embed server | Done: `:8081/health` is green and bounded eval shows equivalent quality with lower latency |
| P3 | `karpathy:gpu` re-run | Done: CUDA/fp16 lane refreshed 45 candidates, 42 Qdrant hits, 42 encoded files |
| P4 | `graphify:cluster:pagerank` / `graphify:authority` | Done after Redis auth fix/env injection; cluster scores and `ace:authority:top` refreshed |
| P5 | `graphify:topology` bounded run | Still needs a bounded/observable runner; full alias exceeded the 4-minute command timeout |

---

## What "Done" Looks Like

```
atlas_feature_map:
  total: 14,465
  raw inventory_qdrant_no_som: 1,492
  active_production_qdrant_no_som: 0
  active_production_no_qdrant: 0
  active_production_som: 100.0%
  active summaries: 100%

atlas_feature_map_synthesized:
  total: 12,656+
  som rows match atlas_feature_map topology

recommendations:
  workspace tasks materialized: 12
  next ready: task_967675a8

codebase_chunks_768 (Qdrant):
  points: ~80,000+

Karpathy blend:
  coverage: 90%+ (all indexed files scored)

CouchDB wiki_cards:
  docs: ~11,000 (src + scripts lanes)

Reconciliation audit:
  39/39 PASS / 0 WARN
```

At that point, the Atlas is the authoritative, live retrieval layer for every query that flows through ACE — no silent zero-scores, no missing graph edges, full recommendation engine coverage.
