# P0→P12 Parent Atlas Execution Roadmap

**Date**: July 11, 2026  
**Status**: READY FOR EXECUTION  
**Scope**: Complete domain classification, embedding pipeline, topology, and retrieval integration  
**Duration**: Sessions 135-140+ (estimated 4-6 weeks)

---

## Executive Summary

This roadmap defines the 12-phase sequential execution plan to build a complete, production-ready packet retrieval and ranking pipeline. Starting from **P0 identity validation** through **P12 promotion gates**, each phase has explicit completion criteria and gates.

**Key Principle**: Data layer first, GPU work last. Identity → Features → Embeddings → Topology → Classification → Retrieval.

---

## P0: Identity & Source-Reference Alignment

**Duration**: Session 135 (1-2 hours)  
**Goal**: Establish deterministic packet identity without data rebuild  
**Status**: DISCOVERY_COMPLETE → READY FOR EXECUTION

### Current State
- **4,725 packets WITH qdrant_point_id** (8.1%) — all valid, authentic UUIDs
- **53,640 packets WITHOUT qdrant_point_id** (91.9%):
  - ~47K correctly unlinked (gitignored files, build artifacts, logs)
  - ~7K potentially recoverable (real indexed code chunks)

### Root Causes of Bridge Failure
1. **chunk_id join failed** (0% match): atlas_packets.chunk_id ≠ codebase_chunk_index.id (synthetic/out-of-sync)
2. **source_ref join insufficient** (0% match): codebase_chunk_index.source_ref mostly NULL (canonical ID is relative_path)

### Tasks

#### P0 Task 1: Validate Existing Mappings
**Duration**: 30 min  
**Command**:
```bash
npm run atlas:p0:validate-bridges --sample=100
```
**Acceptance Criteria**:
- ✓ Spot-check 4,725 mappings
- ✓ Confirm qdrant_point_id values exist in Qdrant
- ✓ Verify source_ref consistency
- ✓ Gate: ≥99% validation pass

#### P0 Task 2: Identify Recoverable Packets
**Duration**: 30 min  
**Commands**:
```bash
npm run atlas:p0:identify-recoverable --dry-run
npm run atlas:p0:identify-recoverable --apply --limit=5000
```
**Acceptance Criteria**:
- ✓ Join atlas_packets.source_ref to codebase_chunk_index.relative_path (normalized)
- ✓ Filter to packets WITH indexed content but NO qdrant_point_id
- ✓ Expected: ~7K recoverable packets
- ✓ Gate: coverage ≥70% (relative to recovery target) or ≥10% (absolute)

#### P0 Task 3: Create Query-Time Qdrant Bridge (DEFERRED)
**Duration**: 2 hours (Session 136+)  
**Status**: Lower priority, can defer  
**Commands**:
```bash
npm run atlas:p0:create-qdrant-lookup-view --dry-run
npm run atlas:p0:create-qdrant-lookup-view --apply
```
**Acceptance Criteria**:
- ✓ Create v_packet_qdrant_lookup view
- ✓ Join atlas_packets.source_ref to Qdrant payloads at query time
- ✓ Update retrieval paths to use view
- ✓ Benchmark <10ms overhead

#### P0 Completion: Final Gate Check
**Duration**: 15 min  
**Acceptance Criteria**:
- ✓ source_ref coverage = 100%
- ✓ Qdrant bridge coverage = 10-12% (acceptable, rest non-indexed)
- ✓ duplicate packet_keys = 0
- ✓ orphan qdrant_ids = 0
- ✓ Commit P0 completion report

### P0 Status Gates

| Gate | Target | Current | Status |
|------|--------|---------|--------|
| source_ref coverage | ≥99% | 100% | ✅ PASS |
| Qdrant bridge coverage | ≥95% | 8.1% → 10-12% (after Task 2) | ⏳ IN PROGRESS |
| duplicate packet_keys | 0 | 0 | ✅ PASS |
| orphan qdrant_ids | 0 | 0 | ✅ PASS |
| mismatched source_ref | 0 | 0 | ✅ PASS |

