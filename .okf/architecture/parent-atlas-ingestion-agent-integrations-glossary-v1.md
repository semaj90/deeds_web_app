---
type: architecture
title: Parent Atlas Ingestion & Agent Integrations Glossary
id: architecture/parent-atlas-ingestion-agent-integrations-glossary-v1
status: active
owners:
  - legal-ai-team
source_refs:
  - docs/MASTER-TOC-v2.md
  - AGENTS.md
  - .okf/pipelines/web-sources.md
  - .okf/systems/parent-atlas-compute-ownership.md
  - docs/.okf/research/deltanet-swiglu/manifest.json
  - docs/.okf/research/deltanet-swiglu/published-current.json
  - sveltekit-frontend/src/lib/server/retrieval/retrieve-candidates.ts
related:
  - system/hyperrag
  - pipeline/web-sources
  - pipeline/retrieval-ranking-synthesis
---

# Parent Atlas Ingestion, Lexical, Vector & Agentic Glossary (v1)

## 1. Core Terminology & Boundary Contracts

### BeautifulSoup
* **Definition**: Python HTML/XML document parser (`beautifulsoup4`), active inside Miniforge Python 3.13 (`:8095`).
* **Boundary**: Parsing/extraction only on already-acquired markup. It does not initiate HTTP/network requests, execute JavaScript, or perform database writes.
* **Ingestion Role**: Normalizes HTML dom trees from crawled documents into clean markdown/text spans before Treesitter CST/AST chunking.

### Firecrawl
* **Definition**: Web crawl/fetch acquisition engine for dynamic and rendered documentation/pages.
* **Boundary**: Acquisition and staging only. Raw fetched markup is retained with `source_url`, `crawl_timestamp`, provider, and byte hash.
* **Ingestion Role**: Staged in external document/crawler tables (`external_programming_docs_768` or `crawled_documents`). It **never** writes directly into canonical workspace source registries (`atlas_packets` or `codebase_chunk_index`) without passing through explicit workspace source admission (`SOURCE-BINDING-03`).

