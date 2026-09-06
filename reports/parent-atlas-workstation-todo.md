# Parent Atlas Workstation TODO Evidence Report

> **Historical evidence report.** This file is retained as an archival snapshot.
> The current Workstation dependency projection is
> `docs/parent-atlas-workstation-todo.md`; OpenSpec task ledgers remain the
> implementation authority.

Generated: 2026-08-10T00:00:00-07:00

This report is evidence-only. It records the current sequencing and conservative phase
statuses; it does not promote any lane.

## Current live owners discovered in this review

| Lane | Status | Owner files | Notes |
|---|---|---|---|
| MCP transport / `/mcp` / `/sse` | created + wired; proof pending | `sveltekit-frontend/src/routes/api/mcp/+server.ts`, `sveltekit-frontend/src/routes/api/sse/chat/+server.ts`, `sveltekit-frontend/src/lib/server/mcp/trace-http.ts` | The route handlers and HTTP client exist; keep TRACE core enabled and sidecars opt-in until transport matches are confirmed live. |
| Claude-Mem export/import | created + wired; export-path alignment pending | `sveltekit-frontend/src/lib/server/memory/claude-mem.ts`, `sveltekit-frontend/src/lib/server/memory/claude-mem-ingest.ts` | Dynamic import plus ingest pipeline exist; importer runs stay blocked until the export path is aligned. |
| Engram ingestion | created + wired; deferred | `sveltekit-frontend/src/lib/server/ai/engram-memory.ts`, `sveltekit-frontend/src/lib/server/memory/local-engram-memory-adapter.ts` | The memory lane is present, but the persistent ingestion lane stays deferred until transport and importer paths are stable. |
| Redis 8 eval cache | created + wired; eval-only | `sveltekit-frontend/src/lib/server/cache/*`, `sveltekit-frontend/src/lib/server/ace/ace-context-pack-cache.ts` | Keep Redis 8 isolated as an eval lane and compare it only after the current ACE context cache lane is stable. |
| Parent Atlas Pass Fabric | durable queue + bounded execution; append-only pass history / duplicate classification live receipt captured (1,272 groups); PF4 proof surface wired; PF4B current-materialization receipt captured; PF4C execution-key semantics confirmed; PF4G duplicate-delivery idempotency proven; PF4H boundary uniqueness not required | `analysis_jobs` / `worker.ts` / NLP sidecar / GPU lane / Valkey hot cache / read-tool executor / `src/lib/server/atlas/pass-fabric-proof.ts` / `src/lib/server/analysis/analysis-pass-current.ts` / `src/lib/server/analysis/analysis-pass-boundary.ts` | Keep Postgres as the canonical queue and pass history, classify duplicate pass results before any uniqueness enforcement, run CPU passes on multi-core workers, keep NLP/GPU passes bounded, keep Valkey as hot coordination cache only, and cap the read-tool fork/join executor at three independent reads. |
| Feature-gap registry | created + wired; live scan pending | `sveltekit-frontend/src/lib/server/atlas/master-feature-map.ts`, `sveltekit-frontend/src/lib/server/atlas/route-feature-map.ts`, `sveltekit-frontend/src/lib/server/atlas/runtime-registry.ts` | Current inventory exists, but the bootstrap registry still needs a live app workspace scan. |
| OKF / taxonomy / ontology / linked tuples | created + wired; schema and navigation live | `docs/.okf/schema.yaml`, `docs/.okf/registry.yaml`, `docs/.okf/README.md`, `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts`, `sveltekit-frontend/src/lib/server/ontology/ontology-extractor.ts`, `sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts`, `sveltekit-frontend/src/lib/server/atlas/pos-concept-tagging-lane.ts` | `schema.yaml` is the schema source of truth, `registry.yaml` is the navigation layer, and the live runtime contracts stay in their existing owners; use this lane for codebase topology classification, domain classification, POS / concept tagging, and ontology linking, but not semantic truth or identity ownership. |
| ClusterCard / GlyphRecord / CHR97 | created; mapping pending | `sveltekit-frontend/src/lib/server/retrieval/cluster-card-contract.ts`, `sveltekit-frontend/src/lib/server/cartridge/glyph-record.ts`, `sveltekit-frontend/src/lib/server/cartridge/chr97-builder.ts` | Keep this downstream of transport proof and registry proof. |

### OKF / telemetry / ontology-linked tuple boundary

- `timestamp`: provenance only.
- `HyperLogLog`: telemetry only; use it for approximate breadth counts, not eviction or truth.
- `OntologyLinkedTuple`: evidence layer only; keep `subject / predicate / object / evidenceRef`
  with explicit revision fields.
