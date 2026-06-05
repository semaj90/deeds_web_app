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
Current summary backlog is tracked against the non-vendor active-production set. The latest active-production summary check returned 3,528 / 3,528 with summaries and 0 missing.
Fills `parent_atlas_documents.summary` — unlocks:
- Richer profile card descriptions
- Summary-aware ACE prompt injection
- CouchDB source cards with human-readable descriptions

### Step 6 — Regenerate profile cards with summaries (DONE)
```bash
npm run docs:file-cards:apply
```

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
| P1 | route runtime packets / ACE write path | Starts the next architecture lane after topology, summaries, profile cards, and recommendations |
| P2 | Fix :8081 embed server | Removes fallback dependence; the focused ingest used Ollama because :8081 was down |
| P3 | `karpathy:gpu` re-run | Refreshes authority blend with current Qdrant coverage |
| P4 | `graphify:topology` / `graphify:pagerank` | Refreshes Neo4j topology and authority signals |

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