### Non-Blockers
- ✅ ~47K unindexed packets correctly lack qdrant_point_id
- ✅ ~7K recoverable packets identified but not yet backfilled (Task 2)
- ✅ Query-time bridge deferred to Session 136+ (lower priority)

**Release to P1** upon P0 completion.

---

## P1: Canonical Semantic Corpus (384-d)

**Duration**: Session 136 (2-4 hours)  
**Goal**: Freeze a deterministic 384-dimensional embedding corpus  
**Prerequisite**: P0 complete

### Current State
- **384-d embedding coverage**: 0.017% (canonical yet to be backfilled)
- **codebase_chunk_index.content_embedding**: 99.5% populated (40,568 / 40,754 chunks)
- **Qdrant codebase_chunks_768**: 55,119 points (768-dim, named vector "content")

### Tasks

#### P1 Task 1: Backfill Canonical 384-d Embeddings
**Duration**: 1.5 hours  
**Acceptance Criteria**:
- ✓ Embed all indexed packets via embeddinggemma:latest (384-d)
- ✓ Coverage ≥95% (expected: 39K+ / 40K+ indexed)
- ✓ Store in Postgres pgvector column
- ✓ Validate: NaN/Inf vectors = 0, UUID uniqueness = 100%

#### P1 Task 2: Freeze Corpus Version
**Duration**: 30 min  
**Acceptance Criteria**:
- ✓ Create manifest.json:
  ```json
  {
    "version": "canonical-384-v1",
    "repository_revision": "git-sha",
    "row_count": 39000,
    "dimension": 384,
    "dtype": "float32",
    "embedding_model": "embeddinggemma:latest",
    "normalization_policy": "L2",
    "source_content_hash": "sha256-...",
    "generated_timestamp": "2026-07-11T...",
    "generator_version": "1.0"
  }
  ```
- ✓ Export vectors to Arrow: `artifacts/parent-atlas/semantic-v1/vectors-content-384.f32`
- ✓ Create row-map and feature-labels Arrow files
- ✓ Gate: all row counts match, UUID uniqueness = 100%

### P1 Status Gates

| Gate | Target | Current | Status |
|------|--------|---------|--------|
| canonical embedding coverage | ≥95% | 0.017% → 95%+ | ⏳ IN PROGRESS |
| content_embedding_384 populate | 100% indexed | ~99.5% | ✅ READY |
| NaN/Inf vectors | 0 | 0 (to validate) | ⏳ IN PROGRESS |
| UUID uniqueness | 100% | ? | ⏳ IN PROGRESS |

**Release to P2** upon P1 completion.

---

## P2: Structural & Semantic Feature Extraction

**Duration**: Session 136-137 (3-5 hours)  
**Goal**: Extract deterministic features for every packet  
**Prerequisite**: P1 complete

### Tasks

#### P2 Task 1: Continue AST Symbols Backfill
**Duration**: 1 hour  
**Current State**: 11.06% coverage (improved from 3.74%)  
**Commands**:
```bash
node scripts/atlas/backfill-ast-symbols.mjs --limit=10000 --batch-size=100 --apply
```
**Acceptance Criteria**:
- ✓ Target 20%+ coverage (currently 11.06%)
- ✓ Extract: functions, classes, methods, imports, exports
- ✓ Resolve source files with fallback to summaries
- ✓ Validate: encoding issues handled (recommend batches <5K)

#### P2 Task 2: LangExtract Concept Backfill
**Duration**: 1.5 hours  
**Process** (keep LangExtract outside GPU):
- Extract from README, architecture docs, specs
- Extract from comments, docstrings
- Extract from API descriptions, migration notes
- Extract legal concepts, business capabilities, runtime dependencies, security boundaries

**Acceptance Criteria**:
- ✓ Used_concepts populated for packets with extracted concepts
- ✓ Concept_ids mapped to shared registry
- ✓ Every result includes source_ref + content_hash
- ✓ Coverage ≥50% for semantic concepts

