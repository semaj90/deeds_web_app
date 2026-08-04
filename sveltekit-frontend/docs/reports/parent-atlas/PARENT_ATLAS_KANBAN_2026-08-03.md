# Parent Atlas Kanban

## BLOCKED

### P0 PA-AST-001 — AST-aware source understanding

- Area: AST
- Owner component: ast
- Dependencies: PA-ID-001, PA-SCHEMA-001
- Expected proof: FIXTURE_PROVEN
- Reason: No AST-aware implementation was located.
- Definition of done:
  - one real parser path proven for TS/JS
  - exact file/span output
  - symbol occurrence mapped to canonical packet/source
  - regex fallback clearly labeled
- Validation:
  - `npm run batch:a:validate`
- Prohibited scope:
  - Do not call regex extraction tree-sitter
  - Do not use tree_node_id as stable symbol identity

### P0 PA-EMB-001 — EmbeddingGemma semantic_768 contract

- Area: SEMANTIC
- Owner component: semantic
- Dependencies: PA-ID-001, PA-AST-001
- Expected proof: FIXTURE_PROVEN
- Reason: Embedding runtime or semantic_768 implementation is missing.
- Definition of done:
  - output dimension exactly 768
  - model and revision recorded
  - normalization and pooling recorded
  - source text/hash recorded
  - packet_key manifest produced
- Validation:
  - `npm run smoke:embeddinggemma`
- Prohibited scope:
  - Do not use latent_64 for packet ANN
  - Do not mix PageRank or SOM coordinates into semantic_768

### P1 PA-CLS-001 — Domain classification lineage

- Area: CLASSIFICATION
- Owner component: classification
- Dependencies: PA-AST-001, PA-EMB-001
- Expected proof: FIXTURE_PROVEN
- Reason: Domain classification code/storage references exist, but producer, model revision, confidence, and active consumers require proof.
- Definition of done:
  - classifier owner identified
  - input feature contract recorded
  - model/revision recorded
  - confidence stored
  - consumer purpose documented
- Validation:
  - `npm run batch:f:validate`
- Prohibited scope:
  - Do not treat domain_class as canonical identity

### P1 PA-ONT-001 — Ontology-linked tuples and concept edges

- Area: ONTOLOGY
- Owner component: ontology
- Dependencies: PA-AST-001, PA-CLS-001
- Expected proof: FIXTURE_PROVEN
- Reason: Concept/ontology/hyperedge code exists; canonical tuple identity, provenance, and retrieval use remain partially proven.
- Definition of done:
  - tuple schema defined
  - source packet and exact span recorded
  - concept edge provenance recorded
  - duplicate tuple prevention defined
- Validation:
  - `npm run batch:c:validate`
- Prohibited scope:
  - Do not synthesize ontology facts without source evidence

### P1 PA-PROJ-001 — Canonical Qdrant payload routing

- Area: QDRANT
- Owner component: qdrant
- Dependencies: PA-ID-001, PA-EMB-001
- Expected proof: FIXTURE_PROVEN
- Reason: Production payload identity remains incomplete or Qdrant is unavailable.
- Definition of done:
  - active writer uses strict builder
  - production payload coverage is complete
  - repeated delivery does not create duplicates
  - packet_key join-back succeeds
- Validation:
  - `npx tsx scripts/atlas/prove-qdrant-packet-joinback.mts`
  - `npx tsx scripts/atlas/validate-parent-atlas-canonical-routing.mts`
- Prohibited scope:
  - No production upsert during audit
  - No migration before rollback plan

### P1 PA-RET-001 — Canonical retrieval and multi-hop route

- Area: RETRIEVAL
- Owner component: retrieval
- Dependencies: PA-PROJ-001, PA-ONT-001
- Expected proof: FIXTURE_PROVEN
- Reason: HyperRAG/Go retrieval/RRF seams exist, but one canonical production route and bounded traversal receipt are not proven.
- Definition of done:
  - one app-facing route selected
  - canonical Postgres hydration performed
  - stale revisions rejected
  - multi-hop traversal bounded
  - lane provenance preserved
- Validation:
  - `npm run smoke:retrieval:canonical-rerank`
- Prohibited scope:
  - Do not keep duplicate TypeScript and Go orchestration owners

### P1 PA-GRAPH-001 — Persisted graph authority and PageRank