- `DomainClassification`: OKF / taxonomy lane.
- `Low-rank sampling`: retrieval / approximation experiment only.

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

## Telemetry and packet provenance ladder

This report records the remaining measurement gaps only. It does not create new owners or
replace any existing transport, resource, or packet contracts.

### Layer 2: RPC / Transport telemetry

**Status**: PARTIAL

- gRPC clients already exist; HTTP fallbacks are already wired.
- Remaining telemetry must measure protobuf encode latency, protobuf decode latency, JSON
  stringify overhead, and JSON parse overhead.
- Transport provenance must record the live protocol version used for each trace event
  (`grpc` vs `http`).

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
4. Keep proof separate from promotion; telemetry presence does not imply a new owner.

## Current Proven Stop State — 2026-08-10

Patch H 7/7 proven
↓
sidecar/native-addon cleanup
↓
WSL2 RAPIDS reconciliation
↓
/v1/vector/kmeans (T6c: centroid + membership lineage)
↓
20×20 SOM
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

## T6c — RESULT (2026-08-10, supersedes the plan below with live evidence)

Executed live against the real WSL2 RTX 3060 Ti GPU sidecar, K∈{64,128,256} × C∈{1,2,4,8}
nearest-centroids-searched, evaluated against a CPU-exact cosine oracle. `semantic_768`
confirmed L2-normalized live first (norms ≈1.0000, std≈0), so cuml's squared-Euclidean KMeans
objective is cosine-consistent for this corpus.

Best observed tradeoffs: K=128,C=8 → 88.5% recall@10 using 8.2% of the corpus; K=256,C=8 → 86%
recall@10 using 4.25% of the corpus (at ~3× the fit cost, 23.4s vs. 3.3s for K=64). recall@1 was
1.0 at every single (K,C) tested; recall@10 never reached 1.0 in any tested config.

**Status: `KMEANS_ROUTING_EXPERIMENT_PROVEN`, explicitly not `CANONICAL_RETRIEVAL_FILTER`.** No
canonical K/C was chosen. Centroids/membership/provenance persisted per-K
(`centroids_r1_k{K}.arrow`, `membership_r1_k{K}.arrow`, `kmeans_run_r1_k{K}.json`) — see
`openspec/changes/parent-atlas-tensor-residency-integration/tasks.md` for the full table and
methodology. SOM 20×20 must be evaluated with this same recall/candidate-fraction methodology
before being trusted as anything beyond a cache hint.

Also completed live this pass: T3a (Arrow mmap → real GPU exact top-k → packet_key recovery,
exact match with the CPU oracle) and T6b-e (CAGRA ephemeral-endpoint recall 1.0, but ~15×
slower than exact at this corpus size — reclassified as conflating index-build with search
cost, not a true crossover measurement; T6b-p, a persistent-index benchmark, is still
unstarted). The `docs/graph/codebase-graph.json` canonical refresh was also completed live
(23,254 files, 235.9s, zero errors) — `npm run graphify:daily` itself is currently broken on
this machine (Windows `EPERM` file-lock on an unrelated Phase-8 RabbitMQ chain); use
`node scripts/index-codebase-fast.mjs --publish-canonical` directly instead.

## P1 tree lineage — PROVEN (2026-08-10, canonical packets only)

- `atlas_packets`: 61,659 packets
- `atlas_packets → atlas_tree_nodes`: 61,659 / 61,659 packet links
- canonical `source_ref` uniqueness: PASS
- canonical `page_index_path` uniqueness: PASS
- path reconciliation: APPLIED
- row deletion: 0

This proof is intentionally separate from the topology lane. `atlas_topology_index` still contains
extra synthetic rows, but the canonical packet→tree lineage is now complete and idempotent.

## Summary layers — storage proven, content partial (2026-08-10)

- `atlas_summary_layers`: 18,437 rows
- non-empty `summary`: 7,061 rows
- non-empty `summary_text`: 1,128 rows
- any non-empty content: 7,654 rows
- placeholder-like content: 254 rows
- empty rows: 10,783 rows
- worker split: `embeddinggemma-batch-worker` 14,721; `backfill-summary-layers-from-chunks` 87; legacy `"<none>"` 3,629
- nested `metadata.summary_context`: 470 rows
- `identity_required_complete` inside nested summary context: 406 / 470
- `identity_chain_complete` inside nested summary context: 0 / 470
- `source_revision` / `representation_revision` are absent from nested summary context