#### P2 Task 3: Feature/Metric Table Separation
**Duration**: 1.5 hours  

**Create atlas_packet_features** (observed evidence):
```sql
CREATE TABLE atlas_packet_features (
  packet_key TEXT PRIMARY KEY,
  ast_labels TEXT[],
  domain_labels TEXT[],
  concept_ids TEXT[],
  source_metadata JSONB,
  tree_node_id TEXT,
  test_count INT,
  schema_count INT,
  route_handler_count INT
);
```

**Create atlas_packet_metrics** (derived values):
```sql
CREATE TABLE atlas_packet_metrics (
  packet_key TEXT PRIMARY KEY,
  page_rank_score REAL,
  retrieval_frequency INT,
  historical_success REAL,
  som_distance REAL,
  centroid_distance REAL,
  rerank_score REAL,
  domain_probability REAL,
  freshness_score REAL
);
```

**Acceptance Criteria**:
- ✓ Zod schemas created for both tables
- ✓ No redundant data across tables
- ✓ Raw concepts and derived metrics fully separated
- ✓ Backfill both tables with existing data

### P2 Status Gates

| Gate | Target | Current | Status |
|------|--------|---------|--------|
| AST symbols coverage | ≥20% | 11.06% → 20%+ | ⏳ IN PROGRESS |
| LangExtract coverage | ≥50% | 0% → 50%+ | ⏳ IN PROGRESS |
| Feature/metric separation | 100% clean | To be validated | ⏳ IN PROGRESS |

**Release to P3** upon P2 completion.

---

## P3: Feature/Metric Separation (Parallel with P1-P2)

**Duration**: Session 136-137 (1-2 hours)  
**Goal**: Formalize schema for features vs. derived metrics  
**Prerequisite**: P2 concurrent

### Deliverables
- ✓ Drizzle schema for atlas_packet_features
- ✓ Drizzle schema for atlas_packet_metrics
- ✓ Zod validation schemas
- ✓ Migration SQL
- ✓ Data backfill script

**Release to P4** upon P3 completion.

---

## P4: Autoencoder & Gradient Checkpointing

**Duration**: Session 137-138 (3-4 hours)  
**Goal**: Train 384→256→128→64 representation learning pipeline  
**Prerequisite**: P1 complete (canonical embeddings)

### Training Profiles

Test all profiles and measure:
- Peak allocated VRAM
- Peak reserved VRAM
- Step latency
- Examples/second
- Reconstruction loss
- Cosine preservation
- Nearest-neighbor Recall@10

| Profile | Precision | Checkpointing | Microbatch |
|---------|-----------|---------------|-----------|
| A | FP32 | Off | 256 |
| B | FP16 AMP | Off | 256 |
| C | FP16 AMP | On | 256 |
| D | FP16 AMP | On | 512 |
| E | FP16 AMP | On | smaller + accumulation |

### Promotion Gates
- ✓ Gradient checkpoint VRAM reduction ≥20%, else leave disabled
- ✓ Validation loss regression <1%
- ✓ NaN/Inf gradients = 0
- ✓ Resume-from-checkpoint reproduces within tolerance
- ✓ Latent row identity = 100%

### Storage
```python
latent128: float16 or float32 (384→256→128)
latent64: float16 (128→64)
```

**Release to P5** upon P4 completion.

---

## P5: SOM 20×20 & K-means

**Duration**: Session 138 (2-3 hours)  
**Goal**: Build topology and clustering foundations  
**Prerequisite**: P4 complete (latent vectors)

### SOM Contract
- **Grid**: 20×20 (400 cells)
- **Index**: row * 20 + col (0-399)
- **Coordinates**: (row, col, index)

**Audit**:
- ✓ Invalid row/column
- ✓ Index mismatch
- ✓ Missing coordinates
- ✓ Duplicate/stale model versions

