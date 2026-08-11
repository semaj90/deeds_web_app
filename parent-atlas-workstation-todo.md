# Parent Atlas Workstation TODO

**Status**: LAYER 1 🟡 FIELDS POPULATED, IDENTITY MODEL NOT YET PROVEN (see corrected section below, 2026-08-02) | EXPORT STACK ✅ READY | LANE ALIGNMENT ⏳ IN PROGRESS

---

## Event Plane

PostgreSQL is the canonical task, gate, checkpoint, and outbox store for Atlas work. RabbitMQ handles durable async dispatch, Redis / Valkey holds hot context and leases, Arrow + `mmap` hold immutable batch snapshots, and gRPC / Protobuf carries typed sidecar commands. Browser-local work stays in Web Workers, IndexedDB, Service Workers, and SharedArrayBuffer; those are compute or cache lanes only, not canonical state.

Current lane map:

- Postgres: canonical identity, packet spine, provenance, and recommendation log.
- Qdrant: main codebase chunk retrieval lane, retrieval mirror, and named-vector / multivector semantic analysis lane.
- Neo4j: CPU/JVM topology lane for PageRank, graph expansion, and multi-hop context; not GPU-enabled by Docker passthrough.
- Redis / BitFrost: hot packet cache, centroid routing, and short-lived replay state.
- cuVS / GPU: ANN staging, rerank input, batch graph analysis, and benchmark lanes in a separate analytics service.
- Token cache: exact model-state reuse only; key on model/tokenizer/prefix/config revisions, not on query similarity.
- Inference: embeddings and generation compute only; do not let it decide identity or promotion.
- Retrieval: candidate gathering and reranking only; no canonical truth or schema ownership.
- Feature / geometry: numeric evidence, routing scores, and 4D metric-tensor diagnostics only.
- Graph: PageRank / communities / k-core / betweenness / bounded traversal evidence.
- Hypergraph: n-ary relation and event structure lane for joint facts, not a second retrieval owner.
- `embeddinggemma`: canonical embedding family at `768`; any `384`-dimensional artifacts are migration evidence only, not an active retrieval lane.
- `768`: main codebase chunk lane.
- `384`: legacy migration / projection evidence only; never an active retrieval lane.
- `64`: routing / clustering lane only.
- `okf` YAML: declarative contract lane for LDR, semantic labeling, and workflow metadata.
- Firecrawl / Pydantic: research ingestion, validation, and schema-gated extraction lane.
- PyTorch / TorchInductor: GPU training, reranking, compiled numeric kernels, and sidecar analytics.
- atlas-tools: query-context preamble lane for intent, retrieval hints, and compact RAG injection.
- ACE packet: assembly / materialization lane for compact synthesis output and packet persistence.
- ACE packet: compact synthesis and semantic labeling output, not raw corpus state.
- TileKey / LOD memory hierarchy: design-only memory management model; 4D coordinates map to logical TileKey, never a GPU pointer directly.

### Current live owners discovered in this review

| Lane | Status | Owner files | Notes |
|---|---|---|---|
| MCP transport / `/mcp` / `/sse` | created + wired; proof pending | `sveltekit-frontend/src/routes/api/mcp/+server.ts`, `sveltekit-frontend/src/routes/api/sse/chat/+server.ts`, `sveltekit-frontend/src/lib/server/mcp/trace-http.ts` | The route handlers and HTTP client exist; keep TRACE core enabled and sidecars opt-in until transport matches are confirmed live. |
| Claude-Mem export/import | created + wired; export-path alignment pending | `sveltekit-frontend/src/lib/server/memory/claude-mem.ts`, `sveltekit-frontend/src/lib/server/memory/claude-mem-ingest.ts` | Dynamic import plus ingest pipeline exist; importer runs stay blocked until the export path is aligned. |
| Engram ingestion | created + wired; deferred | `sveltekit-frontend/src/lib/server/ai/engram-memory.ts`, `sveltekit-frontend/src/lib/server/memory/local-engram-memory-adapter.ts` | The memory lane is present, but the persistent ingestion lane stays deferred until transport and importer paths are stable. |
| Redis 8 eval cache | created + wired; eval-only | `sveltekit-frontend/src/lib/server/cache/*`, `sveltekit-frontend/src/lib/server/ace/ace-context-pack-cache.ts` | Keep Redis 8 isolated as an eval lane and compare it only after the current ACE context cache lane is stable. |
| Feature-gap registry | created + wired; live scan pending | `sveltekit-frontend/src/lib/server/atlas/master-feature-map.ts`, `sveltekit-frontend/src/lib/server/atlas/route-feature-map.ts`, `sveltekit-frontend/src/lib/server/atlas/runtime-registry.ts` | Current inventory exists, but the bootstrap registry still needs a live app workspace scan. |
| OKF / taxonomy / ontology / linked tuples | created + wired; schema and navigation live | `docs/.okf/schema.yaml`, `docs/.okf/registry.yaml`, `docs/.okf/README.md`, `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts`, `sveltekit-frontend/src/lib/server/ontology/ontology-extractor.ts`, `sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts`, `sveltekit-frontend/src/lib/server/atlas/pos-concept-tagging-lane.ts` | `schema.yaml` is the schema source of truth, `registry.yaml` is the navigation layer, and the live runtime contracts stay in their existing owners; use this lane for codebase topology classification, domain classification, POS / concept tagging, and ontology linking, but not semantic truth or identity ownership. |
| ClusterCard / GlyphRecord / CHR97 | created; mapping pending | `sveltekit-frontend/src/lib/server/retrieval/cluster-card-contract.ts`, `sveltekit-frontend/src/lib/server/cartridge/glyph-record.ts`, `sveltekit-frontend/src/lib/server/cartridge/chr97-builder.ts` | Keep this downstream of transport proof and registry proof. |

### OKF / telemetry / ontology-linked tuple boundary

This is a contract block, not a new owner.

- `timestamp`: provenance only. Use it to order or compare events, not to define identity.
- `HyperLogLog`: telemetry only. Use it for approximate breadth counts such as distinct workflows,
  symbols, users, packets, and retrieval neighborhoods. Do not use it to decide eviction or
  canonical cache truth.
- `OntologyLinkedTuple`: evidence layer only. Keep it as `subject / predicate / object / evidenceRef`
  with explicit `sourceRevision`, `representationRevision`, and producer revision fields. It is a
  linked evidence record, not semantic truth.
- `DomainClassification`: OKF / taxonomy lane. Use it for domain labels and ontology navigation.
- `Low-rank sampling`: retrieval / approximation experiment only. Keep Tang-style sketching with the
  retrieval LOD / algorithm taxonomy lane, not the ontology lane.

Suggested field list:

```ts
type OntologyLinkedTuple = {
  subject: string;
  predicate: string;
  object: string;
  evidenceRef: string;
  timestamp: string;
  sourceRevision: string;
  representationRevision: string;
  producerId: string;
  producerRevision: string;
  domainClass?: string;
};

type TelemetryBreadth = {
  packetKey: string;
  workflowHllKey?: string;
  symbolHllKey?: string;
  userHllKey?: string;
  neighborhoodHllKey?: string;
  countedAt: string;
};
```

Ownership boundaries:

- OKF / ontology owns classification and linked-evidence navigation.
- Workstation telemetry owns HyperLogLog breadth counters.
- Retrieval / approximation owns low-rank sampling experiments.
- Neither HyperLogLog nor low-rank sampling may rewrite canonical packet identity or semantic truth.

### Current Proven Stop State — 2026-08-10

This is the durable sequencing record. T6c is complete as an experiment and must not be reopened
as if KMeans still needs first proof.

T6c proven
↓
KMeans routing experiment stays CACHE_HINT_ONLY
↓
SOM 20×20 remains a separate cache-hint experiment
↓
Arrow mmap → pinned host → exact GPU tile
↓
ACE / BitFrost / Valkey residency
↓
GA8 wide ablation
↓
GA9 feature promotion
↓
deterministic HMM + linear policy baseline
↓
DSPy program contract
↓
GEPA reflective optimization
↓
4D geometry / Jacobian experiments
↓
HyperGraphRAG GPU experiments
↓
QLoRA / SFT
↓
DPO
↓
PPO only if still justified

## T6c current proven stop state

1. Canonical source representation is frozen `semantic_768`.
2. KMeans artifacts were produced for `K ∈ {64, 128, 256}` with centroid, membership, and provenance artifacts persisted.
3. Each clustering configuration was evaluated against the already-proven T3a exact cosine oracle.
4. KMeans achieved useful corpus reduction but did not preserve perfect Recall@10, so it is `KMEANS_ROUTING_EXPERIMENT_PROVEN` and `CACHE_HINT_ONLY`.
5. SOM remains a separate 20×20, 400-cell topology experiment and must be evaluated with the same exact-oracle methodology before any promotion.
6. Do not rerun T6c to increase coverage, and do not use KMeans membership as canonical packet identity.
7. Do not start AE, RRF, Neo4j projection, or GA8/GA9 promotion from this lane.
8. Do not silently substitute 384-dimensional vectors; future compressed latents must be separately revisioned experiments.

## Phase 3 canonical 768-dim note

Phase 3 uses the frozen `semantic_768` representation everywhere in the live path.
`384`-dim references are legacy or derived lanes only; they do not become canonical writers,
canonical retrieval truth, or new owner boundaries.

- Stage 3B: community_id propagation and AST symbol extraction.
- Stage 3C: SOM 20×20 as a separate 400-cell topology experiment over `semantic_768`.
- Stage 3D: reranker feature preparation from packet evidence.

`latent_64` is legacy routing compatibility only. Any future latent compression work should be a
separately revisioned experiment, with `latent_128` the more plausible candidate if one is needed.
The phrase `kmeans 20x20` is not the correct terminology; KMeans uses `K ∈ {64, 128, 256}` and SOM
is the separate 20×20 topology experiment.

## Separate lane: Kafka / CDC / Rust sidecar analysis

This workstream is design-only until explicitly opened as its own task.

- Kafka / CDC is not part of the current T6c or Graphify sequence.
- PostgreSQL 18 specifics are not a canonical owner here; they are an integration target only if a
  separate ingestion lane proves they matter.
- Rust sidecar analysis is a separate infrastructure lane, not a replacement for the current
  Python / SvelteKit / GPU split.
- Do not let bitmap / aio / CDC ideas redefine the `semantic_768` routing proof.
- If this lane is ever opened, it should start from evidence of a real producer / consumer gap,
  not from the KMeans or SOM evaluation path.

## Sequencing and Gate Order

### P2 transport and ingestion gates

1. Finish the MCP / `/mcp` / `/sse` diagnostics.
2. Keep TRACE core enabled and optional sidecars opt-in until transport matches are confirmed.
3. Resolve Claude-Mem export path alignment before any importer run.
4. Keep the persistent Engram ingestion lane deferred until the transport and importer path are stable.
5. Keep Redis 8 isolated as an eval lane and compare it only after the current ACE context cache lane is stable.

### P2 registry and retrieval policy

1. Replace the bootstrap feature-gap registry with a live app workspace scan when the mounted codebase is available.
2. Ingest the current feature inventory into the registry and mark each lane as implemented, partial, missing, or eval-only.
3. Keep the retrieval policy explicit: exact cache first, then semantic cache, then retrieval, then packet assembly.
4. Keep single-fact lookups on vector search, code navigation on agentic search, and graph-heavy data on graph lanes.

### P3 storage, cards, and synthesis

1. Build ClusterCard flow from reviewed sourceRefs and table contracts.
2. Keep the semantic cache policy split between Redis exact-card lookup and Qdrant dense retrieval.
3. Add graph refresh manifest discipline with version/hash and promotion state.
4. Wire synthesis consumers only after the packet/version contract stays stable.

### P3 validation and structural promotion

1. Stabilize the 768d -> 64d latent -> cluster -> JSON graph path.
2. Define the canonical ClusterCard -> GlyphRecord -> CHR97 mapping.
3. Keep manifold4 as a later analytical lane, not a correctness gate.
4. Treat the ACE Context Pack Cache / NES Cartridge Cache as Redis-hot-pointer plus Postgres-durable storage only; large snapshot storage stays open.

### P4 semantic memory and checklist mining

1. Keep the semantic indexer as a first-class lane.
2. Keep its outputs consumable by the feature-gap registry without rereading whole corpora.
3. Keep the semantic lane aligned with the ACE/NES packet contract and version field.
4. Add smoke/report outputs to registry rows for retrieval lanes and feature-map lanes.
5. Use LangChain later only as an optional organizer for messy `.md` / `.json` after LangExtract.

### Token remapping and geometry lanes

