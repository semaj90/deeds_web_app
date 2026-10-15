# Topology, Classifier, 4D, LUT and Agentic Dense Search Index

> Navigation only. Owners and status come from `docs/architecture/runtime-ownership-registry.json`. Unproven items are marked; nothing here is evidence that a path serves live data.

## TL;DR

Topology sidecars are RAPIDS/cuGraph/cuVS executors intended for WSL2; their source presence does not prove a current live GPU run. The 4D search and hypergraph routing call the topology service on `:8101`, but no tracked code serves it. The classifier and LUTs are offline or in-process. Agentic dense search is TRACE-side and needs a selective packet filter.

## Topology sidecars (WSL2 RAPIDS, GPU)

| File | Role | Owner class | Status |
|---|---|---|---|
| `python/atlas_rapids_graph_runtime.py` | Resident cuGraph PageRank over a frozen snapshot; executor, not authority | Executor | Not observed live |
| `python/atlas_rapids_community.py` | Community detection on call and import graphs; refuses to treat directed graphs as undirected | Executor | Not observed live |
| `python/atlas_cuvs_resident_sidecar.py` | Exact KNN and CAGRA over a resident index | Executor | Not observed live |

These do not call the Ornith server on `:8090` and do not bind `:8101`. They conflict with Ornith only on VRAM.

## Topology service on :8101 (no tracked server)

| Consumer | Calls | Owner in tracked code |
|---|---|---|
| `sveltekit-frontend/src/mcp/trace-mcp-server.ts` `topology.search_4d` | `${TOPOLOGY_SEARCH_URL}/search/4d` | None: client only |
| `sveltekit-frontend/src/lib/server/retrieval/hypergraph-routing-service.ts` | `HG_LOOKUP_URL` or `TOPOLOGY_SEARCH_URL` | None: client only |
| `sveltekit-frontend/src/lib/server/retrieval/hyperrag-fusion-service.ts` | `HG_LOOKUP_URL` or `TOPOLOGY_SEARCH_URL` | None: client only |

Default: `.env.example` sets `TOPOLOGY_SEARCH_URL=http://127.0.0.1:8101`. Status: DOWN at last health check. The earlier label "optional" applies only to the readiness audit; these callers treat it as a live dependency.

## Classifier

| File | Role | Owner class | Status |
|---|---|---|---|
| `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts` | Domain taxonomy | Canonical runtime | Present |
| `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy-ml-bridge.ts` | Bridge to the ML classifier | Adapter | Present |
| `python/train_domain_classifier.py` | Offline sklearn trainer | Offline trainer | Present |
| `python/atlas_nlp_classification_helper_v1.py` | Read-only FastAPI classification seam | Helper | Present |

Classifier output is a proposal. It never promotes identity or adds a retrieval vote.

### Keyword, topic, cluster, and concept boundaries

| Signal | Meaning | May do | Must not do |
|---|---|---|---|
| Keyword / glossary alias | A normalized surface-form match against a revisioned vocabulary | Generate lexical candidates and explain a match | Mint a concept/entity ID or prove semantic equivalence |
| Topic | A corpus/query grouping produced by a named extraction or clustering run | Route analysis and attach advisory features | Replace a domain taxonomy term |
| Cluster | A grouping from KMeans/SOM or another declared algorithm | Add distance/assignment features with model and snapshot revisions | Use integer cluster labels as ordinal values or canonical IDs |
| Domain label | A classifier's bounded classification proposal | Select candidate lanes or filters under existing policy | Become an ontology fact without owner resolution and evidence admission |
| Concept / entity | A canonical ontology term or typed Atlas object | Join by resolved owner ID and revision | Join by display name, embedding similarity, or keyword alone |

For a corpus-to-glossary crosswalk, preserve the raw term, normalized form, language, source reference/revision, glossary revision, match method, and evidence span. Emit `EXACT`, `AMBIGUOUS`, `UNMAPPED`, or `RESOLVED` explicitly; never silently coerce ambiguity to a hit. Read [the taxonomy/OAK/GraphRAG index](./_taxonomy_oak_graphrag_index.md) for the complete alignment sequence and current proof limits.

## 4D topology search

| File | Role | Owner class | Status |
|---|---|---|---|
| `sveltekit-frontend/src/mcp/trace-mcp-server.ts` (line 3083) | Tool `topology.search_4d`: SOM x and y, `semantic_z`, `grpo_w`, Euclidean radius, JSONB filters | TRACE tool | Registered; backend DOWN |
| `sveltekit-frontend/src/lib/server/ai/tool-selection.ts` | Tool-selection metadata | Routing | Present |

