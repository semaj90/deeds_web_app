# OpenSpec: Structural Identity + Semantic Indexing Roadmap (Phases 3A–5)

**Date**: 2026-07-27  
**Status**: DESIGN COMPLETE, NOT YET AUTHORIZED FOR IMPLEMENTATION  
**Canonical Authority**: Parent Atlas P0–P7 Roadmap + Frozen Identity Contract  
**Critical Constraint**: "Do not start with PyTorch, K-means, DiskANN, or TurboVec. They all need stable rows and labels to operate on."

---

## Executive Summary

This OpenSpec defines the **correct execution spine** for transitioning from incomplete structural identity to production-ready semantic indexing. It replaces premature GPU work (SOM, K-means, ANN) with deterministic, reproducible infrastructure that establishes:

1. **Canonical packet identity** (tree_node_id, feature_id, feature_label)
2. **Structural authority** (AST facts, dependency graphs, ontology observations)
3. **Semantic projections** (deterministic embeddings, confidence tracking)
4. **Search baselines** (exact, pgvector, Qdrant benchmarks)
5. **Classifiers** (Naive Bayes → XGBoost → PyTorch)
6. **Rankers** (RRF → XGBRanker → cross-encoder)

**Critical Path**: 7 Batches (A–G), ~24–32 hours of work, **unblocks GPU indexing** only after Batch E search experiments validate that identity is stable.

---

## Problem Statement

**Current State**:
- ✅ Postgres atlas_packets: 58,304 rows (identity + metadata)
- ✅ codebase_chunk_index: 40,754 chunks with embeddings (768-dim native)
- ✅ Qdrant: 40,568 mirrored points (read-only)
- ❌ tree_node_id: not fully materialized (only tree-sitter parse trees exist)
- ❌ feature_id: not fully materialized (only file/function paths exist)
- ❌ feature_label: not governed (Phase 1.5 observations exist, no promotion flow)
- ❌ domain_membership: not fully established
- ❌ training_labels: not frozen
- ❌ Naive Bayes classifier: does not exist
- ❌ XGBoost ranker: does not exist
- ❌ PyTorch model: does not exist

**Root Cause**: Any ANN index built NOW will need to be rebuilt when identity stabilizes. We are adding layers on an incomplete foundation.

**Solution**: Establish **canonical identity contracts** (Batches A–C) **before** adding semantic indexes (Batches D–G).

---

## Batch A: Structural Authority Materialization

### Objective
Prove that every AST node, function, class, import, and call site has a stable, reproducible identity. Record parent/child relationships and source revisions.

### Inputs
- All TypeScript/JavaScript source files (27,704 files)
- tree-sitter parser (native binary, language-agnostic)
- Git commit SHA (workspace_revision)

### Outputs
- **atlas_tree_nodes** table (Postgres)
  - tree_node_version_id (UUID, UNIQUE)
  - tree_node_id (stable identifier for named symbols)
  - tree_node_kind (function, class, export, import, call_site, etc.)
  - source_ref (file path)
  - workspace_revision (git commit SHA)
  - byte_start, byte_end (source location)
  - symbol_path (namespace::class::method)
  - node_content_hash (SHA256 of node text)
  - parent_tree_node_id (NULLABLE, for nesting)
  - parser_version (e.g., "tree-sitter 0.21.0")
  - created_at, updated_at

- **atlas_tree_edges** table (Postgres)
  - source_tree_node_id
  - target_tree_node_id
  - edge_kind (IMPORTS, CALLS, INHERITS, DEPENDS_ON, etc.)
  - workspace_revision
  - created_at

- Validation report: `batch-a-structural-audit.json`

### Success Criteria (Hard Gates)

| Gate | Condition | Pass Threshold |
|------|-----------|-----------------|
| **A1** | Coverage — tree_node_version_id exists for ≥95% of AST nodes | ≥95% |
| **A2** | Uniqueness — zero duplicate tree_node_version_id values | 0 duplicates |
| **A3** | Determinism — re-run produces identical row hashes | 100% row match |
| **A4** | Parent/child integrity — no cycles in parent_tree_node_id pointers | 0 cycles |
| **A5** | Edge integrity — source_tree_node_id and target_tree_node_id both exist | 100% exist |

### Deliverables

| File | Type | Purpose |
|------|------|---------|
| `scripts/atlas/batch-a-structural-materializer.mts` | Script | Tree-sitter parser, node/edge extraction, DB persistence |
| `scripts/atlas/batch-a-determinism-validator.mts` | Script | Re-run verification, row-by-row comparison |
| `batch-a-structural-audit.json` | Report | Gate results, node count, edge count, timing |

### Estimated Effort
**4–6 hours**

- Tree-sitter parsing + node hashing: 2–3h
- Edge recording: 1h
- Validation gates: 1–2h

