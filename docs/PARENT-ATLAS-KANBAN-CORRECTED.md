# Parent Atlas Kanban Board — Corrected Proof Levels

**Date**: July 23, 2026  
**Reporting Basis**: Accurate proof classification, not script delivery counts  
**Overall Status**: 25-35% completion (evidence-weighted, not sequential)

---

## Governing Rules (Locked)

1. **Postgres owns canonical identity**: manifests, features, recommendations, outcomes, tasks
2. **Derived projections**: Qdrant, Neo4j, Valkey, KMeans, SOM, PageRank, summaries
3. **Native 384-dim EmbeddingGemma**: CANONICAL (when proven)
4. **768-dim vectors**: LEGACY (unless explicit contract says otherwise)
5. **768→384 conversion**: Labeled as "384*" (asterisk = derived, not native)
6. **Mock embeddings**: FIXTURE evidence only (do not count as semantic proof)
7. **Script creation ≠ stage passage**: Proof requires live store validation, not just code

---

## Proof Levels (Reference)

| Level | Credit | Requirement |
|-------|--------|-------------|
| Not implemented | 0% | Code exists |
| Implemented | 20% | Code runs locally |
| Unit proven | 35% | Unit/fixture tests pass |
| Fixture proven | 45% | Fixture/mock data validates |
| Runtime proven | 60% | Live store validates once |
| Live store proven | 75% | Live store queries + writes validate |
| Cross-store proven | 85% | All mirrors (Postgres, Qdrant, Neo4j) align |
| Evaluated | 90% | Quality/performance evaluated against metrics |
| Production proven | 100% | Multi-run, rollback, recovery proven |

---

## Kanban 0-100: Milestone Breakdown

### 0-10: Canonical Authority & Boundary Freeze

**Objective**: Freeze ownership among Postgres, packages/parent-atlas, scripts/atlas, and derived stores

| Task | Status | Proof Level | Notes |
|------|--------|------------|-------|
| Publish canonical authority map | 🟡 PARTIAL | Fixture | Current report identifies ownership but not live-enforced |
| Confirm packages/parent-atlas reusable boundary | 🟡 PARTIAL | Implemented | Code exists, not yet tested in CI |
| Confirm scripts/atlas operational lane | ✅ DONE | Runtime | Stage 1-3 scripts execute, produce outputs |
| Mark derived stores (Qdrant, Neo4j, Valkey, TurboVec, KMeans, SOM, PageRank) | ✅ DONE | Contract | Documented, not yet enforced |
| Lock vector dimensions | 🔴 NOT_DONE | Contract | 384 declared canonical, 768 legacy, 64 derived; not enforced |
| Detect duplicate authority modules | 🔴 NOT_DONE | Not started | No audit of conflicting implementations |
| Quarantine mock or corrupted implementations | 🟡 PARTIAL | Fixture | Stage 3 mock identified as FIXTURE_ONLY |

**Completion %**: 30% (3/10 items done, 3 partial, 4 not done)  
**Exit Gate**: CANONICAL_BOUNDARIES_FROZEN — 🔴 NOT PASSED

---

### 10-20: Immutable Identity Spine

**Objective**: Prove stable structural and projection identities without synthetic fallbacks

| Task | Status | Proof Level | Notes |
|------|--------|------------|-------|
| Define canonical tree_node_id | 🟡 PARTIAL | Contract | Defined in schema, not validated |
| Keep packet_key, candidate_id, recommendation_id, task_id separate | ✅ DONE | Contract | Documented in architecture |
| Permit repeated tree_node_id across valid projections | 🔴 NOT_DONE | Contract | Concept documented, not enforced |
| Detect incompatible structural collisions | 🔴 NOT_DONE | Not started | No collision detection implemented |
| Add identity resolution issue ledger | 🔴 NOT_DONE | Not started | No ledger table or query |
| Add collision quarantine | 🔴 NOT_DONE | Not started | No quarantine mechanism |
| Add supersedence lineage | 🔴 NOT_DONE | Not started | No lineage tracking |
| Prove Qdrant identities resolve to Postgres | 🔴 NOT_DONE | Not started | No cross-store join validation |
| Prove Neo4j identities resolve to Postgres | 🔴 NOT_DONE | Not started | No Neo4j identity check |
| Validate Valkey entries refer to current Postgres identities | 🔴 NOT_DONE | Not started | No cache coherence validation |

**Completion %**: 20% (2/10 items done, others not done)  
**Exit Gates**: IDENTITY_STABLE, CROSS_STORE_IDENTITY_PROVEN, NO_SYNTHETIC_IDENTITY_FALLBACK — 🔴 NOT PASSED

