# Phase 10B–16 Roadmap: Parent Atlas, Streaming Indexing, and Ornith 1.5

**Status:** implementation roadmap, not a completion claim. Component availability, a successful fixture, or a running service does not prove end-to-end production wiring. The current owners and admission receipts remain authoritative.

## Goal

Build a revision-qualified source and evidence fabric for the workstation so that OpenCode and bounded agents can retrieve compact, grounded context and use **Ornith-1.5-9B through the existing llama-server at `http://127.0.0.1:8090`** for synthesis and tool-use proposals. PostgreSQL and admitted source bindings own identity and durable evidence. Models propose; deterministic owners validate and record what happened.

The active model must be resolved from the configured runtime (`/v1/models` or the existing model resolver), not inferred from a filename or compatibility symbol. A live read-only `/v1/models` check during this revision reported `ornith-1.5-9b`. Gemma4 names in old files may describe lineage, historical artifacts, or compatibility APIs; they are not the active synthesis authority unless runtime evidence says otherwise.

## Current ownership spine

```text
admitted workspace + source_ref + source_revision
                    │
                    ▼
       source-role and eligibility policy
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
 code: Tree-sitter/AST      data/docs: bounded,
 and AST-grep               schema-aware extraction
       └────────────┬────────────┘
                    ▼
 existing Graphify/source/chunk/packet owners
                    ▼
 PostgreSQL 18 canonical identity and evidence
                    ▼
 EmbeddingGemma semantic_768 canonical writer
                    ▼
 one logical semantic lane (SearchRuntime)
  pgvector exact/HNSW | Qdrant | cuVS/CAGRA | TurboVec
                    ▼
 identity normalization + CandidateOrdinalMap checksum
                    ▼
 bounded AST/graph/ontology/features and ranking
                    ▼
 canonical admitted resolver → AcePacketV3
                    ▼
 ContextManifest / PromptPlan → optional BitFrost residency
                    ▼
 llama-server :8090 → Ornith-1.5 synthesis
                    ▼
 validated tool proposal/action → execution receipt
```

PostgreSQL remains the canonical owner for admitted identity, revisions, source/chunk/packet bindings, and durable evidence. Qdrant, TurboVec, cuVS/CAGRA, Neo4j/cuGraph, and Valkey/BitFrost are projections or executors. They do not create identity or extra semantic retrieval votes.

## Runtime and streaming facts

- **Synthesis:** llama-server `:8090`, OpenAI-compatible `/v1/chat/completions`; resolve the loaded ID using `/v1/models`/the existing resolver. Streaming generation is transport behavior, not evidence admission.
- **Classification/NLP:** the FastAPI sidecar is `:8095`, through `/analyze` with `passes: ["classify"]`; callers must pass exact source identity/revision. Results are proposals, not canonical labels.
- **Embedding:** Go EmbeddingGemma service is `:8097`; `semantic_768` is the canonical representation contract. Executor availability is not proof of canonical write lineage.
- **Latent:** `:8121` and the historical `.pt` checkpoint are a separate, non-promoted lane. Do not load the retired 768→384→256 artifact as the current candidate. Current candidate definition is 768→512→256→128; `latent_64` is a normalized prefix of `latent_128`; `topology_4d` is separate.
- **JSONL helper:** `scripts/atlas/lib/stream-jsonl-batches-v1.mjs` provides bounded parsing/transport (default 1 MiB line and 256 records per batch; hard limits 4 MiB and 2,000 records). It does not classify, chunk semantically, extract AST, embed, or write stores.
- **Daily Graphify directory stream:** `scripts/atlas/daily-graphify-directory-stream.mjs` currently emits a planned JSONL stage plan. Planned AST/chunk/embed stages are not proof that those stages ran. Confirm each stage has an existing owner, frozen inputs, execution receipt, and readback before calling it indexed.
- **The cap is not the ingestion architecture.** Streaming limits memory and bounds work; SourceRole/observation policy controls semantic cardinality. JSON arrays must not become millions of pseudo-symbols. Route source code to structural parsers, JSONL to record streams, known structured documents to schema-aware extraction, and generated artifacts to metadata-only or exclusion as policy requires.
- **Chunking is not established merely by streaming.** Prove the existing canonical chunk producer, stable chunk identity, source/workspace revision binding, lineage readback, and downstream embedding eligibility. Do not introduce a parallel chunk authority.

## Retrieval and context rules

There is one logical `semantic_768` lane. PostgreSQL exact search is the correctness oracle; pgvector HNSW, Qdrant, cuVS/CAGRA, and TurboVec are selectable executors/projections. Normalize and deduplicate candidates against canonical identity before feature joins, ranking, or top-K. Candidate ordinal is meaningful only with its sealed map checksum.