### Dependencies
- None (first Batch)

### Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| tree-sitter parsing failures on edge-case syntax | Catch parsing errors, record `parse_error_reason`, continue (non-blocking) |
| Duplicate tree_node_version_id generation | Use deterministic hash: `sha256(workspace_revision + source_ref + node_kind + byte_start + byte_end + node_text_hash + parser_version)` |
| Database connection timeout on 27K+ files | Batch writes (1,000 nodes per transaction), use connection pooling |
| Symbol path collision (same method name in different classes) | Include full namespace path, disambiguate with byte_start + byte_end |

### Next Gate
**PROCEED ONLY IF ALL GATES PASS.** If A1–A5 fail, root-cause and repeat until deterministic.

---

## Batch B: Feature Identity Derivation

### Objective
Define deterministic rules for feature_id generation. Map tree_node_id clusters into logical features (functions, classes, modules, exports).

### Inputs
- atlas_tree_nodes (from Batch A)
- atlas_tree_edges (from Batch A)
- Phase 1.5 domain ontology (feature kinds: function, class, module, export, hook, middleware, etc.)

### Outputs
- **atlas_features** table (Postgres)
  - feature_id (stable UUID, UNIQUE)
  - feature_kind (function, class, module, export, hook, middleware, service, utility)
  - feature_label (human-readable name, e.g., "Authentication Sessions")
  - canonical_tree_node_id (primary tree node, usually the export or declaration)
  - workspace_revision (git commit SHA)
  - semantic_text (generated description from symbol_path + comments)
  - domain_class (NULL for now, filled in Batch C)
  - created_at, updated_at

- **atlas_tree_to_feature** mapping table (Postgres)
  - tree_node_id (may be many-to-one to feature_id)
  - feature_id
  - mapping_kind (primary, related, test, mock, etc.)
  - workspace_revision
  - created_at

- Validation report: `batch-b-feature-identity-audit.json`

### Feature ID Rules (Deterministic)

**Rule 1: Named Exports**
```
feature_id = hash(workspace_revision + source_ref + "export" + symbol_name)
```

**Rule 2: Top-Level Functions**
```
feature_id = hash(workspace_revision + source_ref + "function" + symbol_path)
```

**Rule 3: Classes**
```
feature_id = hash(workspace_revision + source_ref + "class" + symbol_path)
```

**Rule 4: Modules (directories)**
```
feature_id = hash(workspace_revision + directory_path + "module")
```

**Rule 5: Unresolved (orphan nodes)**
```
feature_id = hash(workspace_revision + source_ref + "unresolved" + byte_start)
```

### Success Criteria (Hard Gates)

| Gate | Condition | Pass Threshold |
|------|-----------|-----------------|
| **B1** | Coverage — feature_id assigned for ≥80% of tree_node_id | ≥80% |
| **B2** | Uniqueness — zero duplicate feature_id values | 0 duplicates |
| **B3** | Determinism — re-run produces identical feature_id for same input | 100% |
| **B4** | Mapping integrity — tree_to_feature rows reference existing trees and features | 100% |
| **B5** | Orphan containment — unresolved features ≤5% of total | ≤5% |

### Deliverables

| File | Type | Purpose |
|------|------|---------|
| `scripts/atlas/batch-b-feature-identity-builder.mts` | Script | Feature extraction, mapping, DB persistence |
| `scripts/atlas/batch-b-determinism-validator.mts` | Script | Re-run verification |
| `batch-b-feature-identity-audit.json` | Report | Gate results, feature count by kind |

### Estimated Effort
**3–4 hours**

- Feature extraction rules: 1h
- Mapping generation: 1–2h
- Validation gates: 1h

### Dependencies
- **REQUIRED**: Batch A PASS (atlas_tree_nodes, atlas_tree_edges must exist)

### Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Many tree nodes → single feature creates bloat | Use mapping_kind="related" to distinguish primary from secondary; limit one canonical per feature |
| Export name collision across files | Include source_ref in hash to disambiguate |
| Orphan nodes exceed threshold | Set feature_kind="unresolved", route to human review in Batch C |

### Next Gate
**PROCEED ONLY IF B1–B5 PASS.**

---

## Batch C: Ontology Observations (Label Pipeline)

### Objective
Convert structural facts into labeled observations. Build a **reviewed 1,000-feature control set** for classifier training (Phase F).

### Inputs
- atlas_features (from Batch B)
- Phase 1.5 domain ontology (40 unique labels, 18 ACTIVE)
- ast-grep structural labeling rules (code patterns → domain hints)

### Outputs
- **atlas_observations** table (Postgres)
  - observation_id (UUID, UNIQUE)
  - feature_id
  - lane (semantic, lexical, structural, domain_membership, identity)
  - observation_value (domain label, confidence score, reasoning)
  - observation_source (ast-grep rule ID, phase, human reviewer)
  - confidence (0.0–1.0, reflects source certainty)
  - created_at, reviewed_at (NULL if not promoted)