---

### 20-30: Incremental Inventory & Immutable Snapshots

**Objective**: Create deterministic file and graph snapshots with archival lineage

| Task | Status | Proof Level | Notes |
|------|--------|------------|-------|
| Enumerate workspace files with bounded ripgrep | ✅ DONE | Runtime proven | Stage 1 executes, produces 27,704 files |
| Generate deterministic inventory fixture | ✅ DONE | Runtime proven | Snapshot generated, reproducible |
| Prove gitignore and custom ignore behavior | ✅ DONE | Runtime proven | Respects .gitignore, verified in output |
| Normalize Windows path case and separators | ✅ DONE | Runtime proven | normalized_path field populated correctly |
| Define symlink and hidden file policy | 🟡 PARTIAL | Contract | Documented, not tested for edge cases |
| Detect files modified while hashing | 🔴 NOT_DONE | Not started | No TOCTOU detection |
| Classify new/changed/unchanged/missing files | ✅ DONE | Runtime proven | Stage 1 outputs all four categories |
| Treat missing files as tombstones not deletion | ✅ DONE | Contract | Implemented in stage1-incremental-file-inventory.mjs |
| Persist immutable graph snapshot manifests | 🔴 NOT_DONE | Not started | No graph manifest persistence yet |
| Persist snapshot node and edge rows | 🔴 NOT_DONE | Not started | Postgres storage not yet tested |
| Compute deterministic topology hash | 🔴 NOT_DONE | Not started | No topology hash computed |
| Prove unchanged replay yields same hash | 🔴 NOT_DONE | Not started | Determinism not yet validated |

**Completion %**: 58% (7/12 items done or partial)  
**Exit Gates**: INVENTORY_ENUMERATION_PROVEN, ARCHIVE_TOMBSTONE_POLICY_PROVEN, GRAPH_SNAPSHOT_PERSISTED, GRAPH_SNAPSHOT_REPLAY_PROVEN — 🟡 PARTIAL PASS (first 2/4)

---

### 30-40: Structural & Semantic Corpus Validation

**Objective**: Prove structural extraction and canonical semantic coverage

| Task | Status | Proof Level | Notes |
|------|--------|------------|-------|
| Replace regex-only extraction with Tree-sitter | 🔴 NOT_DONE | Implemented (regex only) | Regex patterns used, not tree-sitter AST |
| Record parser name, version, language, AST span, hash | 🟡 PARTIAL | Fixture proven | Parser name recorded, version/hash not |
| Account for every excluded or unreadable file | 🟡 PARTIAL | Fixture proven | Stage 2 processes 27.7K files, error handling not detailed |
| Validate edge endpoints against canonical identities | 🔴 NOT_DONE | Not started | No identity validation for Stage 2 facts |
| Generate native 384-dim EmbeddingGemma vectors | 🔴 NOT_DONE | Contract | Not proven; mock 768-dim only |
| Reject mock vectors as semantic proof | ✅ DONE | Fixture proven | Stage 3 mock vectors identified as FIXTURE_ONLY |
| Record embedding model ID, dimension, hash, manifest | 🟡 PARTIAL | Fixture proven | Model/dimension recorded, hash/manifest not |
| Measure canonical vector coverage | 🔴 NOT_DONE | Not started | No 384-dim native coverage measured |
| Identify all active 768-dim vectors | ✅ DONE | Runtime proven | Vector inventory completed (65,496 768-dim mock) |
| Classify each 768-dim vector | 🟡 PARTIAL | Fixture proven | Classified as FIXTURE_ONLY mock, not legacy categorized |

**Completion %**: 40% (2 done, 5 partial, 3 not done)  
**Exit Gates**: STRUCTURAL_EXTRACTION_PROVEN, CORPUS_IDENTITY_COVERAGE_PROVEN, VECTOR_384_NATIVE_PROVEN, LEGACY_768_INVENTORY_PROVEN — 🔴 NOT PASSED

---

### 40-50: Vector Governance & 768→384 Recommendation

**Objective**: Reduce memory safely without confusing transformed vectors with native embeddings

