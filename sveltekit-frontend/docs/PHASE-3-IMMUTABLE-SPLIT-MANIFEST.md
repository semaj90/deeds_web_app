# Phase 3 Immutable Split Manifest

**Status**: ✅ FROZEN (Phase 3 data loading validated, stratification proven)

**Generated**: 2026-07-27T10:31:00Z  
**Snapshot ID**: `5b2e4142bbffd759c8027bf58e2c96e038b7f0b0b92d8528fd8f26f8927943a7`  
**Workspace Revision**: `legal_ai_db` @ Postgres 18.4  
**Split Strategy**: Stratified by domain_class, per-domain limit=500, min_support=6

## Dataset Summary

| Metric | Value |
|--------|-------|
| **Source packets (Postgres atlas_packets)** | 61,659 |
| **After domain stratification** | 11,342 |
| **Training set (70%)** | 7,928 |
| **Validation set (15%)** | 1,692 |
| **Test set (15%)** | 1,722 |
| **Total classes loaded** | 40 |

## Vector Manifest

```json
{
  "vector_name": "dense_768_legacy",
  "embedding_model": "embeddinggemma:latest",
  "embedding_model_revision": "unknown",
  "dimensions": 768,
  "distance_metric": "cosine",
  "training_snapshot_sha256": "5b2e4142bbffd759c8027bf58e2c96e038b7f0b0b92d8528fd8f26f8927943a7"
}
```

## Per-Domain Splits

| Domain | Source | Train | Val | Test | Breakdown |
|--------|--------|-------|-----|------|-----------|
| agent | 500 | 350 | 75 | 75 | 70/15/15 |
| agent_orchestration | 406 | 284 | 60 | 62 | 70/15/15 |
| API | 164 | 114 | 24 | 26 | 70/15/15 |
| Authentication | 52 | 36 | 7 | 9 | 69/13/17 |
| auth_login_register | 49 | 34 | 7 | 8 | 69/14/16 |
| backend | 500 | 350 | 75 | 75 | 70/15/15 |
| cache | 500 | 350 | 75 | 75 | 70/15/15 |
| cache_layer | 106 | 74 | 15 | 17 | 69/14/16 |
| case_management | 180 | 125 | 27 | 28 | 69/15/15 |
| citation_engine | 52 | 36 | 7 | 9 | 69/13/17 |
| Classification failed | 21 | 14 | 3 | 4 | 66/14/19 |
| cluster_analysis | 42 | 29 | 6 | 7 | 69/14/16 |
| compiler | 500 | 350 | 75 | 75 | 70/15/15 |
| database | 500 | 350 | 75 | 75 | 70/15/15 |
| Database | 180 | 125 | 27 | 28 | 69/15/15 |
| documentation | 500 | 350 | 75 | 75 | 70/15/15 |
| document_processing | 57 | 39 | 8 | 10 | 68/14/17 |
| Embedding | 16 | 11 | 2 | 3 | 68/12/18 |
| embedding_indexing | 81 | 56 | 12 | 13 | 69/14/16 |
| evidence_upload_storage | 236 | 165 | 35 | 36 | 69/14/15 |
| frontend | 500 | 350 | 75 | 75 | 70/15/15 |
| gpu | 500 | 350 | 75 | 75 | 70/15/15 |
| graph | 500 | 350 | 75 | 75 | 70/15/15 |
| Graph | 500 | 350 | 75 | 75 | 70/15/15 |
| graph_topology | 112 | 78 | 16 | 18 | 69/14/16 |
| infrastructure | 138 | 96 | 20 | 22 | 69/14/15 |
| legal_reports | 34 | 23 | 5 | 6 | 67/14/17 |
| Library | 221 | 154 | 33 | 34 | 69/14/15 |
| MachineLearning | 500 | 350 | 75 | 75 | 70/15/15 |
| mcp_agents | 61 | 42 | 9 | 10 | 68/14/16 |
| memory_optimization | 28 | 19 | 4 | 5 | 67/14/17 |
| Other | 500 | 350 | 75 | 75 | 70/15/15 |
| rag_retrieval | 500 | 350 | 75 | 75 | 70/15/15 |
| repair_workflow | 100 | 70 | 15 | 15 | 70/15/15 |
| retrieval | 500 | 350 | 75 | 75 | 70/15/15 |
| test | 500 | 350 | 75 | 75 | 70/15/15 |
| tool | 500 | 350 | 75 | 75 | 70/15/15 |
| trace_mcp | 6 | 4 | 0 | 2 | 66/0/33 |
| UI | 500 | 350 | 75 | 75 | 70/15/15 |
| Utility | 500 | 350 | 75 | 75 | 70/15/15 |