- **atlas_feature_labels** table (Postgres) — **Promotions only**
  - feature_id
  - label (canonical domain label, e.g., "authentication", "data-access", "utility")
  - promotion_source (observation_id that was promoted)
  - promotion_timestamp
  - reviewer (human or agent who validated)
  - locked (TRUE = no further edits without audit trail)

- Control set export: `control-set-1k-reviewed.ndjson` (1,000 features with locked labels)

- Validation report: `batch-c-ontology-audit.json`

### Important: No Automatic Promotion

**Observations are NOT labels.** Observations are **evidence** for labels. The flow is:
1. ast-grep emits `observations` (low confidence, heuristic)
2. Human or agent reviews observations
3. **Only after review**, emit `atlas_feature_labels` row (promotion)
4. Label becomes locked (immutable for classifier training)

This prevents Label Leakage and ensures data quality.

### Success Criteria (Hard Gates)

| Gate | Condition | Pass Threshold |
|------|-----------|-----------------|
| **C1** | Observation coverage — ≥4 observations per feature (avg) | ≥4 per feature |
| **C2** | Label coverage — ≥1 promoted label per control-set feature | 100% of control set |
| **C3** | Domain diversity — ≥6 active domains represented in control set | ≥6 domains |
| **C4** | Confidence calibration — avg observation confidence ≥0.65 | ≥0.65 |
| **C5** | Locked label immutability — 0 edits to locked labels | 0 edits |

### Deliverables

| File | Type | Purpose |
|------|------|---------|
| `scripts/atlas/batch-c-ontology-observation-emitter.mts` | Script | ast-grep rules, observation generation, promotion workflow |
| `scripts/atlas/batch-c-control-set-reviewer.mts` | Script | Interactive review UI, promotion authorization, locked label emission |
| `control-set-1k-reviewed.ndjson` | Data | 1,000 features with locked labels, ready for Batch F training |
| `batch-c-ontology-audit.json` | Report | Gate results, domain distribution, confidence histogram |

### Estimated Effort
**5–7 hours**

- ast-grep rule definition: 1–2h
- Observation emission: 1–2h
- Control set review (1,000 features × 2 min each): 30–40 min
- Validation gates: 1h

### Dependencies
- **REQUIRED**: Batch B PASS (atlas_features must exist)

### Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| ast-grep rule false positives → noisy observations | Calibrate confidence scores based on ground truth; filter low-confidence before review |
| Reviewer bottleneck (1,000 features takes too long) | Use agent-assisted review (Gemma4 ranks observations by confidence, human approves top-N per domain) |
| Label drift (different reviewers assign different labels) | Lock labels immediately after promotion; require audit trail for changes |
| Unresolved features (from B5) block control set | Treat unresolved as a valid label category; include ≤5% in control set |

### Next Gate
**PROCEED ONLY IF C1–C5 PASS.**

---

## Batch D: Semantic Projections (Embedding Pipeline)

### Objective
Generate deterministic, reproducible embeddings with confidence tracking. NO GPU work yet.

### Inputs
- atlas_features (from Batch B)
- control-set-1k-reviewed (from Batch C)
- Ollama embeddinggemma:latest (768-dim, canonical model)
- Tokenizer specification (tiktoken, sentencepiece, etc.)

### Outputs
- **atlas_semantic_embeddings** table (Postgres)
  - feature_id
  - semantic_text (deterministic input to embedding function)
  - semantic_text_hash (SHA256, input to cache)
  - tokenizer_name (e.g., "sentencepiece-xT5")
  - tokenizer_version
  - token_count
  - embedding_model ("embeddinggemma:latest")
  - embedding_model_revision (commit hash from Ollama)
  - embedding (768-dim float array)
  - embedding_finite (all components finite, not NaN/Inf)
  - embedding_confidence (0.0–1.0, reflects input quality)
  - created_at, embedding_timestamp

- Optional post-alignment: `atlas_semantic_embeddings_384_mrl` (truncated via Matryoshka, NOT used for search yet)

- Validation report: `batch-d-embedding-audit.json`

### Deterministic Semantic Text Rules

Each feature gets a deterministic text projection:

```
semantic_text = [
  "Feature: <feature_kind>",
  "Name: <feature_label>",
  "File: <source_ref>",
  "Symbol: <symbol_path>",
  "Summary: <extracted_comments_or_docstring>",
  "Edges: <dependency_summary>"
].join(" ")
```

Example:
```
Feature: function
Name: validateSession
File: src/lib/server/auth.ts
Symbol: auth::validateSession
Summary: Checks if Lucia session is valid and not expired
Edges: imports=lucia, calls=sessionCache.get, called_by=api.users
```

