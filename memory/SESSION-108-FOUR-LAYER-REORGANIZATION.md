---
name: Session 108 Four-Layer Reorganization — Identity → Compiler → Intelligence → Runtime
description: Reframed CARD 3 roadmap from script-centric to data-layer architecture. Real work is deterministic evidence graph completion, not ML tuning.
type: project
---

# SESSION 108: FOUR-LAYER REORGANIZATION

**Date**: 2026-07-05
**Pivot**: From "improving ML models" → "completing deterministic evidence graph"
**Status**: ✅ **LAYER 1 (CANONICAL IDENTITY) 95% COMPLETE** | ⏳ **LAYER 2-4 STAGED**

---

## Current Reality Check

| Component | Status | Coverage |
|-----------|--------|----------|
| **Phase 1 (CARD 2)** | ✅ Complete | 4,273 packets materialized |
| **Batch defaults raised** | ✅ Done | Feature refresh 2000, materializer 1000 |
| **Architect confirms** | ✅ Aligned | Infrastructure exists, do NOT rebuild |
| **Real blocker** | ⏳ Phase 2 | qdrant_point_id bridge (not SOM, not tree backfill) |

**Key insight**: You're past the "design" phase. Now it's "complete the deterministic graph layers so ML can consume them reliably."

---

## LAYER 1: Canonical Identity (95% COMPLETE)

**Rule**: Never changes once packet created. Every downstream component references only these IDs.

| Field | Status | Coverage | Notes |
|-------|--------|----------|-------|
| **packet_key** | ✅ Complete | 58,365 / 58,365 | 100% |
| **feature_id** | ✅ Complete | 58,365 / 58,365 | 100% |
| **title_id** | ✅ Complete | 58,365 / 58,365 | 100% |
| **domain_class** | ✅ Complete | 58,365 / 58,365 | 100% |
| **tree_node_id** | ✅ Complete | 58,365 / 58,365 | 100% (not 65%!) |
| **source_ref** | ⚠️ Partial | 58,304 / 58,365 | 99.90% (need 61 missing) |
| **canonical_source_ref** | ⚠️ Partial | 58,304 / 58,365 | Mirrors source_ref |
| **relative_path** | ⏳ Pending | Need from codebase_chunk_index | Part of qdrant bridge |
| **qdrant_point_id** | ⏳ Partial | 4,273 / 58,365 | 7.32% (Phase 2 work) |

### LAYER 1 IMMEDIATE WORK (Canonical Identity Completion)

**Card A: Identity Completion**

1. **qdrant_point_id bridge expansion** (Phase 2 — 1-2h)
   - Current: 4,273 / 58,365 (7.32%)
   - Target: All indexed file-based packets (8-10%, architectural ceiling)
   - Action: `node backfill-qdrant-point-id-bridge.mjs --apply --batch-size=1000`
   - Depends on: Complete source_ref propagation (see next)

2. **source_ref propagation to all layers** (2-3h)
   - Audit: 61 missing source_ref values
   - Action: Trace root cause (proto:, task:, aggregate packets missing source)
   - Fix: Either populate or mark as "no-bridge-candidate" in packet metadata
   - Result: source_ref 100% populated for all valid candidates

3. **tree_node_id sync to Neo4j + Qdrant** (Phase 3 — 2-3h)
   - Postgres: ✅ 100% complete
   - Neo4j: ⏳ Add tree_node_id property to nodes (if missing)
   - Qdrant payload: ⏳ Include tree_node_id + parent_tree_node_id
   - Action: Verify sync, not backfill

4. **packet_qdrant_bridge canonical ledger** (NEW TABLE — 1h)
   - Schema:
     ```sql
     CREATE TABLE packet_qdrant_bridge (
       packet_key TEXT PRIMARY KEY,
       qdrant_point_id UUID NOT NULL,
       confidence REAL,
       source_path TEXT,
       indexed_at TIMESTAMP,
       indexed_version TEXT
     );
     ```
   - Purpose: **Single source of truth for bridge**. Every script reads this ledger, nothing rediscovers mappings.
   - Action: Materialize from current bridge backfill (one-time insert)