- Area: GRAPH
- Owner component: graph
- Dependencies: PA-RET-001
- Expected proof: FIXTURE_PROVEN
- Reason: PageRank/GDS code exists; canonical property, snapshot lineage, and post-hydration attachment need runtime proof.
- Definition of done:
  - canonical PageRank property selected
  - graph snapshot ID recorded
  - PageRank attached after hydration
  - missing value handled nonfatally
- Validation:
  - `npm run atlas:som:audit`
- Prohibited scope:
  - No per-request PageRank recomputation

### P1 PA-RERANK-001 — XGBoost and neural reranker routing

- Area: RERANK
- Owner component: rerank
- Dependencies: PA-RET-001
- Expected proof: FIXTURE_PROVEN
- Reason: Reranker services/code exist; canonical post-hydration routing, feature schema, ablation, and identity preservation are not fully proven.
- Definition of done:
  - packet-deduplicated inputs
  - feature order/version recorded
  - packet_key preserved
  - latency and fallback recorded
  - ablation beats simpler baseline
- Validation:
  - `npm run reranker:health`
  - `npm run batch:g:validate`
- Prohibited scope:
  - Do not score raw Qdrant points as authoritative candidates

### P2 PA-ACE-001 — Exact source and ACE provenance

- Area: ACE
- Owner component: ace
- Dependencies: PA-RERANK-001
- Expected proof: FIXTURE_PROVEN
- Reason: Summary and ACE seams exist; exact current-source resolution and complete lane provenance remain unproven.
- Definition of done:
  - every evidence item resolves to exact current source
  - stale summaries rejected
  - contributing lanes recorded
  - workspace/source revisions recorded where owned
- Validation:
  - `npm run test -- src/lib/server/ace/ace-materializer.spec.ts`
- Prohibited scope:
  - Do not allow summary-only edit recommendations

### P2 PA-EDIT-001 — Agentic file-edit recommendation readiness

- Area: EDIT
- Owner component: edit
- Dependencies: PA-ACE-001, PA-AST-001
- Expected proof: FIXTURE_PROVEN
- Reason: Patch/error-fixing seams exist; exact target resolution, stale guards, and validation-plan completeness remain partial.
- Definition of done:
  - file path and exact span resolved
  - source hash/revision recorded
  - symbol reconciled when available
  - retrieval/graph evidence recorded
  - validation commands identified
  - ambiguous targets rejected
- Validation:
  - `npm run test -- --run patch-tournament`
- Prohibited scope:
  - No file mutation
  - No summary-only target selection

### P2 PA-DAG-001 — Guarded mutation DAG

- Area: DAG
- Owner component: dag
- Dependencies: PA-EDIT-001
- Expected proof: FIXTURE_PROVEN
- Reason: State-transition and artifact-lineage concepts exist; the complete validated mutation DAG is not proven.
- Definition of done:
  - read-only diagnosis state
  - validated plan state
  - dry-run state
  - stale revision gate
  - explicit approval boundary
  - post-mutation receipt
- Validation:
  - `npm run test -- --run state-transition`
- Prohibited scope:
  - No autonomous production mutation

### P2 PA-GPU-001 — cuVS exact oracle and CAGRA eligibility

- Area: GPU
- Owner component: gpu
- Dependencies: PA-EMB-001, PA-PROJ-001
- Expected proof: FIXTURE_PROVEN
- Reason: GPU exact-search and CAGRA references were found; same-matrix parity and CAGRA eligibility remain gated.
- Definition of done:
  - row-index manifest maps to packet_key
  - cuVS brute force matches PyTorch top-k
  - Qdrant HNSW recall measured on same matrix
  - VRAM fit documented
- Validation:
  - `npm run atlas:gpu:knn:health`
  - `npm run atlas:phase3:smoke`
- Prohibited scope:
  - Do not run CAGRA before exact oracle parity

### P3 PA-OPENWIKI-001 — OpenWiki generated documentation integration

- Area: KNOWLEDGE
- Owner component: knowledge
- Dependencies: PA-OKF-001
- Expected proof: FIXTURE_PROVEN
- Reason: OpenWiki must consume promoted or validated OKF and write only to generated documentation staging.
- Definition of done:
  - OpenWiki input path is explicit
  - generated output path is isolated
  - OKF version/profile validation runs after generation
  - canonical promotion requires review
- Validation:
  - `npx tsx scripts/atlas/validate-openwiki-okf.mts`
- Prohibited scope:
  - No direct writes to atlas_packets, graph tables, Qdrant, or Neo4j
  - No automatic canonical promotion