### DeltaNet
* **Definition**: Attention/memory architecture family using delta-rule state updates; gated variants may be combined with other attention layers.
* **Boundary**: Model-internal architecture, not a Parent Atlas retrieval lane, routing ID, packet field, or embedding conversion. Reference: Yang et al., [Gated Delta Networks](https://arxiv.org/abs/2412.06464); staged reference-only corpus: `docs/.okf/research/deltanet-swiglu/`.

### SwiGLU
* **Definition**: A gated feed-forward activation variant that combines a SiLU-transformed projection with a learned gate.
* **Boundary**: Feed-forward block operation, distinct from attention architecture, embedding dimension, and autoencoder latent transform. Reference: Shazeer, [GLU Variants Improve Transformer](https://arxiv.org/abs/2002.05202). Model-specific use must be established from that model's architecture/configuration evidence.

### Selection receipt
* **Definition**: A revision/checksum-bound record linking a query run, candidate snapshot and ordinal map, optional routing manifest, ordered Top-K result, evidence/tuple references, task phase/gate, and ContextManifest identity/admission.
* **Boundary**: A proposed cross-contract binding, not a new canonical identity owner. Routing IDs name routing artifacts/decisions; canonical packet/source IDs remain with existing identity contracts. `laneMask` records provenance and does not create additional votes.

### n-gram / Trigram (`pg_trgm`)
* **Definition**: Substring n-tuples of adjacent characters or tokens. In PostgreSQL, `pg_trgm` provides 3-character fuzzy matching and trigram similarity over text fields.
* **Boundary**: Used strictly as an ILIKE / spelling-tolerant fallback (`retrieveBM25Trigram`) in `retrieve-candidates.ts`.
* **Label Invariant**: Labeled `postgres_trigram`, not BM25 or FTS. It is excluded from summary hydration to avoid hallucinated lexical matches.

### PostgreSQL FTS (`postgres_fts`)
* **Definition**: PostgreSQL native lexical search via `tsvector` and `ts_rank(search_vector, to_tsquery('english', ...))` indexed with GIN.
* **Boundary**: Primary lexical candidate generation lane in `retrieve-candidates.ts`.
* **Label Invariant**: Explicitly labeled `postgres_fts` (scoring maps to `bm25Score` for backward-compatible RRF weighting, but clearly attributed to PostgreSQL built-in FTS).

### BM25
* **Definition**: Best Matching 25 (Okapi BM25) probabilistic relevance algorithm based on document length normalization and term frequency saturation.
* **Boundary**: Installed via the `pg_search` (ParadeDB) extension (`idx_codebase_chunk_pgsearch_bm25`) as an experimental challenger. Production lexical lane runs native `postgres_fts`.

---

## 2. Lineage Keys, Deduplication & PostgreSQL Uniqueness

### `(chunk_id, content_hash)` Non-Uniqueness Analysis
* **Observed State**: 726 duplicate pairs (1,452 rows) share `(chunk_id, content_hash)` and `(chunk_id, source_ref)`.
* **Database Constraint**: `codebase_chunk_index` defines primary key `id (uuid)` and unique index on `qdrant_id`. It does **not** have a unique index on `(chunk_id, content_hash)`.
* **Root Cause**: The 726 pairs represent two distinct historical ingestion passes:
  1. Legacy pass with numeric `qdrant_id` strings (e.g., `'1413774487'`) and older summaries.
  2. Modern pass with UUID `qdrant_id` strings (e.g., `'6462eb27-708f-9377-a9af-131453ce05c5'`).
* **Lineage Invariant**:
  - Joins between Qdrant and PostgreSQL must use `qdrant_id` $\leftrightarrow$ `qdrant_point_id` or canonical `id (uuid)` rather than ambiguous `chunk_id`.
  - Deduplication mutations must remain gated until an explicit promotion recipe verifies which point ID is active in Qdrant's live index.

---

## 3. Qdrant Snapshots & Vector Alignment (EmbeddingGemma vs Legacy 384)

### Snapshot Inventory
* **Live readback (2026-10-12)**: 18 collections, 18 API-visible snapshots (5 collections have two, 8 have one, 5 have none), 5,163,315,712 snapshot bytes, and no aliases. Receipt: `.tmp/atlas/production-hardening-seed-20261012/qdrant-pruning-audit-v2.json`. This is an inventory, not a retention authorization; no snapshot was pruned.
* **Container snapshot directories**: 43 collection-named directories plus `tmp`; 30 collection names are absent from the live API. Twenty-eight non-current directories hold 7,403,776 bytes, and the `codebase_chunks_384` and `codebase_chunks_384_hybrid` directories are empty. The 384 snapshot payload files are absent; empty directories remain. Receipt: `.tmp/atlas/production-hardening-seed-20261012/qdrant-volume-storage-readback-v1.json`.
* **Canonical Embedding Authority**:
  - `EmbeddingGemma` (768D) served by the Go service (`:8097`) is the **sole canonical dense embedding authority** matching PostgreSQL `codebase_chunk_index.content_embedding_768`.
* **Retired Embedding & Sparse Stacks**:
  - A live Qdrant inventory found no `*384*` collection. The packet-grain PostgreSQL column `atlas_packets.content_embedding_384` remains populated on 58,109 rows; producer/model, archival provenance, and physical-drop authorization remain unresolved. Do not infer its model from dimension.
  - No validated BM42 encoder or live sparse 384 collection is established. The historical FNV-1a/log-TF adapter is not BM42 and is an explicit-opt-in legacy path; the default SearchRuntime does not enable it. PostgreSQL FTS is the lexical baseline.
  - MiniLM/FastEmbed are not established as current production embedding owners. Their historical presence does not identify the producer of the surviving 384-D packet values.
* **Recalculation / Upsert Contract**:
  - Qdrant snapshots can be recreated on-demand via `POST /collections/{collection_name}/snapshots`.
  - Upserts to Qdrant must be projection-only mirrors derived from PostgreSQL canonical rows.
  - Never treat Qdrant point IDs or snapshot timestamps as source authority.
  - Canonical PostgreSQL ownership does not make a snapshot disposable. Require an isolated restore/readback and rollback/alias review before cleanup.

---

## 4. RTX Agentic Dense Search & Agentic Error Fixing LUT

### Architecture Order
1. **Dense Search**: Query is embedded into 768D vector via Go service (`:8097`), matched against Qdrant `codebase_chunks_768` or pgvector `content_embedding_768`.
2. **Lexical Fusion**: FTS candidates (`postgres_fts`) are combined via Reciprocal Rank Fusion (`rrf-combiner.ts`).
3. **Lookup Table (LUT)**: HMM Tool Selector (`hmm-tool-selector.ts`) consults candidate features and error risks (`hmm_error_risk`).
4. **Agentic Error Fixing**: Verified failures produce bounded diagnostic packets, querying the fixer memory (`fixer_memory_768`) before proposing non-destructive patches.

## Model boundary terms (added 2026-10-13)

- **Ornith 1.5 9B** — the only synthesis and tool-use model, served by llama-server on `:8090` (alias `ornith-1.5-9b`). GGUF metadata (`hforf.gguf`): architecture `qwen35`, hidden size (`embedding_length`) 4096, 32 layers, trained context 262,144. Served context 65,536 (`/props`). The GGUF has no sliding-window key, so a "512 sliding window" is not a fact about this model. It is not a Gemma model and is not an embedding writer.
- **AtlasGemmaRankV1 / `atlas_gemma_rank_service.py`** — a separate numerical scorer on its own standalone checkpoint (`models/atlas-gemma-rank-v1/standalone-init-bf16/`), built on a Gemma 4 assistant-style backbone. It never calls `:8090` and never generates text. Its rank head is untrained (Xavier init): responses carry `rankHeadTrained: false` and `rankingQualityProven: false`, so its scores are not relevance evidence.
- **EmbeddingGemma** — the canonical 768-dimensional embedding model (`semantic_768`). Not Ornith, not the rank model.
- **MiniLM (all-MiniLM-L6-v2)** — a separate 384-dimensional model. Its card says inputs longer than 256 word pieces are truncated by default and that training used sequence length 128; do not report 128 as the model's maximum input context. Its historical use is not proven to be the producer of the surviving 384-D PostgreSQL packet values; this repo does not contain its artifacts.