### Success Criteria (Hard Gates)

| Gate | Condition | Pass Threshold |
|------|-----------|-----------------|
| **D1** | Coverage — embeddings generated for ≥95% of control set | ≥95% |
| **D2** | Determinism — same input → same embedding (bit-for-bit) | 100% |
| **D3** | Dimensionality — all embeddings are exactly 768-dim | 100% |
| **D4** | Finiteness — 0 NaN/Inf components | 0 invalid |
| **D5** | Confidence tracking — embedding_confidence properly recorded | 100% recorded |

### Deliverables

| File | Type | Purpose |
|------|------|---------|
| `scripts/atlas/batch-d-semantic-embedder.mts` | Script | semantic_text generation, Ollama call, embedding storage |
| `scripts/atlas/batch-d-determinism-validator.mts` | Script | Re-run verification, hash comparison |
| `batch-d-embedding-audit.json` | Report | Gate results, dimension histogram, confidence distribution |

### Estimated Effort
**3–4 hours**

- semantic_text rules definition: 30 min
- Ollama integration: 1h
- Embedding loop + storage: 1–1.5h
- Validation gates: 30 min

### Dependencies
- **REQUIRED**: Batch C PASS (control-set-1k-reviewed must exist)
- **OPTIONAL**: Ollama embeddinggemma:latest running on :11434

### Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Ollama service unavailable | Implement retry loop with exponential backoff; record failed features, re-run after service restart |
| Non-deterministic tokenizer (different versions) → different embeddings | Pin tokenizer version in metadata; validate at read-time that version matches stored version |
| Semantic text generation includes mutable data (timestamps) | Use ONLY static, structure-based text; exclude timestamps, comments with dates |
| 768-dim storage bloats Postgres | Use `vector` type (pgvector native support), standard 768-dim indexing |

### Next Gate
**PROCEED ONLY IF D1–D5 PASS.**

---

## Batch E: Search Experiments (Baselines)

### Objective
Establish performance baselines BEFORE adding GPU acceleration. Measure recall, latency, and ranking quality on exact search, pgvector HNSW, and Qdrant.

### Inputs
- atlas_semantic_embeddings (from Batch D)
- control-set-1k-reviewed (from Batch C)
- Postgres pgvector (768-dim, native support)
- Qdrant (existing `codebase_chunks_768` collection)

### Outputs
- Baseline results: `batch-e-search-baselines.json`
  ```json
  {
    "experiments": [
      {
        "engine": "exact_search",
        "query_count": 23,
        "recall_at_10": 0.42,
        "latency_p50_ms": 120,
        "latency_p95_ms": 450
      },
      {
        "engine": "pgvector_hnsw",
        "index_type": "hnsw",
        "index_params": { "m": 16, "ef_construction": 64 },
        "query_count": 23,
        "recall_at_10": 0.88,
        "latency_p50_ms": 45,
        "latency_p95_ms": 120
      },
      {
        "engine": "qdrant",
        "collection": "codebase_chunks_768",
        "query_count": 23,
        "recall_at_10": 0.91,
        "latency_p50_ms": 38,
        "latency_p95_ms": 95
      }
    ],
    "winner": "qdrant",
    "recommendation": "Use Qdrant for primary ANN; pgvector as fallback"
  }
  ```

- Validation report: `batch-e-search-audit.json`

### Benchmark Queries
Use 23 domain-specific queries (one per active domain in control set):
- authentication, data-access, ui, utility, middleware, error-handling, etc.
- Each query has a known ground-truth set of "relevant features" (manually curated)

### Success Criteria (Hard Gates)

| Gate | Condition | Pass Threshold |
|------|-----------|-----------------|
| **E1** | Coverage — all 3 engines (exact, pgvector, Qdrant) complete 23 queries | 100% |
| **E2** | Recall — pgvector/Qdrant recall@10 ≥0.80 (vs exact ≤0.50) | ≥0.80 |
| **E3** | Latency — Qdrant p95 <150ms (production acceptable) | <150ms |
| **E4** | Consistency — 2nd run produces ±5% latency variance | ±5% |
| **E5** | Determinism — query embedding + candidate set are reproducible | 100% |

### Deliverables

| File | Type | Purpose |
|------|------|---------|
| `scripts/atlas/batch-e-search-benchmarker.mts` | Script | Query embedding, 3-engine loop, latency tracking, recall calculation |
| `benchmark-queries.ndjson` | Data | 23 queries + ground-truth relevance sets |
| `batch-e-search-baselines.json` | Report | Full results, latency histograms, recall distributions |
| `batch-e-search-audit.json` | Report | Gate results, recommendations |

### Estimated Effort
**4–5 hours**

- Benchmark query curation: 1h
- 3-engine implementation: 2–2.5h
- Latency profiling: 30 min–1h
- Analysis + recommendations: 30 min