### P3 PA-OTEL-002 — Routing connector and lane isolation

- Area: OBSERVABILITY
- Owner component: observability
- Dependencies: PA-OTEL-001
- Expected proof: FIXTURE_PROVEN
- Reason: Routing-connector availability, default routing, Parent Atlas lanes, batching, redaction, and memory controls were checked.
- Definition of done:
  - routing connector used instead of routing processor
  - default route proven
  - graphify route proven
  - retrieval route proven
  - GPU route proven
  - agent route proven
  - projection route proven
  - no sensitive high-cardinality resource routing keys
- Validation:
  - `npx tsx scripts/atlas/prove-otel-routing-isolation.mts`
- Prohibited scope:
  - Do not claim complete fault isolation inside one Collector process
  - Do not route by packet_key, trace ID, span name, or query text

### P3 PA-DAG-LOG-001 — Debounced DAG orchestration logger

- Area: OBSERVABILITY
- Owner component: observability
- Dependencies: PA-DAG-001, PA-OTEL-001
- Expected proof: FIXTURE_PROVEN
- Reason: The orchestration logger is checked for keyed debounce, immediate critical-event delivery, bounded pending state, shutdown flush, and OpenTelemetry integration.
- Definition of done:
  - progress and heartbeat events coalesce by workflow/run/node/event key
  - errors, approvals, rejections, terminal transitions, rollback events, and receipts bypass debounce
  - canonical DAG state mutations are never debounced
  - pending keys are bounded and overflow is observable
  - flushAll runs on transition barriers and shutdown
  - OTel span start/end boundaries are not suppressed
  - debounced count and original time range are preserved
  - unit tests use fake timers and deterministic clocks
- Validation:
  - `npm run test -- --run src/lib/server/observability/dag-debounced-logger.spec.ts`
  - `npx tsx scripts/atlas/smoke-dag-logger-otel.mts`
- Prohibited scope:
  - Do not debounce Postgres state writes or mutation receipts
  - Do not debounce error/terminal/approval events
  - Do not use debounce as event deduplication or idempotency
  - Do not retain source content, prompts, packet_key, or symbol IDs as OTel resource attributes

### P3 PA-OPS-001 — Graphify freshness and stage isolation

- Area: OPERATIONS
- Owner component: operations
- Dependencies: none
- Expected proof: FIXTURE_PROVEN
- Reason: Graph artifact is stale or missing.
- Definition of done:
  - graph artifact below freshness threshold
  - code graph can refresh without optional SOM/topology stages
  - stage receipts emitted
- Validation:
  - `npm run graphify:daily`
- Prohibited scope:
  - No broad SOM retraining during graph-only repair

## READY

### P3 PA-OTEL-001 — OpenTelemetry SDK and Collector wiring

- Area: OBSERVABILITY
- Owner component: observability
- Dependencies: none
- Expected proof: FIXTURE_PROVEN
- Reason: Existing OTel SDK, OTLP endpoints, Collector configuration, and resource attributes were inventoried.
- Definition of done:
  - OTLP gRPC ingress on 4317 reachable
  - OTLP HTTP ingress on 4318 configured or explicitly disabled
  - service.name and Parent Atlas resource schema emitted
  - memory limiter and batch processors configured
  - sensitive attributes redacted before export
- Validation:
  - `npx tsx scripts/atlas/smoke-otel-parent-atlas.mts`
- Prohibited scope:
  - Do not put packet_key, query text, or source content in stable resource attributes
  - Do not treat OTel as canonical business-event storage

## IN_PROGRESS

- None

## VERIFY

### P0 PA-SCHEMA-001 — Live Postgres and application schema alignment

- Area: SCHEMA
- Owner component: schema
- Dependencies: PA-ID-001
- Expected proof: FIXTURE_PROVEN
- Reason: Live atlas_packets fields and indexes were inspected; application-schema parity still requires repository comparison.
- Definition of done:
  - complete live-vs-Drizzle diff
  - no unresolved type/nullability mismatch on active writer fields
  - active writer fields exposed in application schema
- Validation:
  - `npm run schema:ci:full`
- Prohibited scope:
  - No ALTER TABLE during audit
  - No generic representation_id invention

### P2 PA-OKF-001 — OKF knowledge bundle schema alignment