This lane is live and partly real, but it still contains a large empty/legacy tail and multiple peer writers.
Do not treat row existence as proof of canonical summary quality.

## T2-lineage — 3/5 proven (2026-08-10, new since this report was generated)

| Field | Status | Source | Live coverage |
|---|---|---|---|
| `authority_norm` | PROVEN | `graph_node_metrics.pagerank` | 94.9% (58,546/61,659) |
| `domain_fit` | PROVEN | `atlas_packets.domain_confidence` | 7.2% (4,412/61,659) |
| `ast_signal` | PROVEN | `codebase_chunk_index.ast_symbols` (real `web-tree-sitter`, not a stub); formula `tanh(symbol_count/5)` | 5.5% (2,903/52,417) |
| `entropy_norm` | NOT PROVEN | No live Engram byte/n-gram stats table exists; bundle's `mapreduce_engram.py` never run against real text | — |
| `execution_utility` | NOT PROVEN | `trace_runs` exists (15 rows) but has **no `packet_key` column** — run-level only, not usable as-is | — |

"Proven" means a real live source + defined formula exist, not full coverage — `domain_fit`'s
7.2% is actually lower than `ast_signal`'s 5.5%; consumers must treat missing rows as missing,
never zero-filled. `feature_tensor_4x6_r1.arrow`/`feature_matrix_5.arrow` remain blocked until
5/5. Naming hazard found in passing: `src/lib/server/atlas/indexing/tree-sitter-chunker.ts` does
no AST parsing despite its name (plain fixed-window text splitter) — has real live callers, so
not dead code, just don't mistake it for a second `ast_signal` source.

Wiring update: `feature_source_manifest` now flows through
`sveltekit-frontend/src/lib/server/atlas/okf-topic-ingestion.ts`, so the live 3/5 state is
carried in OKF packets instead of existing only as an OpenSpec note. The artifact gate remains
blocked until 5/5.

## T6c current proven stop state (2026-08-10)

T6c is complete as an experiment and must not be reopened as if KMeans still needs first proof.

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

## Layered architecture (L0–L10) snapshot

This is vocabulary and sequencing only. It does not add a new implementation owner.

- L0 exact memory: DeepSeek-style Engram byte / AST / ontology n-gram lookup.
- L1 feature tensor: `FeatureTensor[4,6]` with softcapped policy axes.
- L2 tabular router: logistic regression → XGBoost.
- L3 semantic: `semantic_768`, Qdrant, cuVS.
- L4 structural: Tree-sitter, Graphify.
- L5 graph: PageRank / HITS / communities.
- L6 cache routing: KMeans centroid hints, SOM 20×20, `Topology4`, Hilbert2D.
- L7 ACE: prefetch / pin / resident / evict.
- L8 GPU: PyTorch, cuVS, cuML, cuGraph, cuTile only where benchmarked.
- L9 evidence: ontology-linked n-ary tuples and POS / concept-tagging packets.
- L10 agent: HMM, DSPy / GEPA, Ornith / Gemma, event hypergraph recommendation runtime.
  Packet-level NLP can proceed now; document-root / tree-dependent promotion
  stays blocked until duplicate-root / idempotency closure in the tree
  lineage work.
y

## Conservative phase status

| Phase | Status |
|---|---|
| Phase 11 Engram/Gemma4 memory wiring | partial |
| Phase 12 Parent Atlas codebase index | partial |
| Phase 13 feature-gap registry completion | partial |
| Phase 14 Redis exact-card cache policy | implemented |
| Phase 15 Qdrant semantic lane | implemented |
| Phase 16 Graph/KAG/DAG refresh manifest | partial |
| Phase 17 PyTorch feature extraction lane | partial |
| Phase 18 XGBoost / gradient tree boosting reranker | partial |
| Phase 19 deterministic HMM + linear policy baseline | partial |
| Phase 20 DSPy program contract | planned |
| Phase 21 GEPA reflective program optimization | planned |
| Phase 22 XGBoost / gradient boosting / reinforcement-learning experiments | partial |
| Phase 23 QLoRA / SFT | eval-only |
| Phase 24 DPO | eval-only |
| Phase 25 PPO | eval-only / not yet graded |

## Current phase sub-updates — 2026-09-05

This addendum updates the interpretation of the historical phase table above. It
does not erase or rewrite earlier evidence. Current implementation and promotion
authority remain in the owning OpenSpec ledgers and the current Workstation
projection under `docs/`.

### Phase 11 — Engram / model memory wiring

