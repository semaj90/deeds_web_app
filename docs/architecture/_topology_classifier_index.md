# Topology, Classifier, 4D, LUT and Agentic Dense Search Index

> Navigation only. Owners and status come from `docs/architecture/runtime-ownership-registry.json`. Unproven items are marked; nothing here is evidence that a path serves live data.

## TL;DR

Topology sidecars run on RAPIDS in WSL2 and need the GPU. The 4D search and hypergraph routing call the topology service on `:8101`, but no tracked code serves it. The classifier and LUTs are offline or in-process. Agentic dense search is TRACE-side and needs a selective packet filter.

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

Several scripts keep ad hoc lookup maps. Do not add a second class table without naming an owner first (KAFKA-18).

## Agentic dense search

| Tool | Role | Status |
|---|---|---|
| `atlas_packet_dense_search` (TRACE) | Bitmap-prefiltered packet search, then a Qdrant dense rerank. CODE scope needs a selective filter (`feature_id`, `source_ref`, `concept_id`, or `tags`) and an explicit collection. | Registered; not run in this index |
| `atlas_packet_search` (TRACE) | Canonical packet lookup by `summary_query`, `source_ref`, or `feature_id` | Works with bounded queries; `source_ref` timed out once in an earlier session (not re-run here) |

Agentic dense search depends on canonical packet summaries. Summaries containing drafting text are a known defect (LOG-13).

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
