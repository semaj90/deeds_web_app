# Parent Atlas Next Steps

- Generated: 2026-08-03T23:41:01.624Z
- Overall: **BLOCKED**

## Readiness matrix

| Order | ID | Area | Gate | Status | Proof |
|---:|---|---|---|---|---|
| 1 | PA-ID-001 | IDENTITY | Canonical packet identity | PASS | PRODUCTION_DATA_PROVEN |
| 2 | PA-SCHEMA-001 | SCHEMA | Live Postgres and application schema alignment | PARTIAL | PRODUCTION_DATA_PROVEN |
| 3 | PA-AST-001 | AST | AST-aware source understanding | NOT_PROVEN | NOT_PROVEN |
| 4 | PA-EMB-001 | SEMANTIC | EmbeddingGemma semantic_768 contract | FAIL | NOT_PROVEN |
| 5 | PA-CLS-001 | CLASSIFICATION | Domain classification lineage | NOT_PROVEN | NOT_PROVEN |
| 6 | PA-ONT-001 | ONTOLOGY | Ontology-linked tuples and concept edges | NOT_PROVEN | NOT_PROVEN |
| 7 | PA-PROJ-001 | QDRANT | Canonical Qdrant payload routing | FAIL | PRODUCTION_DATA_PROVEN |
| 8 | PA-RET-001 | RETRIEVAL | Canonical retrieval and multi-hop route | NOT_PROVEN | NOT_PROVEN |
| 9 | PA-GRAPH-001 | GRAPH | Persisted graph authority and PageRank | NOT_PROVEN | NOT_PROVEN |
| 10 | PA-RERANK-001 | RERANK | XGBoost and neural reranker routing | NOT_PROVEN | SOURCE_PRESENT |
| 11 | PA-ACE-001 | ACE | Exact source and ACE provenance | NOT_PROVEN | NOT_PROVEN |
| 12 | PA-EDIT-001 | EDIT | Agentic file-edit recommendation readiness | NOT_PROVEN | NOT_PROVEN |
| 13 | PA-DAG-001 | DAG | Guarded mutation DAG | NOT_PROVEN | NOT_PROVEN |
| 14 | PA-GPU-001 | GPU | cuVS exact oracle and CAGRA eligibility | NOT_PROVEN | NOT_PROVEN |
| 15 | PA-OKF-001 | KNOWLEDGE | OKF knowledge bundle schema alignment | PARTIAL | SOURCE_PRESENT |
| 16 | PA-OPENWIKI-001 | KNOWLEDGE | OpenWiki generated documentation integration | NOT_PROVEN | NOT_PROVEN |
| 17 | PA-NLP-001 | NLP | PyTorch GPU POS and token-classification sidecar | PARTIAL | RUNTIME_SMOKE_PROVEN |
| 18 | PA-REP-001 | SEMANTIC | Representation and collection alignment | PARTIAL | PRODUCTION_DATA_PROVEN |
| 19 | PA-OTEL-001 | OBSERVABILITY | OpenTelemetry SDK and Collector wiring | NOT_PROVEN | SOURCE_PRESENT |
| 20 | PA-OTEL-002 | OBSERVABILITY | Routing connector and lane isolation | NOT_PROVEN | NOT_PROVEN |
| 21 | PA-QDRANT-TRANSPORT-001 | QDRANT | Qdrant HTTP and gRPC transport health | PASS | RUNTIME_SMOKE_PROVEN |
| 22 | PA-DAG-LOG-001 | OBSERVABILITY | Debounced DAG orchestration logger | FAIL | NOT_PROVEN |
| 23 | PA-OPS-001 | OPERATIONS | Graphify freshness and stage isolation | FAIL | PRODUCTION_DATA_PROVEN |

## Exact next task

**PA-OTEL-001 — OpenTelemetry SDK and Collector wiring**

Existing OTel SDK, OTLP endpoints, Collector configuration, and resource attributes were inventoried.

## PA-ID-001 — Canonical packet identity

**Status:** PASS

Canonical packet/source/workspace identity is complete in live Postgres.

**Next:** Repair or quarantine missing canonical identities before projection or edit recommendations.

## PA-SCHEMA-001 — Live Postgres and application schema alignment

**Status:** PARTIAL

Live atlas_packets fields and indexes were inspected; application-schema parity still requires repository comparison.

**Next:** Run the schema drift gates and classify each mismatch before altering tables.

## PA-AST-001 — AST-aware source understanding

**Status:** NOT_PROVEN

No AST-aware implementation was located.

**Next:** Choose the real tree-sitter path as structural authority and reconcile its outputs to packet/source identity.

## PA-EMB-001 — EmbeddingGemma semantic_768 contract

**Status:** FAIL

Embedding runtime or semantic_768 implementation is missing.

**Next:** Run one bounded embedding manifest proof before ANN or reranker promotion.

## PA-CLS-001 — Domain classification lineage

**Status:** NOT_PROVEN

Domain classification code/storage references exist, but producer, model revision, confidence, and active consumers require proof.

**Next:** Trace domain_class from producer to retrieval/reranking consumers and add lineage receipts.

## PA-ONT-001 — Ontology-linked tuples and concept edges

