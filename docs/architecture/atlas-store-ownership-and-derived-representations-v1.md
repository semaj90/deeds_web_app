# Atlas Store Ownership and Derived Representations V1

This map is navigation and design guidance. Existing contracts and runtime owners remain authoritative; it creates no store, schema, identity, or admission authority.

## Store and representation ownership

| Store or artifact | Owner and responsibility | Not authoritative for |
| --- | --- | --- |
| Source files and published `.okf` generations | Immutable input bytes and acquisition records; retain canonical URL/source reference, content digest, extractor revision, and publication generation. | Repository packet identity, implementation truth, ontology admission, or indexed-corpus admission. |
| PostgreSQL 18 | Canonical packet/chunk identity, source/workspace revisions, eligibility, evidence, feature rows, FTS, and `semantic_768` vectors. | Search ranking policy or GPU execution. |
| Qdrant | Rebuildable semantic retrieval projection; points resolve back through canonical packet identity. | Packet identity, source authority, CandidateOrdinal, or ontology facts. |
| Valkey/Redis (BitFrost) | Bounded, expiring, revision-qualified cache descriptors, hints, and residency metadata. | Source truth, evidence admission, model KV tensors, or cache-only citations. |
| Neo4j and NetworkX/cuGraph | Derived graph projections and traversal; NetworkX is the CPU reference where applicable, cuGraph an optional executor. | Canonical relation admission or identities created from graph topology. |
| Arrow IPC and read-only mmap artifacts | Immutable, checksummed materializations for bounded tensor/feature batches; descriptors bind identity, revisions, shape, dtype, and digest. | A new packet registry, mutable source, or durable process/GPU pointers. |
| cuVS, cuTile, CUDA SIMT, TensorRT-RTX, and PyTorch | Optional retrieval, graph, kernel, analysis, or inference executors over frozen inputs. | Canonical writes, admission, or proof from import/capability status alone. |
| Kafka or other event transport | Delivery of typed, replayable events when an owning producer/consumer is configured. | Packet identity, durable evidence, or a substitute for PostgreSQL readback. |

## Shape-safe data contracts

- A dictionary/map is a lookup projection: keys must be typed stable identities or revision-qualified cache keys, not labels, paths, row positions, or cluster numbers. Values carry the descriptor and lineage needed to re-resolve through the canonical owner.
- A relation is a typed n-ary tuple with a relation identity, predicate, participant identities and roles, exact evidence references, revisions, and an admission receipt. Its graph projection is a relation/fact node connected to role-bearing participant nodes; do not flatten it into an untyped linked list or infer edges from cosine similarity.
- A feature matrix is a derived numeric view. For an illustrative `4 x 6` matrix, persist the row-to-candidate ordinal map, named/versioned six-column feature map, dtype, normalization, input snapshot, and content digest together. The dimensions alone confer no semantics or admission.
- A `4 x 4` homogeneous transform is only a coordinate-frame/visualization transform when an actual spatial use case requires it. It cannot define packet identity, relation, or evidence. PCA/SVD, PageRank, manifold, SOM, and cluster coordinates remain derived from a frozen qualified input.
- Token-to-source mappings used for prefill must be request/model/template scoped and retain exact source offsets and manifest identity. Do not persist hidden thoughts, KV cache, or arbitrary activation/tensor state to Atlas stores.
- QLoRA and learned tensor heads are offline, versioned experiments trained from admitted, frozen examples. They may recommend routes or rankings, never admit claims or alter canonical feature labels. Compare against deterministic CPU baselines before GPU promotion.

## Documentation acquisition and summarization

