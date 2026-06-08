# Pipeline Kanban — HyperRAG · GPU · Karpathy Indexing
## Updated: 2026-06-08 | Branch: main | svelte-check: 0 errors

Legend: 🔴 BLOCKED · 🟡 TODO · 🟢 READY · 🔵 IN-PROGRESS · ✅ DONE · ⚪ DEFERRED

---

## COLUMN A — Agentic Error Fixing

### 🟢 A1 · Fix barrel import resolution (HIGH · UI Components)
**Goal**: Eliminate 112 unresolved imports across 6 barrel/index files  
**Smoke**: `node scripts/atlas/debug-import-resolve.mjs <import> 'src/lib/components/ui/index.ts'`  
**Validation**: `npx svelte-check` → 0 errors  
**Files**:
- `src/lib/components/ui/index.ts` — 42 dangling refs
- `src/lib/components/ui/gaming/n64/index.ts` — 29 dangling refs
- `src/lib/components/ui/gaming/index.ts` — 18 dangling refs
- `src/lib/components/ui/alert-dialog/index.js` — 12 dangling refs
- `src/lib/components/ui/dialog/index.ts` — 11 dangling refs
- `src/lib/icons/yorha/index.ts` — 12 dangling refs

**Strategy**: Run debug-import-resolve per file → remove or re-export missing symbols → re-run svelte-check  
**Risk**: HIGH — barrel breakage cascades to all consumers

---

### 🟢 A2 · Embed 3,539 unembedded files (HIGH · Atlas Coverage)
**Goal**: Raise Qdrant coverage from 33% → 95%+  
**Command**: `npm run graphify:semantic`  
**Smoke**: `docker exec legal-ai-qdrant curl -s http://localhost:6333/collections/codebase_chunks_768` → points_count increases  
**Validation**: `node scripts/atlas/generate-qdrant-source-cards.mjs --dry-run` → 0 missing  
**Deps**: Ollama :11434 healthy, embeddinggemma:latest loaded  
**Risk**: HIGH — ACE packet source_refs empty without embeddings

---

### 🟢 A3 · SOM cluster 3,744 unclassified files (HIGH · Atlas Coverage)
**Goal**: Raise SOM coverage from 29% → 95%+  
**Command**: `npm run graphify:semantic-cluster`  
**Smoke**: `docker exec legal-ai-redis redis-cli HLEN gpu:karpathy:scores` → increases  
**Validation**: `SELECT count(*) FROM parent_atlas_documents WHERE cluster_id IS NULL` → near 0  
**Deps**: A2 complete (embeddings required for SOM assignment)  
**Risk**: HIGH — topology boosting unavailable without cluster_id

---

### 🟢 A4 · Backfill 2,201 atlas_feature_map orphans (HIGH · Atlas Sync)
**Goal**: Join all feature_map entries to parent_atlas_documents  
**Command**: `npm run atlas:sync`  
**Smoke**: `SELECT count(*) FROM atlas_feature_map afm LEFT JOIN parent_atlas_documents pad ON afm.source_ref = pad.source_ref WHERE pad.id IS NULL` → 0  
**Validation**: Recommendations pipeline shows 0 "not joined" coverage gap  
**Risk**: HIGH — orphaned features invisible to ACE packet assembly

---

### 🟡 A5 · Label 4 high-import unclassified files (MEDIUM · Feature Labeling)
**Goal**: Add feature labels to files with >10 imports but no cluster assignment  
**Command**: `node scripts/atlas/mapreduce-consolidated-index.mjs --output=.tmp/mapreduce-full-v4.ndjson`  
**Then**: Add matching rules to `scripts/atlas/cluster-attribution-pipeline.mjs` CLUSTER_MAP  
**Smoke**: Re-run mapreduce, verify `feature_id` populated for 4 files  
**Risk**: MEDIUM

---

## COLUMN B — GPU Karpathy Indexing Pipeline