### K-means
- Train on canonical 384-d + latent128 separately
- Compare cluster stability across seeds
- Measure silhouette score, Davies-Bouldin, cluster entropy

### Promotion Gates
- ✓ Coverage ≥95%
- ✓ Assignment stability ≥0.90
- ✓ No unexplained cluster >25% of total
- ✓ Model + corpus hashes persisted

**Release to P6** upon P5 completion.

---

## P6: Domain Classification

**Duration**: Session 138-139 (2-3 hours)  
**Goal**: Train deterministic domain classifier  
**Prerequisite**: P2 complete (features), P4 complete (embeddings)

### Labeled Domain Set (12 domains)
- retrieval
- cache
- database
- graph
- inference
- agent orchestration
- authentication
- telemetry
- legal analysis
- frontend
- testing
- build tooling

### Feature Set
- content_embedding_384
- summary_embedding_384
- latent128
- latent64
- SOM row/col/index
- K-means labels
- AST counts (functions, classes, methods, imports, exports)
- Feature labels
- Concept counts
- PageRank
- Community ID
- File extension
- Route/schema/test flags
- Historical retrieval telemetry

### Baseline: XGBoost GPU

**Ablations**:
- Embedding only
- AST only
- Embedding + AST
- Embedding + topology
- Embedding + concepts
- Full feature set

**Metrics**:
- Macro F1
- Weighted F1
- Per-domain precision/recall
- Top-2 accuracy
- Calibration error
- Confusion matrix

### Promotion Gates
- ✓ Macro F1 ≥0.85
- ✓ Minority-domain precision ≥0.80
- ✓ Top-2 accuracy ≥0.95
- ✓ File/revision leakage = 0

**Release to P7** upon P6 completion.

---

## P7: Multi-Vector RRF Fusion & Reranking

**Duration**: Session 139 (2-3 hours)  
**Goal**: Implement production ranking pipeline  
**Prerequisite**: P6 complete (domain classifier)

### Canonical Retrieval Vectors
- content_embedding_384
- summary_embedding_384
- signature_embedding_384

### Fusion Lanes
1. BM25
2. Content dense (Qdrant)
3. Summary dense (Qdrant)
4. Signature dense (Qdrant)
5. Topology similarity (Neo4j)
6. Domain match (XGBoost)

### RRF Formula
```
score = sum(1 / (60 + rank_i))
```

### XGBoost Reranker
- Train on fused top-K candidates
- Target NDCG@10 improvement over baseline
- Validate no regression on non-top candidates

### Evaluation Metrics
- Recall@10, Recall@20
- NDCG@5, NDCG@10
- MRR
- Same-file duplication rate
- Domain purity
- Feature-label purity

**Release to P8** upon P7 completion.

---

## P8: Qdrant vs cuVS & Go Retrieval

**Duration**: Session 139-140 (2-3 hours)  
**Goal**: Benchmark vector search and wire retrieval service  
**Prerequisite**: P7 complete

### Benchmark Comparison
| Approach | Metric | Measure |
|----------|--------|---------|
| cuVS brute force | Recall@10/50 | Baseline |
| cuVS IVF-Flat | Recall@10/50 | Compare |
| Qdrant HNSW | Recall@10/50 | Compare |
| Go retrieval | Latency p50/p95 | Record |
| HyperRAG RRF | Throughput | Batch ops |

**Record**:
- ✓ Recall@10/50
- ✓ p50/p95 latency
- ✓ Batch throughput
- ✓ VRAM peak
- ✓ Qdrant overlap
- ✓ Row-map failures

### Go Retrieval Wiring
- BM25 index
- Qdrant candidate calls
- Candidate normalization
- Bounded concurrency
- Streaming transport
- Stable source identities

### Neo4j KAG Expansion
- One-hop precision
- Two-hop recall
- Three-hop noise
- Cycle suppression
- Duplicate suppression
- Authorization filtering
- Maximum fanout

**Release to P9** upon P8 completion.

---

## P9: Topology & Ontology Graph Fanout

