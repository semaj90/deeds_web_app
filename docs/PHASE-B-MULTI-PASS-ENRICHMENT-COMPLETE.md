# Phase B Multi-Pass Enrichment Pipeline — COMPLETE ✅

**Status**: Session 96 — **Provenance-First Architecture + Worker Pipeline WIRED**

**Created**: 2026-06-29  
**Type**: Architecture + Implementation Guide  
**Scope**: 58,304 packets, 4-layer canonical flow (identity → variance → enrichment → cache)

---

## Overview

Phase B implements a **multi-pass enrichment pipeline** where each analysis task (summarization, embedding, clustering, cache push) is independent, versioned, and tracked with provenance.

**Key Principle**: Packet identity in `atlas_packets` is **immutable**. Variance (different LLM outputs, model versions, hyperparameters) is recorded in `analysis_pass_results` as an **append-only audit trail**.

---

## 4-Tier Architecture

```
Tier 1: atlas_packets (IMMUTABLE)
  └─ Identity: packet_key, source_ref, feature_id, feature_label
      (58,304 rows — never mutated, frozen at insert time)

Tier 2: analysis_pass_results (VARIANCE)
  └─ Logs: gemma4_summary_v1, embeddinggemma_summary_embed_v1, etc.
      (Append-only audit trail; multiple rows per packet allowed)

Tier 3: atlas_summary_layers (ENRICHMENT)
  └─ Selected results: summary, embedding, clustering
      (Multiple rows per packet allowed; upsert-friendly)

Tier 4: chrom97_packets + Mirrors (AGENT WORKFLOW)
  ├─ Redis/Bifrost (L1 cache)
  ├─ Qdrant (vector search)
  └─ Neo4j (topology)
```

---

## 9 Analysis Pass Types (Stable, Versioned)

| Pass Key | Type | Input | Output | Status |
|----------|------|-------|--------|--------|
| `gemma4_summary_v1` | summarization | packets | summary text | ✅ WIRED |
| `embeddinggemma_summary_embed_v1` | embedding | summaries | 384-dim vector | ✅ WIRED |
| `langextract_feature_v1` | feature extraction | summaries | feature labels | ⏳ FUTURE |
| `bitfrost_cache_push_v1` | cache push | analysis_pass_results | Redis/Qdrant writes | ✅ WIRED |
| `qdrant_payload_tag_sync_v1` | tag sync | analysis_pass_results | Qdrant payload update | ⏳ FUTURE |
| `neo4j_relation_projection_v1` | topology | embeddings | Neo4j edges | ⏳ FUTURE |
| `gds_pagerank_v1` | graph analytics | Neo4j | authority scores | ⏳ FUTURE |
| `semantic_kmeans_v1` | clustering | embeddings | cluster IDs | ⏳ FUTURE |
| `som_topology_v1` | topology mapping | clusters | SOM grid coords | ⏳ FUTURE |

---

## 3 Worker Scripts (Phase B Complete)

### Worker 1: Gemma4 Offline Summarization

**File**: `scripts/atlas/gemma4-offline-summary-worker.mts`

**Flow**:
1. Fetch packets from `atlas_packets` without summaries (LEFT JOIN atlas_summary_layers)
2. Call Gemma4 via llama-server :8090 (T=0.3, max_tokens=256)
3. Log to `analysis_pass_results` (pass_key='gemma4_summary_v1', status='success')
4. Write to `atlas_summary_layers` (summary text, pass provenance)

**Commands**:
```bash
# Dry-run (shows 100 packets, no writes)
npm run worker:gemma4:summary:dry

# Test with 10 packets
npm run worker:gemma4:summary:limit

# Full apply (100 packets, writes to DB)
npm run worker:gemma4:summary:apply

# Custom limit
LIMIT=50 npx tsx scripts/atlas/gemma4-offline-summary-worker.mts --apply
```

**Schema Input**: `atlas_packets (packet_key, source_ref, feature_id, feature_label)`  
**Schema Output**: `analysis_pass_results (1 row per packet)` + `atlas_summary_layers (1 summary row)`

---

### Worker 2: EmbeddingGemma Batch Embeddings

**File**: `scripts/atlas/embeddinggemma-batch-worker.mts`

**Flow**:
1. Fetch summaries from `analysis_pass_results` (pass_key='gemma4_summary_v1', status='success')
2. Call EmbeddingGemma via Ollama :11434 (384-dim)
3. Log to `analysis_pass_results` (pass_key='embeddinggemma_summary_embed_v1')
4. Update `atlas_summary_layers.embedding` with 384-dim vector