### 🟢 B1 · Run Karpathy GPU enrichment (READY · Karpathy)
**Goal**: Refresh `gpu:karpathy:scores` after A2/A3 complete  
**Command**: `npm run karpathy:gpu` (top-50) or `npm run karpathy:gpu:top200`  
**Smoke**: `docker exec legal-ai-redis redis-cli HLEN gpu:karpathy:scores` → ≥200  
**Validation**: `docker exec legal-ai-redis redis-cli HGET gpu:karpathy:scores 'src/lib/server/db/client.ts'` → JSON with pr/attn/authority/blend  
**Deps**: TurboQuant :8090 healthy OR Ollama :11434 healthy  
**Risk**: LOW — read-only enrichment, 24h TTL

---

### 🟢 B2 · Neo4j graph projection + PageRank (READY · Graph)
**Goal**: Compute fresh PageRank scores after A2/A3 atlas changes  
**Command**: `npm run graphify:gds` then `npm run graphify:authority`  
**Smoke**: `docker exec legal-ai-redis redis-cli EXISTS ace:authority:top` → 1  
**Validation**: `docker exec legal-ai-redis redis-cli HLEN ace:authority:top` → ≥200  
**Deps**: Neo4j healthy (:7474), B1 complete  
**Risk**: LOW

---

### 🟡 B3 · Warm Bifrost semantic cache (READY · Cache)
**Goal**: Populate Valkey bifrost:sem:* with fresh packet candidates  
**Command**: `npm run packets:duckdb:semantic` (generate candidates) then `node scripts/cache/warm-bifrost-semantic-cache.mjs`  
**Smoke**: `docker exec legal-ai-redis redis-cli KEYS "bifrost:sem:packet:*" | wc -l` → ≥40  
**Validation**: `docker exec legal-ai-redis redis-cli GET bifrost:sem:warm:summary` → JSON with processed/written counts  
**Deps**: DuckDB CLI, semantic-cache-candidates.jsonl exists  
**Risk**: LOW — writes only TTL-backed keys

---

### 🟡 B4 · Run full parent atlas --apply after A2/A3/A4 (READY · Atlas)
**Goal**: Rebuild all 9 NDJSON lanes with fresh embeddings/clusters  
**Command**: `node scripts/atlas/build-all-lanes-parent-atlas.mjs --apply`  
**Expected**: 118,529+ nodes, 9,402+ edges  
**Smoke**: `ls .tmp/ingest/lanes/*.ndjson` → 9 files, all >0 bytes  
**Deps**: A2, A3, A4 complete  
✅ **Done (2026-06-08)** — 118,529 nodes / 9,402 edges written to `.tmp/ingest/lanes/`

---

## COLUMN C — Feature Labeling & Tracking

### 🟢 C1 · Run cluster attribution pipeline (READY · Labeling)
**Goal**: Enrich all NESCHROM97 cards with cluster/feature metadata  
**Command**: `node scripts/atlas/cluster-attribution-pipeline.mjs --apply`  
**Smoke**: Check first card in `neschrom97/cards/` has `cluster_id` field  
**Validation**: `node scripts/ingest/rank-cards.mjs "ACE context retrieval" --top 10` → scores differentiated  
**Deps**: `neschrom97/cards/` populated  
**Risk**: LOW — writes to card files only

---

### 🟢 C2 · Generate Qdrant source cards (READY · Labeling)
**Goal**: Create retrieval-ready source cards for top Karpathy-ranked files  
**Command**: `node scripts/atlas/generate-qdrant-source-cards.mjs`  
**Smoke**: `docker exec legal-ai-qdrant curl -s http://localhost:6333/collections/codebase_chunks_768` → points increase  
**Deps**: B1 (Karpathy scores), A2 (embeddings)  
**Risk**: LOW

---