## LUTs

| File | Role | Owner class | Status |
|---|---|---|---|
| `sveltekit-frontend/src/lib/server/atlas/residency/packet-class-lut-v1.ts` | Byte and nibble packet-class table (ROM-bank framing; not Pokémon data) | Canonical runtime | Present |
| `scripts/atlas/lib/repair-lut-v1.mjs` | Repair lookup table | Script | Present |
| `CandidateOrdinalMapV1` (`candidate-ordinal-corpus-v1.mts`) | Dense vector ordinal projection for LibTorch CPU/GPU parameter tensor indexing | Projection LUT | Contract-tested |

Several scripts keep ad hoc lookup maps. Do not add a second class table without naming an owner first (KAFKA-18). LUT ordinals are ephemeral presentation projections and must never replace canonical UUIDs or database keys.

## LibTorch CPU parameter fetching

| Component | Role | Mechanism | Status |
|---|---|---|---|
| `simd-bridge/cpp/pytorch_graph.cc` | Host memory wrapping | `torch::from_blob(const_cast<float*>(query), ...)` wraps host `Float32Array` input; `.to(dev)` performs device transfer when CUDA is selected | Source-confirmed; live device execution requires a runtime receipt |
| `pytorch_graph.cc::pgDevice()` | Device selection | Selects CUDA when `torch::cuda::is_available()`, otherwise CPU; CUDA OOM is returned as an error, not retried on CPU | Source-present; runtime probe is separately reported in `_cuda_rtx_toc.md` |
| `LibTorchReranker.rerank` | Typed host buffer input | Passes `Float32Array` without JSON encoding; `from_blob` wraps host memory, while `.to(cuda)` copies to device | Host-side interface present; no zero-copy GPU transfer claim |

## Agentic dense search, ACP and A2A

| Tool / Protocol | Role | Status |
|---|---|---|
| `atlas_packet_dense_search` (TRACE) | Bitmap-prefiltered packet search, then a Qdrant dense rerank. CODE scope needs a selective filter (`feature_id`, `source_ref`, `concept_id`, or `tags`) and an explicit collection. | Registered; not run in this index |
| `atlas_packet_search` (TRACE) | Canonical packet lookup by `summary_query`, `source_ref`, or `feature_id` | Works with bounded queries; `source_ref` timed out once in an earlier session (not re-run here) |
| `ACP Worker Loop` (`acp/worker.ts`) | Action Control Plane: async task validation, feature extraction, and LibTorch parameter routing without canonical DB writes | Verified contract (9/9 Python unit tests) |
| `A2A Delegation Wire` (`a2a-wire-v1.ts`) | Agent-to-Agent protocol: discovery at `/.well-known/agent.json`, streaming SSE at `POST /api/ai/agent`; projection-only task binding | Verified contract (15/15 unit fixtures, v1.0 spec) |

Agentic dense search depends on canonical packet summaries. Summaries containing drafting text are a known defect (LOG-13). Neither ACP nor A2A is authorized to mutate PostgreSQL, Qdrant, or Neo4j directly.

## Parent Atlas workstation: navigation packet and bounded recommendations

Treat Atlas as a revision-aware map of the codebase and knowledge corpus: canonical entities are places, qualified source/graph relations are routes, domain concepts are map layers, and evidence references are the legend. A route must retain its source/workspace/graph revisions; a classifier label or low-rank coordinate is only a navigation hint, never a new identity.

The existing owners compose the path; do not add a second packet, task, retrieval, or fusion authority:

```text
ACP request / A2A task projection
  → existing SearchRuntime candidate lanes and canonical lane dedup/RRF
  → revision-qualified candidate snapshot + existing low-rank helper shortlist (advisory)
  → exact candidate/source qualification
  → ACE packet references + existing ContextManifestV2 token admission
  → existing DAG/context execution gate
```

`AcePacketV3` is the durable, revision-qualified composition envelope and references vectors rather than embedding them. Request-local selected evidence and token budgeting belong to `ContextManifestV2`; raw retrieval results must not be injected directly. ACP/A2A carry validated task/control data and remain projections; they do not confer source authority or authorize writes. The new low-rank helper budget receipt is likewise an advisory shortlist only. Estimated context tokens are a planning bound, not a measured token saving; the final prompt/tokenizer owner must account for actual rendered context.