The local `.okf` schema is a repository convention, not the external Google OKF specification. Prefer the existing bounded static HTTP fetcher for ordinary official HTML; its optional BeautifulSoup Python path is available only when `beautifulsoup4` imports in the selected interpreter. **Observed interpreter census (2026-10-11; import checks only, no installs):** Windows Python 3.13 at `C:\Python313\python.exe` imports PyTorch, NumPy, Pydantic, FastAPI, LangExtract, Tree-sitter, NetworkX, BeautifulSoup, Python simdjson, and LangChain; it does not import cuVS, cuGraph, or DeepAgents. Windows Python 3.14 has none of those checked packages. WSL `base` likewise has none; WSL `atlas-rapids-cu13` imports PyTorch, NumPy, Pydantic, FastAPI, LangExtract, Tree-sitter, NetworkX, cuVS, and cuGraph, but not BeautifulSoup, Python simdjson, LangChain, or DeepAgents. These are distinct environments; package availability in one is not availability in another. Firecrawl is a paid fallback and can incur usage charges; the crawler's `--no-firecrawl` option disables it for a run. Do not install a parser or model dependency just to fetch documentation. Tesseract OCR is installed on Windows; OCR is only needed when a required source is an image/scanned document rather than accessible text/PDF text. This does not establish that Windows.Media.Ocr is used by the app.

The Windows repo also contains a Rust `napi` v2 Node-API crate and built `.node` artifacts; the SvelteKit wrapper loads the separate `tensorrt_bridge.node` addon. Node-API is the native Node binding interface, not an HTTP API or GPU executor. The recorded bounded JSONL benchmark found the current cold native parser slower than V8 `JSON.parse`; retain V8 as the default and do not expand the N-API ingestion path without a representative end-to-end benchmark win. No Linux/WSL N-API addon compatibility or runtime load was established by this census.

Fetched page metadata and bounded excerpts are acquisition evidence, not model summaries or indexed/admitted facts. Summaries are separate derivative artifacts and require source links, content digests, model and prompt revisions, input ContextManifest identity, and output validation. Keep the source record's `llm_synthesis` unchanged when no synthesis ran.

## Current local documentation coverage

- tRPC: present in `docs/.okf/trpc/` and `docs/.okf/trpc-beautifulsoup-r2/`; receipt `docs/.okf/pipeline-receipt-okf-tooling-docs-trpc-bs-r3.json` reports 9 pages/96 chunks and `ACQUISITION_ONLY` (not database admission or semantic indexing).
- Official NetworkX, PyTorch/NumPy/Arrow, cuVS, and cuGraph sources are declared in `docs/.okf/dev/manifest.json`; fetched NetworkX, PyTorch/NumPy/Arrow, cuVS, and cuGraph pages are under `docs/.okf/dev/raw/<source-id>/`. This proves local documentation acquisition only, not that a package is installed, an executor is active, or the corpus is semantically indexed/admitted.
- TensorRT-RTX 1.6: local reference snapshot at `docs/.okf/tensorRTX7_26/`; it records a challenger/direction, not proof the runtime is installed or active.
- simdjson and cuVS/cuGraph sources already exist in the `.okf/dev` catalog/corpus. Official cuTile/CUDA Tile/SIMT pages were added through the exact-URL allowlist and the existing bounded crawler; the published generation/readback is acquisition-only, not semantic or database admission.
- Existing `AGENTS.md` files are indexed in the generated `docs/MASTER-TOC.md` by their actual directory scope. Do not create or overwrite instruction files or duplicate per-directory TOCs without a separate directory-index contract.

## OpenSpec indexing boundary

- `scripts/atlas/openspec-task-fts-index-v1.mjs` already parses proposals and task ledgers into a database-free in-memory lexical/BM25-style preview. The 2026-10-11 read-only preview found 101 changes, 96 proposals, 11,316 task rows, and 11,412 indexed text records; it wrote only `.tmp/atlas/openspec-task-fts-index-v1.json`.
- PostgreSQL/Drizzle already define OpenSpec task, revision, predicate, evidence-receipt, and evidence-chunk owners. Do not add a parallel generic key/value table. The preview's generated-column/GIN SQL is proposal text only; no migration or database index was applied or independently read back in this pass. PostgreSQL AIO/bitmap selection is planner behavior, not a separate Atlas index abstraction.
- A production search promotion still needs the owning migration/schema, packet/task revision identity, source digest and independent readback. Keep the preview and generated Master TOC as navigation/search aids, not canonical task admission.
