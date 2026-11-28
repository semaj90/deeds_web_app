# DSPy documentation: PostgreSQL 18 index contract

Status: reference only. The DSPy captures are `LOCAL_UNADMITTED`. Admission,
migrations, embeddings, and projection writes require their own authorization.

## Existing canonical tables

The repo already owns external documentation in
`atlas_external_doc_pages` and `atlas_external_doc_chunks`, defined by
`sveltekit-frontend/drizzle/manual/20260904_external_doc_intelligence_v1.sql`.
The application uses the existing declarations in
`sveltekit-frontend/src/lib/server/db/schema/external-doc-intelligence.ts`.
Both tables are excluded from drizzle-kit generation. The manual SQL remains
the DDL owner.

### Page identity and provenance

`atlas_external_doc_pages` fields:

- `id UUID` primary key
- `provider`, `product`, `product_version`, `architecture`, `language`
- `url`, `title`, `publisher`, `source_authority`, `fetcher`
- `crawl_revision`, `parser_revision`, `content_hash`, `evidence_revision`
- `retrieved_at`, `created_at`

Identity is unique on `(provider, product, product_version, url)` and separately
on `evidence_revision`. DSPy `/current/` is a mutable channel. Use DSPy `3.4.0`
for the release-pinned pilot and preserve the capture hashes as separate evidence
revisions. The [3.4.0 capture receipt](snapshots/20260928T205007Z-9bd30a9471d9/receipt.json)
records 165 captured pages. The [current-channel receipt](snapshots/20260928T203954Z-1d0dffe4ef63/receipt.json)
records the separate mutable reference capture.

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
architecture and provider/product; URL trigram GIN; and cosine HNSW on the
nullable 768-dimensional embedding column.
Use FTS GIN for lexical retrieval, structured-array GIN for exact metadata
filters, and HNSW only after vectors are separately qualified. PostgreSQL
documents GIN as the preferred full-text index type.

## Admission gates still required for DSPy

1. Recover a byte-exact release capture and rerun the existing snapshot verifier.
   The Windows checkout failed the 3.4.0 verification with 332 checksum failures.
   All 332 mismatches matched the recorded checksums after CRLF-to-LF conversion
   in memory. That comparison diagnoses the drift. Admission still requires a
   byte-exact copy that passes the verifier without normalization. `pages.jsonl`
   and `indexes/llms.txt` are ignored by Git and must be available from the capture
   when verifying a fresh checkout.
2. Prepare one page from the verified release capture for the existing deterministic
   chunker. Carry the canonical URL, exact captured bytes, product version,
   source and parser revisions, and capture checksums into the admission envelope.
3. Validate the envelope and exact normalized-page bytes through the existing
   `run-external-doc-admission-v1.mts` one-page pilot. The pilot's `--plan` mode
   can check the staging schema and classify the page before an approved write.
4. After approval, use the existing `external-doc-admission.ts` transaction and
   independently check page/chunk identities, exact spans, and FTS readback.
5. Keep `content_embedding` null until the semantic representation, tokenizer,
   and executor gates are satisfied. Qdrant remains a downstream projection.

Local failure receipt: `.tmp/review/dspy-pg18-index-contract-snapshot-v1.json`.
Reproduce the exact byte check with:

```powershell
py -3.13 scripts/atlas/capture-dspy-doc-corpus-v1.py --verify-dir .okf/docs/dspy/snapshots/20260928T205007Z-9bd30a9471d9
```

No new PostgreSQL index is needed merely to make the captured local snapshot
searchable as reference files. The existing GIN/BTREE/TRGM/HNSW definitions
cover the canonical corpus once admission is authorized.