### Dependencies
- **REQUIRED**: Batch D PASS (embeddings must exist)
- **REQUIRED**: Qdrant running with `codebase_chunks_768` collection
- **OPTIONAL**: pgvector HNSW index on `atlas_semantic_embeddings` (can be created during E1)

### Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Qdrant collection is stale (doesn't match Batch D embeddings) | Sync Qdrant from Postgres before running benchmarks; verify point count matches feature count |
| pgvector index not built → slower than should be | Create HNSW index before benchmarking; exclude index build time from query latency |
| Ground truth queries are biased toward certain domains | Stratified random sample (2–3 per domain from control set) |
| Latency variance too high (not reproducible) → cache effects | Run on isolated machine, cold-start all services, repeat 3× |

### **CRITICAL GATE**: If Batch E **FAILS** E2 or E3, **DO NOT PROCEED** to GPU acceleration. Diagnose before advancing.

### Next Gate
**PROCEED ONLY IF E1–E5 PASS.**

---

## Batch F: Classification (Supervised Learning)

### Objective
Train classifiers to predict domain_class for unlabeled features. Start with Naive Bayes, then XGBoost, defer PyTorch.

### Inputs
- atlas_semantic_embeddings (from Batch D)
- atlas_feature_labels (from Batch C, the **locked** labels only)
- control-set-1k-reviewed (1,000 features with domain labels)

### Outputs
- **Naive Bayes classifier** (scikit-learn, exportable to .pkl)
  - Input: 768-dim embedding
  - Output: predicted domain, confidence per class
  - Metrics: accuracy, macro-F1, per-domain precision/recall
  - Report: `batch-f-nb-evaluation.json`

- **XGBoost classifier** (trained after NB baseline)
  - Input: 768-dim embedding (same feature space)
  - Output: predicted domain, confidence per class, feature importance
  - Metrics: accuracy, macro-F1, per-domain metrics
  - Report: `batch-f-xgb-evaluation.json`
  - Model file: `atlas-domain-classifier-xgboost.xgb` (serialized)

- **Training metadata**:
  - `atlas_classifier_manifest.json` — schema version, model hash, training timestamp, class list, feature count

- Validation report: `batch-f-classification-audit.json`

### Success Criteria (Hard Gates)

| Gate | Condition | Pass Threshold |
|------|-----------|-----------------|
| **F1** | Baseline — Naive Bayes accuracy ≥0.55 (better than random) | ≥0.55 |
| **F2** | Improvement — XGBoost accuracy ≥0.75 (25% over NB) | ≥0.75 |
| **F3** | Domain coverage — all 18 active domains represented in training | 18/18 |
| **F4** | Per-domain — macro-F1 ≥0.70 (no domain <0.60 F1) | ≥0.70 macro, >0.60 per domain |
| **F5** | Reproducibility — re-train on same data → same model hash | 100% deterministic |

### Classifier Specs

**Naive Bayes**:
```python
from sklearn.naive_bayes import GaussianNB
model = GaussianNB()
model.fit(X_train_768, y_train_labels)
y_pred = model.predict(X_test_768)
y_proba = model.predict_proba(X_test_768)  # confidences
```

**XGBoost**:
```python
import xgboost as xgb
model = xgb.XGBClassifier(
  n_estimators=200,
  max_depth=6,
  learning_rate=0.1,
  random_state=42  # Determinism
)
model.fit(X_train_768, y_train_labels, eval_set=[(X_val_768, y_val_labels)])
y_pred = model.predict(X_test_768)
y_proba = model.predict_proba(X_test_768)
importances = model.feature_importances_  # Top 768 dimensions
```

### Deliverables

| File | Type | Purpose |
|------|------|---------|
| `scripts/atlas/batch-f-naive-bayes-trainer.mts` (Python via subprocess) | Script | NB model training, evaluation, serialization |
| `scripts/atlas/batch-f-xgboost-trainer.mts` (Python via subprocess) | Script | XGB model training, evaluation, feature importance |
| `scripts/atlas/batch-f-classification-validator.mts` | Script | Reproducibility check, per-domain metrics |
| `atlas-domain-classifier-naive-bayes.pkl` | Model | Serialized NB classifier |
| `atlas-domain-classifier-xgboost.xgb` | Model | Serialized XGB classifier |
| `atlas_classifier_manifest.json` | Metadata | Schema, training time, class list, feature count |
| `batch-f-*-evaluation.json` | Report | Metrics, confusion matrices, per-domain breakdowns |
| `batch-f-classification-audit.json` | Report | Gate results, recommendations |

### Estimated Effort
**6–8 hours**

- Data preparation (feature matrix, label encoding): 1–1.5h
- Naive Bayes training + evaluation: 1.5–2h
- XGBoost tuning + training: 2–3h
- Reproducibility validation: 1h
- Reporting + per-domain analysis: 1h

