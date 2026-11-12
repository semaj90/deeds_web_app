# Agentic Prefill Capacity and Ownership Audit

Status: source and capacity audit; no service, database, cache, GPU workload, or model was changed. `canonicalAuthority: false`.

## Current host observation

Read-only Windows inventory on 2026-11-08: Intel i7-11700F, 8 physical cores / 16 logical processors; 32,650 MiB RAM total, 4,752 MiB free; RTX 3060 Ti, 8,192 MiB VRAM total, 7,080 MiB used, 945 MiB free. The observed GPU headroom is insufficient evidence for an adapter-training or second-model workload. Do not start GPU experiments while the resident `:8090` service is using the card; service/GPU lifecycle remains operator-controlled.

## Capacity math (raw payload only)

- 64,000,000 bits = 8,000,000 bytes (about 7.63 MiB); 64 Mib = 8 MiB. A 64-bit radix key is one key, not a 64-byte record and not a 64-million-bit slot map.
- 1 GiB holds at most 16,777,216 raw 64-byte records, or 67,108,864 occupancy bits. This excludes indices, allocator overhead, labels, strings, RPC framing, and resident cache data.
- One 768-dimensional centroid is 3,072 bytes as FP32, 1,536 bytes as FP16, or 768 bytes as int8. A 4,096-centroid raw codebook is therefore 12 MiB / 6 MiB / 3 MiB respectively. Those are storage ceilings, not a recommendation to train 4,096 semantic groups.
- The current Valkey helper serializes centroid float arrays as JSON. Actual cache consumption is higher than packed-vector arithmetic; estimate it from `MEMORY USAGE` on representative keys and the configured `maxmemory`, key count, replication, and eviction policy before setting a production cardinality.
- The current GPU observation leaves 945 MiB free. That is not a 1-GiB experiment budget: allocate headroom for model activity, CUDA context, temporary buffers and transfers. Do not run an embedding model, QLoRA, or a second synthesis model in this state.

## Existing owners and contract boundaries

| Need | Existing owner / evidence | Missing proof or decision |
|---|---|---|
| `.okf` vocabulary and crawled sources | `python/atlas_okf_docs_pipeline.py`; `python/atlas_doc_manifest.py`; bounded Firecrawl capture at `sveltekit-frontend/src/lib/server/atlas/docs/firecrawl-v2-capture.ts`; root read-only audit `scripts/atlas/audit-doc-03-firecrawl-bounded-owner-v1.mjs` | A current live crawl receipt and source rights/revision admission for each source. The WFU-05 ledger says the root `.okf` manifest/schema and relation vocabulary are incomplete; validate the actual current bundle before proposing labels. |
| `feature_label` candidates | Existing topic/domain/feature ontology, classification and `FeaturePacketV1` owners; `scripts/atlas/prove-dag-prefill-bitfrost-ace-synthesis-v1.mjs` consumes verified `.okf` chunks as noncanonical grounding | A reviewed vocabulary mapping and exact source span/revision binding. LLM/keyword labels remain proposals; never use a label as task identity or executable authority. |
| 64-bit / byte synthesis | `simd-bridge/cpp/atlas_byte_synth_core.{h,cpp}` provides fixed-record and LSB0 occupancy-bitset routines; JSON parser bindings exist in `simd-bridge/cpp/binding.cc` | Current evidence does not show an end-to-end gRPC caller carrying the synthesized records into the prefill executor. A 64-byte RPC descriptor is not proof of physical alignment or zero-copy transport. |
| SIMD JSON | Existing `simdJson*` Node-API exports in `binding.cc` and `simdjson_bridge.cc` | Verify runtime CPU dispatch and exact parity for AVX2/AVX-512 separately. AVX2 is 256-bit and AVX-512 is 512-bit; they are different CPU paths. `gpjson` was not established as an active owner in this audit. |
| Centroids | Canonical embedding contract is PostgreSQL `content_embedding_768` / `semantic_768`; Valkey cache helper `scripts/atlas/lib/valkey-centroid-cache-v1.mjs`; durable artifact contract `sveltekit-frontend/src/lib/server/atlas/cache/centroid-artifact-v1.ts` | Corpus/model/representation lineage and one reconciled centroid owner. Prior live reports mention 64 coarse centroids, while the latest supplied scratch readiness report says 0 canonical vectors and 0 centroids in scratch. These are different DB targets and must not be combined. |
| Postgres/AIO/bitmap | PostgreSQL owns task/source/vector identity and revisions; bitmap scans and AIO are planner/executor behavior | No special “AIO bitmap table” is needed. WFU-07 only has a rolled-back fixture BitmapAnd plan; live corpus plan and AIO performance remain unproven. |
| DAG / KAG / ACE prefill | Existing Kanban task/dependency owners, KAG readers, ACE context manifest and `scripts/atlas/prove-dag-prefill-bitfrost-ace-synthesis-v1.mjs` | Cohort identity, dependency parity, source-qualified prefill, reviewed verification commands, durable authorized claim, independent receipt and fresh readback. KAG retrieval can supply evidence, not task authority or completion. |
| FSM/cache swaps and QLoRA | `sveltekit-frontend/src/lib/server/atlas/adapters/qlora-fsm-swap-adapter-v1.ts` is a fail-closed descriptor/planner; Valkey is a cache | No runtime model loading, adapter training/promotion, authenticated remote Colab worker, or validated local/remote spillover is proven. Swap revisioned descriptors/artifacts only; never persist model KV cache or hidden reasoning. |