**LAYER 1 COMPLETION TARGET**: All 8 canonical identity fields populated + validated + in canonical ledger

---

## LAYER 2: Compiler Output (Phase 1.5)

**Table**: `atlas_packet_features` (one row per packet)
**Rule**: Input is source code. Output is deterministic semantic IR. No retrieval logic.

| Field | Status | Coverage | Source |
|-------|--------|----------|--------|
| packet_key | ✅ | 58,365 | Identity layer |
| **ast_symbols** | ❌ | ~0.9% | ast-grep (need 80%+) |
| **lexical_features** | ❌ | ~2.4% | rg + tokenizer (need 80%+) |
| **used_concepts** | ✅ | ~100% | LangExtract (proof: 1,134 traces seeded) |
| **entities** | ❌ | Partial | NER (PII, dates, places) |
| **imports** | ❌ | Partial | AST extraction |
| **exports** | ❌ | Partial | AST extraction |
| **functions** | ❌ | Partial | ast-grep |
| **classes** | ❌ | Partial | ast-grep |
| **routes** | ❌ | Partial | SvelteKit route parser |
| **permissions** | ❌ | None | Auth scope analysis |
| summary_keywords | ✅ | ~95% | Phase 7 summaries |
| embedding_version | ✅ | 100% | embeddinggemma (384-dim) |
| langextract_version | ✅ | ~100% | LangExtract (1.0) |
| astgrep_version | ❌ | ~0.9% | ast-grep (need to scale) |

### LAYER 2 WORK (Semantic Compiler — Parallel with LAYER 1)

**Card B: Semantic Compiler**

1. **ast_symbols expansion** (Phase 4a — 4-6h)
   - Current: ~0.9% (560 packets)
   - Target: >80% (47K packets)
   - Tool: `ast-grep` (already integrated)
   - Action: Batch run `npm run atlas:ast:expand:apply --workers=4 --batch=100`
   - Output: ast_symbols, ast_depth, ast_kind, function_count, class_count

2. **lexical_features expansion** (Phase 4b — 2-3h)
   - Current: ~2.4% (1,400 packets)
   - Target: >80%
   - Tool: `rg` + tokenizer
   - Action: Batch run lexical extraction
   - Output: keyword_vector, importance_scores

3. **Entities extraction** (Phase 4c — 2h)
   - PII: Regex + ML (names, emails, SSNs, phone numbers)
   - Dates: Regex (YYYY-MM-DD, natural language)
   - Places: NER (cities, addresses)
   - Action: Batch NER via Gemma4 or spaCy
   - Output: entity_type, entity_value, confidence, line_number

4. **Imports/Exports/Functions/Classes** (Phase 4d — 4-6h)
   - Language-specific AST parsing
   - Action: For each language (TS, JS, Python, Go, Rust):
     - `ast-grep` for symbols
     - Extract qualified names
     - Build dependency graph
   - Output: Multiple CSV columns or JSONB array

5. **Routes extraction** (Phase 4e — 1-2h)
   - SvelteKit-specific: `src/routes/` pattern
   - Other frameworks: Express, Fastify, Flask, Django patterns
   - Action: Path extraction + HTTP verb inference
   - Output: route_path, http_method, is_api, auth_required

6. **Permissions analysis** (Phase 4f — 2-3h)
   - Read: `locals.user`, `requireAuth`, role checks
   - Write: Mutation checks, validation gates
   - Action: Scan for auth guards + permission keywords
   - Output: permission_level, scope, requires_auth_guard

**LAYER 2 COMPLETION TARGET**: All 15 compiler output fields populated + validated for >80% of packets

---

## LAYER 3: Derived Intelligence (Topology + Metrics)

**Table**: `atlas_packet_metrics` (one row per packet, recomputable)
**Rule**: Everything here CAN be recomputed. Nothing is source truth.