### Dependencies
- **REQUIRED**: Batch D PASS (embeddings must exist)
- **REQUIRED**: Batch C PASS (locked labels must exist)
- **OPTIONAL**: scikit-learn, xgboost (Python packages)

### Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| XGBoost overfits on 1,000 training samples | Use 70/15/15 train/val/test split; early stopping on validation set; monitor train vs val accuracy |
| Rare domains (1–2 examples) → poor F1 | Oversample via SMOTE or class weighting; report F1 per domain; accept <0.60 F1 for n<5 classes |
| Random seed non-determinism → different model weights | Set random_state=42 everywhere (sklearn, xgboost, numpy); validate model hash |
| Pickle serialization not reproducible | Serialize to .pkl + compute model SHA256; re-deserialize and verify SHA matches |

### Next Gate
**PROCEED ONLY IF F1–F5 PASS.**

---

## Batch G: Ranking (Candidate Reranking)

### Objective
Train a learning-to-rank model (XGBRanker) that reranks candidate features retrieved by Batch E search engines.

### Inputs
- Search candidates from Batch E (top-20 per query, 23 queries)
- Relevance judgments (ground-truth binary: relevant or not)
- Candidate feature matrix (768-dim embedding + structural features)

### Outputs
- **XGBRanker model** (LTR variant of XGBoost)
  - Input: embedding + candidate rank position + query context
  - Output: relevance score (higher = more relevant)
  - Metrics: NDCG@5, NDCG@10, recall@10
  - Model file: `atlas-ranking-model-xgbranker.xgb`

- **Cross-encoder reranker** (optional, for top-5 final reranking)
  - Input: query + candidate feature pair
  - Output: relevance score
  - Framework: Sentence Transformers or similar

- Validation report: `batch-g-ranking-audit.json`

### Success Criteria (Hard Gates)

| Gate | Condition | Pass Threshold |
|------|-----------|-----------------|
| **G1** | Coverage — ranking model trained on ≥90% of retrieval candidates | ≥90% |
| **G2** | Improvement — NDCG@5 ≥0.70 (reranked vs baseline) | ≥0.70 |
| **G3** | Stability — NDCG@10 within 90% of NDCG@5 (no cliff drop) | ≥0.90×NDCG@5 |
| **G4** | Reproducibility — re-train → same model hash | 100% deterministic |
| **G5** | Latency — reranking top-20 in <50ms (production acceptable) | <50ms |

### Ranking Features (Candidate-level)

```python
features = {
  'embedding_similarity': float,           # Query-candidate cosine
  'rank_position': int,                    # 1–20 from retrieval
  'domain_match': float,                   # 1.0 if domain aligns, 0.0 else
  'pagerank_score': float,                 # Authority (from Batch A edges)
  'feature_kind_match': float,             # 1.0 if same kind as query, else 0.0
  'label_confidence': float,                # Confidence of domain label (from Batch C)
}
```

### Deliverables

| File | Type | Purpose |
|------|------|---------|
| `scripts/atlas/batch-g-ranking-trainer.mts` (Python via subprocess) | Script | Feature matrix generation, XGBRanker training, NDCG calculation |
| `scripts/atlas/batch-g-ranking-validator.mts` | Script | Reproducibility check, latency profiling |
| `atlas-ranking-model-xgbranker.xgb` | Model | Serialized LTR model |
| `batch-g-ranking-audit.json` | Report | Gate results, NDCG breakdown by query, latency histogram |

### Estimated Effort
**4–5 hours**

- Ranking feature engineering: 1–1.5h
- XGBRanker training: 1.5–2h
- NDCG/recall calculation: 1h
- Latency profiling + optimization: 30 min–1h

### Dependencies
- **REQUIRED**: Batch E PASS (retrieval candidates + ground truth must exist)
- **REQUIRED**: Batch A PASS (PageRank-like scores for authority features)
- **OPTIONAL**: Sentence Transformers (for optional cross-encoder)

### Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Learning-to-rank requires qid (query group ID) | Include qid in XGBRanker dataset; group candidates by query; train with `eval_metric='ndcg'` |
| Top-5 may have different quality than top-20 | Stratify relevance distribution across all positions; report NDCG@K for K=1,5,10 |
| Cross-encoder inference is slow (>50ms) | Use only as optional post-processing for top-5; measure latency before committing |
| Relevance judgments are subjective (human bias) | Use ≥2 judges per query; compute inter-rater agreement; adjudicate disagreements |

### Next Gate
**PROCEED ONLY IF G1–G5 PASS.**

---

## Critical Path Summary

