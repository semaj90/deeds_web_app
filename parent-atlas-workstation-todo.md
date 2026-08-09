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
| `atlas_tree_nodes` | `node_id` | provisional parse-occurrence / structural node | Yes | provisional structural inventory | FAIL for canonical identity |
| `codebase_chunk_index` | `id`, `chunk_id`, `source_ref` | chunk mirror keyed by source/span | Yes | retrieval chunk mirror | PARTIAL |
| `atlas_packet_registry` | `packet_key` | packet registry backfill from canonical rows | Yes | hot packet registry / projection | PARTIAL |
| `atlas_representation_records` | `packet_id`, `representation_id`, `representation_revision` | representation lineage record | Yes | representation lineage ledger | PARTIAL |
| `atlas_topology_index` | `packet_key` | packet-level topology projection | Yes | topology / PageRank / SOM projection | PARTIAL |

**Inventory notes**

- `tree_node_id` is still a provisional linkage field, not the stable graph identity.
- `graphify_files.file_id` is not yet proven to be a stable cross-revision file identity; treat it as a source identity candidate until the derivation is inspected.
- `graphify_symbols.symbol_id` exists, but cross-revision stability and `stable_symbol_key` formula are not yet proven.
- `graphify_edges` has valid row identity, but endpoint continuity still depends on the symbol identity proof.
- `symbol_id` is the best stable-symbol candidate visible in the repo, but the `symbol_version_id` contract is still missing.
- `concept_ids` are annotations attached to packets, not identity keys.
- `atlas_packet_registry` and `atlas_topology_index` are projections or mirrors, not canonical truth.
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
| `PACKET_TREE_LINK_SEMANTICS` | PARTIAL_PROVEN | packet-to-tree linkage exists, meaning still provisional |
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
- `atlas_summary_layers`: `18,423`
- `packet summaries`: `6,885`
- `populated summary layers`: `7,640`
- `codebase_chunk_index`: `52,417`
- `atlas_feature_envelopes`: `58,365`

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

**Latest live audit (2026-08-02)**: `atlas_tree_nodes` row_count `263,263`; `node_id` duplicates `0`; `source_ref → packet_key` linkage `58,304/263,263` (`22%`); orphan count `0`; max depth `2`; gate result `FAIL` on linkage coverage.

### Immediate Checklist

- [ ] Inventory identity fields across `atlas_tree_nodes`, `atlas_packets`, `graphify_files`, `graphify_symbols`, `graphify_edges`, and the topology tables.
- [ ] Define separate contracts for `parse_node_id`, `symbol_id`, `chunk_id`, `packet_key`, `concept_id`, and `graph_node_key`.
- [ ] Split `tree_node_id` from stable symbol identity: add or confirm `symbol_version_id` for version-bound occurrences and keep `symbol_id` as the stable cross-revision key.
- [ ] Inventory the parser manifest vs runtime implementation: declared `tree-sitter typescript v1` vs actual regex/heuristic extraction.
- [ ] Reclassify the current graph artifact as a provisional structural snapshot until the enrichment chain is proven.
- [ ] Keep `tree_node_id` uniqueness intact for now; do not relax or drop the constraint yet.
- [ ] Confirm whether `tree_node_id` is being used as a catch-all identity in any remaining ETL or backfill script.
- [ ] Prove the retrieval chain in order: `semantic_768` coverage, KNN top-k, KMeans, 20x20 SOM, then PageRank.
- [ ] Revisit graph snapshot apply behavior only after the identity and enrichment gates pass.

### Proof Gates

**Completeness scale**: `0` = blocked / not proven, `100` = proven end state.

| Gate | Status | Completeness | Notes |
|------|--------|--------------|-------|
| PARSE_NODE_IDENTITY | PARTIAL_PROVEN | 60 | parser-backed occurrence identity still needs the full live contract |
| STABLE_SYMBOL_IDENTITY | NOT_PROVEN | 5 | stable cross-revision symbol identity not yet proven live |
| SYMBOL_VERSION_IDENTITY | NOT_PROVEN | 0 | revision-bound symbol version contract still missing |
| PACKET_TO_SYMBOL_LINEAGE | NOT_PROVEN | 15 | lineage exists in pieces, not as a complete contract |
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

**Date Updated**: August 9, 2026
**Session**: 109+ (Continuation Final)
**Last Verified**: Live database analysis complete
