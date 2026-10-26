---
type: system
title: Parent Atlas compute and retrieval ownership
id: system/parent-atlas-compute-ownership
status: active
owners:
  - legal-ai-team
source_refs:
  - python/atlas_graph_runtime/gnn_reference.py
  - python/atlas_graph_runtime/networkx_executor.py
  - python/atlas_graph_runtime/cugraph_executor.py
  - python/atlas_graph_runtime/cuvs_executor.py
  - sveltekit-frontend/src/lib/server/atlas/graph/s-graph-search.ts
  - sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts
  - sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts
  - sveltekit-frontend/src/lib/server/db/schema.ts
related:
  - system/hyperrag
  - pipeline/retrieval-ranking-synthesis
generated:
  by: human:james
---

# Parent Atlas compute and retrieval ownership

This page records local ownership boundaries. A source module, configured Python environment,
successful MCP handshake, or imported library does not prove that a production request used that
component. Record runtime and parity receipts separately.

## Identity and retrieval

- PostgreSQL owns canonical packet/chunk identity, source/workspace revisions, eligibility, and
  evidence state. Do not resolve identities from labels, vector IDs, cache keys, cluster IDs, or
  candidate ordinals alone.
- SearchRuntime owns cross-lane normalization, de-duplication, and the single retrieval fusion
  decision. Feature classifiers, graph scores, and cache hints are advisory and cannot add a second
  lane vote.
- Qdrant, Neo4j, cuVS, and graph-layout artifacts are rebuildable projections. Valkey/BitFrost is
  cache and residency routing, never canonical source truth or an evidence-admission owner.

## CPU reference and GPU challengers

- `python/atlas_graph_runtime/gnn_reference.py` uses NetworkX for topology and PyTorch for tensor
  math. Its declared architecture/fixture inventory is fixture scope, not proof of a current Atlas
  graph or production GNN execution.
- `networkx_executor.py` is the CPU graph oracle; `cugraph_executor.py` is the separate RAPIDS
  graph executor. Compare them only on the same frozen, revision-qualified graph and ordinal map.
- `cuvs_executor.py` serves vector-neighbor work; it does not own graph traversal or relationship
  admission. SIMT/cuTile and custom kernels remain challengers behind CPU parity and resource gates.
- `s-graph-search.ts` owns bounded TypeScript plan/receipt search policies. A plan/receipt API is
  not a live route; source call sites and graph readback must be established independently.
- PCA/SVD, clustering, PageRank, manifold coordinates, and 4D topology are derived analysis or
  routing signals. They must not become identity, facts, ontology edges, or additional retrieval
  votes.

## Parsing, NLP, and agent tools

- The Node N-API SIMDJSON bridge is an optional ingestion/parser path. Keep V8 parsing as the
  fallback and promote the native path only on bounded, representative end-to-end benchmarks;
  parsing validates neither schema nor source lineage.
- The 8095 NLP/AST sidecar may emit bounded, source-span-grounded proposals. Canonical source
  revisions remain with the source owner; ontology admission remains with the tuple authority.
- MCP tool selection proposes registered capabilities. Registry schemas, permissions, operator
  approval, cancellation, and execution receipts remain authoritative across OpenCode, ACP, A2A,
  tRPC, or optional orchestration clients.
- DSPy/GEPA and learned rankers are offline evaluation tools until frozen held-out results and a
  reviewed promotion path exist. QLoRA, Titans/HOPE memory, and KV-cache residency are separate
  model/runtime concerns and do not replace canonical evidence or BitFrost descriptors.

## Promotion gates

Before any live graph ranking or GPU claim, require a current admitted packet/source cohort, an
integrity-checked CandidateOrdinalMap, exact graph/evidence readback, deterministic CPU results,
and resource-admitted GPU parity on the identical input. Missing graph or source rows stay
unavailable; do not synthesize a fixture or default value into a live batch.
