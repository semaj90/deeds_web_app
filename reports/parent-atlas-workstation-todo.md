# Parent Atlas Workstation TODO Evidence Report

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
| Feature-gap registry | created + wired; live scan pending | `sveltekit-frontend/src/lib/server/atlas/master-feature-map.ts`, `sveltekit-frontend/src/lib/server/atlas/route-feature-map.ts`, `sveltekit-frontend/src/lib/server/atlas/runtime-registry.ts` | Current inventory exists, but the bootstrap registry still needs a live app workspace scan. |
| OKF / taxonomy / ontology / linked tuples | created + wired; schema and navigation live | `docs/.okf/schema.yaml`, `docs/.okf/registry.yaml`, `docs/.okf/README.md`, `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts`, `sveltekit-frontend/src/lib/server/ontology/ontology-extractor.ts`, `sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts` | `schema.yaml` is the schema source of truth, `registry.yaml` is the navigation layer, and the live runtime contracts stay in their existing owners; use this lane for codebase topology classification, domain classification, and ontology linking, but not semantic truth or identity ownership. |
| ClusterCard / GlyphRecord / CHR97 | created; mapping pending | `sveltekit-frontend/src/lib/server/retrieval/cluster-card-contract.ts`, `sveltekit-frontend/src/lib/server/cartridge/glyph-record.ts`, `sveltekit-frontend/src/lib/server/cartridge/chr97-builder.ts` | Keep this downstream of transport proof and registry proof. |

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

## Current Control-Plane Override — 2026-08-09

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

## T6c lineage stop (original plan, pre-execution — see RESULT above for what actually ran)

1. Freeze the `semantic_768` corpus revision before running KMeans.
2. Persist centroid and membership artifacts for `K ∈ {64, 128, 256}` with lineage metadata.
3. Compare candidate reduction and recall@10 against the already-proven T3a exact oracle.
4. Keep SOM cache-hint-only until it proves it does not hurt recall.
5. Refresh Graphify only after T6c is persisted and evaluated.
6. Do not start AE, RRF, Neo4j projection, or GA8/GA9 promotion from this lane.

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
- L9 evidence: ontology-linked n-ary tuples.
- L10 agent: HMM, DSPy / GEPA, Ornith / Gemma.

Current gate:

- `feature_tensor_4x6_r1.arrow` and `ace_policy_r1.json` stay gated on T2-lineage reaching 5/5
  proven sources.

## Slotting note from the vocabulary review

Keep these terms in the same L0–L10 ladder, not as new owners:

| Term | Slot | Note |
|---|---|---|
| nibble / INT4 / INT8 packing | L8 cache tier | Quantized cache fidelity only; never encode `packet_key` / `feature_id` as canonical identity. |
| tensor analysis / RTX matrix ops | L8 GPU | PyTorch / cuVS-style computation lane. |
| cuVS / RAPIDS | L3 / L8 | cuVS exact stays the oracle; RAPIDS KMeans belongs in L6. |
| HNSW | L3 (Qdrant only) | Qdrant ANN structure, not an Atlas implementation target. |
| 4D linked topology coordinates | L6 | Topology4 routing / cache coordinates only. |
| Hilbert (constrained dimensionality) | L6 | 2D SOM locality only, never a 4D curve over the whole topology. |
| `ae:train` | L1 / L8, gated | Deterministic AE only, blocked behind KMeans/SOM evidence. |
| KMeans 20×20 | no merge | KMeans and SOM are separate; do not conflate them. |
| domain classification | L1 (`domain_fit`) | Proven source, partial coverage only. |
| hyper-dimensional fanout | L9 | N-ary / hypergraph evidence lane. |
| simdjson-like GPU memory swapping | none | Category error; GPU tile swapping is L7 ACE, not simdjson. |
| Redis centroid caching | L7 / T5 | Pointers only; never raw tensors. |
| indexing already-computed tensor for RTX analysis | L7 / T3c | GPU-resident tile reuse, not proven live yet. |
| gradient checkpointing / N64-style memory | not applicable yet | Only relevant if L10-adjacent training work begins. |

## P2 transport and ingestion gates

1. Finish the MCP / `/mcp` / `/sse` diagnostics.
2. Keep TRACE core enabled and optional sidecars opt-in until transport matches are confirmed.
3. Resolve Claude-Mem export path alignment before any importer run.
4. Keep the persistent Engram ingestion lane deferred until the transport and importer path are stable.
5. Keep Redis 8 isolated as an eval lane and compare it only after the current ACE context cache lane is stable.

## Registry and retrieval policy

1. Replace the bootstrap feature-gap registry with a live app workspace scan when the mounted codebase is available.
2. Ingest the current feature inventory into the registry and mark each lane as implemented, partial, missing, or eval-only.
3. Keep the retrieval policy explicit: exact cache first, then semantic cache, then retrieval, then packet assembly.
4. Keep single-fact lookups on vector search, code navigation on agentic search, and graph-heavy data on graph lanes.

## Storage, cards, synthesis

1. Build ClusterCard flow from reviewed sourceRefs and table contracts.
2. Keep the semantic cache policy split between Redis exact-card lookup and Qdrant dense retrieval.
3. Add graph refresh manifest discipline with version/hash and promotion state.
4. Wire synthesis consumers only after the packet/version contract stays stable.

## P3 validation and structural promotion

1. Stabilize the 768d -> 64d latent -> cluster -> JSON graph path.
2. Define the canonical ClusterCard -> GlyphRecord -> CHR97 mapping.
3. Keep manifold4 as a later analytical lane, not a correctness gate.
4. Treat the ACE Context Pack Cache / NES Cartridge Cache as Redis-hot-pointer plus Postgres-durable storage only; large snapshot storage stays open.

## P4 semantic memory and checklist mining

1. Keep the semantic indexer as a first-class lane.
2. Keep its outputs consumable by the feature-gap registry without rereading whole corpora.
3. Keep the semantic lane aligned with the ACE/NES packet contract and version field.
4. Add smoke/report outputs to registry rows for retrieval lanes and feature-map lanes.
5. Use LangChain later only as an optional organizer for messy `.md` / `.json` after LangExtract.

## Token remapping and geometry lanes

1. `autoencoder`: default lane for token remapping, latent projection, and route compression.
2. `decoder-upscale`: optional reconstruction / upscaling lane; do not make it the identity owner.
3. `bvh-geometry`: spatial traversal and visualization lane only.
4. `riemannian-geometry`: metric-tensor and distortion diagnostics lane only.
5. `kmeans-20x20`: centroid routing topology lane; keep it separate from semantic truth.
6. `glyph-animation`: NES / CHR97 / sprite visualization lane; never the canonical retrieval lane.

## Agent-program and model-training ladder

1. Keep the deterministic HMM + linear policy baseline as the control owner.
2. Treat DSPy as the Atlas agent-program contract layer.
3. Place GEPA immediately after DSPy as the reflective prompt/program optimizer over RouteTrace and evaluation traces.
4. Keep GEPA ahead of QLoRA / SFT, then DPO, then PPO only if still justified.
5. Keep geometry / Jacobian / HyperGraphRAG experiments on a separate branch from the agent-program ladder.

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

## Notes

- TRACE core remains enabled.
- Optional sidecars stay opt-in until transport matches are confirmed.
- Redis 8 stays isolated as an eval lane.
- Engram ingestion stays deferred until the transport and importer path is stable.