1. `autoencoder`: default lane for token remapping, latent projection, and route compression.
2. `decoder-upscale`: optional reconstruction / upscaling lane; do not make it the identity owner.
3. `bvh-geometry`: spatial traversal and visualization lane only.
4. `riemannian-geometry`: metric-tensor and distortion diagnostics lane only.
5. `kmeans-64-128-256`: centroid routing topology lane; do not label it `kmeans-20x20`.
6. `som-20x20`: separate 400-cell cache-hint topology experiment, not KMeans.
7. `glyph-animation`: NES / CHR97 / sprite visualization lane; never the canonical retrieval lane.

### Optional downstream phases

1. Phase 10B TurboVec + Qdrant optimization.
2. Phase 11 cuVS / CUDA sidecar benchmark.
3. Phase 12 CUDA streams / tensor bridge / RNN experiments.
4. Phase 13 graph synthesis + feature MapReduce.
5. Phase 14 DuckDB + LangGraph + Langfuse.
6. Phase 15 feature labeling + pruning.
7. Phase 16 implement missing features.
8. Phase 17 optional LangChain organizer after LangExtract.
9. Phase 18 WebGPU TypeScript MapReduce matrix and CUDA/libtorch experiments.
10. Phase 19 deterministic HMM + linear policy baseline.
11. Phase 20 DSPy program contract for Atlas agent programs.
12. Phase 21 GEPA reflective prompt/program optimization on RouteTrace and eval traces.
13. Phase 22 XGBoost / gradient boosting / reinforcement-learning experiments.
14. Phase 23 QLoRA / SFT.
15. Phase 24 DPO.
16. Phase 25 PPO only if still justified.

Phase 18 and Phase 22 overlap conceptually for boosting-based work; treat Phase 18 as the current
evaluation surface and Phase 22 as any later learned-policy experimentation, or you create two
owners for the same capability.

### Conservative phase-status snapshot

| Phase | Status |
|---|---|
| Phase 11 Engram/Gemma4 memory wiring | partial |
| Phase 12 Parent Atlas codebase index | partial |
| Phase 13 feature-gap registry completion | partial |
| Phase 14 Redis exact-card cache policy | implemented |
| Phase 15 Qdrant semantic lane | implemented |
| Phase 16 Graph/KAG/DAG refresh manifest | partial |
| Phase 17 PyTorch feature extraction lane | partial |
| Phase 18 XGBoost / gradient tree boosting reranker | partial / evaluation surface |
| Phase 19 deterministic HMM + linear policy baseline | partial |
| Phase 20 DSPy program contract | planned |
| Phase 21 GEPA reflective program optimization | planned |
| Phase 22 XGBoost / gradient boosting / reinforcement-learning experiments | later experimental lane |
| Phase 23 QLoRA / SFT | eval-only |
| Phase 24 DPO | eval-only |
| Phase 25 PPO | eval-only / not yet graded |

### Evidence artifacts

- `.tmp/parent-atlas-workstation-todo.json`
- `reports/parent-atlas-workstation-todo.md`
- `docs/reports/parent-atlas-workstation-status.md`
- `docs/reports/parent-atlas-workstation-status.json`
- `docs/reports/parent-atlas-workstation-openspec-task-board.md`
- `docs/reports/parent-atlas-workstation-openspec-task-board.json`
- `reports/parent-atlas-open-lanes-todo.md`
- `docs/reports/parent-atlas-open-lanes-todo.md`

The gate model is executable state: task created -> PostgreSQL row written -> outbox event emitted -> RabbitMQ worker claimed -> gates evaluated -> task transitions READY / CLAIMED / RUNNING / AWAITING_GATE / COMPLETED / FAILED. LLMs may recommend the next transition, but smoke and authorization outcomes must be recorded by the worker and gate evaluator.

## LAYER 1A: Canonical Packet Identity (✅ COMPLETE, corrected 2026-08-02)

**Current packet contract**

| Field | Status | Notes |
|-------|--------|-------|
| packet_key | PASS | canonical packet identifier |
| source_ref | PASS | canonical source identity reference |
| feature_id | PASS | canonical feature identifier |
| domain_class | PASS | classification only, not identity |
| title_id | PASS | stable packet metadata |
| canonical_source_ref | PASS | canonical source reference alias |

**Packet identity coverage**

| Surface | Status | Notes |
|---------|--------|-------|
| packet identity coverage | PASS | packet_key, source_ref, feature_id, title_id, canonical_source_ref |
| tree_node_id population | PASS | present on all packets, but provisional linkage only |
| qdrant_point_id population | PARTIAL | mirror coverage, not canonical identity |
| concept_ids population | PASS_WITH_GAPS | annotations present, provenance still incomplete |
| domain_class lineage | NOT_PROVEN | classification lineage only, not identity |

## LAYER 1B: Parse and Stable Symbol Identity (IN PROGRESS)

> **Correction**: `tree_node_id` is present everywhere, but that does not make it canonical.
> The live evidence says it is a provisional structural linkage, not a stable symbol identity.
> See `openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md` (GS1.9–GS1.11) for the current
> proof split:
> - `atlas_tree_nodes.node_id` is populated as a content-version / parse-occurrence hash, not a stable symbol id.
> - `scripts/atlas/phase1-tree-node-derivation.mjs` and `scripts/atlas/backfill-tree-nodes.mjs` still backfill
>   `tree_node_id` via heuristics and write it back to packets.
> - `graphify_symbols` is the better stable-symbol candidate, but it is not yet the live canonical owner.
> - Do not relax `atlas_graph_nodes_v2_tree_node_unique` or promote graph persistence until separate
>   `parse_node_id`, `symbol_id`, `symbol_version_id`, `chunk_id`, `packet_key`, and `graph_node_key`
>   contracts are live.
> - `concept_ids` are annotations, not identity links.

**Provisional linkage coverage**

| Surface | Status | Notes |
|---------|--------|-------|
| tree_node_id population | PASS | linkage exists on every packet |
| tree_node_id stable identity | FAIL | not proven canonical |
| symbol_id coverage | NOT_PROVEN | stable symbol contract not fully live |
| parse_node_id contract | NOT_DEFINED | separate parse occurrence contract still missing |
| concept_ids provenance | NOT_PROVEN | annotations present, provenance incomplete |
| qdrant_point_id coverage | PARTIAL | mirror only, not canonical truth |

**Current correction**

Do not present the chain as `packet_key → source_ref → feature_id → tree_node_id → domain_class`.
The safer chain is:

`source_ref` → `source_revision` → `parse_node_id` → `symbol_id` → `symbol_version_id` → `chunk_id` → `packet_key` → `graph_node_key`

`domain_class` and `concept_ids` are annotations, not identity links.

**Identity surface inventory**

| Entity | Current ID / Key | Derivation | Revision-bound | Current owner / role | Status |
|--------|------------------|------------|----------------|----------------------|--------|
| `graphify_files` | `file_id` | `workspace_id + source_ref` with revision-scoped versioning | Yes | source file identity candidate | PARTIAL |
| `graphify_symbols` | `symbol_id`, `stable_symbol_key` | stable symbol candidate within file context | Yes | stable symbol candidate | PARTIAL |
| `graphify_edges` | `edge_id` | `subject_symbol_id → object_symbol_id` | Yes | edge row identity / symbol relationship ledger | PASS |
| `atlas_packets` | `packet_key` | canonical packet registry key | Yes | packet truth / canonical packet row | PASS |
| `atlas_tree_nodes` | `node_id` | canonical document/chunk tree identity | Yes | canonical tree lineage / structural inventory | PROVEN for canonical tree lineage |
| `codebase_chunk_index` | `id`, `chunk_id`, `source_ref` | chunk mirror keyed by source/span | Yes | retrieval chunk mirror | PARTIAL |
| `atlas_packet_registry` | `packet_key` | packet registry backfill from canonical rows | Yes | hot packet registry / projection | PARTIAL |
| `atlas_representation_records` | `packet_id`, `representation_id`, `representation_revision` | representation lineage record | Yes | representation lineage ledger | PARTIAL |
| `atlas_topology_index` | `packet_key` | packet-level topology projection | Yes | topology / PageRank / SOM projection | PARTIAL (canonical packet coverage proven; synthetic rows remain) |

**Inventory notes**

- `tree_node_id` is now proven for the canonical packet→tree lineage path, but still acts as a linkage field rather than the stable graph identity.
- `graphify_files.file_id` is not yet proven to be a stable cross-revision file identity; treat it as a source identity candidate until the derivation is inspected.
- `graphify_symbols.symbol_id` exists, but cross-revision stability and `stable_symbol_key` formula are not yet proven.
- `graphify_edges` has valid row identity, but endpoint continuity still depends on the symbol identity proof.
- `symbol_id` is the best stable-symbol candidate visible in the repo, but the `symbol_version_id` contract is still missing.
- `concept_ids` are annotations attached to packets, not identity keys.
- `atlas_packet_registry` and `atlas_topology_index` are projections or mirrors, not canonical truth. Canonical packet coverage in `atlas_topology_index` is now proven; extra synthetic rows remain noncanonical.
- `codebase_chunk_index` is the bridge surface for retrieval and backfill, not the canonical packet owner.

**Identity status summary**

| Gate | Status | Notes |
|------|--------|-------|
| `GRAPHIFY_FILE_IDENTITY` | PARTIAL | source identity candidate only |
| `CROSS_REVISION_FILE_ID` | NOT_PROVEN | file identity across source revisions not yet proven |
| `GRAPHIFY_SYMBOL_ID_EXISTS` | PASS | symbol rows and IDs exist |
| `GRAPHIFY_SYMBOL_ID_CROSS_REVISION` | NOT_PROVEN | symbol identity stability across revisions not yet proven |
| `STABLE_SYMBOL_KEY_FORMULA` | NOT_PROVEN | formula still needs audit |
| `GRAPHIFY_EDGE_ROW_IDENTITY` | PASS | edge rows exist and are keyed |
| `GRAPHIFY_EDGE_ENDPOINT_STABILITY` | NOT_PROVEN | continuity depends on symbol identity proof |
| `TREE_NODE_VERSION_IDENTITY` | PROVEN | `tree_node_id` is revision-bound / occurrence-bound |
| `PACKET_TREE_LINK_SEMANTICS` | PROVEN | packet-to-tree linkage exists for all canonical packets |
| `IDENTITY_DERIVATION_PROOF` | IN_PROGRESS | read-only derivation audit not yet complete |
| `IDENTITY_OWNER_ASSIGNMENT` | IN_PROGRESS | source/symbol owners still need confirmation |
| `IDENTITY_SURFACE_INVENTORY` | PARTIAL | tables and roles inventoried, formulas still under audit |

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

### Phase 4: GPU + Research Runtime Prep

**Purpose**: Prepare the runtime lanes for LDR ingestion, GPU reranking, and semantic labeling
- **Script**: `npm run atlas:export:qlora:analyze` (coverage stats)
- **Script**: `npm run atlas:export:qlora:prepare` (full dataset, 58K records)
- **Script**: `npm run atlas:export:qlora:prepare:sample` (1K sample for testing)
- **CRITICAL**: DO NOT include qdrant_point_id, packet_key, or mmap offsets as training features
- **Input**: embedding_768, embedding_512, domain_class, topology (som_row/col, pagerank), features (ast_symbols, lexical, entities)
- **Keywords**: `embedding_768` → `embedding_512` → `domain_class` → `used_concepts`

**Naive Bayes Domain Fallback v3**
- **Purpose**: Provide a deterministic lexical fallback for domain classification when the semantic classifier is underconfident.
- **Stack**: split train/validation/test rows, multinomial Naive Bayes baseline, calibrated abstention gate, immutable prediction ledger.
- **Rules**: never write predictions back to canonical truth by `source_ref` alone; persist by `packet_key` with model/version lineage.
- **Keywords**: `naive_bayes_v3` → `abstain_threshold` → `packet_key` → `prediction_ledger` → `domain_class`

**LDR / OKF Lane**
- **Purpose**: Use local deep research to build evidence bundles, not canonical truth.
- **Stack**: `okf` YAML + Pydantic validation + Firecrawl fetch/extract + text normalization.
- **Output**: OKF topic bundles, citations, screenshots, and compact ACE packets.
- **Keywords**: `okf` → `pydantic` → `firecrawl` → `citations` → `ace_packet`

**atlas-tools Query Context Lane**
- **Purpose**: Build compact query context and intent preambles for ACE and chat routes.
- **Stack**: `atlas-tools_classify_intent` → `atlas-tools_build_agentic_rag_context` → `atlas-tools_build_recommendation` → `atlas-tools_record_outcome`.
- **Rules**: query context is not canonical truth and does not replace ACE packet assembly or LDR evidence. Do not invent a generic task agent hop or non-catalog tool names.
- **Keywords**: `atlas-tools_classify_intent` → `atlas-tools_build_agentic_rag_context` → `atlas-tools_build_recommendation` → `atlas-tools_record_outcome`
- **Flow**:
  - classify intent and domain first
  - build bounded ACE context from retrieved evidence
  - synthesize recommendation only after the packet exists
  - record outcome after success or failure is known

