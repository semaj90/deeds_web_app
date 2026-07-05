# Phase 8 Execution Board — Architecture Promotion & Validation

**Status**: Session 105 — Promotion Phase (Present → Partial → Missing → Script)  
**Date**: July 4, 2026  
**Summary**: Architecture structurally in place. Work is promotion and propagation, not inventing new lanes.

---

## 4-Column Execution Matrix

| Lane | Present ✅ | Partial 🟡 | Missing ❌ | Next Script to Run |
|------|-----------|----------|----------|-------------------|
| **Tree Node ID** | Schema field, some joins | Not complete across summary/envelope paths | Fully universal flow through summary generation, feature envelopes, retrieval mirrors | `propagate-tree-node-ids.mjs` |
| **Used Concepts** | Field defined in schema | Effectively absent in batch path | Live used_concepts / semantic blob lane in envelope pipeline | `wire-used-concepts-lane.mjs` |
| **Qdrant Payload** | Payload fields broadly present | Canonical identity fields show gaps, alias-only coverage | Unified payload schema enforced across all searches | `normalize-qdrant-payloads.mjs` |
| **Tags Indexing** | GIN index scaffolded | Not fully promoted in gate output | Tags as first-class search signal (equal weight to keywords) | `index-tags-production.mjs` |
| **Arrow Registry** | Arrow batch scripts exist | Arrow usable for batch movement, not settled canonical | Real binary registry handoff between runtime and storage | `arrow-batch-canonical-bridge.mjs` |
| **Queue/Deque** | Documented, modeled | Partially enforced in some paths | Single runtime contract across all async operations | `enforce-queue-contract.mjs` |
| **Lexical Lane** | keywords, ngrams, trigrams, engrams ✅ | Coverage 0.1%–2.4% | Span all 1,286 packets with summaries | `lexical-lane-complete:1286.mjs` |
| **SOM 20×20** | Deterministic hash clustering (58K) | NOT trained on latent vectors | True K-Means + SOM training on latent_64 | `train-som-20x20:400-cells.mjs` |
| **HMM Agentic Error** | Error-domain ontology wired (5 classes × 10 domains) | Recovery packet selection 2/16 domains | Full HMM classifier + recovery packet ranking | `hmm-agentic-error-classifier.mjs` |
| **ACP Control Plane** | Routing/provenance role defined | Not enforced as single source for all decisions | Binary registry + inverse queue/deque loop | `acp-binary-registry-loop.mjs` |

---

## Highest-Value Fixes (Priority Order)

### 1. **Finish tree_node_id Propagation** (1-2 hours)
```
Impact: Unblocks retrieval mirrors, Neo4j topology, ACE context assembly
Files:
  - sveltekit-frontend/scripts/atlas/propagate-tree-node-ids.mjs (NEW)
  - Update: summary-layers-writer, packet-envelope-validator
Acceptance: tree_node_id ≥ 95% in atlas_packets + summary_layers
```

### 2. **Wire used_concepts Lane** (1-2 hours)
```
Impact: Unblocks semantic enrichment, concept graph, LangExtract integration
Files:
  - sveltekit-frontend/scripts/atlas/wire-used-concepts-lane.mjs (NEW)
  - Update: lexical-feature-extraction.mjs to populate used_concepts
  - Update: simple-concept-extraction.mjs to write to used_concepts column
Acceptance: used_concepts ≥ 80% coverage in atlas_packets
```

### 3. **Harden Binary Registry Path** (2-3 hours)
```
Impact: Unblocks Arrow/msgpack serialization, mmap registry, runtime delivery
Files:
  - sveltekit-frontend/scripts/atlas/binary-registry-handoff.mjs (NEW)
  - sveltekit-frontend/src/lib/server/registry/mmap-reader.ts (NEW)
Acceptance: Round-trip packet_key → binary → unpacked identity verified
```

### 4. **SOM 20×20 Training on Latent Vectors** (3-4 hours)
```
Impact: Topology now semantic, enables retrieval boosting, reduces KNN search space
Files:
  - sveltekit-frontend/scripts/atlas/train-som-20x20-latent.mjs (NEW)
  - Dependency: autoencoder training complete (768→64 latent)
Acceptance: 400 SOM cells populated, BMU assignments deterministic
```

### 5. **HMM Agentic Error Classifier + Validation** (4-5 hours)
```
Impact: Error-domain-recovery packet chain fully functional
Files:
  - sveltekit-frontend/scripts/atlas/hmm-agentic-error-classifier.mjs (NEW)
  - sveltekit-frontend/scripts/atlas/smoke-agentic-error-finding.mjs (VALIDATION)
Acceptance: 14/16 domains have recovery packets, HMM classification ≥ 80% confidence
```

---

## Validation Gates (SOM 20×20 + HMM Agentic Error)