The “DLSS-like” analogy is limited to a coarse-to-refined pipeline: low-rank features may narrow or order candidates, then the existing exact identity/source checks and ACE selection refine the result. Do not reconstruct, interpolate, or replace canonical `semantic_768` from a latent representation. Keep one semantic retrieval vote and the deterministic SearchRuntime order as fallback.

Ewin Tang’s quantum-inspired recommendation algorithm is a research reference, not the implemented low-rank helper scorer. Its sublinear result depends on an input structure supporting specific \(\ell^2\)-sampling operations and low-rank assumptions; Parent Atlas has not proved those conditions for its retrieval/usage matrix. Do not claim Tang’s complexity or quality guarantees for the current scorer. Evaluate any future sampling challenger on a frozen, independently labeled cohort.

**Current proof boundary:** focused local tests pass for strict factor dimensions, deterministic bounded shortlist selection, advisory/write-disabled output, the existing unified-context descriptor, and ACE packet-to-ContextManifest bridge (17/17 fixtures). They do not prove live ACP→A2A→SearchRuntime→ACE/DAG execution, exact tokenizer savings, trained model quality, GPU execution, or ContextManifest persistence/readback.

The `.okf/corpora/keyword-corpus.yaml` vocabulary has a separate read-only lexical MCP surface, `atlas.keyword_corpus_search`. It validates the adjacent JSON Schema and YAML unique keys, ranks by deterministic keyword overlap, returns bounded Top-K pages with a corpus/query-checksum-bound cursor, and attaches `PacketClassLutV1` code + encoding revision for display/compact-reference use. The result is runtime-validated and returned in MCP structured content plus compatible JSON text. The corpus remains `reference_only`, `canonical_authority: false`, and `indexing.searchable: false`; this tool does not search canonical source packets, add a SearchRuntime lane, resolve taxonomy IDs, or promote the LUT to identity. Pre-change fixtures passed 4/4; the structured-output change still needs a focused rerun, and live MCP registration/invocation are not independently proven. See `sveltekit-frontend/src/lib/server/atlas/keyword-corpus-search-v1.ts` and `sveltekit-frontend/src/mcp/atlas-keyword-corpus-tools.ts`.

## What we need

| Need | Why | Owner / gate |
|---|---|---|
| An owner for `:8101` (or a decision to drop it) | Three callers treat it as live; no tracked server serves `/search/4d` | `TOPOLOGY-EXECUTOR-NEED-01`, LOG-09, `tasks.md` gate `TRACE_PORT_AUTHORITY_01` |
| Fix the TRACE health notes for `:8090`, `:8080`, `:8099` | Source notes are corrected; live labels pending a TRACE restart | LOG-10, LOG-16 |
| Drafting-text repair for canonical summaries | 258 of 6,886 summaries flagged (census, 2026-10-13) | LOG-13, LOG-17 |
| Centroid BMU assignments and revision lineage | BMU rows 0 of 2; no centroid records observed | `CENTROID_RESIDENCY_01` |
| Lane-collapse fix in retrieval | FTS and KAG return one lexical lane (fallback) | `TRACE_RETRIEVAL_PARITY_01` |

## To do

- [x] Identify the `:8080` owner (SeaweedFS volume container, 2026-10-13).
- [x] Correct the port labels in `trace-mcp-server.ts` source notes (2026-10-13).
- [ ] Restart TRACE so live health text shows the corrected port labels (LOG-16).
- [ ] Decide whether `:8101` should run or be removed from the health set (LOG-09).
- [ ] Run `atlas_packet_dense_search` with a selective filter and record the result.
- [ ] Re-run `atlas_packet_search` with `source_ref` to see whether the timeout reproduces.
- [ ] Decide the repair path for the 258 flagged summaries (quarantine and regeneration are proposals only).
- [ ] Run `npm run atlas:docs:toc:check:v2` after this index is final (not yet run).
- [ ] Verify the cited line numbers again after any edit to `trace-mcp-server.ts`.

## Not proven

- No centroid BMU assignments or revision lineage observed (see `CENTROID_RESIDENCY_01`, verdict NOT_PROVEN).
- Retrieval parity is partial: FTS and KAG collapse to one lexical lane (see `TRACE_RETRIEVAL_PARITY_01`).
- Port `:8080` is owned by the SeaweedFS volume container (identified 2026-10-13, see `TRACE_PORT_AUTHORITY_01`).
