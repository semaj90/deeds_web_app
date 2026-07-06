# Parent Atlas Workstation TODO

**Status**: LAYER 1 ✅ COMPLETE (100% coverage) | EXPORT STACK ✅ READY | LAYER 2 ⏳ READY TO EXECUTE

---

## LAYER 1: Canonical Identity (✅ COMPLETE 100%)

| Field | Total | Complete | Status |
|-------|-------|----------|--------|
| packet_key | 58,365 | 58,365 | ✅ 100.0% |
| source_ref | 58,365 | 58,365 | ✅ 100.0% |
| feature_id | 58,365 | 58,365 | ✅ 100.0% |
| domain_class | 58,365 | 58,365 | ✅ 100.0% |
| tree_node_id | 58,365 | 58,365 | ✅ 100.0% |
| title_id | 58,365 | 58,365 | ✅ 100.0% |
| concept_ids | 58,365 | 58,360 | ✅ 99.99% |
| canonical_source_ref | 58,365 | 58,365 | ✅ 100.0% |
| qdrant_point_id | 58,365 | 4,273 | 🟠 7.32% (architectural ceiling) |

**Keywords**: `packet_key` → `source_ref` → `feature_id` → `tree_node_id` → `domain_class`

---

## Export Stack: Canonical Packet Serialization + Cache Materialization

**Status**: ✅ READY (Scripts created, npm aliases added)

### Phase 1: Arrow Batch Export

**Purpose**: Serialize 58K packets to Apache Arrow IPC format for fast ingest
- **Script**: `npm run atlas:export:arrow:dry` / `--apply`
- **Output**: `packets-batch-*.arrow` + `offset-index.json` (O(1) lookup by packet_key)
- **Coverage**: All 58,365 canonical identity packets
- **Keywords**: `packet_key` → `title_id` → `feature_id` → `source_ref` → `page_rank_score`

### Phase 2: GIN Index Acceleration

**Purpose**: Create full-text search + vector similarity indexes
- **Script**: `npm run atlas:export:gin-index:dry` / `--apply`
- **Indexes Created**:
  - `atlas_packets.summary` (trigram for LIKE similarity)
  - `atlas_packets.metadata` (JSONB containment)
  - `codebase_chunk_index.content` (trigram for FTS)
  - `codebase_chunk_index.content_embedding` (HNSW pgvector cosine_ops)
- **Keywords**: `summary` → `metadata` → `content_embedding` → `cosine_ops`

### Phase 3: MsgPack Envelope Materialization

**Purpose**: Binary cache format for hot layer (5-20ms retrieval)
- **Script**: `npm run atlas:export:msgpack:dry` / `--apply`
- **Schema**: packet_key, title_id, feature_id, som_row/col, page_rank, community_id, domain_class, concept_ids, canonical boolean
- **Batching**: 1000 packets/file with batch-index.json
- **Keywords**: `som_cluster` → `msgpack_offset` → `packet_key` → `cache_hit`

### Phase 4: QLoRA Dataset Preparation (Optional)

**Purpose**: Export training records for autoencoder (768→384→64 compression)
- **Script**: `npm run atlas:export:qlora:analyze` (coverage stats)
- **Script**: `npm run atlas:export:qlora:prepare` (full dataset, 58K records)
- **Script**: `npm run atlas:export:qlora:prepare:sample` (1K sample for testing)
- **CRITICAL**: DO NOT include qdrant_point_id, packet_key, or mmap offsets as training features
- **Input**: embedding_384, domain_class, topology (som_row/col, pagerank), features (ast_symbols, lexical, entities)
- **Keywords**: `embedding_384` → `domain_class` → `used_concepts` → `latent_64`

**Current Coverage**:
- Embeddings: 99.7% ✅ READY
- Topology: 21.6% (SOM 4.6%, PageRank 21.6%, community 21.6%)
- Features: 0.9% (ast_symbols), 2.4% (lexical), 0% (entities)

### Phase 5: Go Sidecar (Optional)

**Purpose**: Standalone search service (no Python dependency)
- Status: Not yet integrated
- Keywords: `search_query` → `go_retrieval` → `ranked_packets` → `union_blend`

---

## LAYER 2: Compiler Output Expansion (⏳ READY TO EXECUTE)