### 🟡 C3 · Load NDJSON graph into Postgres code_relations_v1 (READY · Graph DB)
**Goal**: Push call graph edges from NDJSON into `code_relations_v1` table  
**Command**: `node scripts/atlas/load-graph-ndjson.mjs`  
**Smoke**: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT count(*) FROM code_relations_v1"` → increases  
**Deps**: B4 (lanes written)  
**Risk**: LOW — idempotent upsert

---

### 🟡 C4 · Compute route packet rewards (READY · Rewards)
**Goal**: Write reward scores to `route_packet_rewards` for top routes  
**Command**: `node scripts/atlas/generate-qdrant-source-cards.mjs --rewards-only` (or `npm run atlas:rewards`)  
**Smoke**: `SELECT count(*) FROM route_packet_rewards` → ≥45  
**Deps**: C3  
**Risk**: LOW

---

## COLUMN D — Smoke → Validation Testing

### 🟢 D1 · llama-server smoke (READY · Smoke)
**Goal**: Verify llama-server system role + tool calls operational  
**Command**: `node scripts/tests/smoke-opencode-tool-call.mjs`  
**Expected**: 3/3 passed (supports_system_role, system-prompt, streaming)  
**Fix if failing**: Ensure NO `--chat-template gemma/gemma3` flags; use `--jinja --reasoning-format none`  
✅ **Passing** (2026-06-08)

---

### 🟢 D2 · Bifrost cache smoke (READY · Smoke)
**Goal**: Verify 45 packets / 10 features in Valkey  
**Command**: `docker exec legal-ai-redis redis-cli GET bifrost:sem:warm:summary`  
**Expected**: `processed>=45, features>=10`  
✅ **Passing** (2026-06-08) — 45 packets / 10 features

---

### 🟢 D3 · ACE route smoke (READY · Smoke)
**Goal**: Verify ACE route handler returns source_refs + prompt_context  
**Command**: `curl -s -X POST http://localhost:5173/api/ace/route -H 'Content-Type: application/json' -d '{"query":"test","pipeline":"codebase"}'`  
**Expected**: JSON with `source_refs[]` non-empty, `prompt_context` string  
**Validation**: No "no codebase context" in response  
**Deps**: Dev server running  
**Risk**: LOW

---

### 🟡 D4 · Flow enforcer integration test (READY · Test)
**Goal**: Pass all gate checks in flow-enforcer.test.ts  
**Command**: `cd sveltekit-frontend && npx vitest run src/tests/gateway/flow-enforcer.test.ts`  
**Expected**: all tests green  
**Risk**: MEDIUM — may expose ACE/gateway regressions

---

### 🟡 D5 · Full graphify smoke (5-pillar) (READY · Smoke)
**Goal**: Confirm all 5 graphify health pillars pass  
**Command**: `npm run smoke:graphify`  
**Expected**: 5/5 green (graph JSON + map.md + Redis fast cache + KAG notes + Qdrant codebase_chunks_768)  
**Deps**: A2/A3/B1 complete for full green  
**Risk**: LOW

---

### 🟡 D6 · Full svelte-check + vite build (READY · Validation)
**Goal**: 0 errors, 0 warnings; build exits 0  
**Command**: `cd sveltekit-frontend && npx svelte-check && npm run build`  
**Baseline**: 0 errors / 0 warnings (2026-06-08)  
**Risk**: MEDIUM — A1 barrel fixes could introduce new errors

---

## COLUMN E — Infrastructure Health Gates

### 🟢 E1 · RabbitMQ queue declaration (READY · Infra)
**Goal**: Ensure all 7 queues + 5 exchanges are declared on startup  
**Status**: RabbitMQ healthy (`b19c2ffc2b28_legal-ai-rabbitmq Up, healthy`)  
**Missing queues on cold start**: Confirmed 7 queues absent until first consumer connects  
**Fix**: Run `node scripts/startup/ace-incremental-startup.mjs` → triggers queue declaration  
**Smoke**: `curl -s -u guest:guest http://localhost:15672/api/queues` → 7 queues listed

---

