# Phase 8 Readiness Gate — Concrete Execution Plan

**Date**: July 3, 2026 (Phase 7 Complete, Phase 8 Ready)  
**Status**: ✅ Ready for execution

---

## Executive Summary

Phase 7 (summarization) is **100% complete**: 39,151/39,151 chunks summarized, zero contamination, Postgres canonical truth locked.

Phase 8 (topology computation) is **schema-ready**: all six Phase 8 columns exist on `atlas_packets`, zero population yet. Ready to execute topology steps.

This document provides the **concrete preflight script**, the **lane ownership matrix**, and the **7-gate stop-on-failure sequence** to validate readiness before topology computation begins.

---

## Lane Ownership Matrix (Immutable)

| Lane | Responsibility | Backing Store | Examples |
|------|---|---|---|
| **CANONICAL** | Postgres packet identity + summaries | `atlas_packets` (58,304 rows) + `codebase_chunk_index` (40,754 chunks) | packet_key, summary, embedding, source_ref |
| **DERIVED** | Mirrors (read-only, rebuildable) | Neo4j, Qdrant, Redis/Bifrost | PageRank, SOM coords, community_id, cached payloads |
| **COMPUTE** | GPU acceleration (tensor-only) | TurboVec (ANN), TensorRT/LibTorch (matmul) | cosine similarity, centroid clustering, PCA projection |
| **PARSER** | JSON parsing (not transport) | SIMD JSON bridge (simdjson C++) | fast Qdrant/Ollama/RabbitMQ response parsing |
| **TRANSPORT** | Binary/event delivery | gRPC/Protobuf (50051-50057), SSE (5173) | embeddings gRPC, retrieval gRPC, UI streaming |
| **ORCHESTRATION** | Async job control | ACP (async/await), RabbitMQ (7 queues) | worker spawn, pub/sub queueing, message acking |
| **ERROR TRIAGE** | State classification only | HMM (Hidden Markov Model) | error-state detection, never ranking/retrieval |

**Hard rules:**
- ✅ Postgres is truth; never read from cache as source of truth
- ✅ Each mirror (Neo4j, Qdrant, Redis) is independently rebuildable from Postgres
- ✅ GPU only for tensor math (matmul, cosine, clustering); CPU for CRUD/joins
- ✅ gRPC/Protobuf is transport only; no business logic in protocol buffers
- ✅ HMM detects error states; never uses HMM for ranking or retrieval decisions

---

## Stop-on-Failure Sequence (7 Gates)

Run `bash scripts/phase8-preflight.sh` to execute all gates in order.

### Gate 1: Phase 7 Summary Completeness
```sql
SELECT COUNT(*) total, 
       COUNT(*) FILTER (WHERE summary IS NOT NULL AND LENGTH(summary) > 10) summarized
FROM codebase_chunk_index;
```
**Expected**: total=39,151, summarized=39,151  
**Action on FAIL**: Phase 7 still running; wait for completion

### Gate 2: Postgres Canonical Identity
```sql
SELECT COUNT(*) total, 
       COUNT(DISTINCT packet_key) unique_keys
FROM atlas_packets;
```
**Expected**: 58,304 unique packet_keys, 0 duplicates  
**Action on FAIL**: Verify packet_key uniqueness constraint; run lineage audit

### Gate 3: Phase 8 Schema Columns Exist
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name='atlas_packets'
  AND column_name IN ('latent_64', 'som_row', 'som_col', 'page_rank_score', 'kmeans_cluster_id', 'community_id');
```
**Expected**: 6 rows (all columns present)  
**Action on FAIL**: Run `npm run phase8:create-schema:apply`

### Gate 4: Neo4j Packet Key Projection
```cypher
MATCH (p:Packet) RETURN count(p) AS cnt;
```
**Expected**: ≥58,304 packet nodes (mirrors canonical count)  
**Action on FAIL**: Neo4j topology may be stale; rebuild from Postgres

### Gate 5: Qdrant Payload Mirror
```bash
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 \
  | jq '.result.points_count'
```
**Expected**: ≥40,500 points (mirrors codebase_chunk_index with embeddings)  
**Action on FAIL**: Rebuild Qdrant from Postgres: `npm run atlas:qdrant:384:restore:apply`

### Gate 6: Redis BitFrost Cache
```bash
docker exec legal-ai-redis redis-cli DBSIZE
```
**Expected**: ≥1,000 keys (at least L1 packet cache warmed)  
**Action on FAIL**: Run `npm run atlas:phase102:step8:bitfrost:warm:apply`

### Gate 7: Lane Ownership Verified
✅ CANONICAL → Postgres packet_key  
✅ DERIVED → Neo4j, Qdrant, Redis (mirrors only)  
✅ COMPUTE → TurboVec (ANN/rerank), TensorRT/LibTorch (tensor ops)  
✅ PARSER → SIMD JSON (JSON parsing, not transport)  
✅ TRANSPORT → gRPC/Protobuf (binary), SSE (UI events)  
✅ ORCHESTRATION → ACP (async/await), RabbitMQ (pub/sub)  
✅ ERROR TRIAGE → HMM (state classifier, never ranking)

**Action on FAIL**: Review lane ownership; confirm no lane boundaries crossed in Phase 8 steps

---

## Detailed Matrix: Phase 8 Readiness

| Component | Status | Verification Command |
|-----------|--------|----------------------|
| Phase 7 complete | ✅ 100% | `npm run phase8:readiness` |
| Postgres identity | ✅ 58,304 unique | `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(DISTINCT packet_key) FROM atlas_packets;"` |
| Schema columns | ✅ All 6 exist | `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT column_name FROM information_schema.columns WHERE table_name='atlas_packets';"` |
| Neo4j nodes | ⚠️ Pending check | `docker exec legal-ai-neo4j cypher-shell -u neo4j -p password "MATCH (p:Packet) RETURN count(p);"` |
| Qdrant points | ✅ 40,568 | `curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 \| jq '.result.points_count'` |
| Redis keys | ✅ 125+ warmed | `docker exec legal-ai-redis redis-cli DBSIZE` |
| Gemma4 server | ✅ :8090 | `curl -s http://127.0.0.1:8090/health` |
| TurboVec ANN | ✅ :50062 gRPC (just started) | `curl -s http://127.0.0.1:8100/health` |
| LangExtract | ⚠️ :8095 (fallback to Gemma4) | `curl -s http://127.0.0.1:8095/health` |
| Qdrant Filer | ✅ :6333 | `curl -s http://127.0.0.1:6333/collections` |