| Batch | Effort | Blocker | Unlock |
|-------|--------|---------|--------|
| **A** | 4–6h | None | B |
| **B** | 3–4h | A PASS | C |
| **C** | 5–7h | B PASS | D |
| **D** | 3–4h | C PASS | E |
| **E** | 4–5h | D PASS | F, GPU work (IF E PASS) |
| **F** | 6–8h | D+C PASS | G, PyTorch (later) |
| **G** | 4–5h | E+A PASS | Production ranking |

**Total**: 29–39 hours (critical path: A→B→C→D→E, 19–27h)

**GPU Work Unblocked After**: Batch E success (recall@10 ≥0.80, latency acceptable)
- SOM training (requires stable feature identity + domain labels from C)
- K-means clustering (requires stable embeddings from D + confidence scores)
- TurboVec prefilter (optional, after E validates pgvector/Qdrant performance)

---

## Parent Atlas Contracts (Implementation Requirements)

### Zod Schemas

```typescript
// Batch A: Tree node
const TreeNodeSchema = z.object({
  tree_node_version_id: z.string().uuid(),
  tree_node_id: z.string(),  // stable for named symbols
  tree_node_kind: z.enum(['function', 'class', 'export', 'import', 'call_site', 'variable', 'type', 'enum']),
  source_ref: z.string(),  // file path
  workspace_revision: z.string().regex(/^[a-f0-9]{40}$/),  // git SHA
  symbol_path: z.string(),  // namespace::class::method
  node_content_hash: z.string().regex(/^[a-f0-9]{64}$/),  // SHA256
  byte_start: z.number().int().nonnegative(),
  byte_end: z.number().int().nonnegative(),
  parent_tree_node_id: z.string().uuid().nullable(),
  parser_version: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// Batch B: Feature
const FeatureSchema = z.object({
  feature_id: z.string().uuid(),
  feature_kind: z.enum(['function', 'class', 'module', 'export', 'hook', 'middleware', 'service', 'utility']),
  feature_label: z.string().min(1).max(256),  // human-readable
  canonical_tree_node_id: z.string().uuid(),
  workspace_revision: z.string().regex(/^[a-f0-9]{40}$/),
  semantic_text: z.string(),  // for embedding input
  domain_class: z.string().nullable(),  // filled in Batch C
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// Batch C: Observation & Label
const ObservationSchema = z.object({
  observation_id: z.string().uuid(),
  feature_id: z.string().uuid(),
  lane: z.enum(['semantic', 'lexical', 'structural', 'domain_membership', 'identity']),
  observation_value: z.string(),  // domain label or structured JSON
  observation_source: z.string(),  // rule ID or human
  confidence: z.number().min(0).max(1),
  created_at: z.string().datetime(),
  reviewed_at: z.string().datetime().nullable(),
});

const FeatureLabelSchema = z.object({
  feature_id: z.string().uuid(),
  label: z.string().min(1).max(64),  // canonical domain label
  promotion_source: z.string().uuid(),  // observation_id
  promotion_timestamp: z.string().datetime(),
  reviewer: z.string(),  // "human" or agent ID
  locked: z.boolean(),
});

// Batch D: Embedding
const SemanticEmbeddingSchema = z.object({
  feature_id: z.string().uuid(),
  semantic_text: z.string(),
  semantic_text_hash: z.string().regex(/^[a-f0-9]{64}$/),
  tokenizer_name: z.string(),
  tokenizer_version: z.string(),
  token_count: z.number().int().positive(),
  embedding_model: z.string(),  // "embeddinggemma:latest"
  embedding_model_revision: z.string(),
  embedding: z.array(z.number()).length(768),
  embedding_finite: z.boolean(),  // all components are finite
  embedding_confidence: z.number().min(0).max(1),
  created_at: z.string().datetime(),
  embedding_timestamp: z.string().datetime(),
});
```

### Determinism Rules

1. **Every materialization must be reproducible** — same input + same code → identical output
2. **Hashing must be deterministic** — SHA256(string) must produce same hash every run
3. **Random seeds must be fixed** — random_state=42 everywhere (Python classifiers)
4. **Floating-point arithmetic must be exact** — record model weights as-is (no rounding)
5. **Database writes must be idempotent** — ON CONFLICT DO UPDATE, never silent insert duplicates

### Confidence Tracking

Every artifact carries a confidence score (0.0–1.0):

- **Structural confidence**: reflects parser quality (tree-sitter is near-perfect, 0.95+)
- **Feature identity confidence**: reflects extraction rule quality (Batch B heuristics, 0.70–0.90)
- **Label confidence**: reflects observation quality (ast-grep rules, 0.50–0.80)
- **Embedding confidence**: reflects input quality (Batch D, usually 0.85–0.95)
- **Classifier confidence**: reflects training data quality and model calibration (Batch F, varies by domain)

**Use these scores for**:
- Filtering low-confidence predictions before promoting to production
- Routing uncertainty to human review
- Measuring data quality decay over time

