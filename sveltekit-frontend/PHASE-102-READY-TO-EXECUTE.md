# Phase 102: READY TO EXECUTE ✅

**Date**: July 2, 2026 | **Time**: 21:30 UTC | **Status**: ALL SYSTEMS GREEN

---

## Pre-Flight Verification Complete

### Tier 1: Postgres 18 (Canonical Truth)
```
58,304 packets in atlas_packets ✅
code_features_edges: NOT YET (created in Step 1) ✅
```

### Tier 2: Neo4j GDS (CPU Graph Algorithms)
```
GDS 2.13.10 operational ✅
PageRank algorithm ready ✅
HITS algorithm ready ✅
Louvain algorithm ready ✅
```

### Tier 3: Qdrant (Vector ANN Mirror)
```
Version 1.18.2 ✅
40,572 points in codebase_chunks_768 ✅
Named vectors: content, error, signature ✅
```

### Tier 4: CUDA Sidecar (Optional)
```
Not required for CPU execution ✅
Available if Step 4 latency >2s ✅
```

### Tier 5: CouchDB (MapReduce Views, Optional)
```
Not on critical path ✅
Used for /api/packets/manifest export only ✅
```

### Tier 6: Service Worker (Browser Cache)
```
Read-only cache ready ✅
/api/packets/manifest, /api/search-intelligence/cards ✅
```

### Synthesis & Embedding (Routing Fixed)
```
llama-server :8090 (gemma4-legal-iq4xs-direct.gguf) ✅
  - Chat/synthesis ONLY
  - TurboQuant canonical model
  - 6.3GB VRAM cached

Ollama :11434 (embeddinggemma:latest) ✅
  - Embedding ONLY (384-dim)
  - Mirror to pgvector codebase_chunk_index
  - NOT used for synthesis
```

### Cache Layer (Valkey/Redis)
```
Valkey :6379 ✅
Password: redis ✅
PING response: PONG ✅
```

---

## 12-Step Execution Pipeline

### PHASE A: Identity Foundation (10-15 min)

**Step 1**: Code Features Edges
```bash
npm run atlas:code-features:edges:backfill --dry-run
# Verify 10K+ edges in Neo4j

npm run atlas:code-features:edges:backfill --apply
# Create code_features_edges table in Postgres
```

**Gate**: `SELECT COUNT(*) FROM code_features_edges;` → 10K+

---

### PHASE B: Statistics Computation (10-20 min)

**Step 2**: Neo4j GDS Pipeline
```bash
npm run atlas:code-features:pagerank --dry-run
npm run atlas:code-features:pagerank --apply
# Compute PageRank scores (1-2 min)

npm run atlas:code-features:hits --apply
# Compute HITS authority/hub (30s)

npm run atlas:code-features:louvain --apply
# Compute Louvain communities (30s)
```

**Gate**: `SELECT COUNT(*) FROM feature_statistics WHERE pagerank > 0;` → 58K+

---

### PHASE C: Qdrant Enrichment (10-15 min)

**Step 3**: Feature Statistics Sync
```bash
npm run atlas:feature-statistics:sync --dry-run --batch=100
npm run atlas:feature-statistics:sync --apply --batch=100
# Mirror feature_statistics to Qdrant payloads
```

**Step 4**: Qdrant Payload Tags
```bash
npm run atlas:qdrant:payload-tags:sync --dry-run --batch=100
npm run atlas:qdrant:payload-tags:sync --apply --batch=100
# Add semantic_tags (kind, language, cluster, community)
```

**Gate**: Qdrant payloads have `pagerank`, `community_id`, `semantic_tags`

---

### PHASE D: Ranking Validation (5-10 min)

**Step 5**: Go Retrieval Smoke Test
```bash
npm run go-retrieval:feature-search:smoke --query="authentication session"
# Verify RRF blend (6 signals)
# Expected latency: <2s
```

**Gate**: Output contains "6 signals PASS" and latency <2000ms

---

### PHASE E: Explanation Generation (15-20 min)

**Step 6**: Batch Summaries
```bash
npm run batch:summaries:test10 --query="authentication session"
# Generate 10 Gemma4 summaries (2-3 sentences each)
# Expected: ~1-2s per summary
```

**Gate**: 10 summaries generated, no timeouts, <150 words each

---

### PHASE F: Potentials Layer (15-20 min)