### Gate 1: SOM 20×20 Topology Validation
```javascript
// File: scripts/atlas/validate-som-topology.mjs

const VALIDATION_GATES = {
  som_cells_populated: { min: 390, max: 400, metric: 'cell_count' },
  bmu_assignments: { min: 58000, max: 58365, metric: 'assigned_packets' },
  bmu_distribution: { min: 0.8, max: 1.0, metric: 'entropy' }, // should be well-distributed
  adjacency_edges: { min: 2400, max: 3000, metric: 'tricubic_edges' }, // ~6 neighbors per cell
  latent_variance: { min: 0.7, max: 1.0, metric: 'pca_explained' }, // latent_64 captures structure
  retrieval_boost: { min: 1.5, max: 3.0, metric: 'topological_speedup' }, // SOM reduces ANN search space
};

// Expected distribution (uniform across 400 cells):
// Each cell: 58,365 / 400 ≈ 146 packets ± 20%
// Low cells: <120 packets (cells in sparse regions)
// High cells: >170 packets (dense regions)
```

### Gate 2: HMM Agentic Error Classification
```javascript
// File: scripts/atlas/validate-hmm-agentic-error.mjs

const HMM_VALIDATION_GATES = {
  error_classes: { expected: 5, metric: 'ConnectivityError, TimeoutError, ValidationError, ResourceError, CypherError' },
  domains_mapped: { expected: 10, metric: 'auth, db, cache, search, grpc, sse, llm, gpu, neo4j, ui' },
  feature_coverage: { min: 0.15, metric: 'domain_feature_ids matched in packets' },
  recovery_packet_count: { min: 12, max: 16, metric: 'domains with ≥1 recovery packet' },
  hmm_confidence: { min: 0.80, metric: 'error_class classification accuracy' },
  error_signal_sources: { expected: 3, metric: 'Postgres, Qdrant, Neo4j' },
};

// HMM States:
// S0: INIT → S1 (error signal ingested)
// S1: CLASSIFY → S2 (error-domain mapping via ontology)
// S2: RETRIEVE → S3 (recovery packets from topology + pagerank)
// S3: RANK → S4 (xgboost ranking)
// S4: EMIT → [ACE packet dispatch]

// Signal Types:
// 1. Training error: (model_name, task_id, error_class, timestamp)
// 2. MapReduce grouping: (error_class, model_name, task_id) → {count, latest_timestamp, recovery_packets[]}
// 3. HMM emission: error_signal → probability distribution over recovery packets
```

### Gate 3: Integration: Error Signal → Recovery Packet
```javascript
// File: scripts/atlas/smoke-agentic-error-finding.mjs (EXPANDED)

const INTEGRATION_VALIDATION = {
  'Gate 1: Error-Domain Mapping': {
    test: () => Object.keys(ERROR_DOMAIN_MAP).length >= 5,
    expected: '5 error classes mapped',
    result: 5, // ConnectivityError, TimeoutError, ValidationError, ResourceError, CypherError
  },
  'Gate 2: Packet Feature Coverage': {
    test: () => featureCoveragePercent >= 0.15,
    expected: '≥15% of packets have feature_ids matching domain patterns',
    result: 0, // 0% currently; expected 15–30% after LangExtract/concept_ids
    blocker: 'LangExtract entity extraction needed',
  },
  'Gate 3: Recovery Packet Selection': {
    test: () => successfulSelectionsCount >= 12,
    expected: '≥12 of 16 error-domain pairs have recovery packets',
    result: 2, // currently 2/16; expected 14/16 after tree_node_id propagation
    blocker: 'tree_node_id and feature_id propagation needed',
  },
  'Gate 4: HMM State Transitions': {
    test: () => hmm_states.all_transitions_tested,
    expected: 'INIT → CLASSIFY → RETRIEVE → RANK → EMIT tested',
    result: false,
    blocker: 'HMM classifier not yet wired to live error signal pipeline',
  },
  'Gate 5: End-to-End Error → Recovery': {
    test: () => e2e_test_passed,
    expected: 'Simulated error signal produces ranked recovery packets',
    result: false,
    blocker: 'MapReduce grouping + HMM not yet integrated',
  },
};
```

---

## Topology Decomposition Loops (Gap Analysis)

### Loop 1: Latent Vector → SOM BMU Assignment
```
Missing: true K-Means training on latent_64 vectors
Current: deterministic hash assignment (does NOT respect latent structure)
Impact: SOM cells may be sparsely or unevenly populated

Script to fix:
  - scripts/atlas/train-autoencoder-768-64.mjs (prerequisite)
  - scripts/atlas/train-kmeans-latent.mjs (true K-Means, replace hash)
  - scripts/atlas/train-som-20x20-latent.mjs (SOM on latent, use true BMUs)

Expected output:
  - som_row, som_col ∈ [0–19]
  - som_cluster = som_row * 20 + som_col (unique ∈ [0–399])
  - som_index = row_major traversal (for SOM neighbor queries)
```