Qdrant stores a rebuildable semantic projection; its point ID is not packet/source identity. TurboVec is not search-ready solely because a process owns a port: require a non-empty index, declared transport/health, identity mapping, filter parity, and exact-oracle comparison. The older `8791/8792/8793` port map is stale. Engram is stdio-driven; optional services must not become mandatory folder-open TCP checks. Resolve transport through the current registry/audit.

The admitted context path is:

```text
retrieval candidates
 → canonical admitted resolver
 → exact packet/source/workspace revisions and evidence spans
 → AcePacketV3 builder + validator
 → ContextManifest / PromptPlan
 → bounded Ornith request
```

Do not pass raw retrieval hits to the model. Do not resurrect the legacy cartridge/ranked-card/subgraph JSON as a competing ACE contract. BitFrost/Valkey is derived residency, only after context identity/checksum is established; never persist hidden thoughts, tensors, or model KV state there.

## Work phases and exit evidence

### Phase 10B — Semantic retrieval and executor convergence

- [ ] Identify the canonical `semantic_768` writer and all callers/mirrors/legacy writers; keep broad writes fail-closed until one qualified owner is proven.
- [ ] Bind each admitted input to source/workspace revision, input digest, immutable EmbeddingGemma model/tokenizer/runtime identity, representation revision, vector digest, and independent PostgreSQL readback.
- [ ] Establish one `DenseExecutor` contract and exact-search oracle; compare pgvector/Qdrant/TurboVec without multiplying semantic votes.
- [ ] For TurboVec, resolve actual transport, usable health, non-empty indexed corpus, canonical external-ID mapping, filter parity, and bounded recall/latency receipt.
- [ ] Keep Qdrant as a rebuildable projection and prove same-cohort payload/readback before promotion.

**Exit:** a frozen cohort and receipt bind canonical inputs to vector outputs and executor readbacks; unavailable challengers fail over within the same logical lane.

### Phase 11 — cuVS/CAGRA benchmark

- [ ] Use the exact frozen `semantic_768` cohort and canonical identity mapping.
- [ ] Compare approximate results to bounded exact CPU/pgvector oracle; report recall, filters, latency, and resource use.
- [ ] Keep WSL2/RAPIDS executor capability separate from Windows serving; runtime installation/ABI must be checked before claiming live GPU parity.

**Exit:** replayable benchmark receipt; no canonical writes or additional retrieval vote.

### Phase 12 — Derived routing and topology

- [ ] Revision-qualify KMeans/SOM/RFF/latent/topology inputs, algorithms, outputs, and ordinal-map checksum.
- [ ] Keep clusters, coordinates, PageRank, and learned recommendations as features only—not identity, ontology truth, or independent retrieval votes.
- [ ] Require CPU/reference parity before GPU promotion and held-out evaluation before any learned policy promotion.

**Exit:** derived snapshot checksums align to the same admitted cohort and remain safely discardable/rebuildable.

### Phase 13 — Structural graph, chunking, and feature synthesis

- [ ] Compare the daily stream planner with the workstation's actual source inventory, Graphify extractor, canonical chunk owner, and PostgreSQL packet/chunk lineage. Record which stages execute versus merely emit plans.
- [ ] Define source-role routing for code, documentation, structured JSON, JSONL/NDJSON, generated artifacts, and unsupported/oversized sources; keep stream limits separate from semantic eligibility.
- [ ] Prove bounded chunk streaming through the existing chunk owner: frozen manifest, exact revision recheck, deterministic chunk IDs/spans, resumable batches, terminal outcomes, and independent lineage readback.
- [ ] Use existing `AstMiniRecordV1`/AST observation owners and revision-qualified evidence; add only missing bounded helpers (DAG relation builder, named label features, deterministic label proposals) where no owner exists.
- [ ] Keep POS/NLP/LangExtract and `:8095` classification as grounded enrichment; propagate `sourceRef`, `sourceRevision`, and workspace revision where available.
- [ ] Treat NetworkX as a small/reference oracle; Neo4j/cuGraph as derived graph executors. Seal edge/hyperedge inputs and ordinal mapping before graph algorithms.
- [ ] Stream large intermediate records as bounded JSONL/NDJSON; use Arrow/Parquet or mmap for dense matrices, not JSON vectors.

**Exit:** every frozen input has a typed terminal outcome and each emitted fact/chunk has source revision, producer revision, and readback evidence. A plan file alone does not pass this phase.

### Phase 14 — Workflow and observability

- [ ] Carry request, workspace, source, context, model, and policy revisions through bounded workflow actions.
- [ ] Record tool, retrieval, cache, synthesis, validation, and execution receipts; telemetry is diagnostic and never substitutes for correctness evidence.
- [ ] Add watchdog limits for repeated failures, stalled progress, unauthorized effects, and resource budgets.

**Exit:** an execution can be replayed/audited from receipts without storing hidden reasoning or runtime KV/tensors.

### Phase 15 — Taxonomy, labeling, and ontology alignment

