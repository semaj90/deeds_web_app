# Spec: native-acceleration-core

## ADDED Requirements

### Requirement: C ABI core with opaque handles
The Parent Atlas native core SHALL expose a C ABI (`atlas_core.h`) using opaque handles (`atlas_context_t`, `atlas_cuvs_index_t`, `atlas_turbovec_index_t`), versioned structures, `atlas_status_t` error codes, explicit buffer ownership (allocator/deallocator pairs — every buffer freed by the module that allocated it), and `atlas_execution_receipt_t` telemetry. The public header SHALL contain no Napi, torch, raft, nlohmann::json, grpc, or Unreal Engine types.

#### Scenario: Adapter isolation
- **WHEN** the N-API adapter, gRPC adapter, or Unreal plugin is compiled
- **THEN** each links against `atlas_core` as a consumer
- **AND** `atlas_core` compiles standalone with none of those dependencies

### Requirement: Compute-only core
The native core SHALL perform computation only. It SHALL NOT connect to PostgreSQL, Qdrant, Redis, Neo4j, Kafka, HTTP services, or canonical filesystem stores. Application-owned adapters validate identity, invoke native computation, and persist results separately.

#### Scenario: No store credentials in core
- **WHEN** `atlas_core` is audited for linked dependencies and configuration surface
- **THEN** it contains no database drivers, network clients, or store credentials
- **AND** all identity resolution and persistence happens in the calling adapter

### Requirement: Representation-bound indexes and requests
Every native index build and compute request SHALL be bound to a named representation contract: representation ID, representation revision, dimensions, dtype, normalization, metric, and model ID + hash where applicable. The core SHALL reject searches across mismatched representations with `ATLAS_INVALID_ARGUMENT` (or a dedicated representation-mismatch status).

#### Scenario: latent_64 query against semantic_768 index rejected
- **WHEN** a query bound to `latent_64` is submitted against an index built for `semantic_768`
- **THEN** the call fails with a representation-mismatch error before any computation
- **AND** the execution receipt records the rejection reason

#### Scenario: Every compute call returns a receipt
- **WHEN** any `atlas_*` compute function completes (success or fallback)
- **THEN** it populates `atlas_execution_receipt_t` with backend, status, queue_wait_ns, execution_ns, transfer bytes, and used_cpu_fallback

### Requirement: Graph similarity is three distinct operations
The system SHALL provide `atlas_knn_exact` (query→corpus top-k, cuVS brute-force), `atlas_cagra_build`/`atlas_cagra_search` (approximate ANN), and `atlas_similarity_graph_build` (bounded sparse CSR pairwise graph). A dense n×n similarity matrix SHALL NOT be the default output of any operation.

#### Scenario: Sparse graph bounds
- **WHEN** `atlas_similarity_graph_build` runs with `threshold` and `max_neighbors_per_row`
- **THEN** the output is `atlas_csr_graph_t` (row_offsets, column_indices, edge_weights)
- **AND** edge count per row never exceeds `max_neighbors_per_row`

### Requirement: PageRank consumes CSR with cross-backend parity
`atlas_pagerank` SHALL accept only `atlas_csr_graph_t` input. CPU reference, native CUDA/LibTorch, cuGraph, and Neo4j GDS implementations SHALL prove equivalence on a shared fixture: same graph orientation, edge-weight interpretation, dangling-node policy, damping, initial vector, convergence tolerance, and normalization. Raw JSON adjacency SHALL NOT be passed to cuGraph or the N-API bridge.

#### Scenario: Fixture parity gate
- **WHEN** the PageRank parity fixture runs against any backend
- **THEN** scores match the CPU reference within declared tolerance and the receipt names the backend
- **AND** a mismatch reports NUMERICAL_MISMATCH, not PASS