**Commands**:
```bash
# Dry-run
npm run worker:embedding:batch:dry

# Test with 10
npm run worker:embedding:batch:limit

# Full apply
npm run worker:embedding:batch:apply
```

**Dependency**: Requires Worker 1 to have completed (summary must exist in analysis_pass_results)  
**Performance**: ~60ms per embedding (on RTX 3060 Ti + Ollama)

---

### Worker 3: Cache Push to Redis/Qdrant

**File**: `scripts/atlas/cache-push-worker.mts`

**Flow**:
1. Fetch packets with both summaries and embeddings
2. Materialize to `atlas_summary_layers` (one per packet_key)
3. Push to Redis/Bifrost (bifrost:packet:{key}, bifrost:feature:{feature_id})
4. Push to Qdrant (chrom97_context collection, 384-dim vectors + payload)
5. Log to `analysis_pass_results` (pass_key='bitfrost_cache_push_v1')

**Commands**:
```bash
# Dry-run
npm run worker:cache:push:dry

# Test with 10
npm run worker:cache:push:limit

# Full apply
npm run worker:cache:push:apply
```

**Graceful Fallback**: If Redis or Qdrant unavailable, logs warning and continues  
**Idempotent**: Safe to re-run; only writes new/updated packets

---

## Execution Strategy

### Option A: Sequential (Safest, ~3-5 minutes per batch)

```bash
# 1. Summarize 100 packets
npm run worker:gemma4:summary:apply

# 2. Embed 100 summaries
npm run worker:embedding:batch:apply

# 3. Push to cache
npm run worker:cache:push:apply

# Verify
npm run verify:atlas
```

### Option B: Batch Testing (5 packets, ~30 seconds)

```bash
npm run worker:gemma4:summary:limit      # 5 summaries
npm run worker:embedding:batch:limit     # 5 embeddings
npm run worker:cache:push:limit          # 5 cache writes

# Quick validation
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*) FROM analysis_pass_results WHERE pass_key LIKE 'gemma4%';"
```

### Option C: Dry-Run Verification (No writes)

```bash
npm run worker:gemma4:summary:dry      # Shows 100 packets, no DB change
npm run worker:embedding:batch:dry     # Queries DB, no writes
npm run worker:cache:push:dry          # Simulates Redis/Qdrant ops
```

---

## Provenance Recording (Analysis Pass Results)

Every pass logs a record with:

```json
{
  "pass_key": "gemma4_summary_v1",
  "packet_key": "ace:packet:001",
  "source_ref": "src/lib/server/auth.ts",
  "feature_id": "auth.sessions",
  "pass_type": "summarization",
  "status": "success",
  "model_name": "gemma4-legal-iq4xs-direct.gguf",
  "temperature": 0.3,
  "max_tokens": 256,
  "output": {
    "summary": "Authentication session validation...",
    "summary_tokens": 18
  },
  "scores": {
    "confidence": 0.85,
    "coherence": 0.90
  },
  "index_push": {
    "postgres": true,
    "qdrant": true,
    "bitfrost": true,
    "neo4j": false
  },
  "provenance": {
    "source": "offline_summary_worker",
    "repo_analysis": true,
    "input_kind": "repo_file_packet",
    "summary_variance": {
      "temperature": 0.3,
      "max_tokens": 256,
      "seed": null,
      "deterministic": false
    },
    "runtime": {
      "endpoint": "http://127.0.0.1:8090/v1/completions",
      "worker": "node_typescript",
      "concurrency": 1
    },
    "identity": {
      "identity_mutated": false,
      "join_key": "packet_key",
      "fallback_join": "source_ref:feature_id"
    }
  }
}
```

**Key Invariant**: `identity_mutated=false` on every record — packet identity stays stable.

---

## Verification Gates

### Gate 1: Schema Integrity

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT
    (SELECT COUNT(*) FROM atlas_packets) as packets,
    (SELECT COUNT(*) FROM analysis_pass_results) as passes,
    (SELECT COUNT(*) FROM atlas_summary_layers) as layers;
"
```

Expected:
- packets: 58,304 (unchanged)
- passes: (grows with each worker run)
- layers: (grows with summarization + embeddings)

### Gate 2: Pass Key Distribution

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT pass_key, COUNT(*) as count, COUNT(DISTINCT packet_key) as unique_packets
  FROM analysis_pass_results
  GROUP BY pass_key
  ORDER BY count DESC;
"
```