- **Capability:** `PARTIAL`.
- **Current model boundary:** Ornith `ornith-1.5-9b` through llama-server `:8090`.
- **Embedding boundary:** Ollama remains only the EmbeddingGemma lane.
- **Missing:** complete Engram ingestion and current analysis-memory wiring.
- **Promotion:** no hidden thoughts, KV cache, or model tensors are persisted.

### Phase 12 — Parent Atlas codebase index

- **Capability:** `PARTIAL`.
- **Proven:** source identity, bounded structural indexing, canonical chunk
  preimage validation, and Workstation workboard replay.
- **Current evidence:** a bounded physical cohort covers 50 sources and 434
  chunks, with source-to-chunk materialization binding proven for that recorded
  scope. Stable source-registry/repository-namespace authority remains
  unresolved.
- **Blocked:** current completed Graphify source authority and full current
  packet/chunk eligibility.
- **Promotion:** validated chunks may become eligible for PostgreSQL admission;
  the owning bounded admission gate performs any write. No semantic, graph, GPU,
  or package promotion from stale index populations.

### Phase 13 — feature-gap registry

- **Capability:** `PARTIAL`.
- **Proven:** registry and feature-map contracts exist with bounded audit/report
  surfaces.
- **Missing:** complete live workspace scan and authoritative lane coverage.
- **Promotion:** registry labels are planning metadata, not implementation proof.

### Phase 14 — Redis exact-card / BitFrost cache policy

- **Capability:** `IMPLEMENTED_BOUNDED`.
- **Proven:** canonical BitFrost invalidation primitive and bounded residency
  planning/read behavior.
- **Not proven:** broad live residency adoption or continuous writer convergence.
- **Boundary:** BitFrost/Valkey remains derived cache/residency, never canonical
  source or retrieval authority.

### Phase 15 — Qdrant semantic lane

- **Capability:** `PARTIAL`.
- **Proven:** bounded `semantic_768` canary and canonical PostgreSQL/Qdrant
  projection parity for the admitted test cohort.
- **Blocked:** current full-cohort admission because source authority and packet
  eligibility remain unresolved.
- **Contract:** `semantic_768` is canonical; use the existing representation
  owner. EmbeddingGemma is a runtime detail only when its receipt binds it to
  the representation revision; `384` is legacy/compatibility only. Scale means
  15 candidates → 128 candidates → 768 candidates, not vector dimensions.

### Phase 16 — Graph / KAG / DAG refresh manifest

- **Capability:** `PARTIAL`.
- **Proven:** Graphify execution ledger/coordinator bounded canary and deterministic
  Workstation workboard refresh proof.
- **Required order:** current source/chunk cohort → execution-bound graph snapshot
  → `GraphOrdinalMapV1` → NetworkX oracle ↔ cuGraph → graph-derived feature
  inputs → ContextManifest/PromptPlan. Receipts bind workspace, graph,
  source-population, node, edge, and ordinal-map checksums.
- **Blocked:** current graph snapshot authority and production-wide source coverage.
- **Promotion:** NetworkX/cuGraph, topology, centroid, and DAG artifacts remain
  downstream derived projections.

### Phase 17 — PyTorch feature extraction lane

- **Capability:** `PARTIAL`.
- **Proven:** fixture contracts and bounded feature/residency planning surfaces.
- **Missing:** proof of the currently registered RAPIDS/cuVS/cuGraph endpoint,
  capability revision, and same-corpus parity for promotion.
- **Promotion:** latent family remains downstream of the admitted
  `semantic_768` cohort: `latent_256 → latent_128 → latent_64`.
- Every representation binds its parent representation revision, model revision,
  normalization contract, population checksum, and artifact checksum.

### Current cross-phase gate

The active dependency order is:

`current source authority → qualified source/packet/chunk cohort → CandidateOrdinalMapV1 →
semantic_768 admission → current graph snapshot + GraphOrdinalMapV1 →
AST/graph/retrieval features → latent_256 → latent_128/latent_64 →
CandidateFeatureMatrix → ACE/BitFrost residency → DAG parameter materialization →
ContextManifest/PromptPlan → bounded DAG execution → outcome receipt`.

The packet-membership writer remains blocked while the current preflight reports
zero qualified candidates. No broad Graphify run is implied by the stale-graph
warning.

## Notes

- TRACE core remains enabled.
- Optional sidecars stay opt-in until transport matches are confirmed.
- Redis 8 stays isolated as an eval lane.
- Engram ingestion stays deferred until the transport and importer path is stable.