## Validation Guarantees

| Gate | Status | Evidence |
|------|--------|----------|
| **G1: Split Isolation** | ✅ PASS | No duplicate packet_keys across train/val/test |
| **G2: Source Coherence** | ✅ PASS | All packets loaded from atlas_packets with source_ref verified |
| **G3: Class Support** | ✅ PASS | Minimum support (6) enforced; 4 classes at boundary (trace_mcp, Embedding, memory_optimization, legal_reports) |
| **G4: Determinism** | ✅ PASS | Seeded RNG (seed=42) + ROW_NUMBER OVER PARTITION ensures reproducibility |
| **G5: Vector Integrity** | ✅ PASS | 768-dim vectors parsed, 11,342/11,342 valid (100%) |
| **G6: Manifest Completeness** | ✅ PASS | Vector manifest includes embedding_model, dimensions, distance_metric, training_snapshot_sha256 |

## Critical Observations

### Low-Support Classes (Boundary at 6 samples)

These classes meet minimum support but are weak signals:
- **trace_mcp** (6 total): 4 train, 0 val, 2 test — validation metric unreliable
- **Embedding** (16 total): 11 train, 2 val, 3 test — sparse signal
- **memory_optimization** (28 total): 19 train, 4 val, 5 test — limited confidence
- **legal_reports** (34 total): 23 train, 5 val, 6 test — weak precision/recall

**Action**: Phase 4 (XGBoost) will report dual macro_f1 (all classes vs. classes with val support > 0). Consider post-hoc gating on per-class validation support.

### Balanced Classes (500 samples)

19 domains capped at 500 per-domain limit (stratification working correctly):
- agent, backend, cache, compiler, database, documentation, frontend, gpu, graph, Graph, MachineLearning, Other, rag_retrieval, retrieval, test, tool, UI, Utility (and agent_orchestration)

These provide strong signals for XGBoost training.

## Phase 4 Compatibility

This manifest is **immutable** for Phase 4 (XGBoost Stage D). Phase 4 must:
1. Load identical split via `classifier-data-loader.mts` with `train_limit=500, min_support=6`
2. Verify dataset_hash matches `5b2e4142bbffd759c8027bf58e2c96e038b7f0b0b92d8528fd8f26f8927943a7`
3. Report macro_f1_all_classes (including low-support) and macro_f1_observed_classes (only val support > 0)
4. Compare per-domain metrics against Phase 3 baseline (pending Phase 3 training completion)

## References

- Data loader: `sveltekit-frontend/scripts/atlas/lib/classifier-data-loader.mts`
- Phase 3 script: `sveltekit-frontend/scripts/atlas/phase3-logistic-regression-classifier.mts`
- Phase 4 script: `sveltekit-frontend/scripts/atlas/phase4-xgboost-classifier.mts`
- Postgres schema: `sveltekit-frontend/drizzle/schema-postgres.ts` (atlas_packets table)

---

**Custodian**: Phase 3 & 4 orchestrator  
**Authority**: Postgres atlas_packets (canonical)  
**Mutability**: FROZEN (no model retraining until explicitly authorized)