## Proposed bounded pipeline

1. Capture an explicitly allowed source with page/depth limits; retain URL, retrieval time, content digest, rights/terms record, parser revision and source revision.
2. Parse `.okf` vocabulary and source spans. Emit candidate `feature_label` records containing label namespace, proposed label, `sourceRef`, source revision, exact UTF-8 span, extractor revision and evidence checksum. Keep `canonicalAuthority: false` pending vocabulary validation and review.
3. Resolve those candidates against canonical topic/domain/feature owners and exact source bindings. Only admitted canonical 768-D vectors may enter a semantic centroid build; do not derive centroids from generated labels alone.
4. Keep binary synthesis bounded and versioned: explicit endian, bit order, row size, revision/hash references, count, and schema. Use Protobuf/gRPC for transport and keep vectors/bulk bytes out of JSON ACE packets. ACE packets carry bounded references and evidence, not raw crawl corpora.
5. Use PostgreSQL for canonical identity, dependencies, claims, attempts, and receipts; use KAG/HyperGraphRAG for grounded evidence retrieval; use Valkey only for revision-keyed rebuildable cache entries.
6. Build DAG prefill only after task ID crosswalk and dependency targets reconcile. Keep routing/ranking advisory until the existing Kanban claim owner and independent completion evidence are proven.
7. Benchmark CPU first on this 8-core / 16-thread host. A conservative starting concurrency for CPU-heavy parsing/ranking is 4 workers, with bounded I/O concurrency separately. Record throughput and p95 before raising it. Do not equate 16 logical processors with 16 independent high-throughput workers.

## Open gates

- Reconcile the actual root `.okf` manifest, domain schemas and relation predicates; produce a reviewed label mapping with provenance.
- Freshly qualify gRPC transport, binary parity, SIMD dispatch, and byte/bit ordering; no AVX-512 or `gpjson` speed claim is admitted here.
- Resolve the 241 OpenSpec/Kanban identity differences and current dependency/source revisions before prefill or execution.
- Obtain an authorized scratch canary using the canonical claim and completion owners; current dry-run/prefill receipts do not prove execution.
- Measure Valkey memory per centroid and total available cache budget; report safe cardinality only after accounting for actual JSON storage, cache policy and other residents.
- Benchmark retrieval and ranking on CPU before a separately authorized GPU/Colab run. Cloud proxy security, remote model identity, source-hash echo, fallback, and cost caps all need live tests before use.
- QLoRA needs a rights-reviewed dataset, pinned base/adapter revisions, held-out evaluation, rollback artifact and explicit promotion receipt.

No PostgreSQL, Valkey, Qdrant, SeaweedFS, model, or GPU workload was changed by this audit.