### 🟢 E2 · Verify NESCHROM97 card directory (READY · Infra)
**Goal**: All scripts use `_neschrom-paths.mjs` not hardcoded `.opencode/cards/`  
**Command**: `grep -r "opencode/cards" scripts/atlas/ scripts/ingest/ --include="*.mjs" -l`  
**Expected**: 0 hits (or only legacy fallback references)  
**Risk**: LOW — read-only check

---

### ⚪ E3 · Batch migrate remaining 56 scripts to _neschrom-paths.mjs (DEFERRED · Infra)
**Goal**: Remove all hardcoded `.opencode/cards/` refs from scripts  
**Scope**: ~56 scripts not yet using `_neschrom-paths.mjs`  
**Command**: `node scripts/atlas/migrate-card-paths.mjs --apply` (create if needed)  
**Risk**: LOW — mechanical search-replace

---

## COLUMN F — Context Engineering (ACE/Engram)

### 🟡 F1 · Wire AGENTS.md claude-mem memory write (TODO · Memory)
**Goal**: Ensure claude-mem plugin writes per-session observations to Postgres/engram  
**Status**: "No context yet" showing in memory system — not writing  
**Files**: `scripts/opencode/post-memory.mjs`, `scripts/memory/import-claude-mem-observations.mjs`  
**Smoke**: `node scripts/opencode/post-memory.mjs --check` → connection OK  
**Validation**: After session, `SELECT count(*) FROM ace_context_sources WHERE source_kind='agents_md'` increases  
**Risk**: MEDIUM — engram memory loss affects future session quality

---

### 🟡 F2 · Add --cont-batching --metrics to launcher (TODO · Inference)
**Goal**: Enable continuous batching + Prometheus metrics in llama-server  
**File**: `scripts/launch-turboquant.ps1`  
**Add**: `--cont-batching` and `--metrics` to baseArgs  
**Smoke**: `curl http://localhost:8090/metrics` → Prometheus text format  
**Risk**: LOW — additive flags

---

### ⚪ F3 · OpenCode kanban NDJSON indexing integration (DEFERRED · ACE)
**Goal**: Feed tasks.md kanban into NESCHROM97 cards for ACE packet retrieval  
**Approach**: Add a card-generation step for tasks.md → `neschrom97/cards/kanban-*.json`  
**Deps**: C1 complete  
**Risk**: LOW

---

## Pipeline Execution Order

```
Phase 1 — Fix Blockers (run in parallel)
  A1 barrel imports  →  D6 svelte-check validate
  A2 embed files     →  B1 karpathy:gpu
  A3 SOM clusters    →  B2 pagerank
  A4 atlas sync      →  C3 load-graph-ndjson

Phase 2 — Index & Label
  B3 warm bifrost    ←  (after A2/A3)
  B4 build-all-lanes ←  (after A2/A3/A4) ✅ DONE
  C1 cluster-attribution
  C2 generate-source-cards
  C4 route rewards

Phase 3 — Smoke → Validate
  D1 llama smoke ✅
  D2 bifrost smoke ✅
  D3 ACE route smoke
  D4 flow-enforcer tests
  D5 graphify:smoke
  D6 full svelte-check ✅ baseline

Phase 4 — Infra & Memory
  E1 rabbitmq queues
  E2 neschrom97 path audit
  F1 engram memory write
  F2 launcher --cont-batching
```

---

## Stats (2026-06-08)
| Metric | Value | Target |
|--------|-------|--------|
| Atlas nodes | 118,529 | — |
| Atlas edges | 9,402 | — |
| Qdrant coverage | 33% (1,763 embedded) | 95% |
| SOM coverage | 29% (1,387 classified) | 95% |
| Bifrost packets | 45 | ≥100 after A2 |
| Karpathy scores | 219 entries | ≥1,000 after A2/B1 |
| Barrel import errors | 112 refs | 0 |
| svelte-check | 0 errors | 0 errors ✅ |
| llama-server smoke | 3/3 ✅ | 3/3 |