**Duration**: Session 140 (1-2 hours)  
**Goal**: Build semantic ontology representation  
**Prerequisite**: P8 complete

### Ontology Tuple Schema
```json
{
  "subject_id": "packet_key",
  "predicate": "IMPORTS|BELONGS_TO_CLUSTER|SIMILAR_TOPOLOGY|SHARES_TAGS",
  "object_id": "packet_key",
  "source_ref": "path/to/source",
  "content_hash": "sha256...",
  "confidence": 0.85,
  "extractor": "ast-grep",
  "version": "1.0"
}
```

### Validation
- ✓ Subject exists
- ✓ Object exists
- ✓ Predicate allowed
- ✓ Source_ref resolves
- ✓ Content hash current
- ✓ Duplicate writes idempotent

### Neo4j Mirroring
- ✓ Typed edges (IMPORTS, BELONGS_TO_CLUSTER, SIMILAR_TOPOLOGY, SHARES_TAGS)
- ✓ Bounded k-hop traversal
- ✓ CouchDB PageRank cache (6h TTL)

**Release to P10** upon P9 completion.

---

## P10: Arrow Export & mmap Registry

**Duration**: Session 140 (1-2 hours)  
**Goal**: Durable artifact storage and hot access  
**Prerequisite**: P9 complete

### Arrow Batch Exporter
**Requirements**:
- ✓ --dry-run, --apply modes
- ✓ --offset, --limit for resumable exports
- ✓ Content-hash checks
- ✓ Schema-version checks
- ✓ Transactional bounded writes

### mmap Hot Registry
**Storage**:
- ✓ Offset (byte position in file)
- ✓ Length (bytes)
- ✓ Checksum (verify integrity)
- ✓ Schema version
- ✓ Content hash
- ✓ Packet version

**Format**: MessagePack for packet records, mmap for contiguous access

**Release to P11** upon P10 completion.

---

## P11: HyperRAG Packet Materialization

**Duration**: Session 140-141 (1-2 hours)  
**Goal**: Wire end-to-end packet assembly  
**Prerequisite**: P10 complete

### Materialization Pipeline
```
RPC input
  → Zod validation
  → retrieval candidates
  → source identity validation
  → feature/topology join
  → ranking
  → packet assembly
  → packet validation
  → MsgPack encoding
  → mmap registry write
  → telemetry
  → ACP/A2A handoff
```

### BitFrost Cache Promotion
**Routing token**:
```json
{
  "d": 12,
  "s": 153,
  "k": 7,
  "f": 381,
  "c": 27,
  "p": "01J...",
  "v": 4
}
```

**Stages**:
- Retrieved
- Ranked
- Identity validated
- Source validated
- Materialized
- Successful use
- Cache promoted

**Tiers**:
- Hot: Valkey exact manifests
- Warm: mmap/MsgPack validated registry
- Cold: Postgres/Arrow/archive artifacts

### Security Gates
- ✓ Cross-tenant leakage = 0
- ✓ Cross-repository leakage = 0
- ✓ Stale source acceptance = 0

**Release to P12** upon P11 completion.

---

## P12: Promotion-Gate Audit

**Duration**: Session 141 (1 hour)  
**Goal**: Final validation before production  
**Prerequisite**: P11 complete

### Promotion Gates (Hard Stops)
| Gate | Target | Measure |
|------|--------|---------|
| source_ref coverage | ≥99% | All packets |
| Qdrant bridge coverage | ≥95% | Indexed packets only |
| tree_node coverage | ≥95% | Indexed packets only |
| canonical embedding coverage | ≥95% | Indexed packets only |
| SOM coverage | ≥95% | Indexed packets only |
| K-means coverage | ≥95% | Indexed packets only |
| domain classifier F1 | ≥0.85 | Macro on held-out |
| row-map identity | 100% | UUID uniqueness |
| reranker NDCG@10 | Improves baseline | Validation set |
| graph traversal bounded | k≤3 | Max hops |