**ACE Packet Assembly Lane**
- **Purpose**: Materialize validated evidence into compact ACE packets for synthesis and persistence.
- **Stack**: ACE materializer + packet store + stream/packet routes + trace-backed tool context.
- **Rules**: ACE packets consume canonical and validated evidence; they do not establish source identity by themselves. A packet must reference authoritative packet keys, source refs, content hashes, and revision lineage before synthesis.
- **Keywords**: `ace_materializer` → `packet_store` → `packet_persistence` → `synthesis_output`

**Packet Wiring Audit**
- **Assembler / packetize**: `sveltekit-frontend/src/lib/server/ace/context-assembler.ts` and `sveltekit-frontend/src/lib/server/ace/parent-atlas-packet-assembler.ts` are wired into live ACE routes; `sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts` is the bridge that pulls the packet assembler into the larger feature path.
- **Validator**: `sveltekit-frontend/src/lib/server/acp/packet-assembler.ts` and `sveltekit-frontend/src/lib/server/acp/packet-envelope-validator.ts` are live ACP validation paths.
- **Materializer**: `sveltekit-frontend/src/lib/server/ace/ace-materializer.ts`, `sveltekit-frontend/src/lib/server/atlas/packet-parser.ts`, and `sveltekit-frontend/src/lib/server/hyperrag/hyperrag-packet-pipeline.ts` are defined, but their full runtime caller chain still needs one last proof pass before treating them as fully wired.
- **Audit rule**: do not promote packet materialization as complete until the caller trace is confirmed end to end.

| File | Status | Phase / lane | Evidence |
| --- | --- | --- | --- |
| `sveltekit-frontend/src/lib/server/ace/context-assembler.ts` | LIVE | ACE Packet Assembly Lane / Phase 4D | Imported by live query, synthesis, agent, and router paths. |
| `sveltekit-frontend/src/lib/server/ace/parent-atlas-packet-assembler.ts` | LIVE BRIDGE | ACE Packet Assembly Lane / Phase 4D | Imported by `indexed-source-packet.ts` and dynamically by the larger ACE feature assembler. |
| `sveltekit-frontend/src/lib/server/acp/packet-assembler.ts` | LIVE | ACP packet assembly / validation lane | Self-validates envelopes before return; used as an ACP packet assembly path. |
| `sveltekit-frontend/src/lib/server/acp/packet-envelope-validator.ts` | LIVE | ACP validation lane / Phase 4A adjacent | Used by ACP validation helpers and hyperRAG packet RPC validation. |
| `sveltekit-frontend/src/lib/server/ace/ace-materializer.ts` | TESTED / NO LIVE CALLER FOUND | ACE materializer lane | Imported by tests; no runtime importer found in the current scan. |
| `sveltekit-frontend/src/lib/server/atlas/packet-parser.ts` | DEFINES MATERIALIZE API / NO LIVE CALLER FOUND | Atlas packet parsing / materialization lane | Exports `profileArtifact` and `materializePackets`; no runtime importer found in the current scan. |
| `sveltekit-frontend/src/lib/server/hyperrag/hyperrag-packet-pipeline.ts` | DEFINED / REGISTRY-REFERENCED | HyperRAG packet pipeline lane | Present in runtime registry; no source import caller found in the current scan. |
| `sveltekit-frontend/src/lib/server/acp/packet-materializer-pipeline.ts` | ORPHAN UNTIL PROVEN | ACP materializer pipeline | No runtime importer found in the current scan. |

**Semantic Labeling / Recommendation Lane**
- **Purpose**: Turn validated packets into semantic labels, recommendation logs, and bounded candidate sets.
- **Stack**: PageRank + Neo4j projection updates + Qdrant RRF + PyTorch/TorchInductor rerank.
- **Output**: recommendation log rows, candidate summaries, and potential recommendation tasks.
- **Keywords**: `pagerank` → `neo4j` → `rrf` → `recommendation_log` → `potential_recommendations`

**Multivector Semantic Analysis Lane**
- **Purpose**: Keep dense, sparse, and late-interaction representations separate, then fuse them at query time.
- **Stack**: EmbeddingGemma query/document prompts + Qdrant named vectors + sparse vectors + multivector payloads + RRF fusion.
- **Rules**: do not collapse semantic, lexical, and late-interaction vectors into one unnamed embedding; preserve model/version lineage for each lane.
- **Output**: multivector packets, fusion scores, retrieval explanations, and analysis-ready semantic labels.
- **Keywords**: `embeddinggemma` → `named_vectors` → `sparse_vectors` → `multivector` → `rrf`

**GPU Graph Analysis Lane**
- **Purpose**: Export graph snapshots and batch metrics to a separate GPU analytics service.
- **Stack**: Postgres authority → Arrow / Parquet / NumPy export → cuGraph / cuML / cuVS / PyTorch sidecar → versioned projection import.
- **Rules**: GPU results are projections until written back through a versioned analysis run; Neo4j stays the topology projection store, not the authority.
- **Keywords**: `graph_revision` → `pagerank_alpha` → `cugraph` → `cuml` → `projection_import`

**Current Coverage**:
- Embeddings: 99.7% ✅ READY
- Topology: 21.6% (SOM 4.6%, PageRank 21.6%, community 21.6%)
- Features: 0.9% (ast_symbols), 2.4% (lexical), 0% (entities)

## Graph Retrieval / RTX Status

**Current verified status**

- `REPRESENTATION_LINEAGE_COLUMNS`: `PASS`
- `REPRESENTATION_READ_VALIDATION`: `PASS`
- `SEMANTIC_768_ENDPOINT`: `PASS`
- `SEMANTIC_768_REPAIR_ALIAS`: `PASS`
- `LEGACY_384_ACTIVE_WRITES`: `MIGRATION_SOURCE_ONLY`

**Keep separated**

- Representation lineage columns: `source_representation_id`, `source_dimension`, `projection_representation_id`, `projection_dimension`, `encoder_revision`, `som_revision`
- Analytical lineage: `graph_revision`, `pagerank_revision`, `pagerank_score`, `community_revision`, `community_id`, `kmeans_revision`, `kmeans_cluster_id`, `centroid_distance`

**Counts to preserve**

- `atlas_packets`: `61,659`
- `atlas_packet_registry`: `58,324`
- `atlas_summary_layers`: `18,437`
- `packet summaries`: `7,061`
- `populated summary layers`: `7,061`
- `codebase_chunk_index`: `52,417`
- `atlas_feature_envelopes`: `58,365`

- Summary storage proof is live and PASS; chunk-to-summary promotion is wired, but only rows with packet context are promotable.
- Next summary gate is producer ownership: the app-side `summary_embedding_384` path must be treated as legacy-only, not a canonical writer. Canonical summary embeddings must use `semantic_768` / `dimension=768` with provenance, or be explicitly labeled derived/compatibility.

**Latest launch states**

- `PATCH_TOURNAMENT_SPEC`: `RECEIVED_NOT_STARTED`
- `PATCH_TOURNAMENT_BOUNDED_SEAM`: `QUEUED`
- `GRAPHIFY_RECOVERY_PROOF_LADDER`: `PASS`
- `GRAPHIFY_DAILY_STARTED`: `PARTIAL`
- `GRAPHIFY_DAILY_COMPLETED`: `NOT_PROVEN`
- `GRAPH_SNAPSHOT_FRESH`: `PASS`
- `DEEP_AUDIT`: `NOT_PROVEN`

**Rejected / retiring**

- `content_embedding_768`: flagged dead
- `error_embedding`: flagged dead
- `REFERENCE_AUDIT`: not run
- `DROP_APPROVAL`: blocked


## Graph Identity Audit Next Steps

**Status**: BLOCKED until the identity model is separated from the provisional structural snapshot.

**Latest live audit (2026-08-10)**: `atlas_tree_nodes` row_count `269,972`; canonical document rows `61,658`; canonical chunk rows `61,659`; canonical `source_ref` uniqueness `PASS`; canonical `page_index_path` uniqueness `PASS`; `atlas_packets → atlas_tree_nodes` packet linking `61,659/61,659`; orphan count `0`; max depth `2`; gate result `PACKET_TREE_LINEAGE_PROVEN`.

### Immediate Checklist

- [ ] Inventory identity fields across `atlas_tree_nodes`, `atlas_packets`, `graphify_files`, `graphify_symbols`, `graphify_edges`, and the topology tables.
- [x] Eliminate the 125 canonical `page_index_path` collisions by making the path stable-hash based on canonical `source_ref` rather than lossy slug text.
- [ ] Add or confirm canonical uniqueness invariants for document roots by `source_ref` and packet chunks by `packet_key` before any topology-ranking work consumes tree lineage.
- [ ] Define separate contracts for `parse_node_id`, `symbol_id`, `chunk_id`, `packet_key`, `concept_id`, and `graph_node_key`.
- [ ] Split `tree_node_id` from stable symbol identity: add or confirm `symbol_version_id` for version-bound occurrences and keep `symbol_id` as the stable cross-revision key.
- [ ] Inventory the parser manifest vs runtime implementation: declared `tree-sitter typescript v1` vs actual regex/heuristic extraction.
- [ ] Reclassify the current graph artifact as a provisional structural snapshot until the enrichment chain is proven. Canonical tree lineage is now proven; topology and summary projections remain separate.
- [ ] Keep `tree_node_id` uniqueness intact for now; do not relax or drop the constraint yet.
- [ ] Confirm whether `page_index_path` is still being used as a catch-all identity in any remaining ETL or backfill script.
- [ ] Prove the retrieval chain in order: `semantic_768` coverage, KNN top-k, KMeans, 20x20 SOM, then PageRank.
- [ ] Revisit graph snapshot apply behavior only after the identity and enrichment gates pass.

### Proof Gates

**Completeness scale**: `0` = blocked / not proven, `100` = proven end state.

| Gate | Status | Completeness | Notes |
|------|--------|--------------|-------|
| PARSE_NODE_IDENTITY | PARTIAL_PROVEN | 60 | parser-backed occurrence identity is live, but page-index collisions still need cleanup |
| STABLE_SYMBOL_IDENTITY | NOT_PROVEN | 5 | stable cross-revision symbol identity not yet proven live |
| SYMBOL_VERSION_IDENTITY | NOT_PROVEN | 0 | revision-bound symbol version contract still missing |
| PACKET_TO_SYMBOL_LINEAGE | PARTIAL_PROVEN | 20 | packets link to canonical tree nodes, but not all packets have tree coverage yet |
| DOMAIN_CLASSIFICATION | PARTIAL_PROVEN | 55 | current class population exists, lineage/proof ledger incomplete |
| CONCEPT_EXTRACTION | PARTIAL_PROVEN | 50 | concept rows exist, provenance and edge ledger still incomplete |
| PARSER_MANIFEST_ALIGNMENT | FAIL | 10 | runtime still mismatches the declared parser story |
| TREE_NODE_ID_STABILITY | FAIL | 0 | tree node identity is still provisional |
| SYMBOL_SEMANTIC_768 | NOT_PROVEN | 0 | symbol-version semantic lane not proven |
| KNN_TOPK_RETRIEVAL | NOT_PROVEN | 0 | retrieval lane not yet proven against canonical identities |
| KMEANS_ASSIGNMENTS | PARTIAL / STALE | 35 | assignments exist, run lineage and freshness are incomplete |
| SOM_20X20_ASSIGNMENTS | PARTIAL / STALE | 30 | SOM coverage exists, current run lineage is incomplete |
| PAGERANK_PERSISTENCE | NOT_PROVEN | 0 | graph authority persistence still blocked from canonical identity proof |
| PROVISIONAL_STRUCTURAL_SNAPSHOT | DRY_RUN_PASS | 100 | provisional artifact materializes successfully in dry-run form |
| CANONICAL_GRAPH_SNAPSHOT | NOT_PROVEN | 0 | canonical graph snapshot still gated on identity separation |
| GRAPH_SNAPSHOT_APPLY | ROLLED_BACK | 0 | apply was correctly stopped |
| TREE_NODE_UNIQUENESS_CHANGE | BLOCKED | 0 | uniqueness constraint remains intact |

## Repository-First Search Checklist

**Status**: PARTIAL - owner surfaces located; runtime proof still pending.

The next bounded step is to reuse the existing owners instead of wiring a second implementation. Static search has already located several likely entrypoints, but that does not prove runtime behavior.