- [ ] Reuse the existing domain vocabulary and classification schema; do not create a parallel domain enum/registry.
- [ ] Keep deterministic path/AST/schema rules as the baseline, existing sklearn sidecar as a revision-qualified challenger, and future PyTorch heads as shadow candidates.
- [ ] Emit label proposals with taxonomy/model/provider revisions and evidence refs; resolve/promote only through existing ontology ownership and review gates.
- [ ] Use `.okf` as validated vocabulary/rule input: schema validation, semantic validation, canonical serialization, and checksum before use.

**Exit:** classification coverage/evaluation is measured on frozen, reviewed labels; classifiers cannot set canonical identity or ontology truth.

### Phase 16 — OaK, MCP, and governed agent execution

- [ ] Resolve capabilities from the existing OaK registry; DSPy may compose registered capabilities, and GEPA may optimize instructions/tool descriptions offline or in shadow replay only.
- [ ] Validate a bounded acyclic DAG against typed schemas, dependencies, policies, and effects before execution.
- [ ] Route evidence through the canonical resolver → AcePacketV3 → ContextManifest before Ornith synthesis; verify an actual production caller and grounded readback, not merely adapter tests.
- [ ] Keep MCP as typed transport and execution receipts as records of what happened. No model output directly mutates canonical stores.
- [ ] After ACE grounding and identity checks pass, perform only an explicitly authorized, reversible BitFrost canary with SET/GET and byte/checksum readback.

**Exit:** replayable query-to-context and tool execution receipts; unauthorized writes are zero; cache remains derived and disposable.

## Current gaps to reconcile before declaring phases complete

The latest saved canonical projection audit reviewed for this roadmap is **5/11 PASS** (2026-10-01). A subsequent live refresh attempt failed before producing a new audit because the PostgreSQL protocol connection terminated; do not call that a refreshed result. The saved report's remaining predicates are:

- `SYMBOLS_RESOLVED`: incomplete exact-revision extraction/readback.
- `SEMANTIC_OWNER_PROVEN`: unique writer and per-row source/model/tokenizer/input/representation lineage plus independent readback.
- `LATENT_FAMILY_PROVEN`: canonical semantic input cohort lineage and separate evaluation/promotion decision; candidate status is not promotion.
- `PROJECTIONS_CHECKSUM_ALIGNED`: no receipt yet binds the same admitted cohort, ordinal map, representation inputs, and projection readbacks.
- `ACE_EVIDENCE_GROUNDED`: live retrieval-to-admitted-resolver-to-AcePacketV3-to-ContextManifest grounding/readback is not proven.
- `BITFROST_KEYS_DERIVABLE`: admitted key producer and identity/checksum-bound cache readback not proven; wait until ACE grounding.

`ORDINAL_MAP_SEALED` is now reported PASS for packet grain (16,151/16,151); do not repeat the stale physical-chunk gap as an ordinal-map failure. Physical chunk crosswalk/materialization remains a separate owner question. Do not use broad reindexing, infer revisions, train the autoencoder from unproven inputs, warm BitFrost early, or add a replacement schema merely to turn a predicate green.

## Recommended next steps

1. Restore/verify PostgreSQL protocol access and run the read-only canonical projection audit; save a timestamped report. Do not restart Docker/database services without an explicit operational diagnosis.
2. Reconcile the frozen admitted source set with the existing Graphify inventory and canonical chunk owner. Separate transport/plan output from actual chunk execution; produce a read-only, revision-guarded manifest and reason-coded outcomes first.
3. Close exact-revision symbol extraction/readback only for authorized, eligible rows; preserve drift, identity conflicts, resource deferrals, and parse failures as distinct terminal outcomes.
4. Complete static census of every 768-D writer, then converge through one qualified writer and bounded independent readback before AE training or broad embedding work.
5. Freeze the semantic training-input manifest; evaluate the current 768→512→256→128 candidate separately from promotion. Keep `latent_64` derived from `latent_128` and 4-D topology separate.
6. Produce cross-projection alignment evidence from existing owners for the same cohort/checksum; do not add a second registry/table without proving no existing receipt owner fits.
7. Wire the live SearchRuntime route to the admitted resolver and existing AcePacketV3/ContextManifest bridge; run a no-write bounded query and independent identity/span/checksum readback.
8. Only after ACE grounding passes, prove deterministic BitFrost key derivation and run an authorized reversible cache canary.

## External runtime references

- [Ornith-1.5-9B model card](https://huggingface.co/ornith-ai/Ornith-1.5-9B)
- [Ornith 1.5 official announcement](https://ornith.ai/ornith_1_5.html)
- [llama.cpp server API and streaming](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [EmbeddingGemma model card and Matryoshka dimensions](https://ai.google.dev/gemma/docs/embeddinggemma/model_card)
- [pgvector exact and approximate search](https://github.com/pgvector/pgvector)

These references describe component capabilities; Parent Atlas admission still requires local owner, revision, checksum, and readback evidence.
