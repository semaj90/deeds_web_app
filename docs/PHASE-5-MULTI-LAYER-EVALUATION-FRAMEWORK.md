# Phase 5: Multi-Layer Evaluation Framework

**Status**: SPECIFICATION + IMPLEMENTATION READY  
**Last Updated**: July 11, 2026  
**Scope**: 17 independent test layers with isolated acceptance gates

---

## Executive Summary

This document specifies a **layered evaluation strategy** that tests each retrieval/ranking/ontology component independently before claiming end-to-end success. Each layer has explicit acceptance gates; a good final result does NOT hide broken identity mapping, bad labels, graph leakage, or a weak reranker.

**Test Order**: Identity → Vectors → Clustering → Domain Classification → Ranking → Ontology → Multi-hop → Storage → RPC → Workflow

**Estimated Duration**: 6-8 weeks (parallel streams)

---

## Layer 1: Freeze Canonical Evaluation Corpus

**Purpose**: Create one deterministic snapshot from Postgres to prevent corpus drift during testing.

**Source Table**: `codebase_chunk_index`

**Validity Checks**:
- ✅ `source_ref` NOT NULL
- ✅ `content_hash` NOT NULL (or computed)
- ✅ `tree_node_id` NOT NULL
- ✅ `feature_id` NOT NULL
- ✅ `content_embedding` (384-dim, float32)
- ✅ topology metadata (SOM row/col, K-means cluster, PageRank, community_id)
- ✅ ontology tuples (used_concepts, extracted_entities, ast_symbols)

**Export Artifacts**:

```
artifacts/atlas-eval/
├── chunks.arrow                  # Complete chunk records
├── vectors-content-384.f32       # 384-dim embeddings (binary float32)
├── vectors-summary-384.f32       # Summary embeddings (optional)
├── vectors-signature-384.f32     # Signature embeddings (optional)
├── latent-64.f16                 # 64-dim compressed (optional)
├── topology-128.f16              # 128-dim SOM/topology (optional)
├── row-map.arrow                 # UUID/packet_key/source_ref/content_hash
├── ontology-tuples.parquet       # (subject_id, predicate, object_id, conf)
├── labels.parquet                # Domain labels (human-reviewed subset)
└── manifest.json                 # Row count, vector dims, hash checksums
```

**Row Map Proof** (critical):

```
row_id → chunk_uuid → packet_key → source_ref → content_hash
```

Acceptance Gates (G1):
- ✅ G1a: Row count (chunks.arrow) == Row count (vectors-content-384.f32)
- ✅ G1b: Duplicate row_id count == 0
- ✅ G1c: Duplicate canonical UUID count == 0
- ✅ G1d: Missing source_ref count == 0
- ✅ G1e: Stale content_hash count == 0 (re-hash samples)
- ✅ G1f: NaN/Inf in any vector column == 0
- ✅ G1g: manifest.json checksums match actual file SHA256

**Implementation**: `scripts/atlas/freeze-eval-corpus.mjs`

---

## Layer 2: Test Single-Vector Representations

**Purpose**: Benchmark each semantic lane independently before fusion.

**Vector Types**:
1. `content_embedding_384` — Full implementation detail
2. `summary_embedding_384` — Feature intent and architecture
3. `signature_embedding_384` — API/symbol similarity
4. `latent_64` — Routing only, not canonical retrieval
5. `topology_embedding_128` — Graph-neighbor similarity (SOM)

**Query Sets** (8 intentional groups):
- Symbol lookup queries
- Feature intent queries
- Architecture concept queries
- Bug/TODO queries
- Schema relationship queries
- Test-to-source queries
- Legal concept queries (domain-specific)
- Runtime dependency queries

**Per-Query Metrics**:
- Recall@10, Recall@20, Recall@50
- MRR (Mean Reciprocal Rank)
- NDCG@10
- Domain purity@10
- Feature-label purity@10
- Same-file duplication rate@10

**Expected Winner Per Query Type**:
- Symbol lookup → `content_embedding_384`
- Feature intent → `summary_embedding_384`
- Architecture concept → `summary_embedding_384`
- Bug/TODO → `content_embedding_384`
- Schema relationship → `signature_embedding_384`
- Test-to-source → `signature_embedding_384`
- Legal concept → `summary_embedding_384`
- Runtime dependency → `topology_embedding_128`