**Current State**: ast_symbols 0.9%, lexical_features 2.4%, entities 0%, used_concepts 100%

**Phase 2A: Fix ast-grep Integration** (1-2h, BLOCKING)
- **Issue**: phase1-ast-grep writes synthetic packet_keys; needs to write to real `atlas_packets`
- **Action**: `npm run atlas:phase1:ast-grep:dry` → verify output → `--apply`
- **Keywords**: `ast_symbols` → `tree_sitter` → `packet_key` mapping

**Phase 2B: Lexical Feature Extraction** (2-3h)
- **Script**: `npm run atlas:phase1.5:lexical:dry`
- **Output**: lexical_features array (token-level features)
- **Keywords**: `lexical_features` → `language:ts` → `keywords` array

**Phase 2C: Entity Extraction** (2h, can run parallel)
- **Script**: `npm run atlas:phase1.5:lexical:apply` (includes LangExtract)
- **Keywords**: `entities` → `EMAIL|PHONE|ROUTE|FUNCTION` → `confidence`

**Phase 2D: Wire Remaining Extractors** (6-8h, Session 110)
- imports/exports, functions, classes, routes, permissions
- **Keywords**: `imports` → `exports` → `functions:[]` → `classes:[]` → `routes:[]` → `permissions:{}`

**Total LAYER 2 Effort**: 7-10h to >80% coverage on all 9 compiler output fields

---

## LAYER 3: Metrics & Topology (⏳ PLANNED)

**Current State**: SOM 4.6%, PageRank 21.6%, community 21.6%, k_core 17.5%

**Phase 3A: SOM Topology** (train 20×20 grid on latent vectors)
- **Keywords**: `som_row` → `som_col` → `som_cluster` → `routing_locality`

**Phase 3B: Neo4j GDS Suite** (PageRank, Louvain, CheiRank)
- **Keywords**: `page_rank_score` → `community_id` → `k_core` → `centrality`

**Phase 3C: Semantic Metrics**
- **Keywords**: `entropy` → `density` → `reachability` → `authority_score`

---

## LAYER 4: Runtime & Training (⏳ DESIGNED)

**Purpose**: Naive Bayes, PyTorch reranker, HMM error fixing, RL feedback

**Phase 4A: Naive Bayes Baseline** (text classifier on features)
- **Keywords**: `classification_prob` → `feature_importance` → `prior_odds`

**Phase 4B: PyTorch Reranker** (.pt adapter)
- **Keywords**: `rerank_score` → `grpo_reward` → `policy_hint` → `adapter:auth|db|ui|repair`

**Phase 4C: HMM Error Recovery**
- **Keywords**: `error_state` → `recovery_packet` → `confidence` → `fallback_adapter`

---

## Export Stack Verification Checklist

- [ ] Phase 1: Arrow export 10K sample → verify offsets work
- [ ] Phase 2: GIN indexes created → verify query performance
- [ ] Phase 3: MsgPack batches materialized → verify binary decoding
- [ ] Phase 4: QLoRA dataset analysis → verify embedding coverage
- [ ] Phase 4: QLoRA prepare 1K sample → verify NDJSON format
- [ ] All phases end-to-end → verify retrieval latency <100ms

---

## npm Scripts Quick Reference

```bash
# Export Stack
npm run atlas:export:arrow:dry
npm run atlas:export:arrow:apply
npm run atlas:export:gin-index:dry
npm run atlas:export:gin-index:apply
npm run atlas:export:msgpack:dry
npm run atlas:export:msgpack:apply
npm run atlas:export:qlora:analyze
npm run atlas:export:qlora:prepare
npm run atlas:export:qlora:prepare:sample

# SLM Event Pub/Sub (for agentic workflows)
npm run atlas:slm:event-pubsub:listen
npm run atlas:slm:event-pubsub:demo

# TensorRT-LLM Batch Orchestrator (adapter swapping)
npm run atlas:orchestrator:triton:dry
npm run atlas:orchestrator:triton:start

# LAYER 2 Extraction (when ready)
npm run atlas:phase1:ast-grep:dry
npm run atlas:phase1.5:lexical:dry
```

---

**Date Updated**: July 6, 2026
**Session**: 109+ (Continuation Final)
**Last Verified**: Live database analysis complete