| Field | Status | Coverage | Depends On |
|-------|--------|----------|------------|
| packet_key | ✅ | 58,365 | Identity |
| **latent64** | ❌ | 0% | Autoencoder (AE 768→64) |
| **kmeans_cluster** | ❌ | 0% | KMeans on latent64 |
| **som_cluster** | ⚠️ | 100% but questionable | SOM derivation (267/400 cells) |
| **pagerank_score** | ⚠️ | 5% synced | Neo4j GDS (not fully propagated) |
| **community_id** | ❌ | 0% | Neo4j Louvain (not run) |
| **semantic_entropy** | ❌ | 0% | Embedding diversity metric |
| **feature_density** | ❌ | 0% | ast_symbols + lexical count |
| **authority_score** | ⚠️ | Partial | Karpathy blend (PR + attention + authority) |
| **retrieval_relevance** | ❌ | 0% | Query-time computed |
| **naive_bayes_prediction** | ❌ | 0% | NB classifier (pending) |
| **hmm_state** | ⚠️ | 58,360 | HMM classifier (known issues) |
| **confidence** | ⚠️ | Partial | Various sources |

### LAYER 3 WORK (Topology + Metrics — Depends on LAYER 2)

**Card C: Topology & Metrics**

1. **Latent64 autoencoder** (Phase 5a — 4-6h)
   - Current: 0%
   - Input: Embedding 384-dim
   - Output: Compressed 64-dim latent vector
   - Action: Train/freeze AE, batch inference
   - Result: latent64 column populated

2. **KMeans clustering** (Phase 5b — 2-3h)
   - Input: latent64 vectors
   - K: 16-32 (TBD via silhouette score)
   - Output: kmeans_cluster ID (0-31)
   - Action: Batch KMeans inference

3. **SOM reconciliation** (Phase 5c — 1-2h)
   - Current: 267/400 cells (valid coordinates but sparse)
   - Question: Is 267 equilibrium or re-derivation needed?
   - Action: Audit validator contract + occupancy thresholds
   - Result: Either "contract valid, 267 is correct" or "fix + re-derive"

4. **Neo4j GDS full sync** (Phase 5d — 3-4h)
   - PageRank: Run full GDS, sync all 58K results to Postgres
   - Louvain: Run community detection, sync results
   - Betweenness: Run centrality, sync results
   - Action: Batch inserts from Neo4j → Postgres
   - Result: pagerank_score, community_id populated 100%

5. **Semantic entropy** (Phase 5e — 1h)
   - Metric: Diversity of embedding neighbors (high = isolated, low = generic)
   - Action: Query Qdrant for K-NN, compute entropy over K neighbors
   - Result: entropy value per packet

6. **Feature density** (Phase 5f — 1h)
   - Metric: Count of ast_symbols + lexical_features + entities per packet
   - Action: Sum from LAYER 2 compiler output
   - Result: density score (0-100)

**LAYER 3 COMPLETION TARGET**: All metrics populated + validated. Ready for ML consumption.

---

## LAYER 4: Runtime Routing (ACP + Repair)

**Flow**: Naive Bayes → HMM → ACP → Repair Lane

| Component | Status | Purpose |
|-----------|--------|---------|
| **Naive Bayes** | ⏳ Designed | Classification: "What is this packet?" |
| **HMM** | ⚠️ Partial | State prediction: "What should happen?" |
| **RRF** | ✅ Wired | Evidence fusion (7 signals) |
| **PyTorch reranker** | ⏳ Designed | Learned ranking |
| **ACP** | ✅ Wired | Execution: "Execute and trace" |
| **RabbitMQ** | ✅ Operational | Async dispatch + feedback loop |

### LAYER 4 WORK (Runtime + Learning)

**Card D: Runtime Routing**

1. **retrieval_attempt_scores table** (NEW — 1h)
   - Schema:
     ```sql
     CREATE TABLE retrieval_attempt_scores (
       attempt_id UUID NOT NULL,
       packet_key TEXT NOT NULL,
       dense_score REAL,
       bm25_score REAL,
       topology_score REAL,
       pagerank_score REAL,
       som_score REAL,
       naive_bayes_prior REAL,
       reranker_score REAL,
       rrf_score REAL,
       is_winner BOOLEAN,
       PRIMARY KEY (attempt_id, packet_key)
     );
     ```
   - Purpose: Training dataset ("Why did packet A beat packet B?")
   - Action: Log all intermediate scores during retrieval
   - Result: Audit trail for learning