| Surface | Current owner candidates found in repo | Evidence status |
|---------|----------------------------------------|-----------------|
| Diff context / patch context | `scripts/ace-diff-sniffer.mjs`, `sveltekit-frontend/src/lib/server/atlas/context-for-file.ts`, `sveltekit-frontend/src/mcp/trace-mcp-server.ts` | PARTIAL_PROVEN |
| Recommendation record / supersession | `sveltekit-frontend/src/lib/server/ace/recommendation-record.ts`, `sveltekit-frontend/src/lib/server/mcp/phase109a-mcp-tools.ts`, `sveltekit-frontend/src/lib/server/retrieval/feature-record.ts`, `sveltekit-frontend/src/lib/server/retrieval/promote-results-outbox.ts` | PARTIAL |
| Validation receipts / proof gates | `sveltekit-frontend/src/lib/server/atlas/contracts/validation-result-v1.ts`, `sveltekit-frontend/src/lib/server/agent/execution-review.ts`, `scripts/opencode/validation-gate.mjs` | PARTIAL |
| Hot / warm / cold storage | `sveltekit-frontend/src/mcp/engram_tools.ts`, `sveltekit-frontend/src/lib/server/cache/*`, `sveltekit-frontend/src/lib/server/retrieval/*` | PARTIAL |
| Tensor / gRPC / protobuf | `sveltekit-frontend/src/lib/server/atlas/go-retrieval-grpc-client.ts`, `sveltekit-frontend/src/mcp/server.ts`, `sveltekit-frontend/src/lib/server/atlas/atlas-semantic-tools.ts` | PARTIAL |
| SOM / KMeans / topology | `sveltekit-frontend/src/mcp/server.ts`, `sveltekit-frontend/src/lib/server/atlas/atlas_embedding_tools.ts`, `scripts/agents/som-cluster-cards.mjs` | PARTIAL |
| NLP / LDR sidecar | `sveltekit-frontend/src/mcp/trace-mcp-server.ts`, `sveltekit-frontend/src/mcp/ldr-research-tools.ts` | PARTIAL |
| Graph retrieval / projection | `sveltekit-frontend/src/lib/server/retrieval/*`, `sveltekit-frontend/src/lib/server/atlas/graph/*`, `sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board.ts` | PARTIAL |

### Checklist to keep bounded

- [ ] Reuse the existing diff-context owner instead of adding a second diff parser.
- [ ] Reuse the existing recommendation/supersession path instead of inventing a new status ledger.
- [ ] Reuse the existing validation receipt path instead of storing proof in logs only.
- [ ] Reuse the existing storage tier split: hot cache, canonical Postgres, cold object storage.
- [ ] Reuse the existing tensor/gRPC path instead of sending large tensors through ad hoc JSON.
- [ ] Reuse the existing SOM/KMeans lane only after its runtime proof is explicit.
- [ ] Reuse the existing NLP / LDR sidecar only after its runtime path is proven, not just referenced.
- [ ] Reuse the existing graph retrieval path only after the owner, entrypoint, and tests are located.
- [ ] Record runtime proof separately from static owner discovery.

**Runtime proof captured**

- `tests/routes/auto/api/ace/recommendations.test.ts` now proves the HTTP wrapper around `contextForFile()` returns the expected packet shape and stable unauthorized envelope.
- The direct `contextForFile()` invocation still needs a lighter smoke path if we want proof of the heavy atlas-load branch specifically.

**Do not** wire new implementations until the owner file, runtime entrypoint, and tests are all located.

## Telemetry and packet provenance ladder

This section records the remaining measurement gaps only. It does not create new owners or
replace any existing transport, resource, or packet contracts.

### Layer 2: RPC / Transport telemetry

**Status**: PARTIAL

- gRPC clients already exist; HTTP fallbacks are already wired.
- Remaining telemetry must measure protobuf encode latency, protobuf decode latency, JSON
  stringify overhead, and JSON parse overhead.
- Transport provenance must record the live protocol version used for each trace event
  (`grpc` vs `http`).
- Keep transport validation separate from the canonical tensor / gRPC / protobuf boundary.

### Layer 3: Resource telemetry

**Status**: PARTIAL

- GPU work already exists; the missing piece is per-operation timing and kernel identity.
- Record per-kernel telemetry for embedding, GEMM, cosine similarity, top-k, cross-encoder,
  autoencoder, and SOM lookup.
- Record Redis, Qdrant, and Neo4j operation telemetry separately instead of folding them into
  parent tool timing.

### Layer 4: Packet-centric provenance

**Status**: NOT YET

- Add `packet_id`, `feature_id`, `source_ref`, and `som_cell` to every trace event.
- Track `schema_version`, `embedding_version`, `tool_version`, `gpu_kernel_version`, and
  `rpc_transport` on every packet-producing or packet-consuming event.
- Keep the provenance trail complete from ACP decision to final result; do not rely on logs only.

### Session 84 / 85 work order

1. Wire transport telemetry first: encode, decode, JSON stringify / parse, protocol version.
2. Wire resource telemetry next: GPU kernels, Redis, Qdrant, Neo4j.
3. Add packet-centric provenance fields to every trace event.
4. Keep proof separate from promotion; the presence of telemetry does not imply a new owner.

### Phase 5: Go Sidecar (Optional)

**Purpose**: Standalone search service (no Python dependency)
- Status: Not yet integrated
- Keywords: `search_query` → `go_retrieval` → `ranked_packets` → `union_blend`

### Phase 23: QUIC / UDP / gRPC Transport Validation

**Purpose**: Validate unordered UDP datagrams through QUIC packet-number / AEAD checks, then
reassemble per-stream results for typed gRPC/HTTP3 fixtures. This is a proof lane, not a new
transport owner.
- Status: not started
- Status: wired in code; proof in progress
- Keywords: `udp_datagram` → `packet_number` → `aead_tag` → `stream_reassembly` → `grpc_http3`
- Do not globally sort transport packets; validate and reassemble by QUIC connection / stream.
- Keep the canonical tensor / gRPC / protobuf path as the app-side typed transport boundary.
- Validate duplicate / replay / malformed-packet rejection before any RPC smoke is promoted.

### Phase 24: RTX Embeddings + Vector LOD Ladder

**Purpose**: Use RTX for embeddings and matrix scoring, then split vector search into exact,
hot ANN, and cold ANN tiers with clear ownership. Valkey stays cache / lightweight lookup only;
it does not own Vamana or RTX search.
- Status: not started
- Keywords: `semantic_768` → `PyTorch` → `cuBLAS` / `cuBLASLt` → `cuVS brute_force`
  → `cuVS CAGRA` → `cuVS Vamana` → `DiskANN`
- Embeddings: PyTorch / TorchInductor on RTX, with cuBLAS / cuBLASLt underneath for GEMM-heavy
  work.
- Exact oracle: cuVS brute_force.
- Hot ANN: cuVS CAGRA on the active RTX working set.
- Cold ANN build: cuVS Vamana serialization into DiskANN-compatible files; CPU DiskANN serves
  queries.
- Optional cache lane: Valkey / RedisVL vector lookup may be used as a hot cache / lightweight
  retrieval helper, but it is not the ANN owner.
- Smallest concrete proof: Arrow mmap → pinned batch → async H2D → GPU tile → exact GEMM →
  top-k → compare against the already-proven exact-KNN oracle, with per-stage timing captured
  before expanding the ladder.
- DLSS-like reconstruction, if used at all, belongs after the exact GPU tile proof as an optional
  decoder-upscale consumer of the routed tile; it does not replace the Arrow → pinned host → GPU
  tile path and does not own representation identity.
- Keep Hilbert-space / manifold math as representation geometry only, not identity or transport.
- Keep the 20×20 SOM as a routing surface only; 4D topology / metric-tensor diagnostics stay
  experiment-only and do not redefine semantic truth.
- The full tile-cache / LOD hierarchy is design-only until the simpler vector proof is live.

### Phase 27: OKF Fit + HMM Router + Provenance Ladder

**Purpose**: Route between domain categories and agent states using a calibrated logistic fit
classifier plus HMM/Viterbi state decoding, while keeping rerankers, validators, and cache
residency separate from canonical truth.
- Status: not started
- Keywords: `NaiveBayes` → `LogisticRegression` → `HMM` / `Viterbi` → `Merkle`
  → `Arrow mmap` → `Valkey residency` → `TaskSignature`
- Naive Bayes: lexical-only baseline, not the canonical router.
- Logistic regression: canonical soft-fit classifier for OKF / domain routing.
- HMM / Viterbi: temporal state decoder over pass observations.
- MiniLM / MixedBread: reranker only, never the router.
- Deterministic validation: schema validity remains a validator, not a learned model.
- Evidence identity: use UUIDv7 for run/task/evidence IDs and SHA-256 / Merkle roots for bundle
  deduplication.
- Large tensors and replay artifacts: Arrow IPC / mmap, not Postgres or Valkey blobs.
- Cache ownership: Valkey stores hot metadata, leases, and residency state only.
- Keep coarse agent tools only (`classify_request`, `search_candidates`, `analyze_structure`,
  `traverse_graph`, `compile_evidence`, `synthesize_recommendation`, `execute_validation`).
- Current proof: `okf-fit` now computes separate naive Bayes and logistic scores inside the OKF
  packetizer path; focused vitest coverage is green and the packetizer runtime smoke resolves the
  new scores end to end; the packetizer now also emits a derived HMM observation/state hint in the
  NLP provenance blob. Broader workspace typecheck still needs a rerun before treating the lane as
  fully proven.

### Phase 28: Graph Hierarchy + Projection Distortion

**Purpose**: Keep graph hierarchy, geometric distortion, and routing surfaces separate so Louvain,
SOM, and projection-quality metrics do not collapse into one owner.
- Status: wired in code; proven by unit tests
- Keywords: `Louvain` → `community_level` → `hierarchy` → `Jacobian` → `singular_values`
  → `projection_distortion`
- Louvain / community hierarchy: graph structure and coarse topology only.
- Jacobian / singular values: local distortion / expansion of a learned projection.
- Matrix RTX math: fast projection, centroid scoring, and routing-measure computation.
- 2D SOM: routing surface / locality map only, not identity.
- Do not use cross-product magnitude as a routing scalar.
- 4D manifold / metric-tensor calculations remain diagnostic only; they can inform routing, but
  they do not become a canonical ownership layer.
- Contracts: `sveltekit-frontend/src/lib/server/atlas/graph/routing-manifest.ts`

### Phase 29: Routing Map + Distortion Metrics

**Purpose**: Emit typed routing manifests for graph hierarchy, SOM routing, and projection quality
so the workspace can compare locality experiments without changing canonical truth.
- Status: wired in code; proven by unit tests
- Keywords: `RoutingMapManifest` → `GraphHierarchyManifest` → `ProjectionDistortionStats`
  → `neighborhood_preservation`
- Graph hierarchy manifest: community level, community id, parent community, member count.
- Routing map manifest: SOM row/col, cluster id, route neighborhood, active revision.
- Distortion stats: Jacobian norm, singular value spread, neighborhood preservation score.
- All outputs are experimental projections until evaluated against replay / ablation.
- Contracts: `sveltekit-frontend/src/lib/server/atlas/graph/routing-manifest.ts`

### Phase 30: Hypergraph / Multi-hop Traversal Experiment

**Purpose**: Keep n-ary evidence and multi-hop traversal separate from the canonical retrieval
lane until the live API shape is inspected and the simpler vector / graph lanes are proven.
- Status: design-only
- Keywords: `hyperedge` → `ontology_tuple` → `multi_hop` → `HNSW` → `TileKey`
  → `IndexDB` → `shader_cache`
- Hypergraph facts: joint events, linked ontology tuples, and repair/evidence bundles only.
- Traversal facts: bounded multi-hop graph programs only; never expose raw endless traversal.
- Memory facts: TileKeys and LOD swaps remain a logical cache model, not a GPU pointer layout.
- 20×20 SOM and 4D manifold diagnostics can feed this lane later, but they are not the owner.
- Do not start hypergraph-RAG until the API inspection, backend classification, kmeans wiring,
  and live sidecar blockers are resolved.

**Minimal schema sketch**

```ts
type GraphHierarchyManifest = {
  graphRevision: string;
  projectionRevision: string;
  communityLevel: number;
  communityId: string;
  parentCommunityId: string | null;
  memberCount: number;
};

type RoutingMapManifest = {
  graphRevision: string;
  projectionRevision: string;
  somRevision: string;
  somRow: number;
  somCol: number;
  clusterId: string | null;
  routeNeighborhood: string[];
};

type ProjectionDistortionStats = {
  graphRevision: string;
  projectionRevision: string;
  jacobianNorm: number | null;
  singularValues: number[];
  neighborhoodPreservation: number | null;
};
```

---

## LAYER 2: Compiler Output Expansion (⏳ READY TO EXECUTE)

**Current State**: ast_symbols 0.9%, lexical_features 2.4%, entities 0%, used_concepts 100%