### Loop 2: SOM BMU → Topology Neighbor Links
```
Present: SOM grid structure defined
Partial: tricubic adjacency edges scaffolded, not fully computed

Script to fix:
  - scripts/atlas/compute-som-tricubic-adjacency.mjs (NEW)
    └─ For each cell (row, col):
       └─ Find 6–8 nearest neighbors in grid
       └─ Create SIMILAR_TOPOLOGY edges in Neo4j
       └─ Store adjacency weights (distance decay)

Expected output:
  - Neo4j edges: 58,365 BELONGS_TO_SOM_CELL, 2,400–3,000 SIMILAR_TOPOLOGY
  - Postgres table: som_adjacency_matrix (20×20 grid + weights)
```

### Loop 3: Neo4j PageRank → Postgres Sync
```
Present: PageRank computed in Neo4j (51,078 nodes)
Partial: Only 5% synced to Postgres (2,908 rows)
Missing: Full sync coverage, rank normalization, authority boosting

Script to fix:
  - scripts/atlas/fix-neo4j-pagerank-sync.mjs (IMPROVED)
    └─ Increase sync coverage from 5% to 100%
    └─ Normalize PageRank scores (0–1 range, log scale)
    └─ Apply boosting for k-core centrality and community density

Expected output:
  - atlas_packets.page_rank_score: 58,365/58,365 (100% coverage)
  - page_rank_score ∈ [0.15, 10.126] (log-normal distribution)
  - Authority boosted by community_id + k_core
```

### Loop 4: Postgres Topology → Qdrant Payload
```
Present: Qdrant payload fields defined
Partial: topology_class, som_cluster, page_rank_score not fully synced
Missing: Unified payload schema enforced

Script to fix:
  - scripts/atlas/sync-topology-to-qdrant-payload.mjs (NEW)
    └─ For each atlas_packets row:
       └─ Extract (som_cluster, page_rank_score, community_id, k_core)
       └─ Push to Qdrant payload of matching qdrant_point_id
       └─ Index on som_cluster for locality-aware search

Expected output:
  - Qdrant codebase_chunks_768 payload:
    {
      "packet_key": "...",
      "som_cluster": 0–399,
      "page_rank_score": 0.15–10.126,
      "community_id": 1–49025,
      "k_core": 0–149
    }
```

### Loop 5: ACE Context Assembly → SOM Locality Boost
```
Missing: SOM topology not yet used in ACE retrieval ranking

Script to wire:
  - src/lib/server/ace/context-assembler.ts (update ranking)
    └─ After Qdrant ANN top-K:
       └─ Fetch SOM cluster of query packet
       └─ Boost candidates in same SOM cell (+20%)
       └─ Boost neighbors of SOM cell (+10%)
    └─ RRF blend: 0.40·qdrant + 0.20·som_boost + 0.20·rg + 0.10·ast + 0.10·freshness

Expected output:
  - ACE retrieval latency: 500ms → 250ms (SOM prefilter reduces ANN search space)
  - Relevance: +5–10% (topology-aware locality)
```

---

## Execution Plan: Next 4 Sessions

| Session | Lane | Est. Duration | Acceptance |
|---------|------|---------------|-----------|
| 105 | Tree Node ID Propagation | 1–2h | tree_node_id ≥ 95% |
| 105 | Used Concepts Wiring | 1–2h | used_concepts ≥ 80% |
| 106 | SOM 20×20 Training + Validation | 3–4h | 400 cells, BMU assignment ✅ |
| 106 | HMM Classifier + Smoke Test | 4–5h | 14/16 domains, confidence ≥ 0.80 |
| 107 | Topology Sync Loop 1–3 | 2–3h | PageRank 100%, Qdrant payload unified |
| 107 | Binary Registry Handoff | 2–3h | Arrow round-trip verified |
| 108 | ACE SOM Locality Integration | 1–2h | Latency –50%, relevance +5% |

**Total**: ~20 hours over 4 sessions → **Phase 8 completion** (promotion phase)

---

## Key Principle

**Architecture is structurally sound.** Remaining work is:
- ✅ Propagate existing fields (tree_node_id, used_concepts)
- ✅ Normalize schemas (Qdrant payload, Queue contracts)
- ✅ Train topology (SOM, K-Means on latent)
- ✅ Validate end-to-end (HMM agentic error → recovery packets)

**Do NOT:**
- ❌ Invent new lanes (all 4 lanes exist: lexical, structural, semantic, topology)
- ❌ Skip validation (each gate has measurable acceptance criteria)
- ❌ Defer binary serialization (Arrow is settled, just needs to be canonical)