Acceptance Gates (G2):
- ✅ G2a: content_embedding NDCG@10 ≥ 0.70
- ✅ G2b: summary_embedding NDCG@10 ≥ 0.65
- ✅ G2c: signature_embedding NDCG@10 ≥ 0.60
- ✅ G2d: latent_64 Recall@20 ≥ 0.40 (routing only, low bar)
- ✅ G2e: topology_128 domain_purity@10 ≥ 0.75
- ✅ G2f: No vector type returns NaN/Inf ranks

**Implementation**: `tests/atlas/vectors/single-vector.eval.py`

---

## Layer 3: Test Multi-Vector Fusion

**Purpose**: Verify RRF and weighted fusion improve over best single-vector baseline.

**Fusion Strategies**:

1. **RRF (Reciprocal Rank Fusion)**:
   ```
   score = 1/(k+rank_content) + 1/(k+rank_summary) + 1/(k+rank_signature) + 1/(k+topology)
   ```
   (k = 60 typical)

2. **Weighted Fusion**:
   ```
   score = 0.35·content + 0.25·summary + 0.15·signature + 0.10·topology + 0.10·domain + 0.05·freshness
   ```

3. **Baseline Comparisons**:
   - Content only
   - Summary only
   - Signature only
   - Content + Summary
   - Content + Summary + Topology
   - All vectors + graph features

**Metrics** (same query sets as Layer 2):
- NDCG@10
- Recall@20
- MRR
- Improvement vs. best single-vector

Acceptance Gates (G3):
- ✅ G3a: Multi-vector NDCG@10 > best-single-vector NDCG@10 (by ≥3% absolute)
- ✅ G3b: No query family regresses by >5%
- ✅ G3c: Identity resolution remains 100% (row_map matches)
- ✅ G3d: RRF and weighted scores both positive and bounded

**Implementation**: `tests/atlas/vectors/multi-vector-fusion.eval.py`

---

## Layer 4: Test Domain Classification

**Purpose**: Verify packet domain labels are accurate and stable.

**Labeled Domains** (12 categories):
```
retrieval
cache
database
graph
inference
agent_orchestration
authentication
telemetry
legal_analysis
frontend_ui
testing
build_tooling
```

**Training Features**:
- 384-d embedding
- 64-d latent
- SOM row/col/cell_index
- K-means cluster_id
- AST symbol counts
- File extension
- Import/export counts
- Route/Schema/Test flags
- Feature labels (from layer 1)
- PageRank score
- Community ID
- LangExtract concept counts

**Data Split**: By file, NOT random chunk (prevents leakage).

**Evaluation Metrics**:
- Macro F1 (micro-weighted average, no class imbalance bias)
- Weighted F1
- Per-domain Precision
- Per-domain Recall
- Confusion matrix
- Calibration error (expected vs. actual confidence)
- Top-2 accuracy

Acceptance Gates (G4):
- ✅ G4a: Macro F1 ≥ 0.85
- ✅ G4b: Minority-domain Precision ≥ 0.80
- ✅ G4c: Top-2 accuracy ≥ 0.95
- ✅ G4d: No train/test file overlap
- ✅ G4e: No repository-revision leakage
- ✅ G4f: No label derived from same metadata being predicted

**Implementation**: `tests/atlas/domain/domain-classifier.eval.py`

---

## Layer 5: Test SOM 20×20 and K-means

**Purpose**: Verify clustering quality, not just clustering coverage.

**SOM Metrics**:
- Quantization error
- Topographic error
- Cell occupancy (histogram)
- Dead-cell count
- Domain purity per cell
- Feature-label purity per cell
- Neighbor continuity

**K-means Metrics**:
- Silhouette score
- Davies-Bouldin score
- Cluster size distribution
- Domain purity per cluster
- Feature-label entropy per cluster
- Stability across 3 random seeds

**Test Order**:
1. 384-d embeddings → SOM 20×20
2. 384-d embeddings → K-means
3. latent_64 (PCA optional) → SOM 20×20
4. latent_64 → K-means