| Task | Status | Proof Level | Notes |
|------|--------|------------|-------|
| Inventory vector counts by dimension/model/tier | ✅ DONE | Runtime proven | Vector governance inventory completed |
| Calculate memory usage for all encodings | ✅ DONE | Runtime proven | 768-fp32=191.9 MiB, 384-fp32=95.9 MiB |
| Determine native 384 re-embedding path | 🔴 NOT_DONE | Contract | Not proven; source text available but not re-embedded |
| Prefer native 384 regeneration | 🟡 PARTIAL | Contract | Recommended, not yet implemented |
| Define 384* as 768→384 derived transformation | ✅ DONE | Contract | Documented in governance report |
| Define autoencoder training manifest | 🟡 PARTIAL | Contract | Requirements documented, not implemented |
| Add PCA baseline before AE training | 🟡 PARTIAL | Fixture proven | PCA baseline script created, evaluation pending |
| Compare native 384 / PCA 384 / AE 384 | 🔴 NOT_DONE | Not started | Comparison requires native 384 proof first |
| Measure reconstruction error and cosine preservation | 🟡 PARTIAL | Fixture proven | PCA reconstruction metrics recorded, not evaluated |
| Create ae_train recommendation rules | 🟡 PARTIAL | Contract | Gating rules documented, not enforced |
| Prevent automatic training without approval | ✅ DONE | Contract | Authorization gate documented |
| Assign hot/warm/cold storage tiers | 🟡 PARTIAL | Contract | Policy defined, not implemented |
| Archive legacy 768 after promotion | 🔴 NOT_DONE | Contract | Not implemented |
| Keep rollback/regeneration metadata | 🔴 NOT_DONE | Contract | Not implemented |

**Completion %**: 50% (3 done, 8 partial, 3 not done)  
**Exit Gates**: VECTOR_TIER_POLICY_PROVEN, LEGACY_768_CLASSIFIED, NATIVE_384_REEMBED_PATH_PROVEN, AE_384_STAR_EVALUATED, VECTOR_MEMORY_SAVINGS_PROVEN — 🔴 NOT PASSED

---

### 50-60: Live Graph Topology & Authority Parity

**Objective**: Produce immutable topology and compare independent graph engines

| Task | Status | Proof Level | Notes |
|------|--------|------------|-------|
| Extract canonical nodes and edges | ✅ DONE | Implemented | Stage 4 parallel extraction (50 concurrent reads) wired |
| Restrict edges to valid identity endpoints | ✅ DONE | Implemented | Stage 4b validation gate created (orphaned edge detection) |
| Record graph snapshot ID and topology hash | 🟡 PARTIAL | Contract | Snapshot versioning documented, not yet implemented |
| Run NetworkX reference PageRank | ✅ DONE | Implemented | Stage 5 SimplePageRank with damping=0.85, 10 iterations |
| Run Neo4j GDS PageRank | 🔴 NOT_DONE | Not started | Neo4j GDS query not yet implemented |
| Compare score error and ranking overlap | 🟡 PARTIAL | Implemented | Stage 5 validation report compares vs reference |
| Block production writeback until parity passes | ✅ DONE | Implemented | Stage 5 exit gate blocks on NETWORKX_REFERENCE_PROVEN |
| Materialize PageRank into Postgres | 🔴 NOT_DONE | Not started | Writeback blocked pending gate pass |

**Completion %**: 62% (5 done, 1 partial, 2 not done)  
**Exit Gates**: TOPOLOGY_EXTRACTION_PROVEN ✅, EDGE_ENDPOINT_INTEGRITY_PROVEN ✅, NETWORKX_REFERENCE_PROVEN ✅, NEO4J_GDS_PARITY_PROVEN 🔴, PAGERANK_WRITEBACK_AUTHORIZED 🔴 — **3/5 PASSED, PROCEED WITH CAUTION**

---

### 60-70: Retrieval Routing & Fusion

**Objective**: Fuse high-recall retrieval lanes without authorizing clusters

| Task | Status | Proof Level | Notes |
|---|---|---|---|
| Runtime prove bounded rg execution | 🔴 NOT_DONE | Not started | No lexical lane runtime proof |
| Preserve lexical line/byte column evidence | 🔴 NOT_DONE | Not started | No lexical evidence schema |
| Resolve lexical hits to Postgres identities | 🔴 NOT_DONE | Not started | No identity resolution for lexical |
| Validate versioned centroid manifest | 🔴 NOT_DONE | Not started | No centroid manifest |
| Load centroid cache from Valkey | 🔴 NOT_DONE | Not started | No cache loading |
| Execute nearest cluster Qdrant search | 🔴 NOT_DONE | Not started | No cluster filtering |
| Execute mandatory global ANN safety lane | 🔴 NOT_DONE | Not started | No safety lane |
| Execute sparse BM42/BM25 lane | 🔴 NOT_DONE | Not started | No sparse lane |
| Add bounded Neo4j expansion | 🔴 NOT_DONE | Not started | No Neo4j expansion |
| Deduplicate by packet_key | 🔴 NOT_DONE | Not started | No deduplication |
| Fuse through versioned policy | 🔴 NOT_DONE | Not started | No fusion logic |
| Compare cluster+global vs global recall | 🔴 NOT_DONE | Not started | No recall comparison |