**Phase 2A: Fix ast-grep Integration** (1-2h, BLOCKING)
- **Issue**: phase1-ast-grep still resolves synthetic packet_keys; it needs the canonical packet identity join before it can write into real `atlas_packets`
- **Action**: `npm run atlas:phase1:ast-grep:dry` → verify canonical packet_key readback → `--apply`
- **Keywords**: `ast_symbols` → `tree_sitter` → canonical `packet_key` join

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
- **Note**: Keep this on the JVM/CPU path; use the separate GPU analytics lane for batch experiments and projection refreshes.

**Phase 3C: Semantic Metrics**
- **Keywords**: `entropy` → `density` → `reachability` → `authority_score`

---

## LAYER 4: Runtime & Training (⏳ DESIGNED)

**Purpose**: Semantic classification, compiled GPU reranking, HMM error fixing, RL feedback

**Phase 4A: Pydantic + OKF Validation** (schema-gated research input)
- **Keywords**: `okf_yaml` → `pydantic` → `validation_error` → `evidence_bundle`

**Phase 4B: Firecrawl Ingestion** (web evidence extraction)
- **Keywords**: `firecrawl` → `source_snapshot` → `citation` → `research_bundle`

**Phase 4C: PyTorch / TorchInductor Reranker**
- **Keywords**: `rerank_score` → `torchinductor` → `compiled_kernel` → `gpu_batch`

**Phase 4D: ACE Packet Semantic Labeling**
- **Keywords**: `ace_packet` → `semantic_label` → `recommendation_log` → `bounded_candidates`

**Phase 4E: HMM Error Recovery**
- **Keywords**: `error_state` → `recovery_packet` → `confidence` → `fallback_adapter`

**Phase 4F: GPU Graph Analysis Export**
- **Keywords**: `postgraph_export` → `arrow_snapshot` → `cugraph` → `cuvs` → `projection_refresh`
- **Output**: graph metrics parquet, clusters parquet, centroids f16, and projection parity reports.

**Phase 4G: Research Lane Integration**
- **Keywords**: `firecrawl` → `pydantic` → `okf` → `ldr` → `ace_packet`
- **Output**: research bundles, semantic labels, and recommendation log entries with bounded evidence.

**Phase 4H: Multivector Retrieval**
- **Keywords**: `dense_vector` → `sparse_vector` → `late_interaction` → `named_vector` → `rrf`
- **Output**: hybrid candidate sets, per-lane scores, and packet-level semantic explanations.

---

## Review-derived missing items (2026-08-11)

This is the short execution list extracted from the current compiler / topology / runtime review. It stays aligned with the longer proof ladder below.

### Sequencing correction from the latest proof-spine review

- P0 canonical packet identity join remains the front-door blocker: do not advance PF4, graph dispatch, or runtime training on divergent packet keys.
- `packet-key-builder.ts` is now the canonical logical packet identity minting authority; `compute-packet-key.ts` is demoted to a compatibility / scoped-address helper.
- PF4A duplicate classification is sufficient to keep `analysis_pass_results` as append-only execution history; do **not** add hard uniqueness yet.
- Graph dispatcher / Louvain / PageRank paths exist, but the live proof gap is the dispatcher registry plus the replayable Louvain persistence receipt.
- Retrieval fusion still needs the live one-vote-per-lane receipt and the live fusion-owner matrix before frozen replay can close.
- Rust structural worker promotion stays descriptive only until parity, idempotency, and replay receipts exist.

### Current source map

- `sveltekit-frontend/src/lib/server/analysis/ast-grep-extractor.ts` currently emits real AST features, but the packet identity mapping still needs proof on the write path.
- `sveltekit-frontend/src/lib/server/atlas/feature-doc-enrichment.ts` is the live reader for `feature_structural_facts`, `feature_lexical_facts`, and ontology tuples; its upstream writers must be proven against real packet keys.
- `sveltekit-frontend/src/lib/server/analysis/ast-langextract-bridge.ts` and `sveltekit-frontend/src/lib/server/services/langextract-service.ts` are the likely entity-extraction path for the missing `entities` lane.
- `sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts` still carries LangExtract TODOs, so the retrieval-side consumer is not yet fully wired to the new compiler outputs.

### Layer 2: Compiler output expansion

- [ ] Fix `ast-grep` integration so `ast_symbols` write to real `atlas_packets` identities, not synthetic `packet_keys`.
- [ ] Trace the current `ast-grep` caller chain from `analysis/worker.ts` through the writer that persists `feature_structural_facts` and verify the live `packet_key` join.
- [ ] Finish lexical feature extraction so `lexical_features` moves past the current partial coverage.
- [ ] Verify `feature_lexical_facts` is populated from a live extractor, not only from fallback keywords / identifiers / symbols on the read side.
- [ ] Wire entity extraction through LangExtract so `entities` are no longer empty.
- [ ] Prove the `entities` lane on a real `LangExtract` response path, not only via the bridge fallback.
- [ ] Wire the remaining extractors for `imports`, `exports`, `functions`, `classes`, `routes`, and `permissions`.
- [ ] Decide whether `routes` and `permissions` belong in the AST lane or in a separate policy-enrichment lane.
- [ ] Verify all nine compiler-output fields against live packet evidence before any promotion.

### Layer 3: Metrics and topology

- [ ] Close the SOM 20×20 gate on latent vectors and record `som_row`, `som_col`, `som_cluster`, and `routing_locality`.
- [ ] Normalize PageRank authority into one canonical field before downstream use.
- [ ] Keep `community_id`, `k_core`, and centrality proofs on frozen snapshots before any GPU promotion.
- [ ] Keep NetworkX, Neo4j GDS, and cuGraph parity checks separate instead of merging them into one lane.
- [ ] Add the graph-dispatcher registry and the Louvain persistence receipt to the proof ladder before treating any dispatcher claim as closed.

### Layer 4: Runtime and training

- [ ] Gate Pydantic / OKF validation on explicit schema evidence.
- [ ] Add Firecrawl ingestion only as a bounded evidence lane.
- [ ] Wire the TorchInductor reranker as a separate compiled inference path.
- [ ] Add ACE packet semantic labeling and HMM error recovery as explicit runtime gates.
- [ ] Add GPU graph analysis export with parity reports rather than treating it as a default writer.
- [ ] Keep `recommendation_log` and `semantic_label` as derived runtime artifacts, not source truth.
- [ ] Keep research-lane integration and multivector retrieval as later proofs, not current owners.
- [ ] Keep the Rust structural worker as a reference implementation until parity and replay receipts exist.

---

## Parent Atlas Pass Fabric (durable execution lane)

**Goal**: turn the current analysis queue into a durable, bounded, fork-join service fabric.

**Current fit**

- `analysis_jobs` is already the durable queue.
- `FOR UPDATE SKIP LOCKED` is already the right crash-recovery primitive.
- `worker.ts` already has stage-specific concurrency gates.
- `AnalysisPassResult` and `ExperimentFeatureMatrix` already carry the idempotency / provenance fields needed for unordered completion.

**Contract**

- Postgres is the canonical queue and pass ledger.
- CPU structural / lexical passes run on multi-core workers.
- NLP sidecar passes are bounded and optional.
- GPU concurrency stays bounded and sidecar-owned.
- Valkey is hot coordination cache only.
- Read-side query fanout is a fork-join executor capped at three independent read tools.

### Pass Fabric steps

- [ ] Prove the current worker behavior with one real poll cycle and one real claimed batch.
- [ ] Replace single-job claims with `claimBatch(jobType, freeSlots)` so gates fill immediately.
- [ ] Add `pg_notify` wakeups on enqueue and keep a slow fallback poll.
- [ ] Add durable `AnalysisPassResult` persistence as append-only execution history.
- [ ] Classify the existing duplicate population before adding any uniqueness constraint.
- [ ] Prove whether `pass_key` / `pass_revision` semantics are logical identity or execution metadata.
- [ ] Decide whether the history table needs a separate current-materialization view before any DB uniqueness enforcement.
- [ ] Add a CPU worker pool for structural, lexical, entropy, and normalization passes.
- [ ] Keep NLP sidecar / GPU passes bounded and batched instead of launching one request per packet.
- [ ] Add Valkey batch helpers for hot metadata, result hints, and cache receipts only.
- [ ] Add `executeToolBatch` with `maxParallel = 3` for independent read-only tools; keep dependent or mutating calls sequential.
- [ ] Build incremental eligibility so only changed packets / stale revisions re-run.
- [ ] Add crash-restart replay tests: duplicate enqueue, worker crash, unchanged revision rerun, changed source rerun.

### PF4A duplicate classification gate

- [ ] Group duplicate `analysis_pass_results` rows by `packet_key`, `pass_name` / pass type, and `input_hash`.
- [ ] Compare `output_hash` multiplicity per duplicate group.
- [ ] Compare `producer_id`, `producer_revision`, `backend_version`, and `model_revision` multiplicity per duplicate group.
- [ ] Separate identical retries from distinct execution history before any deduplication or uniqueness rule.
- [ ] Keep nullable `source_revision` / `pass_revision` explicit until provenance can be reconstructed.

**Execution order**

1. Fix worker claim underfill
2. Add queue wakeup notifications
3. Add durable pass ledger / append-only history
4. Classify duplicate history groups
5. Prove pass identity semantics
6. Add CPU worker pool
7. Bound NLP sidecar / GPU lane concurrency
8. Add Valkey batching helpers
9. Add max-3 read-tool fork-join executor
10. Add incremental eligibility
11. Add crash / replay validation

---

## MASTER FEATURE TODO: Controlled Integration Ladder

**Purpose**: Integrate the repair and ranking bundle as a staged proof ladder. Do not turn on all lanes at once. Prove each lane separately before it can influence production ranking or canonical truth.

**Hard constraints**

- Keep canonical Parent Atlas ownership of identity, evidence, and retrieval policy.
- Copy any external bundle into a temporary integration area first; do not overwrite canonical files directly.
- Use `trace_dynamic_context` as the evidence layer, not a second context engine.
- Keep semantic `768` canonical and treat `384` as legacy / migration evidence only.
- Treat RRF candidate fusion and RFF-derived geometric features as separate lanes with separate evaluation gates.
- Do not enable cuVS, cuGraph, new graph traversal, or production fusion until the prior proof gate passes.

**Relevant files**

- `sveltekit-frontend/src/lib/server/atlas/master-feature-map.ts`
- `sveltekit-frontend/src/lib/server/atlas/master-feature-map.schema.ts`
- `sveltekit-frontend/src/lib/server/atlas/master-feature-map.test.ts`
- `sveltekit-frontend/src/lib/server/atlas/context-for-file.ts`
- `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`
- `sveltekit-frontend/src/mcp/trace-mcp-server.ts`
- `sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts`
- `sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts`
- `sveltekit-frontend/src/lib/server/graph/neo4j-gds.ts`
- `sveltekit-frontend/src/lib/server/hypergraph/hypergraph-search.ts`
- `docs/atlas/phase-20-training-readiness.md`
- `packages/parent-atlas/docs/atlas/phase-20-training-readiness.md`
- `docs/atlas/xgboost-reranker-contract.md`
- `packages/parent-atlas/docs/atlas/xgboost-reranker-contract.md`
- `docs/reports/parent-atlas-training-readiness.md`
- `docs/reports/parent-atlas-training-readiness.json`
- `docs/reports/parent-atlas-open-lanes-todo.md`

### Step 1: Bundle staging and repair spine proof

- [ ] Copy the bundle into a temporary integration area.
- [ ] Select one known failing test and capture the failure fingerprint.
- [ ] Wire the minimal repair loop: `observe error` → `repair state` → `localize symbols` → `bounded context` → `surgical patch` → `verify repair` → `record repair episode`.
- [ ] Audit the packetizer / assembler / validator caller chain and classify each file as live, bridge, or orphan before promoting packet materialization.
- [ ] Verify the loop on one real failure before expanding scope.

### Step 2: Replace JSON-only context with Parent Atlas evidence

- [ ] Replace simple JSON localization inputs with `trace_dynamic_context`.
- [ ] Keep the localizer bounded to real Parent Atlas evidence: symbol IDs, packet keys, file paths, callers, tests, and retrieval scores.
- [ ] Ensure `localize symbols` only ranks candidates supplied by the evidence layer.

### Step 3: Close the semantic 768 invariant

- [ ] Confirm raw embedding length is 768 for the active semantic lane.
- [ ] Confirm `codebase_chunks_768` remains the canonical Qdrant collection.
- [ ] Remove any runtime dependency on `384` for active retrieval.
- [ ] Protect precomputed vectors and caches from silent dimension drift.

### Step 4: Make RRF ownership explicit