Acceptance Gates (G5):
- ✅ G5a: No single cluster dominates >25% (unless intentional)
- ✅ G5b: Dead SOM cells < 5% of total (95 cells)
- ✅ G5c: Cluster assignment stability ≥ 0.90 across seeds
- ✅ G5d: Domain purity improves >10% over random baseline
- ✅ G5e: Silhouette score ≥ 0.30 (coarse clusters acceptable)
- ✅ G5f: Davies-Bouldin score ≤ 2.0 (lower is better)

**Implementation**: `tests/atlas/clustering/som-quality.eval.py`, `kmeans-stability.eval.py`

---

## Layer 6: Test Derivatives and Labeled Ranking Features

**Purpose**: Validate feature engineering before XGBoost training.

**Feature Vector** (per candidate hit):
```
dense_content_score (float)
dense_summary_score (float)
dense_signature_score (float)
latent_distance (float)
som_manhattan_distance (int)
same_som_cell (bool)
same_kmeans_cluster (bool)
domain_probability (float, 0-1)
feature_label_overlap (int)
pagerank (float)
community_match (bool)
ontology_path_length (int)
source_freshness (int, days)
historical_success (int, count)
source_ref_valid (bool)
test_relationship (bool)
```

**Ranking Experiments**:
1. Dense scores only (content + summary + signature)
2. Dense + SOM
3. Dense + domain
4. Dense + graph (PageRank + community)
5. Dense + ontology
6. Full XGBoost reranker

**Metrics** (held-out judged query set):
- NDCG@5
- NDCG@10
- MRR
- Recall@20
- Pairwise accuracy (rank i > rank j correct?)
- Top-k stability (rank 1-5 change?)

**Critical Rule**: Do NOT train XGBoost on current ranking order and claim improvement. Use held-out judged queries, not ranking signals.

Acceptance Gates (G6):
- ✅ G6a: No single feature is always NaN or infinity
- ✅ G6b: Feature correlation matrix shows no obvious multicollinearity (|r| > 0.95)
- ✅ G6c: Dense-only baseline NDCG@10 ≥ 0.65
- ✅ G6d: Adding SOM improves NDCG@10 by ≥2%
- ✅ G6e: Adding ontology improves NDCG@10 by ≥2%
- ✅ G6f: Full XGBoost improves NDCG@10 by ≥3% (vs. dense-only)

**Implementation**: `tests/atlas/ranking/reranker-ablation.eval.py`

---

## Layer 7: Test Ontology Tuples and Linked Structures

**Purpose**: Validate knowledge graph representation before multi-hop retrieval.

**Tuple Schema**:
```
subject_id (UUID)
predicate (enum: IMPLEMENTS, USES_SCHEMA, VALIDATES, DEPENDS_ON, BELONGS_TO_DOMAIN, etc.)
object_id (UUID)
source_ref (string)
confidence (float, 0-1)
content_hash (string)
extractor (string: ast-grep, langextract, neo4j-projection, etc.)
version (int: schema version)
```

**Example Facts**:
- `function:uuid → IMPLEMENTS → semantic-cache:uuid`
- `route:uuid → USES_SCHEMA → retrieval-request:uuid`
- `test:uuid → VALIDATES → cache-invalidation:uuid`
- `module:uuid → DEPENDS_ON → qdrant-client:uuid`
- `feature:uuid → BELONGS_TO_DOMAIN → retrieval:uuid`

**Validation Tests**:
- Subject exists in `codebase_chunk_index` (or `atlas_packets`)
- Object exists
- Source_ref resolves
- Content_hash matches (re-hash source)
- Predicate in allowed enum
- Duplicate tuple behavior is idempotent

**Traversal Tests**:
- One-hop precision (subject → object exists)
- Two-hop precision (subject → intermediate → object)
- Three-hop precision
- Cycle handling (no infinite loops)
- Maximum expansion bound (stop at N hops)
- Duplicate-node suppression
- Authorization filtering (source_ref validity)

Acceptance Gates (G7):
- ✅ G7a: One-hop precision ≥ 0.95 (subjects/objects must exist)
- ✅ G7b: Two-hop precision ≥ 0.85
- ✅ G7c: Three-hop precision ≥ 0.70
- ✅ G7d: Cycle detection prevents unbounded traversal
- ✅ G7e: Duplicate nodes suppressed (no repeats in expansion)
- ✅ G7f: Authorization filtering blocks unauthorized edges