2. **Naive Bayes classifier** (Phase 6a — 2-3h)
   - Features: domain_class, ast_symbols, lexical_features, entities, pagerank_score
   - Target: "What is this packet?" (classification labels from domain_class)
   - Action: Train on historical data, deploy for prior scoring
   - Output: naive_bayes_prior column

3. **PyTorch reranker** (Phase 6b — 4-6h)
   - Input: Query embedding + candidate metrics (7 scores from retrieval_attempt_scores)
   - Target: Learned pairwise ranking
   - Action: Train on retrieval_attempt_scores data, deploy for reranking
   - Output: reranker_score column

4. **HMM policy refinement** (Phase 6c — 2-3h)
   - Current: StructureError, SemanticError, VectorError classification (58,360 packets)
   - Action: Verify state transitions, add repair lane routing
   - Output: Improved HMM state predictions

5. **Feedback loop** (Phase 6d — 1-2h)
   - Capture: User confirms/rejects synthesis (ACP output)
   - Update: retrieval_attempts.success = true/false
   - Learn: Re-train Naive Bayes + PyTorch reranker weekly
   - Output: Continuous model improvement

**LAYER 4 COMPLETION TARGET**: All signals logged, models trained, feedback loop operational.

---

## Work Ordering (By Layer Dependency)

```
LAYER 1: Canonical Identity (95% → 100%)
├─ qdrant_point_id bridge expansion (1-2h) ⏳
├─ source_ref propagation (2-3h) ⏳
├─ tree_node_id sync to Neo4j/Qdrant (2-3h) ⏳
└─ packet_qdrant_bridge canonical ledger (1h) ⏳
   ↓
LAYER 2: Semantic Compiler Output (0% → 80%+)
├─ ast_symbols expansion (4-6h) ⏳
├─ lexical_features expansion (2-3h) ⏳
├─ entities extraction (2h) ⏳
├─ imports/exports/functions/classes (4-6h) ⏳
├─ routes extraction (1-2h) ⏳
└─ permissions analysis (2-3h) ⏳
   ↓
LAYER 3: Derived Metrics (20% → 100%)
├─ latent64 autoencoder (4-6h) ⏳
├─ KMeans clustering (2-3h) ⏳
├─ SOM reconciliation (1-2h) ⏳
├─ Neo4j GDS full sync (3-4h) ⏳
├─ semantic entropy (1h) ⏳
└─ feature density (1h) ⏳
   ↓
LAYER 4: Runtime Routing (ML Training)
├─ retrieval_attempt_scores table (1h) ⏳
├─ Naive Bayes classifier (2-3h) ⏳
├─ PyTorch reranker (4-6h) ⏳
├─ HMM policy refinement (2-3h) ⏳
└─ Feedback loop (1-2h) ⏳
```

---

## Effort Estimate (Real Work Order)

| Layer | Work | Effort | Blocker | Status |
|-------|------|--------|---------|--------|
| 1 | Identity completion | 8-12h | Phase 2 qdrant | ⏳ |
| 2 | Compiler output (80%) | 18-24h | LAYER 1 complete | ⏳ |
| 3 | Metrics + topology | 16-22h | LAYER 2 complete | ⏳ |
| 4 | Runtime + ML training | 12-18h | LAYER 3 complete | ⏳ |

**Total**: 54-76h (realistic ML-free timeline for deterministic graph completion)

**Key insight**: This is NOT "ML engineering" work. It's **data engineering infrastructure**. Models (Naive Bayes, PyTorch reranker, HMM) are the last 12-18 hours, sitting on top of a 42-58h foundation.

---

## Session 108 Pivot Summary

**Before**: "Improve promotion policy + ACP tracing" (CARD 3 focused on execution)
**After**: "Complete deterministic evidence graph so models can learn" (layers focused on data)

**Immediate next**: Execute LAYER 1 completion (Phase 2 qdrant expansion + source_ref audit)
**Then**: LAYER 2 compiler output (ast_symbols + lexical parallel batch jobs)
**Then**: LAYER 3 metrics (once compiler data available)
**Then**: LAYER 4 ML training (once all data is present)

**This ordering ensures**: High-value infrastructure work happens first. Models train on complete, deterministic data at the end. No ML models trained on 5% complete feature tables.