- [ ] Decide one canonical owner for fusion: Qdrant-side fusion or Parent Atlas-side fusion.
- [ ] Use the bundle's RRF implementation as an oracle reference first, not a production owner.
- [ ] Compare frozen lane rankings between the canonical implementation and the oracle reference.
- [ ] Require mathematical agreement before changing runtime ownership.

### Step 5: Restore PageRank authority as one field

- [ ] Keep PageRank authority as a single field, not overlapping aliases.
- [ ] Resolve `pickPageRankAuthorityScore()` into the canonical authority row.
- [ ] Preserve provenance: raw, normalized, and revision metadata must stay explicit.

### Step 6: Establish FeatureRowV1

- [ ] Define `FeatureRowV1` as the first convergence point.
- [ ] Start with `packetKey`, `dense`, `sparse`, `rrf`, `ast`, `pagerankAuthority`, `freshness`, `crossEncoder`, `featureRevision`, and `graphRevision`.
- [ ] Defer `rffSimilarity` and `latent128Similarity` to later versions.

### Step 7: Introduce RFF as an experimental projection

- [ ] Define a deterministic representation contract for RFF.
- [ ] Fix the source representation to `semantic_768`.
- [ ] Fix the output projection to a stable RFF dimension and seed.
- [ ] Evaluate RFF only on the final candidate set before adding any index or collection.

### Step 8: Keep RFF out of Qdrant until it proves value

- [ ] Compute RFF only on the final candidate shortlist.
- [ ] Measure whether RFF improves reranking discrimination rather than candidate recall.
- [ ] Do not create a new Qdrant collection for RFF until the ablation result justifies it.

### Step 9: Make Domain 10 the gatekeeper

- [ ] Promote the evaluation scripts into real ablation inputs.
- [ ] Run baseline, RRF, RFF, and combined variants on frozen lane rankings.
- [ ] Measure retrieval and repair metrics separately.

### Step 10: Defer latent128 until its BYTEA contract is proven

- [ ] Define exactly what the latent128 bytes encode.
- [ ] Add a decoder contract before any feature uses the bytes as an input.
- [ ] Treat latent128 as derived representation, not opaque truth.

### Step 11: Use NetworkX as the graph oracle

- [ ] Compare NetworkX PageRank against Neo4j GDS on a frozen snapshot.
- [ ] Measure overlap, rank correlation, and maximum difference.
- [ ] Prove the graph interpretation before GPU promotion.

### Step 12: Add cuGraph only after parity

- [ ] Use cuGraph as the GPU candidate after NetworkX and Neo4j parity are proven.
- [ ] Require same snapshot, same damping, same convergence policy.
- [ ] Promote only if runtime improvement is material.

### Step 13: Add cuVS only for vectors

- [ ] Use cuVS exact KNN as the semantic oracle.
- [ ] Compare Qdrant ANN against exact KNN before introducing CAGRA.
- [ ] Keep semantic localization separate from repair localization.

### Step 14: Close the loop on real failures

- [ ] Run the repair loop on actual failing tests.
- [ ] Record episode state, hypothesis, patch, verification, and outcome.
- [ ] Only then treat the repair spine as real production infrastructure.

### Step 15: Add community taxonomy only after the graph oracle ladder

- [ ] Keep Louvain live and Leiden experimental until taxonomy coherence is proven.
- [ ] Materialize community taxonomy records only from the chosen clustering lane.
- [ ] Treat community IDs as taxonomy metadata, not canonical identity.

### Step 16: Keep traversal and ranking variants explicitly separate

- [ ] Treat personalized PageRank as distinct from global PageRank.
- [ ] Keep weighted Dijkstra as the shortest-path baseline.
- [ ] Use semantic best-first search only as a later experiment, not a replacement.
- [ ] Keep external MoE routing as a later sparse-router layer.

### Step 17: Build a frozen repair replay corpus

- [ ] Record deterministic repair episodes with error fingerprint, beliefs, patch, verification, and outcome.
- [ ] Freeze the replay corpus before any learned promotion.
- [ ] Use the corpus for later evaluation of routing, ranking, and repair policies.

### Step 18: Block learned promotion until the replay corpus exists

- [ ] Do not allow learned policies to redefine canonical truth.
- [ ] Keep learned promotion blocked until the replay corpus and evaluation gates exist.
- [ ] Promote only after the replay corpus demonstrates value on frozen evidence.

### Step 19: Record the missing items audit

- [x] Canonical immutable graph snapshot materializer now has a Postgres-backed loader and focused tests; the frozen production parity run is still pending.
- [x] Frozen-snapshot NetworkX/GDS parity runner is wired to load loader-emitted frozen snapshot JSON; the recorded parity report is still pending.
- [ ] Snapshot-aware bounded traversal contract remains unproven.
- [ ] Closed error-resolution loop remains partial.
- [ ] Frozen repair replay corpus remains absent.
- [ ] `latent_128` byte-contract proof remains absent.
- [ ] OpenWiki source lane is empty and needs content.
- [ ] Library-module source auto-discovery remains manual.
- [ ] DB-backed canonical registry for the library-module index does not exist yet.
- [ ] Conflict review queue for stale/partial library rows is missing.
- [ ] Shared PATH-based global tool resolver for `rg` / `jq` / other binaries is missing.
- [ ] `cuvs` authoritative source mapping is unresolved.

**Execution order**

1. Bundle copy into temporary area
2. Semantic `768` invariant
3. One real repair-loop proof
4. `trace_dynamic_context` integration
5. RRF ownership decision
6. `FeatureRowV1`
7. RFF projection
8. PageRank authority normalization
9. Domain 10 baseline and ablations
10. NetworkX parity
11. cuGraph parity
12. cuVS parity
13. Community taxonomy proof
14. Traversal variant separation
15. Closed-loop repair replay corpus
16. Learned promotion block
17. Missing items audit

**Do not**

- Do not turn on every lane at once.
- Do not make RFF the production fusion owner by accident.
- Do not add new graph traversal into production before the proof ladder is complete.
- Do not treat bundle-provided code as canonical without a Parent Atlas proof gate.
- Do not treat community clustering output as identity.
- Do not allow learned promotion before the frozen replay corpus exists.

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

## SIMD JSON Parser Ownership (FROZEN, 2026-08-09) — for later integration

**Status**: closed for now. Do not spend another session on parser architecture; this is
non-blocking hardening only until explicitly revisited.

| Role | File |
|------|------|
| CANONICAL | `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts` |
| COMPATIBILITY | `sveltekit-frontend/src/lib/utils/json-fast.ts` |
| LEGACY / NON-AUTHORITY | `sveltekit-frontend/src/lib/utils/simd-json-parser.ts` |
| ACTIVE CONSUMERS | `qdrant-parser.ts`, `tool-call-parser.ts` |
| GATE | `scripts/atlas/check-simd-json-runtime.mjs` |
| ORACLE / BENCH | `scripts/simd/*`, `parent-atlas-graph-runtime-enhancement/native/simdjson_edge_scan.cpp`, `avx2-simdjson-bridge.mjs` |

**Remaining non-blocking hardening** (do later, not now): parity corpus across the canonical vs.
legacy parsers, a consolidated smoke invocation covering all of the above, and eventual deletion
of `simd-json-parser.ts` only after proving no dynamic callers remain (do not delete on the
strength of static grep alone — check dynamic `import()` call sites too).

**Do not**: modify any of these parser files without a specific proven need; do not merge
CANONICAL and COMPATIBILITY into one file "for simplicity"; do not treat ORACLE/BENCH files as
production code paths.

## GR1 DuckDB Schema Drift — RESOLVED (2026-08-09)

`graphify:daily`'s offline DuckDB MapReduce stage (`scripts/atlas/offline-parent-atlas-mapreduce.sql`)
was failing every run. Root cause was schema drift, not a stale mirror or wrong DuckDB file — the
SQL referenced columns and a table that never existed in the live Postgres schema:

- `pad.workspace_id` / `pad.updated_at` — real columns on `atlas_packets`, never exposed by the
  `parent_atlas_documents` view. Fixed by widening the view (new tracked migration:
  `sveltekit-frontend/drizzle/manual/parent_atlas_documents_view_widen.sql` — no tracked source
  existed for this view before; it had been created ad hoc in an earlier session).
- `pad.file_ext` / `pad.alias_id` / `pad.ingest_source` — never existed anywhere. `file_ext` now
  derived from `rel_path`; the other two are explicit `NULL` placeholders.
- `afm.neo4j_node_id` / `afm.nes_card_id` / `afm.atlas_version` — never existed on
  `atlas_feature_map` (no writer anywhere populates them). Same `NULL` placeholder treatment.
- `pg_db.atlas_source_ref_synthesis` (aliased `asrs`) — never existed at all, not a rename.
  Degraded `cold_source_ref_rollups` to source from the real `atlas_topology_features` table,
  keeping only the 3 columns actually consumed downstream (`source_ref`, `pagerank_score`,
  `karpathy_blend`).
- `cold_hot_path_rollups` — was remapping real `route_runtime_packets` columns (`route`,
  `latency_ms`, `captured_at`, `source_refs`, `feature_ids`, `cache_hit`) to a stale output shape
  (`route_path`, `method`, `packet_count`, `avg_latency_ms`, `error_count`, `p95_latency_ms`) and
  omitting `qdrant_hits`/`cache_tier`. Rewritten to use the real column names directly.

Verified live end-to-end: all 5 tables build clean (`cold_parent_atlas_cards`: 8,019 rows;
`cold_source_ref_rollups`: 61,659; `cold_profile_card_candidates`: 8,019;
`cold_feature_rollups`/`cold_hot_path_rollups`: 0 rows each, both pre-existing empty-source
tables, not new bugs). Commits: `293cf2e85e`, `115c25df8e`.

**Not yet done**: a full `npm run graphify:daily` run through to completion with this fix in
place (only the DuckDB SQL stage was verified in isolation). Also see
`openspec/changes/parent-atlas-graph-runtime-enhancement/` for the GR0-GR10 graph-runtime ladder
this unblocks (GR1: fresh graph + revision freeze).

---

## Lane ownership — tightened phrasing (2026-08-10)

Consolidates the tensor-residency / geometry brainstorm threads (see
`openspec/changes/parent-atlas-tensor-residency-integration/tasks.md` for the live-verified
implementation status) into one canonical "use it for / not for" reference. This is vocabulary,
not new architecture — every row restates a boundary already enforced elsewhere in this file or
in the tensor-residency OpenSpec change.

| Thing | Use it for | Not for |
|---|---|---|
| `topology4` (4D routing coordinate: som_x, som_y, authority, entropy_utility) | routing coordinates, residency hints | identity |
| covector / scoring head (`wᵀx`) | scoring, policy head | storage |
| Jacobian / metric tensor | local distortion, expansion/compression diagnostics | truth — never decides what a packet means |
| quaternion rotation | 3D orientation, animation only | similarity scoring, routing truth |
| cosine similarity | ranking, nearest-neighbor score | geometry ownership |
| low-rank sampling / Ewin-Tang-style sketching | offline sketching, compression, candidate reduction | canonical retrieval |
| event hypergraph | n-ary symbolic events, evidence relations, participant roles | AST truth, canonical identity |
| DLSS-like decoder-upscale lane | optional reconstruction, strictly *after* exact tile selection | identity, never before exact proof |
| KMeans 20×20 / SOM | coarse routing, centroid map | final answer truth |
| multi-hop graph/hypergraph traversal | evidence expansion | dense embedding ownership |
| packet validator | schema + order + provenance gate | ranking |
| packet assembler | deterministic merge/materialization | semantic truth |
| packet materializer | emit the final ACE packet / selected context | retrieval ownership |
| Naive Bayes | cheap "did you mean" / lexical prior | canonical router |
| UUID / ULID | stable event, packet, artifact IDs (labels) | latent coordinates — never put an ID in latent space |
| latent space (`latent_128`) | compressed continuous representation | provenance |
| hypergraph coordinates | n-ary evidence layout / joint relations | raw ANN ownership (CAGRA/HNSW still own ANN) |
| feature-matrix distance tensor (RTX) | scoring, ranking, centroid routing, top-k | semantic ownership |
| rotation animation / RenderMan-like tracing | view-layer motion, scene rendering, debugging | canonical identity, retrieval truth |

**Router/ranker ladder** (cheapest → most expensive, each stage only invoked if the cheaper one
is insufficient): exact identity + packet validation → feature matrix → Naive Bayes (cheap prior)
→ logistic regression (first real router) → XGBoost/gradient boosting (stronger tabular ranker)
→ KMeans/SOM (coarse routing) → graph/hypergraph traversal (multi-hop evidence) → exact GPU tile
proof → optional DLSS-like reconstruction lane → only then AE/RL/GEPA/QLoRA-style experiments.