**Implementation**: `tests/atlas/ontology/tuple-validation.test.ts`

---

## Layer 8: Test Multi-hop Retrieval

**Purpose**: Verify graph expansion improves recall without irrelevant noise.

**Query Classes**:
- Find caller of function X
- Find tests for route Y
- Find schema used by feature Z
- Find implementation behind UI action
- Find domain concept and all affected modules
- Find dependency chain causing failure

**Comparisons**:
- Dense only
- Dense + one hop (expand to DEPENDS_ON, USES_SCHEMA, CALLS neighbors)
- Dense + two hops
- Dense + ontology (without graph)
- Dense + DAG order (topological sort)

**Metrics**:
- Answer coverage (% of expected documents retrieved)
- Relevant-node Recall
- Irrelevant expansion rate
- Hop count distribution
- Latency (ms)
- Tokens added to context
- Duplicate evidence count

Acceptance Gates (G8):
- ✅ G8a: Two-hop retrieval improves Recall@20 by ≥5%
- ✅ G8b: Irrelevant expansion rate ≤ 20% (80% of expanded are relevant)
- ✅ G8c: Three-hop used only when justified (≤10% of queries need 3+ hops)
- ✅ G8d: Cycles never cause unbounded traversal (capped at 500 nodes)
- ✅ G8e: Latency with two-hop ≤ 2× latency of dense-only
- ✅ G8f: Duplicate nodes suppressed (max 1 per expansion)

**Implementation**: `tests/atlas/ontology/multihop-retrieval.eval.py`

---

## Layer 9: Test Arrow and mmap Correctness

**Purpose**: Verify binary storage is recoverable without loss.

**Arrow Tests**:
- Schema version matches manifest
- Row order stable (deterministic)
- UUID/string columns preserved (no corruption)
- Nullable metadata preserved
- Zero-copy reads work correctly

**mmap Tests**:
- File size == rows × dimensions × dtype_bytes
- Offset alignment correct
- Endianness correct
- Row N maps to canonical row N
- Partial reads return exact vectors
- Hash matches manifest

**Cross-Check (100 random rows)**:
```
Postgres vector
  ↓
Arrow vector
  ↓
mmap vector
  ↓
GPU-loaded vector
```

**Numerical Tolerance**:
- `float32`: near exact (<1e-6 relative error)
- `float16`: bounded cosine drift (<0.1% recall loss)
- `int8`: explicitly measured recall loss (gate separately)

Acceptance Gates (G9):
- ✅ G9a: Arrow round-trip matches Postgres 100%
- ✅ G9b: mmap round-trip matches Arrow 100%
- ✅ G9c: GPU read matches mmap 100%
- ✅ G9d: File size = expected bytes (no padding/corruption)
- ✅ G9e: Offset alignment = dtype alignment
- ✅ G9f: Hash matches manifest (no bit rot)

**Implementation**: `tests/atlas/storage/arrow-roundtrip.test.py`, `mmap-roundtrip.test.py`

---

## Layer 10: Test cuVS and Qdrant Together

**Purpose**: Validate GPU index quality and compare alternative backends.

**Baseline**: cuVS brute-force as exact ground truth.

**Comparison**:
- cuVS brute-force (oracle)
- cuVS IVF-Flat (with various n_lists/n_probes)
- Qdrant HNSW (current production)

**Sweep Parameters**:
- n_lists: [50, 100, 190, 500]
- n_probes: [5, 10, 20, 30, 40]
- top_k: [10, 20, 50, 100]
- batch_size: [1, 4, 16, 100]

**Metrics**:
- Recall@10, Recall@50
- p50/p95 latency (ms)
- Throughput (queries/sec)
- VRAM peak (MB)
- Index build time (sec)
- Qdrant overlap@k (% of Qdrant results match cuVS)

Acceptance Gates (G10):
- ✅ G10a: cuVS IVF-Flat Recall@10 ≥ 0.95 (Phase 4 proven)
- ✅ G10b: cuVS IVF-Flat Recall@50 ≥ 0.97
- ✅ G10c: cuVS latency < 10ms (batch 100)
- ✅ G10d: Qdrant HNSW Recall@10 ≥ 0.90
- ✅ G10e: Qdrant overlap with cuVS ≥ 80%
- ✅ G10f: Do NOT replace Qdrant unless cuVS improves both quality AND operational reliability