- Area: KNOWLEDGE
- Owner component: knowledge
- Dependencies: PA-SCHEMA-001, PA-ONT-001
- Expected proof: FIXTURE_PROVEN
- Reason: OKF staging is absent or contains frontmatter/schema gaps.
- Definition of done:
  - docs/.okf generated and canonical zones exist
  - every concept has type and title
  - Parent Atlas extension records gate/proof/workspace lineage
  - sources link to deterministic reports or canonical resources
  - generated documents are not treated as canonical facts
- Validation:
  - `npx tsx scripts/atlas/validate-okf-parent-atlas.mts`
- Prohibited scope:
  - Do not let OKF write directly to Postgres or Qdrant
  - Do not promote source-less generated claims

### P3 PA-NLP-001 — PyTorch GPU POS and token-classification sidecar

- Area: NLP
- Owner component: nlp
- Dependencies: PA-AST-001, PA-EMB-001
- Expected proof: FIXTURE_PROVEN
- Reason: The NLP sidecar is checked for PyTorch/CUDA and POS or token-classification capabilities.
- Definition of done:
  - health reports model ID and revision
  - CUDA/device status reported
  - POS/token classification response schema versioned
  - output offsets map to exact source text
  - fallback lane clearly labeled
- Validation:
  - `npm run nlp:sidecar:health`
  - `npx tsx scripts/atlas/prove-nlp-pos-sidecar.mts`
- Prohibited scope:
  - Do not replace tree-sitter structure with POS tags
  - Do not use NLP labels as canonical identity

### P3 PA-REP-001 — Representation and collection alignment

- Area: SEMANTIC
- Owner component: semantic
- Dependencies: PA-EMB-001, PA-PROJ-001
- Expected proof: FIXTURE_PROVEN
- Reason: Semantic collection dimensions and latent storage lanes are checked independently.
- Definition of done:
  - semantic_768 collection has a 768-dimensional vector contract
  - latent_64 rows are exactly 256 bytes when float32
  - latent_128 has an explicit schema before use
  - every representation has ID, dimension, and revision
  - readers consume only the intended representation lane
- Validation:
  - `npm run atlas:audit:embeddings -- --verbose`
  - `npm run atlas:som:audit`
- Prohibited scope:
  - Do not use latent_64 for packet ANN
  - Do not infer latent_128 storage from file names
  - Do not mix legacy 384 and canonical 768 collections

## DONE

### P0 PA-ID-001 — Canonical packet identity

- Area: IDENTITY
- Owner component: identity
- Dependencies: none
- Expected proof: PRODUCTION_DATA_PROVEN
- Reason: Canonical packet/source/workspace identity is complete in live Postgres.
- Definition of done:
  - packet_key coverage equals total qualified rows
  - source_ref coverage equals total qualified rows
  - workspace_id coverage equals total qualified rows
- Validation:
  - `npm run schema:inspect`
  - `npm run schema:drift:check`
- Prohibited scope:
  - Do not derive packet identity from qdrant_point_id
  - Do not derive workspace_id from unrelated metadata

### P3 PA-QDRANT-TRANSPORT-001 — Qdrant HTTP and gRPC transport health

- Area: QDRANT
- Owner component: qdrant
- Dependencies: PA-PROJ-001
- Expected proof: RUNTIME_SMOKE_PROVEN
- Reason: Qdrant REST health and gRPC TCP reachability were checked separately.
- Definition of done:
  - HTTP collections/health endpoint succeeds
  - gRPC port 6334 accepts connections
  - active client transport is documented
  - HTTP and gRPC target the same Qdrant instance
  - one bounded gRPC collection/read request is proven
- Validation:
  - `npx tsx scripts/atlas/smoke-qdrant-transports.mts`
- Prohibited scope:
  - Do not infer gRPC API correctness from TCP connectivity alone
  - Do not send production upserts during a transport smoke

## DEFERRED

### P3 PA-GRAPH-099 — Derived graph enhancements

- Area: GRAPH
- Owner component: graph
- Dependencies: PA-ID-001, PA-PROJ-001, PA-RET-001, PA-GRAPH-001
- Expected proof: FIXTURE_PROVEN
- Reason: Derived graph enhancements are premature while canonical identity and retrieval remain incomplete.
- Definition of done:
  - canonical graph snapshot proven
  - PageRank lineage proven
  - derived edge usefulness measured
- Validation:
  - Not yet defined
- Prohibited scope:
  - No SHARES_CLUSTER or HIGH_AUTHORITY edges before prerequisites

