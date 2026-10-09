# Agentic Error-Fixing Corpus Index Audit v1

Status: `PARTIAL_DIAGNOSTIC`  
Mode: read-only audit plus local non-authoritative JSONL export  
Canonical datastore writes: 0  
Embedding performed: no  
Projection writes: no

## Corpus observed

- `docs/.okf/langextract/manifest.json` lists 7 acquired documents at `langextract:1.6.0`; the namespace contains raw Markdown and document metadata, not a `chunks.jsonl` corpus.
- `docs/.okf/dev/tooling-docs.admission-envelopes-v1.json` contains 57 page envelopes and 717 chunks across oaklib, ast-grep, ts-morph, and tRPC.
- `scripts/atlas/export-external-doc-chunks-jsonl-v1.mjs` now emits a deterministic local diagnostic projection at `docs/.okf/dev/tooling-docs.chunks.jsonl`. Receipt: 717 rows, 4 sources, SHA-256 `2e2ce2f9cbb576f69ed437123e35c4f5d69716c64409c086bb2180946e979b71`.
- The JSONL is gitignored by the existing `*.jsonl` rule. Every row says `canonicalAuthority=false`; its span check proves byte-length consistency, not exact source-slice alignment. Do not treat it as a canonical corpus or source-span proof.

## Owner map

| Capability | Existing owner/evidence | State and boundary |
|---|---|---|
| Acquire/normalize/chunk docs | `python/atlas_okf_docs_pipeline.py`; `--acquire-only` | Owner exists. It writes local artifacts/receipt. It is not a no-write command and must not be run without reviewing source fetch scope. |
| Tooling doc admission | `sveltekit-frontend/scripts/atlas/run-external-doc-admission-v1.mts` and validated envelopes | Existing admission path, but the four-source corpus has not been admitted by this audit. No authorization phrase used. |
| Canonical docs read/search | `sveltekit-frontend/src/lib/server/atlas/docs/doc-intelligence-read-model.ts`; PostgreSQL `atlas_external_doc_pages/chunks` | Owner exists. Live row counts/current corpus admission were not queried here. |
| Lexical/trigram | `sveltekit-frontend/src/lib/server/retrieval/bm25-search.ts`, `cognitive-router.ts`, PostgreSQL `pg_trgm` scripts | Lexical owners and extension/index patterns exist. No proof that the acquired 717 rows are in the searchable canonical corpus. Trigram does not depend on embeddings. |
| Canonical semantic | PostgreSQL `codebase_chunk_index.content_embedding_768` / `semantic_768`; docs have a separate canonical page/chunk owner | Contract exists. This audit did not establish eligible doc rows, model/recipe parity, or vector coverage for the local JSONL. |
| Ollama EmbeddingGemma | `services/go-index-worker/internal/embedder/ollama.go`; default model in `services/go-index-worker/cmd/server/main.go` | Calls `/api/embed`, batches 8 texts inside a job. The NATS subscriber starts one goroutine per job; no bounded global concurrency was found in the inspected handler. This worker also writes Redis progress and Qdrant points, so it is not a read-only CPU embedding path. |
| Existing docs embedding pipeline | `python/atlas_okf_docs_pipeline.py` | Uses the manifest-configured embedding URL (tooling manifest points to `:8081`) and can optionally write Qdrant. It does not prove Ollama fallback or canonical pgvector parity. |
| AST/CST/POS and symbols | 8095 sidecar; tRPC `astSidecar.chunk`; existing Graphify structural adapters | Component owners exist. Their output remains diagnostic unless source/workspace/graph revisions and canonical endpoint identity are proven. |
| SIMD JSON | `packages/parent-atlas-retrieval/src/gpu/simdjson-bridge.ts` | Parsing bridge exists; it is not a corpus chunker, alignment authority, or identity owner. |
| cuVS/cuGraph/cuTile/SIMT | RAPIDS/Graphify/GPU probe and executor surfaces, including `python/atlas_cuda_cutile_simt_probe_v1.py` | Challenger/experiment only. No common live corpus snapshot, ordinal checksum, CPU parity, or resource receipt was established for this audit. |
| Error-fix parameter synthesis | Existing agentic error-map/retrieval/context/validation surfaces | No single proven chain from these acquired chunks through canonical retrieval to validated `KernelDagCandidate`/parameter proposal was established. Retrieved text must remain evidence, not executable instructions. |

## What is wired versus missing

Wired locally: envelope JSON → deterministic JSONL projection → strict ID/checksum/span-length checks → diagnostic receipt. Focused exporter tests pass 3/3.

Still missing before indexing this corpus canonically:

1. Exact chunk-to-source slice verification against the exact normalized source bytes; length parity alone is insufficient.
2. The existing DOC-26/canonical admission step for any new corpus rows, with operator authorization and independent readback.
3. A distinct FTS/trigram baseline over admitted document chunks. Do not mistake code/packet pg_trgm indexes for document-corpus coverage.
4. A bounded, read-only EmbeddingGemma CPU invocation with concurrency limits and complete model/recipe/checksum receipt. Ollama fallback is diagnostic until representation parity is proven.
5. Canonical `semantic_768` write/readback only after its admission/representation gates; Qdrant remains a downstream projection.
6. Same-candidate identity and evidence propagation through SearchRuntime → ContextManifest → error-fix proposal → independent validator.
7. GPU challenger parity only after the same immutable corpus/vector snapshot and ordinal map are frozen.

## Ordered gates

`CORPUS-JSONL-ALIGN-01` exact source-byte slice verification → `DOC-26` authorized admission/readback → `DOC-LEXICAL-BASELINE-01` FTS/trigram evaluation → `EMB-CPU-DRY-01` bounded Ollama/EmbeddingGemma diagnostic → `SEMANTIC-DOC-ADMISSION-01` representation-qualified pgvector write/readback → `CTX-ERROR-FIX-E2E-01` canonical candidate through ContextManifest and validator → optional `GPU-SEMANTIC-PARITY-01` cuVS/cuGraph challenger.

No embedding was run, no database/cache/projection was written, no Graphify refresh was run, and no task checkbox was changed.