---

## npm Scripts Scaffold

```json
{
  "scripts": {
    "batch:a": "node scripts/atlas/batch-a-structural-materializer.mts",
    "batch:a:validate": "node scripts/atlas/batch-a-determinism-validator.mts",
    "batch:b": "node scripts/atlas/batch-b-feature-identity-builder.mts",
    "batch:b:validate": "node scripts/atlas/batch-b-determinism-validator.mts",
    "batch:c:emit": "node scripts/atlas/batch-c-ontology-observation-emitter.mts",
    "batch:c:review": "node scripts/atlas/batch-c-control-set-reviewer.mts",
    "batch:c:validate": "npx tsx scripts/atlas/batch-c-ontology-validator.mts",
    "batch:d": "node scripts/atlas/batch-d-semantic-embedder.mts",
    "batch:d:validate": "node scripts/atlas/batch-d-determinism-validator.mts",
    "batch:e:benchmark": "node scripts/atlas/batch-e-search-benchmarker.mts",
    "batch:e:validate": "node scripts/atlas/batch-e-search-audit.mts",
    "batch:f:nb": "node --loader ts-node/esm scripts/atlas/batch-f-naive-bayes-trainer.mts",
    "batch:f:xgb": "node --loader ts-node/esm scripts/atlas/batch-f-xgboost-trainer.mts",
    "batch:f:validate": "node scripts/atlas/batch-f-classification-validator.mts",
    "batch:g": "node --loader ts-node/esm scripts/atlas/batch-g-ranking-trainer.mts",
    "batch:g:validate": "node scripts/atlas/batch-g-ranking-validator.mts",
    "batch:all": "npm run batch:a && npm run batch:a:validate && npm run batch:b && npm run batch:b:validate && npm run batch:c:emit && npm run batch:c:review && npm run batch:c:validate && npm run batch:d && npm run batch:d:validate && npm run batch:e:benchmark && npm run batch:e:validate && npm run batch:f:nb && npm run batch:f:xgb && npm run batch:f:validate && npm run batch:g && npm run batch:g:validate",
    "batch:dry-run": "npm run batch:a -- --dry-run && npm run batch:b -- --dry-run && npm run batch:c:emit -- --dry-run && npm run batch:d -- --dry-run && npm run batch:e:benchmark -- --dry-run"
  }
}
```

---

## Implementation Order (Recommended)

1. **Week 1: Batches A–C** (structural foundation)
   - Batch A: tree_node materialization (4–6h)
   - Batch B: feature_id derivation (3–4h)
   - Batch C: ontology observations + control set (5–7h)
   - **Checkpoint**: 1,000-feature control set with locked labels

2. **Week 2: Batches D–E** (semantic grounding)
   - Batch D: embedding generation (3–4h)
   - Batch E: search baselines (4–5h)
   - **Checkpoint**: Validated ANN performance (recall@10 ≥0.80)

3. **Week 3: Batches F–G** (ranking pipelines)
   - Batch F: domain classifier (6–8h)
   - Batch G: ranking model (4–5h)
   - **Checkpoint**: Production-ready ranking pipeline

4. **Week 4: GPU Acceleration** (NOW SAFE)
   - SOM training (requires D+C outputs)
   - K-means clustering (requires D+C outputs)
   - TurboVec prefilter (optional, requires E validation)

---

## Gates Summary (All Must PASS Before Proceeding)

| Batch | Gates | Blocker? |
|-------|-------|----------|
| A | A1–A5 | Batch A BLOCKER |
| B | B1–B5 | Batch B BLOCKER |
| C | C1–C5 | Batch C BLOCKER |
| D | D1–D5 | Batch D BLOCKER |
| **E** | **E1–E5** | **CRITICAL: GPU work blocked if E fails** |
| F | F1–F5 | Batch F BLOCKER |
| G | G1–G5 | Batch G BLOCKER |

---

## Appendix: Reference Contracts (Existing)

See `sveltekit-frontend/scripts/atlas/lib/classifier-contracts.ts` for Zod schemas already defined:

- `VectorManifestSchema` — embedding model, dimensions, metadata
- `ClassifierSplitManifestSchema` — train/val/test split tracking
- `DomainFeaturePacketSchema` — feature + embedding + domain label
- `ModelRunManifestSchema` — classifier metadata (type, version, training timestamp)
- `EvaluationReportSchema` — metrics, per-domain breakdown
- `DomainOntologyLabelSchema` — domain hierarchy
- `EvidenceLanesSchema` — multi-signal confidence (semantic, lexical, structural, etc.)

---

**Status**: COMPLETE, AWAITING USER AUTHORIZATION  
**Next Action**: User to confirm Batch A can proceed, or request clarifications/adjustments to this OpenSpec.