**Step 7**: Apply Potentials Schema
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -f sveltekit-frontend/drizzle/0102_feature_statistics_and_potentials.sql
# Create 4 tables: feature_statistics, packet_potentials, packet_promotion_log, fallback_routing_audit
```

**Step 8**: Populate Potentials
```bash
npm run atlas:potentials:populate --dry-run --batch=100
npm run atlas:potentials:populate --apply --batch=100
# Populate 40K+ soft-routing candidates
```

**Step 9**: Fallback Routing Validation
```bash
npm run atlas:fallback:lexical:smoke
# Verify lexical fallback (low semantic, high noun)

npm run atlas:fallback:deep-research:smoke
# Verify deep-research gate (unknown queries)
```

**Gate**: Both fallback tests PASS

---

### PHASE G: Validation & Production Ready (5 min)

**Step 10**: Full Pipeline Validation
```bash
npm run atlas:unified:validate:full
# All 5 layers operational (identity → statistics → potentials → ranking → explanation)
```

**Step 11**: Production Smoke Test
```bash
npm run atlas:unified:smoke --query="authentication session validation" --verbose
# Expected: ✅ PRODUCTION READY
```

---

## Expected Results

| Phase | Duration | Status | Output |
|-------|----------|--------|--------|
| A | 10-15 min | ✅ READY | 10K+ edges |
| B | 10-20 min | ✅ READY | 58K+ statistics |
| C | 10-15 min | ✅ READY | Qdrant enriched |
| D | 5-10 min | ✅ READY | RRF blend validated |
| E | 15-20 min | ✅ READY | 10 summaries |
| F | 15-20 min | ✅ READY | 40K+ potentials |
| G | 5 min | ✅ READY | Production ready |
| **TOTAL** | **79-115 min** | **✅ READY** | **2 hours** |

---

## Hard Invariants (Non-Negotiable)

### Layer 1: Identity Immutable
- feature_id NEVER changes once written
- source_ref, symbol, kind derived (never stored redundantly)
- No circular dependencies

### Layer 2: Statistics Ephemeral
- feature_statistics can be dropped and rebuilt
- Rebuilding doesn't affect Layer 1 (feature_id stays constant)
- No circular dependencies (stats → ranking only)

### Layer 3: Potentials Safe
- Potentials NEVER feed ranking directly
- Only enable fallback routing (via route_hint)
- External research stays as candidates (confidence < 0.90)

### Layer 4: Ranking Stable
- 6-signal RRF formula immutable
- Component scores all present (no NaN)
- Never changes per-query

### Layer 5: Explanation Bounded
- Summary comes AFTER ranking
- 2-3 sentences, max 150 words
- Doesn't affect ranking

### Layer 6: Cache Integrity
- Postgres is truth; Qdrant/Valkey are mirrors
- Invalidate Valkey AFTER Postgres writes succeed
- Rebuild Qdrant from Postgres if diverged

---

## If Any Step Fails

**DO NOT SKIP TO NEXT STEP**. Instead:

1. **Read the error message carefully**
2. **Check the relevant service** (Postgres, Neo4j, Qdrant)
3. **Run the validation gate** (the SELECT/curl command)
4. **Fix the root cause** (usually missing table or wrong credentials)
5. **Re-run the failed step with --dry-run**
6. **Apply --apply only after dry-run succeeds**

**Rollback**: `git reset --hard HEAD` + restart from Step 1

---

## Architecture Diagram

```
USER QUERY
  ↓
[Layer 6] Service Worker Cache
  ↓ miss
[Layer 1] Postgres (Truth)
  ← [Layer 2] Neo4j PageRank (CPU)
  ↓
[Layer 3] Qdrant ANN Search
  ↓
[Layer 4] RRF Ranking (6 signals)
  ↓
[Optional Layer 4b] CUDA Sidecar (GPU acceleration if needed)
  ↓
[Layer 5] Gemma4 Explanation (:8090 TurboQuant)
  ↓
Result + Summary + Metadata
  ↓
[Layer 6] Service Worker Cache (for next session)
```

---

## Status: GO

✅ All infrastructure operational
✅ All models routed correctly
✅ All caches ready
✅ All databases synchronized

**Begin Step 1 immediately:**
```bash
npm run atlas:code-features:edges:backfill --dry-run
```

Expected: 10K+ edges ready to create