**Three corrections worth re-stating plainly**: quaternions are for 3D rotation, never routing
truth; Jacobian/metric-tensor diagnostics describe local distortion, never packet meaning; DLSS
is a reconstruction/upscale analogy that belongs strictly after exact tile selection, never
before it or as a substitute for it.

---

## Layered architecture (L0–L10) + terminology corrections (2026-08-10)

Consolidates the Kimi K3 / DeepSeek Engram comparison thread. **Not implemented** — a naming
and organizing scheme recorded so the actual implementation work (tensor-residency bundle,
graph-analysis-contract) has consistent vocabulary to grow into, not a new build.

```
L0  EXACT MEMORY      — DeepSeek-Engram-style: byte/AST/ontology n-gram exact lookup
L1  FEATURE TENSOR     — FeatureTensor[4,6], softcapped metrics (see below)
L2  TABULAR ROUTER     — logistic → XGBoost
L3  SEMANTIC           — semantic_768, Qdrant, cuVS
L4  STRUCTURAL         — Tree-sitter, Graphify
L5  GRAPH              — PageRank/HITS/communities: NetworkX oracle, Neo4j GDS operational,
                          cuGraph backend
L6  CACHE ROUTING      — KMeans centroid hints, SOM 20x20, Topology4, Hilbert2D (locality only)
L7  ACE                — prefetch / pin / resident / evict
L8  GPU                — PyTorch, cuVS, cuML, cuGraph, cuTile only where benchmarked
L9  EVIDENCE           — ontology-linked n-ary tuples
L10 AGENT              — HMM, DSPy/GEPA, Ornith/Gemma, event hypergraph recommendation runtime
                         packet-level NLP can proceed now; document-root /
                         tree-dependent promotion waits for duplicate-root /
                         idempotency closure in tree lineage work
```

**Terminology corrections** (apply wherever these terms appear in future design docs):
- The 6 scoring dimensions (relevance, confidence, authority, entropy/novelty, execution
  utility, memory/transfer cost) are **"six policy axes,"** not "six degrees of freedom" — 6DoF
  (x/y/z + pitch/yaw/roll) is a visualization-only concept and must not be conflated with the
  retrieval policy's scoring dimensions.
- **`semantic_768`'s "768" is a representation dimension, not an attention-head count.**
  Do not derive Atlas's embedding width from any model's internal architecture (Kimi K3's
  hidden width 7168 / 96 heads / head-dim 128 / LatentMoE dim 3584, or Gemma 4's internal
  widths, etc.) — `semantic_768` is a retrieval-representation contract independent of whatever
  LLM backend is in use.
- Quaternions remain visualization-only (camera/glyph/node rotation) — reaffirms the earlier
  correction, not a new rule.
- KMeans (K=64/128/256, discrete centroids) and SOM (20×20 grid cells) are **two separate
  concepts** — do not call the SOM "KMeans." Per T6c's live negative result (see
  `parent-atlas-tensor-residency-integration/tasks.md`), both remain non-restrictive cache/
  locality hints, never hard retrieval filters, until proven otherwise by the same recall
  methodology T6c already established.
- Hilbert curve locality applies only to the 2D SOM (`som_x, som_y`) — not a 4D Hilbert curve
  over the full Topology4. Carry `authority_bin`/`entropy_bin` as separate bins alongside the
  2D Hilbert cell key, e.g. `semantic:r42:h217:a5:e3`.
- `Topology4` remains a routing/cache/visualization coordinate, not a Riemannian manifold, until
  a decoder-induced local metric `g(z) = J(z)ᵀJ(z)` is actually built and evaluated (research-only
  for now, unchanged from the earlier correction).

**Latest slotting note from the vocabulary review** — keep these terms in the same L0–L10 ladder,
not as new owners:

| Term | Slot | Note |
|---|---|---|
| nibble / INT4 / INT8 packing | L8 cache tier | Quantized cache fidelity only; never encode packet_key / feature_id as the canonical identity. |
| tensor analysis / RTX matrix ops | L8 GPU | PyTorch / cuVS-style computation lane. |
| cuVS / RAPIDS | L3 / L8 | cuVS exact stays the oracle; RAPIDS KMeans belongs in L6. |
| HNSW | L3 (Qdrant only) | Qdrant ANN structure, not an Atlas implementation target. |
| 4D linked topology coordinates | L6 | Topology4 routing / cache coordinates only. |
| Hilbert (constrained dimensionality) | L6 | 2D SOM locality only, never a 4D curve over the whole topology. |
| ae:train | L1 / L8, gated | Deterministic AE only, blocked behind KMeans/SOM evidence. |
| KMeans 20×20 | no merge | KMeans and SOM are separate; do not conflate them. |
| domain classification | L1 (`domain_fit`) | Proven source, partial coverage only. |
| hyper-dimensional fanout | L9 | N-ary / hypergraph evidence lane. |
| simdjson-like GPU memory swapping | none | Category error; GPU tile swapping is L7 ACE, not simdjson. |
| Redis centroid caching | L7 / T5 | Pointers only; never raw tensors. |
| indexing already-computed tensor for RTX analysis | L7 / T3c | GPU-resident tile reuse, not proven live yet. |
| gradient checkpointing / N64-style memory | not applicable yet | Only relevant if L10-adjacent training work begins. |

**Consolidated live-status snapshot (2026-08-10)** — cross-check against
`openspec/changes/parent-atlas-tensor-residency-integration/tasks.md` for full evidence, this is
a summary only:
- Postgres 18 canonical storage, tensor-residency tables (T1): LIVE
- `semantic_768` Arrow artifact + deterministic mmap reload (T2b): PROVEN
- WSL2 RAPIDS Python sidecar (`atlas_rapids_sidecar.py`): LIVE
- cuVS exact top-k, real GPU, packet_key round-trip (T3a/T6): PROVEN
- KMeans K∈{64,128,256} coarse-routing sweep (T6c): EXPERIMENT_PROVEN as cache hint;
  **hard-filter use REJECTED** by live recall data
- CAGRA ephemeral endpoint (T6b-e): TESTED (recall 1.0, latency conflates build+search cost)
- Persistent CAGRA (T6b-p), pinned host transfer (T3b), GPU-resident tile reuse (T3c), ACE
  eviction (T4), Valkey residency metadata (T5), SOM 20×20: NOT_PROVEN / not started
- `FeatureVector5`/`FeatureTensor` (T2-lineage): BLOCKED — 2 of 5 sources have live data
  (`authority_norm`≈pagerank, `domain_fit`≈domain_confidence); `entropy_norm`/`ast_signal`/
  `execution_utility` still need real producers before any artifact is built
- OKF ingestion now threads a `feature_source_manifest` through `okf-topic-ingestion.ts`, so the
  live 3/5 state is carried with packets instead of staying only in the task note.
- Kafka/CDC tensor event path, Rust tensor-analysis sidecar, cuTile kernels, 4D Riemannian
  metric: architecture/idea only, not proven live anywhere in this repo

**Next mathematical artifact, per this thread's own explicit gating**: `feature_tensor_4x6_r1.
arrow` + `ace_policy_r1.json` (six softcaps + weights) — **gated on T2-lineage reaching 5/5
proven sources first.** T2-lineage remains the actual next actionable gate; it was not
advanced this pass.

---

---

**Session 2026-08-11 — Pass Fabric ledger reconciliation + archival sweep**

- `openspec/changes/parent-atlas-pass-fabric/` created: PF0-3 (queue/worker
  concurrency) confirmed already correctly implemented in
  `sveltekit-frontend/src/lib/server/analysis/{worker.ts,analysis-jobs.ts}`
  — no re-implementation needed. PF4 found `analysis_pass_results` live
  (11,076 rows) but **orphaned** (zero code callers) and holding real
  non-deterministic execution history (1,272 duplicate groups, 97% = repeated
  LLM summarization samples, not bugs — not deleted). Added
  `source_revision`/`pass_revision` columns + partial unique index (safe,
  additive) and `analysis_pass_current` view (PF4B — most-recent-wins
  materialization, flagged NOT_PROVEN as a semantic choice, not yet
  validated as "recent = correct" for non-deterministic outputs). PF4C-H
  (pass_key semantics, dependency DAG, invalidation engine, eligibility
  gate) remain undone — need a fresh session with full context.
- **PF-G0 confirmed as the real blocker**: no proven writer for
  `atlas_packets.packet_key` — reads exist everywhere, zero INSERT/UPSERT
  found. Converged independently from two separate audits (direct grep
  session 197, architecture review session 198) — high confidence this is
  the actual root gate ahead of any Pass Fabric scaling work.
- `docs/PHASE-3-GPU-ACCELERATION-ROADMAP.md`: fixed 7 stale 384-dim
  references (doc predated the 2026-07-27 canonical 768-dim policy by 8
  days). `openspec/changes/parent-atlas-768-dim-migration/` created as an
  inventory (90+ candidate files across `scripts/atlas/` and
  `sveltekit-frontend/src/lib/server/`, mostly unclassified — do NOT bulk
  edit, many are the legitimate secondary 384 routing lane per policy).
- Archival sweep (root CLAUDE.md Archival Rules — copy + manifest + remove,
  never delete): `train-som-384.mts`, `train-kmeans-384.mts` (explicitly
  confirmed legacy via `MASTER-FEATURE-TODO-2026-05-20.md:777` — "legacy
  migration evidence only; not an active representation lane"),
  `train-kmeans-768.mts` (superseded by live GPU `kmeans-chunk-cluster.py`
  pipeline, would've been a duplicate KMeans owner if wired), and a
  5,856-line self-marked-`.disabled` MCP server file. **One archival was a
  mistake and got reverted same session**: `phase101-parent-atlas-packetizer
  .{js,mjs}` — zero code callers, but `docs/atlas/parent-atlas-table-of-
  contents.md:115` lists "Phase 101 parent-atlas packetizer (dry-run
  first)" as active tracked work, not dead code. Restored to original
  location, manifest entry kept with `restored:` timestamp and the lesson
  recorded rather than erased. **Open follow-up**: this packetizer doesn't
  directly reference `atlas_packets`/`packet_key` in a quick grep — worth
  checking in a fresh session whether it's a *precursor* to the still-missing
  PF-G0 writer, since "Phase 101" + "packetizer" + "dry-run first" is
  suggestively close to what PF-G0 needs.

**Follow-up resolved same session**: checked
`phase101-parent-atlas-packetizer.js` exports (`packetizePhase101`,
`storeEngramPacket`, `buildContextPack`, `recommendNextOpenCodeTask`) — zero
Postgres calls, zero `atlas_packets` INSERT/UPSERT anywhere in the file. It's
an OpenCode task-recommendation/context-assembly tool that stores to the
Engram memory cache, unrelated to canonical packet identity despite the
name overlap. Restoring it was still correct (it's real active work), but
it does **not** answer PF-G0 — that gap remains genuinely open.

**MAJOR CORRECTION (same session)**: PF-G0's "zero writer" finding was
**wrong**. All prior audits (session 197 direct grep, session 198
architecture review) searched for literal SQL text (`"INSERT INTO
atlas_packets"`, `.insert\(atlasPackets\)` as a plain grep) but the actual
writer uses Drizzle ORM's query-builder syntax which those greps handled
inconsistently. Correct search — `\.insert\(atlasPackets\)` scoped to
`sveltekit-frontend/src` — finds:

- `sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts`
  — `persistCanonicalSemanticPacketEmbedding()`, does
  `db.insert(atlasPackets).values({ packetKey, ... })`. Has a real live
  caller: `src/routes/api/admin/batch-embeddings/embed/+server.ts` (an
  actual API route), plus its own `.spec.ts` test file.
- `sveltekit-frontend/src/lib/server/hyperrag/hyperrag-packet-pipeline.ts`
  — also does `.insert(atlasPackets)`, not yet checked for live callers.