**Status:** NOT_PROVEN

Concept/ontology/hyperedge code exists; canonical tuple identity, provenance, and retrieval use remain partially proven.

**Next:** Prove one ontology tuple from AST/source evidence through storage and retrieval.

## PA-PROJ-001 — Canonical Qdrant payload routing

**Status:** FAIL

Production payload identity remains incomplete or Qdrant is unavailable.

**Next:** Prove the active writer seam, then produce a read-only production reconciliation plan.

## PA-RET-001 — Canonical retrieval and multi-hop route

**Status:** NOT_PROVEN

HyperRAG/Go retrieval/RRF seams exist, but one canonical production route and bounded traversal receipt are not proven.

**Next:** Select one production route and prove query → hydrate → expand → fuse → rerank → exact source.

## PA-GRAPH-001 — Persisted graph authority and PageRank

**Status:** NOT_PROVEN

PageRank/GDS code exists; canonical property, snapshot lineage, and post-hydration attachment need runtime proof.

**Next:** Prove persisted PageRank attachment on one canonical retrieval request.

## PA-RERANK-001 — XGBoost and neural reranker routing

**Status:** NOT_PROVEN

Reranker services/code exist; canonical post-hydration routing, feature schema, ablation, and identity preservation are not fully proven.

**Next:** Run trace_score-only, XGBoost, and neural-reranker ablations on canonically hydrated candidates.

## PA-ACE-001 — Exact source and ACE provenance

**Status:** NOT_PROVEN

Summary and ACE seams exist; exact current-source resolution and complete lane provenance remain unproven.

**Next:** Prove one ACE packet from a canonical retrieval request with exact current source spans.

## PA-EDIT-001 — Agentic file-edit recommendation readiness

**Status:** NOT_PROVEN

Patch/error-fixing seams exist; exact target resolution, stale guards, and validation-plan completeness remain partial.

**Next:** Build a read-only recommendation skill that outputs exact targets, evidence, confidence, and validation plan without editing.

## PA-DAG-001 — Guarded mutation DAG

**Status:** NOT_PROVEN

State-transition and artifact-lineage concepts exist; the complete validated mutation DAG is not proven.

**Next:** Define and test state transitions before allowing any agentic write.

## PA-GPU-001 — cuVS exact oracle and CAGRA eligibility

**Status:** NOT_PROVEN

GPU exact-search and CAGRA references were found; same-matrix parity and CAGRA eligibility remain gated.

**Next:** Run exact semantic_768 parity before any CAGRA build.

## PA-OKF-001 — OKF knowledge bundle schema alignment

**Status:** PARTIAL

OKF staging is absent or contains frontmatter/schema gaps.

**Next:** Create a versioned Parent Atlas OKF profile and validate generated staging before promotion.

## PA-OPENWIKI-001 — OpenWiki generated documentation integration

**Status:** NOT_PROVEN

OpenWiki must consume promoted or validated OKF and write only to generated documentation staging.

**Next:** Wire OpenWiki as a documentation consumer of validated OKF, not a canonical evidence writer.

## PA-NLP-001 — PyTorch GPU POS and token-classification sidecar

**Status:** PARTIAL

The NLP sidecar is checked for PyTorch/CUDA and POS or token-classification capabilities.

**Next:** Expose a typed capabilities endpoint and prove one GPU POS/tagging fixture with exact offsets.

## PA-REP-001 — Representation and collection alignment

**Status:** PARTIAL

Semantic collection dimensions and latent storage lanes are checked independently.

**Next:** Generate a representation registry and collection compatibility matrix before promoting latent or GPU lanes.

## PA-OTEL-001 — OpenTelemetry SDK and Collector wiring

**Status:** NOT_PROVEN

Existing OTel SDK, OTLP endpoints, Collector configuration, and resource attributes were inventoried.

**Next:** Normalize Parent Atlas resource attributes and prove one trace from each active runtime.

## PA-OTEL-002 — Routing connector and lane isolation

**Status:** NOT_PROVEN

Routing-connector availability, default routing, Parent Atlas lanes, batching, redaction, and memory controls were checked.

**Next:** Add a Collector routing connector with graphify, retrieval, GPU, projection, agent, and default pipelines; then run a blackholed-exporter containment test.

## PA-QDRANT-TRANSPORT-001 — Qdrant HTTP and gRPC transport health

**Status:** PASS

Qdrant REST health and gRPC TCP reachability were checked separately.

**Next:** Add a real Qdrant gRPC health/list-collections smoke using the installed client, while retaining HTTP for inspection and administrative validation.

## PA-DAG-LOG-001 — Debounced DAG orchestration logger

**Status:** FAIL

The orchestration logger is checked for keyed debounce, immediate critical-event delivery, bounded pending state, shutdown flush, and OpenTelemetry integration.

**Next:** Wire one reusable DebouncedDagLogger around noncanonical orchestration telemetry, then prove coalescing, critical bypass, bounded overflow, transition flush, and shutdown flush.

## PA-OPS-001 — Graphify freshness and stage isolation

**Status:** FAIL

Graph artifact is stale or missing.

**Next:** Repair graph-only stage isolation; keep this separate from Qdrant writer work.