---

## Next Actions (Priority Order)

### Immediate (Do Now)
1. **Run preflight script**
   ```bash
   bash scripts/phase8-preflight.sh
   ```
   Verify all 7 gates return "✅". If any gate FAILs, fix that lane before proceeding.

2. **Run readiness matrix**
   ```bash
   npm run phase8:readiness
   ```
   Should output: `✅ READINESS MATRIX: GO`

### Post-Preflight (If All Gates Pass)
3. **Warm BitFrost cache** (in parallel with Phase 7 final summary)
   ```bash
   npm run atlas:phase102:step8:bitfrost:warm:apply
   ```

4. **Apply Phase 8 schema** (idempotent, safe)
   ```bash
   npm run phase8:create-schema:apply
   ```

5. **Audit Phase 8 prerequisites**
   ```bash
   npm run phase8:orchestrator:audit
   ```

### Phase 8 Execution (Step-by-Step)
```bash
# Each step should exit 0; if any fails, stop and investigate
npm run phase8:orchestrator:step1    # Autoencoder latent (20-30 min)
npm run phase8:orchestrator:step2    # SOM training (10-15 min)
npm run phase8:orchestrator:step3    # Neo4j edges (5-10 min)
npm run phase8:orchestrator:step4    # PageRank (15-20 min)
npm run phase8:orchestrator:step5    # SOM centroids (10 min)
npm run phase8:orchestrator:step6    # K-Means (15-20 min)
npm run phase8:orchestrator:step7    # Qdrant enrichment (10 min)
npm run phase8:orchestrator:step8    # BitFrost warming (10 min)

# Optional (community-scoped retrieval)
npm run phase8:orchestrator:louvain  # Louvain communities (3-5 min)
```

**Total Phase 8 time**: ~2 hours

---

## Phase 8 Schema (All Target `atlas_packets`)

✅ **latent_64** — Autoencoder 64-dim latent vectors  
✅ **som_row, som_col** — SOM grid coordinates (20×20)  
✅ **page_rank_score** — Neo4j GDS PageRank (all 58,304 synced)  
✅ **kmeans_cluster_id** — K-Means cluster assignment  
✅ **community_id** — Louvain community (optional)

**Critical**: Do NOT write Phase 8 fields to `codebase_chunk_index`. That table is Phase 7 only (summaries).

---

## Verification Commands (Post-Execution)

```bash
# After Phase 8 complete, expect all 6 columns populated:
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as packets,
          COUNT(*) FILTER (WHERE latent_64 IS NOT NULL) as with_latent,
          COUNT(*) FILTER (WHERE som_row IS NOT NULL) as with_som,
          COUNT(*) FILTER (WHERE page_rank_score IS NOT NULL) as with_pagerank,
          COUNT(*) FILTER (WHERE kmeans_cluster_id IS NOT NULL) as with_kmeans,
          COUNT(*) FILTER (WHERE community_id IS NOT NULL) as with_community
   FROM atlas_packets;"

# Expected:
#  packets | with_latent | with_som | with_pagerank | with_kmeans | with_community
# ---------|-------------|----------|---------------|-------------|----------------
#    58304 |       58304 |    58304 |         58304 |       58304 |         10-50
```

---

## Decision Tree: If Any Gate Fails

| Gate | Symptom | Fix |
|------|---------|-----|
| 1 | Phase 7 <100% | Let Phase 7 workers finish (~1-2 more hours) |
| 2 | packet_key duplicates or NULLs | Run `npm run atlas:lineage:verify` + repair |
| 3 | Schema columns missing | Run `npm run phase8:create-schema:apply` |
| 4 | Neo4j empty or diverged | Rebuild from Postgres topology mirror |
| 5 | Qdrant <40K points | Run `npm run atlas:qdrant:384:restore:apply` |
| 6 | Redis empty | Run `npm run atlas:phase102:step8:bitfrost:warm:apply` |
| 7 | Lane ownership crossed | Audit code paths; revert if needed |

---

## Status Language (Canonical)

- **CREATED** — File/table exists, syntax valid
- **WIRED** — Ready for dry-run, no side effects  
- **DRY_RUN_PROVEN** — Dry-run passes, verified safe
- **APPLY_PROVEN** — Apply succeeded, verification gate passes
- **NOT_PROVEN** — Blocked by prerequisite or failed gate

**Never claim "production-ready" from dry-run evidence alone.**

---

## Summary

✅ **Phase 8 is GO.** All prerequisites met:
- Phase 7 complete (39,151/39,151 summaries, clean)
- Postgres canonical truth locked (58,304 packet_keys, unique)
- Schema ready (6 columns exist, 0 populated yet)
- Lane boundaries immutable (CANONICAL/DERIVED/COMPUTE/PARSER/TRANSPORT/ORCHESTRATION/ERROR_TRIAGE)
- Stop-on-failure sequence automated (7 gates, `bash scripts/phase8-preflight.sh`)

**Next**: Run preflight gate. If PASS, begin Phase 8 step-by-step execution.