**PF-G0 status revised**: from "NOT_PROVEN, no writer found" to "a writer
exists and has a live API route caller — needs verification, not
construction from scratch." Next session should: (1) read
`semantic-packet-writer.ts` in full to confirm it does deterministic
`packet_key` generation from `AstUnit`/source identity (not just accepting
whatever `packetKey` the caller passes in — that distinction matters for
whether this actually satisfies PF-G0's requirement), (2) check whether
`/api/admin/batch-embeddings/embed` is actually invoked in production or
is an admin-only manual trigger (changes how "proven" this is), (3) check
`hyperrag-packet-pipeline.ts` for a second, possibly competing writer path
(would need Duplication Prevention triage per root CLAUDE.md if so).

**Lesson**: this session repeatedly found that "zero callers via grep" is a
claim about the *grep*, not about the code, unless the grep pattern is
verified to catch all real invocation syntaxes (raw SQL text, ORM builder
calls, dynamic imports). Re-verify any "NOT_PROVEN — no writer found" claim
in this codebase's history with an ORM-aware search before trusting it.

**Verification complete, same session**: read `semantic-packet-writer.ts`
in full. `persistCanonicalSemanticPacketEmbedding()` does a real
`db.insert(atlasPackets).values({...}).onConflictDoUpdate(...)` — genuine
upsert, correctly wired. **But it does not derive `packetKey`
deterministically** — line 46-47 accepts `input.packetKey` as-is, falling
back to a **random ULID** (`makePacketUlid()`) only if the caller sends
nothing. Traced the one live caller
(`/api/admin/batch-embeddings/embed/+server.ts`, line 27): `packetKey`
comes straight from the **HTTP request body** — no source-derived identity
logic anywhere in this path. It's a generic "persist whatever embedding
+ key you give me" admin endpoint, not the deterministic
`AstUnit + source span → packet_key` resolver PF-G0 actually requires.

**PF-G0 status, final for this session**: a *storage* writer exists and
works. The *identity resolution* layer that should feed it deterministic
keys does not — or does, somewhere else not yet found. This is a narrower,
more precise gap than "no writer exists" (session 197's original framing)
or "a writer exists, done" (this session's over-correction 10 minutes ago).
Both were wrong in different directions. The real open question: **does
anything in this codebase deterministically compute `packet_key` from
`(source_ref, byte_span, symbol_kind)` or equivalent, and if so, does it
call this writer** — or does every current caller (like the batch-embed
route) supply keys some other, possibly non-deterministic way?

**PF-G0 fully resolved, same session — found both halves, they're just not
connected**:

- Deterministic resolver **exists and is correct**:
  `sveltekit-frontend/src/lib/server/atlas/identity/compute-packet-key.ts`
  — `computePacketKey({ workspaceId, sourceRef, semanticAnchor })` →
  `pkt:<workspaceId>:<sha256_first_32_hex>`. Well-documented (deterministic,
  immutable, collision-free by design), has input validation, a matching
  `validatePacketKey()` verifier, and a sibling `packet-key-builder.ts` not
  yet read. Called by `dispatch/mcp-tool-implementations.ts` and
  `tasks/semantic-packets.ts`.
- Working writer **exists and is correct**: `semantic-packet-writer.ts`'s
  `persistCanonicalSemanticPacketEmbedding()` (verified above). Called by
  `/api/admin/batch-embeddings/embed/+server.ts`.
- **Neither calls the other.** The resolver's two callers don't write to
  `atlas_packets`; the writer's one caller takes `packetKey` from an HTTP
  request body instead of calling the resolver. Two independently correct
  pieces, never joined — this IS this session's own "Duplication Prevention
  / layered ownership" pattern, just inverted: not two competing owners,
  but two halves of one owner that never got wired to each other.

**This is almost certainly why every prior session concluded "no packet
writer" or "packet identity unproven"** — grepping for either piece alone
(without knowing the other existed) looks exactly like a missing writer if
you only check call sites of the resolver, or exactly like a missing
resolver if you only check the writer's caller.

**Next actionable gate, singular**: wire them together. Either (a) modify
`/api/admin/batch-embeddings/embed/+server.ts` (or a new canonical ingest
path) to call `computePacketKey()` and pass the result as `packetKey` into
`persistCanonicalSemanticPacketEmbedding()`, or (b) modify
`semantic-packet-writer.ts` itself to call `computePacketKey()` internally
when `input.packetKey` is absent, instead of falling back to a random ULID.
(b) is probably safer — it fixes the gap at the writer level for ALL
current and future callers, not just one route. Read `packet-key-builder.ts`
first (not yet read this session) in case it's a third, possibly
higher-level wrapper that already does this join and was simply never
switched on.

**REVISED, same session — this is bigger than "wire them together"**: read
`packet-key-builder.ts`. It exports a function with the **identical name**
`computePacketKey` but an **incompatible signature and algorithm**:

| | `compute-packet-key.ts` | `packet-key-builder.ts` |
|---|---|---|
| Signature | `({workspaceId, sourceRef, semanticAnchor})` | `(source_ref, tree_node_id, title_id)` |
| Formula | `sha256("pkt:v1:{ws}:{sourceRef}:{anchor}")`, 32-hex | `sha256("{source_ref}\|{tree_node_id}\|{title_id}")`, 64-hex |
| Output shape | `pkt:<workspaceId>:<32hex>` | raw 64-hex, no prefix |

**These produce different, incompatible keys for the same logical packet.**
Neither the earlier "resolver exists, just disconnected from writer"
framing nor the AGENT_TASK's "compare, define canonical, wire into both
writers" framing were wrong — but the comparison step surfaced that this is
an identity-contract collision (two independently-designed canonical
schemes), not just a missing connection. This is precisely what root
CLAUDE.md's Aug 9 2026 Duplication Prevention rule was written to catch:
"a second canonical `representation_id`... never implies... they can
legitimately coexist" — except here nothing suggests these are meant to
coexist as distinct representations; they're both trying to be *the*
canonical `packet_key`.

`packet-key-builder.ts` is also more architecturally complete — it ships
`validatePacketKeyImmutability()` and `validatePacketKeyLineageChain()`
(5-layer Postgres→Qdrant→Redis→RPC→ACE consistency check), which
`compute-packet-key.ts` lacks entirely. That's a point in favor of
`packet-key-builder.ts`'s scheme, but not proof — `compute-packet-key.ts`
has workspace-scoping (`workspaceId`) which the other lacks, and
multi-tenant workspace isolation may be a harder requirement to drop than
lineage-validation helpers are to port over.

**This decision needs a human call, not an agent pick** — which of
`sourceRef+semanticAnchor+workspaceId` vs `sourceRef+tree_node_id+title_id`
is the actually-correct identity basis is a domain question (does
Parent Atlas need multi-workspace isolation in the key itself, or is a
single global key with workspace as separate metadata sufficient? does
AST tree_node_id survive re-parses the way a semantic anchor name would?).

**Next session, in order**: (1) get the human decision on which scheme
wins — or whether a new `PacketIdentityV1` type supersedes both by taking
the best of each (workspace scoping + tree_node_id + validation helpers),
(2) find every current caller of both `computePacketKey` variants (4 files
total per this session's grep) and migrate them to the chosen canonical
version, (3) wire the winning resolver into `semantic-packet-writer.ts` so
it stops accepting arbitrary caller-supplied `packetKey` / random-ULID
fallback, (4) THEN PF4C-H (pass_key semantics, dependency DAG,
invalidation, eligibility) — those were always downstream of PF-G0 landing
correctly, and landing it on the wrong identity scheme would make PF4's
work need redoing.

---

## Session 2026-08-11 (continued) — Parallel work discovered, cross-lane gap analysis, workstation completion plan

**Discovery**: mid-session, extensive real infrastructure appeared via
`git status` that this session did not create — a concurrent agent/process
implemented substantial Parent Atlas pieces while this session ran. Verified
by reading the actual code (not assumed):

### What's REAL and LIVE (verified by reading code, not docs)

- **PF4 pass ledger** (`analysis-pass-results.ts`): genuinely wired.
  `recordAnalysisPassResult()` is called live in `worker.ts:299`, inside the
  real job-completion path. Deterministic input-hash idempotency
  (`buildAnalysisPassInputHash`), graceful degradation if table missing.
  `findAnalysisPassDuplicateGroups()` is the exact duplicate-classification
  query this session ran manually earlier — now a reusable function.
- **G11 hardcoded-localhost fix**: 14 files fixed this session via a
  reviewed, twice-corrected codemod (`scripts/fix-g11-hardcoded-localhost.mjs`)
  — caught 2 real syntax-error classes before applying (mixed `??`/`||`
  operators from blind literal replacement) via dry-run + typecheck
  verification. `gemma4-invocation.ts` additionally fixed to resolve model
  dynamically from `/v1/models` instead of a hardcoded model id, and to use
  `stream: true` per root CLAUDE.md's own documented hard rule (was hitting
  the exact "thinking eats token budget" bug that rule warns about).
- **G16 test stubs**: 64 real stubs generated via the pre-existing
  `scripts/generate-route-test-stubs.mjs` tool (found — not built this
  session, another case of "infrastructure exists, wasn't being used").
- **POS/n-ary-concept/ontology-tuple builder** (`pos-concept-tagging-lane.ts`):
  real, well-designed pure function (`buildPosConceptTaggingPacket`).
  Deterministic tuple-ID hashing, canonicalized participant ordering
  (order-independent per the 43-section spec's requirement), citations/
  screenshots/MCP-tool-calls/ranking-signals (bm25/bm42/pagerank/manifold/
  som/kmeans/community) all present as designed. Has a **real PASS proof
  run** (`docs/reports/pos-concept-tagging-lane-proof.json`,
  2026-08-11T04:31Z) showing correct idempotency behavior (`inserted: false,
  rowId: 11118` — detected existing row).
- **Event hypergraph contract** (`event-hypergraph-contract.ts`): matches
  the 43-section spec's `AtlasEvent`/participant-role/order-independent-
  identity design.
- **New OpenSpec**: `parent-atlas-telemetry-lowrank-recommendation-okf-integration/`
  already has real `design.md`/`proposal.md`/`README.md`/`tasks.md` content
  (not just stubs) — the 4-lane telemetry/approximation/compute/policy
  separation from this session's earlier review is being tracked there.

### The one gap that shows up in EVERY lane above: P0 identity, worse than thought

Found while checking the POS-tagging proof: `packetKey:
"ace:packet:c115e487d04d"` — **a THIRD packet_key format**, distinct from
both `pkt:<workspace>:<32hex>` (orphaned `compute-packet-key.ts`) and raw
`<64hex>` (live `packet-key-builder.ts`). A quick grep found `ace:packet:`
used across 10+ files in the ACE subsystem — likely the highest-volume
format by usage, and the one the real POS-tagging proof run actually
emitted. Full writeup + next steps:
`openspec/changes/parent-atlas-pass-fabric/tasks.md` (§"P0 UPDATE").

**This is now confirmed, with evidence, as the single blocking gap across
every lane**: Pass Fabric (PF4's ledger has a real writer but no canonical
identity feeding it), Graph (dispatcher exists, packet-keyed metrics need
stable identity to attach to), Retrieval (canonical identity normalization
"mostly implemented" per external review — same root cause), POS/Ontology/
N-ary (the new, real, well-built lane emits its own third identity format).
**No lane can be marked complete until this is resolved**, because every
lane's output is keyed by `packet_key`, and there is currently no single
authoritative answer to "what is packet_key for this source."

### Workstation completion plan — all lanes, next steps

Per the external architectural review (saved in full at
`memory/SESSION-198-CONFIRMED-STATE-AND-CANONICAL-BUILD-ORDER.md`), the
frozen build order is:

```
P0  → resolve the 3-way packet_key format collision (NEW, sharper framing)
PF1-8 → pass identity, dependency DAG, invalidation, eligibility, replay
G1-2  → graph dispatcher registry completeness, Louvain persistence proof
G3-4  → retrieval: one-vote-per-lane RRF, frozen golden replay
R1-3  → Rust structural worker: parity vs TS/Python reference, then promote
N1-9  → lexical→POS→AST/POS-join→mentions→concepts→ontology→conflicts→
         n-ary events→hypergraph (AST-first proof, then reuse pattern —
         do NOT fan out simultaneously; POS/ontology lane already has real
         code, but needs P0 fixed before its output can be trusted as
         correctly identified)
S1-3  → semantic_768, exact kNN oracle, topology/manifold
F1-8  → BM25, BM42, dense, AST, graph, event lanes → normalized fusion → FeatureRow
E1-6  → grounded summaries, citations, screenshots, MCP receipts, tool DAG,
         ContextManifest identity
P1-4  → deterministic policy baseline → recommendation snapshot → oracle → shadow
A1-5  → Packet LUT, HLL telemetry, ACE reward labels, LOD hysteresis, cost model
D1-4  → frozen retrieval/repair replay corpora, negative examples, drift baseline
X1-4  → RFF/Ewin-Tang/XGBoost/GPU-policy — SHADOW ONLY until oracle-compared
FINAL → full-system golden replay (Kanban task through ACE telemetry,
         deterministic replay of every non-generative boundary)
```

**Immediate next session action**: `grep -rn "'ace:packet:'" src/lib/server`
to find the actual construction site(s) for the third identity format, then
make the P0 canonical-format decision (see pass-fabric tasks.md for the
3-way comparison table and decision criteria). This is a genuine
architecture call needing full context — do not rush it.

---

**Date Updated**: August 11, 2026
**Session**: 198 (continued — parallel-work discovery + cross-lane gap analysis)
**Last Verified**: Live code read (analysis-pass-results.ts, pos-concept-tagging-lane.ts,
event-hypergraph-contract.ts, worker.ts, docs/reports/pos-concept-tagging-lane-proof.json)