### Requirement: Proof-first liveness classification
No native capability SHALL be reported live without (1) `getBackendInfo()` metadata, (2) native execution counters incremented inside the actual CUDA/LibTorch branch, and (3) numerical parity against an independent oracle. The startup probe SHALL classify each export as MISSING_EXPORT, NO_LIBTORCH_STUB, NOT_IMPLEMENTED, CPU_FALLBACK, LIBTORCH_CPU, CUDA_LIVE, CALL_FAILED, NUMERICAL_MISMATCH, SKIPPED_EXTERNAL_PROOF, or NOT_PROVEN. The probe SHALL record loaded addon path and SHA-256 as the identity source, and SHALL track "implementation linked", "symbol loaded", "binary present", and "branch executed" as separate proof claims.

#### Scenario: Shape-only evidence rejected
- **WHEN** an export returns an array of expected length but backend metadata or counters are absent
- **THEN** its status is at most CPU_FALLBACK or NOT_PROVEN, never CUDA_LIVE

#### Scenario: Known current truth
- **WHEN** the probe runs against the current addon
- **THEN** `graphSimilarity` reports CPU_FALLBACK, cuVS exports report NOT_IMPLEMENTED (stub), and `batchCosineSimilarity` may report CUDA_LIVE only after counter + parity proof

### Requirement: Format ownership boundaries
JSON SHALL carry configuration, diagnostics, audit reports, and HTTP responses — never embedding matrices. MessagePack SHALL carry local event packets, compact receipts, and Redis values — never the primary gRPC payload. Protobuf SHALL carry remote calls, with large tensors referenced via `TensorRef` (storage URI, offset, length, shape, dtype, content_hash) rather than `repeated float`. Hot numeric payloads SHALL cross boundaries as typed arrays, DLPack, Arrow IPC, or memory-mapped buffers.

#### Scenario: No JSON in the similarity hot path
- **WHEN** the N-API adapter executes a scoring call
- **THEN** inputs and outputs are typed arrays and no JSON parser runs in that path

### Requirement: Visualization clients are not retrieval authorities
Browser WebGPU (SvelteKit), native Dawn viewers, and Unreal Engine clients SHALL consume projections and receipts only. They SHALL NOT resolve canonical identity, bypass workspace-revision validation, or write to any store. Dawn SHALL NOT be compiled into the Node addon.

#### Scenario: Unreal boundary
- **WHEN** an Unreal client requests results
- **THEN** it calls `AtlasVectorService` over gRPC with deadlines and receives NeighborBatch + ExecutionReceipt
- **AND** it holds no database, Qdrant, or Redis credentials

### Requirement: Discriminated envelope identity
Feature envelopes SHALL declare `identity_kind` ∈ {symbol, file, chunk}. Symbol envelopes SHALL require non-null `stable_symbol_id` and `symbol_version_id`; file/chunk envelopes SHALL carry them as explicit nulls with `stable_file_id` present. Hydration SHALL resolve identity via canonical join and report typed counters (`canonical_row_matched`, `envelope_validated`, `missing_stable_symbol`, `missing_stable_file`, `schema_revision_rejected`, `representation_rejected`). Globally nullable identity fields (session-188 hotfix) SHALL be superseded by this contract.

#### Scenario: Truthful hydration proof
- **WHEN** 3 candidates match rows but fail identity resolution
- **THEN** the proof reads canonical_row_matched=3, envelope_validated=0, missing_stable_symbol=3 — not a generic envelope_build_failed=3

### Requirement: Agent tool-calling stays behind MCP
Ornith/Gemma4 agent flows SHALL access native acceleration only through named TRACE MCP tools (`atlas.backend_info`, `atlas.exact_topk_oracle`, `atlas.parity_report`) whose results embed execution receipts. Agents SHALL NOT call gRPC services, the N-API addon, or stores directly.

#### Scenario: Evidence-backed agent claim
- **WHEN** an agent claims a GPU-backed result
- **THEN** the claim references a tool call whose receipt names the backend and counters