**Implementation**: `tests/atlas/vectors/cuvs-recall.eval.py`

---

## Layer 11: Test Redis/BitFrost Packets

**Purpose**: Verify cache isolation and determinism.

**Compact Routing Packet**:
```json
{
  "d": 12,
  "s": 153,
  "k": 7,
  "f": 381,
  "c": 27,
  "p": "01J4Z8CJYWZ6VZQT8N0Q60ZE54",
  "v": 4
}
```
Fields: domain_id, som_cell, k_means_cluster, feature_id, community_id, packet_key, version

**Test Cases**:
- Exact repeat query → exact cache hit
- Paraphrase query → semantic cache hit (within threshold)
- Different HMM state → cache miss (correct)
- Different repo revision → cache miss (correct)
- Different tenant → MANDATORY cache miss + error (security gate)
- Changed source_hash → stale rejection (no return-stale)

**Metrics**:
- Lookup latency (ms)
- Effective hit rate (%)
- False semantic hit rate (%)
- Stale rejection rate (%)
- Cross-tenant leakage count

Acceptance Gates (G11):
- ✅ G11a: Cross-tenant leakage == 0 (MANDATORY)
- ✅ G11b: Stale acceptance == 0 (no return-stale)
- ✅ G11c: Exact-key determinism == 100%
- ✅ G11d: Semantic precision ≥ 98%
- ✅ G11e: Lookup latency ≤ 5ms (Redis P95)

**Implementation**: `tests/atlas/packets/bitfrost-isolation.test.ts`

---

## Layer 12: Test CHROM97 Packet Packing

**Purpose**: Verify compact context-cartridge contract.

**Packet Structure**:
```
identity_header (packet_key, source_ref, feature_id, domain, version)
routing_tokens (domain_id, som_cell, k_cluster, community)
source_references (file_path, line_range, content_hash)
feature_labels (semantics, entity_types)
topology_links (parents, children, same_cluster)
validation_state (identity_valid, source_valid, is_stale)
token_estimate (prompt_tokens, completion_estimate)
materialization_references (where to fetch full context)
```

**Tests**:
- Packet decode == encode (deterministic round-trip)
- Version migration (v3→v4→v5 etc.)
- Source refs resolve back to Postgres manifests
- Token budget respected (actual ≤ estimate)
- Invalid packets rejected (corrupted identity)
- Packet order deterministic (same input → same output)

**Critical Rule**: Do NOT store full truth in compact packet. It resolves back to Postgres.

Acceptance Gates (G12):
- ✅ G12a: Round-trip determinism == 100%
- ✅ G12b: Version migration works (no data loss)
- ✅ G12c: Source refs resolve with 100% success
- ✅ G12d: Token estimate error ≤ 10%
- ✅ G12e: Invalid packets rejected (no silent corruption)
- ✅ G12f: Packet order deterministic

**Implementation**: `tests/atlas/packets/chrom97-roundtrip.test.ts`

---

## Layer 13: Test RPC, ACP and A2A Boundaries

**Purpose**: Verify cross-process communication is correct and authorized.

**gRPC Contract**:
- Zod/Protobuf schema parity
- Trace ID propagation (full chain)
- Deadline enforcement (no timeout leaks)
- Retry policy (exponential backoff)
- Idempotency key (duplicate suppression)
- Binary vector length (verify dims match)
- Status mapping (error codes translate)

**ACP/A2A Contract**:
- Agent identity (who is calling?)
- Capability declaration (what can they do?)
- Task scope (which artifacts can they access?)
- Artifact references (stable UUIDs)
- Approval requirements (when is user consent needed?)
- Trace context (end-to-end observability)
- Authorization scope (tenant, repo, feature boundary)

**Invalid Cases** (must reject):
- Unknown agent → 401
- Forged capability → 403
- Missing tenant → 400
- Stale artifact (>24h old) → 410
- Oversized payload (>10MB) → 413
- Wrong vector dimension → 400
- Unsupported schema version → 501

