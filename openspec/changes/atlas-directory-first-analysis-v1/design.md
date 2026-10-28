## Context

The repository already has owners for incremental source inventory, canonical directory ingestion, directory feature matrices, AST/symbol extraction, Graphify relationships, canonical embeddings, SearchRuntime/ACE, GPU execution, and WAL/outbox delivery. This change is an orchestration contract for using those owners to reduce work on a very large repository; it must not create a competing identity or persistence path.

The target flow is directory inventory and summaries → source-bound CST/AST and compiler/LSP symbols → qualified relationship/features → explainable lexical/graph priority → optional selective embeddings → optional frozen-input GPU clustering/retrieval → existing ACE prefill. JSON decomposition is transport/metadata handling only. Kafka, GPJSON, DuckDB, Arrow/mmap, and browser storage are candidate adapters or derived-analysis tools, not authority owners.

## Goals / Non-Goals

**Goals:**
- Define bounded, deterministic, incremental directory analysis and an auditable priority report.
- Preserve byte-accurate source spans and qualified source/workspace revisions when joining Tree-sitter and LSP observations.
- Reuse canonical packet/chunk, embedding, graph, outbox, cache, and ACE owners.
- Make GPU work conditional on frozen inputs, live resource admission, and CPU-oracle parity.
- Keep derived registries and tensor artifacts replayable through immutable manifests and checksums.

**Non-Goals:**
- Embedding every file, training/swapping a model, or promoting experimental EmbeddingGemma/EmbeddingGemma 2 outputs.
- Introducing a new Kafka WAL, packet identity, event log, graph, index, ranking/fusion, or ContextManifest owner.
- Running Graphify, GPU jobs, Kafka consumers, database/cache/projection writes, or browser persistence as part of this change.
- Claiming that a directory rank, KMeans cluster, Pagerank score, or cache hit is canonical evidence.

## Decisions

1. **Compose existing owners rather than duplicate them.** The implementation ticket must map each stage to the current canonical-directory-ingestion, GPU-substrate, retrieval, ACE, and WAL/outbox owners before code changes. New `packages/parent-atlas` helpers may provide pure adapters and validated contracts only; durable identity/event ownership stays with existing PostgreSQL and outbox owners.

2. **Inventory and extraction are source-first.** Use the current revision-aware inventory and continuation/invalidation owners. Process bounded CPU batches (initial proposed cap: 512 files); persist no completion claim for a failed, quarantined, or unverified file. Tree-sitter supplies syntax spans; the compiler/LSP owns semantic symbol resolution. Convert LSP UTF-16 positions to UTF-8 byte offsets against the exact verified source bytes, with CRLF, astral Unicode, and malformed-span tests.

3. **Directory ranking is deterministic and advisory.** Reuse the existing directory feature matrix. Any proposed feature weights (centrality, diagnostics, retrieval relevance, uncertainty/change, test/coverage risk) are versioned policy inputs, not hard-coded truth. Emit component scores, input digests, exclusions, and explanation; do not add a retrieval vote or canonical identifier.

4. **Embedding is selective and downstream.** Only canonical-eligible, revision-bound source/chunks can be sent to the existing EmbeddingGemma producer. EmbeddingGemma and EmbeddingGemma 2 remain separate representation families until independent model/tokenizer/recipe/pooling/normalization/dimension and corpus receipts prove compatibility. A proposed 5% eligibility ceiling is a review budget, not permission to embed or persist.

5. **GPU execution is an optional projection.** cuVS/cuML/cuGraph consume a frozen, checksummed feature/candidate snapshot and must match a CPU oracle on the same stable identities before results are considered. An initial 1.5 GiB GPU budget is only a proposed cap: admission also checks live free memory, active llama-server/other GPU slots, and operator-approved graceful handoff. Never terminate the model service. KMeans/SOM assignments are features, not IDs or retrieval votes.

6. **Cache tiers store references, not hidden state.** CPU/RAM/GPU residency entries are bounded leases/descriptors keyed by source, workspace, representation, feature, model, and artifact revisions. NVMe/Arrow/mmap hold checksummed immutable artifacts, not raw reasoning or KV cache. Browser IndexedDB is optional UI-local advisory cache only. Eviction must respect live leases and support deterministic cold reload; cache warming never changes canonical state.

7. **Treat event and JSON transports as replaceable adapters.** Kafka may later consume the existing WAL/outbox with idempotent event IDs, bounded replay, offsets/checkpoints, and independent readback; it must not become a second event authority. Evaluate SIMDJSON/GPJSON only against representative uploads and schemas; parsing must preserve `source_ref`, repository-relative path, language, workspace/source revisions, and raw-byte provenance. GPU JSON decomposition is not assumed beneficial and requires measured CPU/GPU parity and transfer-cost evidence.

8. **Derived synthesis remains offline and read-only.** DuckDB may synthesize checksummed snapshots from admitted artifacts. Arrow IPC/mmap may transport bulk tiles through the existing native contract. Neither transport nor synthesis authorizes persistence. The final user-facing path must reuse SearchRuntime and the existing ACE ContextManifest/PromptPlan owners.

## Risks / Trade-offs

- **Risk:** This ticket overlaps multiple active OpenSpec changes. → **Mitigation:** Begin with an owner map and dependency table; tasks are blocked until ownership is reconciled, and do not edit those owners' checkboxes here.
- **Risk:** A directory score is mistaken for semantic relevance or canonical rank. → **Mitigation:** Label as advisory, expose components and receipts, and prohibit extra lane votes.
- **Risk:** LSP UTF-16 offsets drift from UTF-8 parser spans. → **Mitigation:** Convert using the exact source snapshot and test Unicode/CRLF boundaries independently.
- **Risk:** GPU contention disrupts the active synthesis service or causes unbounded residency. → **Mitigation:** Require live slot/free-memory admission, strict budget, lease-aware eviction, and graceful operator handoff.
- **Risk:** Kafka delivery duplicates or reorders WAL events. → **Mitigation:** Reuse the existing outbox identity, idempotency key, ordered partition key where required, and replay/readback contract.
- **Risk:** GPJSON/GPU parsing costs exceed CPU SIMDJSON. → **Mitigation:** Benchmark end-to-end parse plus transfer and validation, retain CPU parser fallback, and add no dependency until it wins on representative data.

## Migration Plan

Planning only. First inventory owner contracts and existing receipts, then implement pure planner/adapters and fixtures, then prove source-span and incremental replay. Add read-only runtime traces next. Any database, Kafka, cache, Qdrant, Neo4j, model, or GPU execution requires a separate explicit gate and owner-specific approval. Rollback consists of disabling the advisory planner/adapter; canonical data remains unchanged.

## Open Questions

- Which existing WAL/outbox OpenSpec change is the exact owner to link for future Kafka delivery?
- Which current directory-summary artifact and cache owner should supply the summary inputs and replay key?
- Does the deployed 8095 sidecar expose both Tree-sitter spans and compatible LSP symbol evidence for the same source revision?
- What representative JSON upload corpus and acceptance metrics should decide SIMDJSON versus GPJSON versus GPU parsing?
- What current runtime API reports GPU slots and safe headroom without interrupting the active llama-server?
- Which existing execution/telemetry receipt should own batch progress, retries, quarantine, and restart recovery?
