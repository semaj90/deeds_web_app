# DSPy documentation: PostgreSQL 18 index contract

Status: reference only. The official DSPy snapshot is `LOCAL_UNADMITTED`; this
file does not authorize admission, migration, embedding, or projection writes.

## Existing canonical tables

The repo already owns external documentation in
`atlas_external_doc_pages` and `atlas_external_doc_chunks`, defined by
`sveltekit-frontend/drizzle/manual/20260904_external_doc_intelligence_v1.sql`.
Do not create DSPy-specific parallel tables.

### Page identity and provenance

`atlas_external_doc_pages` fields:

- `id UUID` primary key
- `provider`, `product`, `product_version`, `architecture`, `language`
- `url`, `title`, `publisher`, `source_authority`, `fetcher`
- `crawl_revision`, `parser_revision`, `content_hash`, `evidence_revision`
- `retrieved_at`, `created_at`

Identity is unique on `(provider, product, product_version, url)` and separately
on `evidence_revision`. DSPy `/current/` is a mutable channel, not a release
version; resolve and bind an exact upstream version before canonical admission.

### Chunk text and retrieval metadata

`atlas_external_doc_chunks` fields:

- `id UUID`, `page_id UUID`, `chunk_id`, `ordinal`
- `heading_path TEXT[]`, `section_anchor`, `start_char`, `end_char`, `text`
- `domain_class`, `ontology_classes TEXT[]`, `code_blocks JSONB`
- `api_signatures TEXT[]`, `domain_tags TEXT[]`, `symbols TEXT[]`, `concept_ids TEXT[]`
- `chunk_checksum`, `evidence_revision`
- `content_embedding vector(768)` nullable; `qdrant_point_id TEXT` nullable
- `search_vector TSVECTOR` generated from chunk `text`; `created_at`

Existing indexes are the PostgreSQL 18 access path: page lookup by
`(page_id, ordinal)`; GIN on `search_vector`, `domain_tags`, `symbols`,
`heading_path`, and `api_signatures`; page filtering by product/version/
architecture and provider/product; URL trigram GIN; nullable 768-D cosine HNSW.
Use FTS GIN for lexical retrieval, structured-array GIN for exact metadata
filters, and HNSW only after vectors are separately qualified. PostgreSQL
documents GIN as the preferred full-text index type.

## Admission gates still required for DSPy

1. Resolve a release-pinned DSPy documentation revision rather than admitting
   the mutable `current` alias as `product_version`.
2. Align the existing raw-SQL tables with Drizzle declarations before adding
   application-side admission support; do not replace their established SQL
   indexes with a second schema owner.
3. Feed captured pages through the existing deterministic chunker and
   `external-doc-admission.ts`, then perform the explicitly approved Postgres
   transaction/readback proof.
4. Keep `content_embedding` null until the independent semantic representation,
   tokenizer, and executor gates are satisfied; Qdrant remains a later mirror.

No new PostgreSQL index is needed merely to make the captured local snapshot
searchable as reference files. The existing GIN/BTREE/TRGM/HNSW definitions
cover the canonical corpus once admission is authorized.