Acceptance Gates (G13):
- ✅ G13a: Trace ID propagates end-to-end
- ✅ G13b: Deadline enforced (request fails cleanly, doesn't hang)
- ✅ G13c: Idempotency key prevents duplicate execution
- ✅ G13d: Vector dimensions match schema (no silent truncation)
- ✅ G13e: Invalid cases rejected with correct error code
- ✅ G13f: Cross-tenant request blocked (leakage == 0)

**Implementation**: `tests/atlas/rpc/grpc-contract.test.ts`, `acp-a2a-validation.test.ts`

---

## Layer 14: Test DAG and Kanban State Transitions

**Purpose**: Verify workflow integrity and atomicity.

**Kanban States** (must correspond to real workflow events):
```
proposal → specified → planned → ready → claimed → implementing → testing → review_required → validated → merged → released

blocked (terminal, retains reason)
```

**Graph Processing DAG**:
```
embed (384-d vectors)
  ↓
classify (domain labels)
  ↓
SOM (20×20 topology)
  ↓
K-means (routing clusters)
  ↓
graph_enrich (ontology edges)
  ↓
rank (XGBoost + features)
  ↓
mirror (Qdrant, Neo4j, Redis)
  ↓
validate (identity, source_hash)
```

**State Transition Tests**:
- Valid transition succeeds
- Invalid transition rejects (e.g., proposed → merged without stages)
- Two agents claim same task → one succeeds, other gets 409 Conflict
- Workflow event and state update are atomic (no half-states)
- Blocked task retains reason (for audit)
- Evidence required for validation (proof of source hash match)

**DAG Tests**:
- Downstream task fails if required upstream artifact missing
- Topological sort produces correct order
- Parallel independent tasks run concurrently
- Cycle detection prevents deadlock

Acceptance Gates (G14):
- ✅ G14a: Valid transitions succeed 100%
- ✅ G14b: Invalid transitions rejected 100%
- ✅ G14c: Concurrent claim → exactly one succeeds
- ✅ G14d: State update and event are atomic (no partial states)
- ✅ G14e: Blocked task reason persists
- ✅ G14f: DAG topological sort correct
- ✅ G14g: Cycle detection works (no infinite loops)

**Implementation**: `tests/atlas/workflow/dag-transition.test.ts`, `kanban-concurrency.test.ts`

---

## Layer 15: Test Cache Loops and Warming

**Purpose**: Verify cache promotion only happens for proven reusable packets.

**Promotion Path**:
```
retrieved
  ↓
ranked (top-3 candidate)
  ↓
identity_validated (source_ref + content_hash match Postgres)
  ↓
source_validated (file still exists, no corruption)
  ↓
materialized (full context loaded)
  ↓
successful_use (returned to user, no rejection)
  ↓
cache_promoted (added to BitFrost L2)
```

**Test Cases**:
- Retrieved but unused → NOT promoted (stays in retrieval cache only)
- Rank winner with stale source → rejected (404, not promoted)
- Validated successful packet → promoted (+ source_ref, content_hash, timestamp)
- Repository change (file deleted/moved) → invalidated (removed from cache)
- Repeated failure (N misses in a row) → demoted (lower priority)

**Metrics**:
- Promotion success rate (% of candidates eligible)
- Demotion rate (% of cached packets aged out)
- False hit rate (promoted but stale at retrieval)
- Cache-warmth correlation (cache hit rate vs. repeated queries)

Acceptance Gates (G15):
- ✅ G15a: Unused candidates NOT promoted (0% false positives)
- ✅ G15b: Stale sources blocked from promotion
- ✅ G15c: Successful candidates promoted
- ✅ G15d: Repository changes invalidate (file deletion detected)
- ✅ G15e: Repeated failures demote cache priority
- ✅ G15f: False hit rate ≤ 2% (stale acceptance minimal)

**Implementation**: `tests/atlas/cache/warming-loops.test.ts`

---

## Layer 16: Recommended Test Suite Layout

```
tests/atlas/
├── identity/
│   ├── row-map.test.ts                 # Layer 1: Row ID → UUID → packet_key
│   └── source-ref.test.ts              # Layer 1: source_ref validity
│
├── vectors/
│   ├── single-vector.eval.py           # Layer 2: content/summary/signature separate
│   ├── multi-vector-fusion.eval.py     # Layer 3: RRF + weighted fusion
│   └── cuvs-recall.eval.py             # Layer 10: cuVS vs Qdrant
│
├── clustering/
│   ├── som-quality.eval.py             # Layer 5: SOM 20×20 quality
│   └── kmeans-stability.eval.py        # Layer 5: K-means consistency
│
├── domain/
│   └── domain-classifier.eval.py       # Layer 4: Domain classification F1
│
├── ontology/
│   ├── tuple-validation.test.ts        # Layer 7: Ontology tuple integrity
│   └── multihop-retrieval.eval.py      # Layer 8: Graph expansion quality
│
├── ranking/
│   ├── reranker-ablation.eval.py       # Layer 6: Feature engineering + XGBoost
│   └── xgboost-quality.eval.py         # Layer 6: Detailed reranker metrics
│
├── storage/
│   ├── arrow-roundtrip.test.py         # Layer 9: Arrow recovery
│   └── mmap-roundtrip.test.py          # Layer 9: mmap correctness
│
├── packets/
│   ├── chrom97-roundtrip.test.ts       # Layer 12: Compact packet packing
│   └── bitfrost-isolation.test.ts      # Layer 11: Cache isolation
│
├── rpc/
│   ├── grpc-contract.test.ts           # Layer 13: gRPC schema/tracing
│   └── acp-a2a-validation.test.ts      # Layer 13: Agent authorization
│
└── workflow/
    ├── dag-transition.test.ts          # Layer 14: DAG ordering
    ├── kanban-concurrency.test.ts      # Layer 14: State transitions
    └── cache-warming.test.ts           # Layer 15: Promotion policy
```

---

## Layer 17: Minimum Production Gates

| Gate | Metric | Acceptance |
|------|--------|-----------|
| **Identity** | Row-map completeness | 100% |
| **Identity** | source_ref validity | 100% |
| **Vectors** | Embedding coverage | ≥95% |
| **Vectors** | AST structural coverage | ≥90% |
| **Clustering** | SOM coverage | ≥95% |
| **Clustering** | K-means coverage | ≥95% |
| **Domain** | Macro F1 | ≥0.85 |
| **Retrieval** | cuVS Recall@10 | ≥0.95 |
| **Retrieval** | cuVS Recall@50 | ≥0.97 |
| **Ranking** | Reranker NDCG@10 improvement | Positive + significant |
| **Graph** | Multi-hop irrelevant expansion | Bounded (<20%) |
| **Security** | Cross-tenant cache leakage | 0 |
| **Storage** | Stale writeback acceptance | 0 |
| **Storage** | Arrow/mmap row mismatch | 0 |
| **RPC** | Trace propagation completeness | 100% |
| **Workflow** | DAG transition atomicity | 100% |

---

## Recommended End-to-End Proof

**Single definitive benchmark**: 100 judged queries executed through the full stack:

```
100 judged queries
  ↓
multi-vector retrieval (content + summary + signature + topology)
  ↓
cuVS/Qdrant comparison (which backend wins?)
  ↓
domain + topology feature join
  ↓
XGBoost rerank (dense + domain + graph features)
  ↓
two-hop ontology expansion (find related concepts)
  ↓
CHROM97 packet build (compact context cartridge)
  ↓
source validation (identity_valid + source_valid gates)
  ↓
metrics persisted (NDCG@10, Recall@20, expansion cost, latency)
```

**This benchmark tells you whether the semantic, topological, ontology and packet layers improve retrieval—or merely add complexity.**

---

## Implementation Roadmap

**Week 1-2**: Layers 1-2 (Corpus freeze, single-vector baseline)
**Week 3**: Layers 3-4 (Fusion, domain classification)
**Week 4**: Layers 5-6 (Clustering, feature engineering)
**Week 5**: Layers 7-8 (Ontology, multi-hop)
**Week 6**: Layers 9-10 (Storage, cuVS)
**Week 7**: Layers 11-13 (Caching, RPC, packets)
**Week 8**: Layers 14-15 (Workflow, cache warming)

**Parallel**: Implementation of RRF fusion module, signal normalizer, and API endpoints.

---

**Status**: Ready to execute. Begin with Layer 1 (corpus freeze) as blocking prerequisite for all downstream layers.