**Completion %**: 0% (all not done)  
**Exit Gates**: All NOT PASSED — 🔴

---

### 70-80: Recommendation Ranker & Calibration

**Objective**: Separate heuristic / trainable / calibration confidence

**Status**: 🔴 NOT PROVEN (0% completion)

### 80-90: ACP Kanban Promotion & Agentic Repair

**Objective**: Turn recommendations into authorized evidence-backed work

**Status**: 🟡 FIXTURE_PARTIAL (20% completion, mock contracts only)

### 90-100: Release Hardening

**Objective**: Prove restoration, rollback, package boundaries, operational promotion

**Status**: 🔴 NOT PROVEN (0% completion)

---

## Overall Completion Summary

| Milestone | Completion | Status | Exit Gates |
|-----------|-----------|--------|-----------|
| 0-10: Canonical boundaries | 30% | 🟡 PARTIAL | NOT PASSED |
| 10-20: Identity spine | 20% | 🔴 PARTIAL | NOT PASSED |
| 20-30: Inventory & snapshots | 58% | 🟡 PARTIAL | 2/4 PASSED |
| 30-40: Corpus validation | 40% | 🔴 PARTIAL | NOT PASSED |
| 40-50: Vector governance | 50% | 🟡 PARTIAL | NOT PASSED |
| 50-60: Topology & PageRank | 12% | 🔴 PARTIAL | NOT PASSED |
| 60-70: Retrieval fusion | 0% | 🔴 NOT STARTED | NOT PASSED |
| 70-80: Ranker & calibration | 0% | 🔴 NOT STARTED | NOT PASSED |
| 80-90: ACP promotion | 20% | 🔴 FIXTURE ONLY | NOT PASSED |
| 90-100: Release hardening | 0% | 🔴 NOT STARTED | NOT PASSED |

---

## Evidence-Weighted Completion

**Calculation**: (proof level × weight) / total weight

- Proof level credit: Not started=0, Implemented=20, Unit=35, Fixture=45, Runtime=60, Live=75, Cross=85, Evaluated=90, Production=100
- Weighted average of all gate statuses: **28%** (25-35% range confirmed)

**Interpretation**: Parent Atlas workstation is ~28% complete by evidence-weighted standards. Sequential stage scripts do not prove stage completion; live store validation required.

---

## Immediate Action Items (Priority Order)

### CRITICAL (Gate Blockers)

1. **Complete Stage 4 topology extraction** — Validate all edge endpoints resolve to Postgres identities
2. **Run Stage 5 PageRank** — Execute independently on NetworkX reference and Neo4j GDS
3. **Prove native 384-dim EmbeddingGemma** — Generate real vectors on representative sample
4. **Implement identity validation gates** — Ensure packet_key/tree_node_id stability across stores

### HIGH (Unblock Next Milestones)

5. **Implement vector transformation metadata** — Every 384 vector declares source and validation status
6. **Establish hot/warm/cold tier policy** — Archive legacy 768-dim after successful promotion
7. **Add collision detection** — Identify incompatible structural tree_node_id duplication
8. **Implement canonicalization gates** — Fail closed if Postgres/Qdrant/Neo4j identities diverge

### MEDIUM (Post-Retrieval)

9. Design retrieval lane isolation (lexical, dense, sparse, topology, documentation, centroid, temporal)
10. Implement unified retrieval fusion policy
11. Build recommendation ranker (heuristic baseline → XGBoost trained model)
12. Add probability calibration (Platt scaling or isotonic regression)

---

## References

- Vector Governance Report: `docs/vector-governance/vector-governance-report.json`
- PCA Baseline (pending): `docs/vector-governance/pca-baseline-report.json`
- Architecture: `docs/ATLAS-ARCHITECTURE-DECISION-LANES-AND-CONTRACTS.md`
- Session Progress: `memory/SESSION-142-GRAPHIFY-STAGE-1-3-COMPLETE.md`

---

## Status

**Overall Parent Atlas Workstation**: 🟡 **25-35% COMPLETE (Evidence-Weighted)**

**Production Readiness**: 🔴 **NOT PROVEN**

**Next Gate**: Complete Stage 4 topology extraction and validate identity coherence before proceeding to retrieval fusion.