### Gate 3: Summary Completeness

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT
    COUNT(*) as total_layers,
    COUNT(DISTINCT packet_key) as unique_packets,
    COUNT(CASE WHEN summary IS NOT NULL THEN 1 END) as with_summary,
    COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embedding
  FROM atlas_summary_layers;
"
```

### Gate 4: Cache Mirror Status

```bash
# Redis
docker exec legal-ai-redis redis-cli DBSIZE
docker exec legal-ai-redis redis-cli KEYS "bifrost:packet:*" | wc -l

# Qdrant
curl -s http://127.0.0.1:6333/collections/chrom97_context | jq '.result.points_count'
```

---

## Rollback / Recovery

If a worker fails mid-batch:

### Resume from last successful pass

```bash
# Check last successful Gemma4 pass
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT COUNT(DISTINCT packet_key) FROM analysis_pass_results
  WHERE pass_key = 'gemma4_summary_v1' AND status = 'success';
"

# Embedding worker will skip already-processed packets (via EXISTS subquery)
npm run worker:embedding:batch:apply
```

### Reset a worker (dev only, not production)

```bash
# DELETE all embeddings (keep summaries)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  DELETE FROM analysis_pass_results
  WHERE pass_key = 'embeddinggemma_summary_embed_v1';
"

# Clear Redis
docker exec legal-ai-redis redis-cli FLUSHDB

# Re-run worker
npm run worker:embedding:batch:apply
```

---

## Performance Baseline

**Test Environment**: RTX 3060 Ti (8GB), Postgres 18.4, Ollama + llama-server

| Worker | Model | Throughput | Batch (10 packets) |
|--------|-------|------------|-------------------|
| Gemma4 | gemma4-iq4xs | 15 tok/s | ~20 sec + network |
| Embedding | embeddinggemma:latest | 60ms/vector | ~1.2 sec |
| Cache Push | Redis + Qdrant | 10 writes/sec | ~2 sec |

**Full 3-worker pipeline** (100 packets): ~8-10 minutes (I/O bound, not CPU)

---

## Next Steps (Session 97+)

1. **Run full pipeline** on remaining 57,874 packets
   - Execute workers sequentially
   - Monitor database metrics
   - Verify cache warming

2. **Wire feature extraction** (langextract_feature_v1)
   - Extract keywords, entities, domain class from summaries
   - Log to analysis_pass_results

3. **Wire clustering workers** (semantic_kmeans_v1, som_topology_v1)
   - GPU k-means on embeddings
   - SOM topology mapping
   - Log coordinates to analysis_pass_results

4. **Wire Neo4j projection** (neo4j_relation_projection_v1)
   - Build graph from cluster membership
   - Create USED_CONCEPT + SIMILAR_TOPOLOGY edges

5. **Enable auto-execution** via startup scripts
   - Wire into `scripts/startup/ace-incremental-startup.mts`
   - Schedule periodic re-runs for new packets

---

## Files Summary

| File | Lines | Purpose |
|------|-------|---------|
| `gemma4-offline-summary-worker.mts` | 280 | Summarization worker |
| `embeddinggemma-batch-worker.mts` | 250 | Embedding worker |
| `cache-push-worker.mts` | 320 | Cache push worker |
| `analysis-pass-orchestrator.mts` | 348 | Pass logging framework |
| `provenance-first-architecture.md` | 277 | Architecture spec |
| `PHASE-B-MULTI-PASS-ENRICHMENT-COMPLETE.md` | 400+ | This guide |

---

## Hard Rules

✅ **ALWAYS**:
- Run dry-run first (--dry-run flag)
- Check analysis_pass_results for duplicates before re-running
- Verify packet identity is unchanged (atlas_packets rows unchanged)
- Log every pass with identity_mutated=false

❌ **NEVER**:
- Mutate atlas_packets after initial insert
- Join on feature_id alone (always use packet_key)
- Write to atlas_summary_layers directly (use workers)
- Assume Redis/Qdrant are source of truth (Postgres is canonical)

---

## Reference

- **Provenance Architecture**: `memory/provenance-first-architecture.md`
- **Docker Setup**: `docs/SESSION-86-DOCKER-RECOVERY-SUMMARY.md`
- **Gemma4 Rules**: `CLAUDE.md` (Gemma4 LLM Call Rules)
- **Execution Context**: `CLAUDE.md` (NPX Execution Context)