### Rejection Report (if gates fail)
```json
{
  "packet_key": "...",
  "failed_gates": ["..."],
  "missing_fields": ["..."],
  "recommended_repair_script": "...",
  "priority": "P0|P1|P2",
  "dependency": "..."
}
```

### Completion Report
- ✓ All phase summaries
- ✓ Gate status matrix
- ✓ Performance metrics
- ✓ Known limitations
- ✓ Handoff to production

---

## Execution Timeline

| Phase | Session | Duration | Status |
|-------|---------|----------|--------|
| P0 | 135 | 1-2h | READY |
| P1 | 136 | 2-4h | BLOCKED (P0) |
| P2 | 136-137 | 3-5h | BLOCKED (P1) |
| P3 | 136-137 | 1-2h | BLOCKED (P2) |
| P4 | 137-138 | 3-4h | BLOCKED (P1) |
| P5 | 138 | 2-3h | BLOCKED (P4) |
| P6 | 138-139 | 2-3h | BLOCKED (P2, P4) |
| P7 | 139 | 2-3h | BLOCKED (P6) |
| P8 | 139-140 | 2-3h | BLOCKED (P7) |
| P9 | 140 | 1-2h | BLOCKED (P8) |
| P10 | 140 | 1-2h | BLOCKED (P9) |
| P11 | 140-141 | 1-2h | BLOCKED (P10) |
| P12 | 141 | 1h | BLOCKED (P11) |
| **TOTAL** | **135-141** | **~28-40 hours** | **Sequential** |

---

## Key Principles

1. **Data layer first, GPU work last**
   - P0-P3: identity, features, schema
   - P4-P6: embeddings, topology, classification
   - P7-P12: retrieval, ranking, production

2. **Reject synthetic refs, backfill only deterministic mappings**
   - No force-mapping to reach arbitrary coverage targets
   - Accept architectural gaps (47K non-indexed packets are correct)

3. **Postgres is truth, everything else is mirror**
   - Qdrant: durable ANN mirror
   - Redis/Valkey: ephemeral cache
   - Neo4j: topology mirror
   - Arrow/mmap: cold archive

4. **Hard fail conditions are non-negotiable**
   - Missing packet_key, source_ref, feature_id → reject packet
   - Duplicate packet_keys or qdrant_ids → fail gate
   - Reconstruction loss >1% or NaN gradients → fail gate

---

## Success Criteria (Final)

✅ **P0-P12 COMPLETE** when:
- All 12 gates pass
- No hard-fail conditions violated
- Promotion-gate audit shows 100% pass rate
- Production handoff documentation complete
- Commit: "P0-P12 Complete: Parent Atlas execution pipeline"

---

## Commands Quick Reference

```bash
# P0
npm run atlas:p0:validate-bridges --sample=100
npm run atlas:p0:identify-recoverable --dry-run
npm run atlas:p0:identify-recoverable --apply --limit=5000

# P1
npm run atlas:p1:backfill-embeddings --limit=10000
npm run atlas:p1:freeze-corpus-version

# P2
node scripts/atlas/backfill-ast-symbols.mjs --limit=10000 --batch-size=100 --apply
npm run atlas:p2:langextract:backfill --dry-run
npm run atlas:p2:create-feature-tables

# P3-P12
# (Commands to be defined as implementation proceeds)
```

---

## References

- [P0 Identity Discovery](P0-IDENTITY-DISCOVERY.md)
- [Domain Classification Backfill Session 134](domain-classification-backfill-session-134.md)
- [JEPA DSPy Next Steps](../next_steps/active/JEPA_DSPY_NEXT_STEPS.md)
- [Unified Retrieval Algorithm](../memory/unified-retrieval-algorithm-execution-plan.md)
- [Canonical Packet Wiring Blueprint](../docs/architecture/CANONICAL-PACKET-WIRING-BLUEPRINT.md)

---

**Owner**: Claude Code (Anthropic)  
**Last Updated**: 2026-07-11  
**Status**: READY FOR P0 EXECUTION (Session 135)
