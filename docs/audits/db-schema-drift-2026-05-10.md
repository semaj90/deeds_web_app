# DB Schema Drift Audit - 2026-05-10

Scope: `src/lib/server/db/schema-postgres.ts` vs live `information_schema` / `pg_indexes`.

## Summary
- 7 schema tables are missing from the live DB.
- 52 live tables still drift from the Drizzle shape after type normalization.
- `cases` is missing 3 declared indexes.
- `pgvector-utils.temp.ts` exports are identical to `pgvector-utils.ts` so the temp file is only a cleanup candidate, not a behavior fork.

## Missing Tables
- `web_search_index` - referenced by `src/lib/server/ace/context-assembler.ts:323` and `src/lib/server/indexer/web-search-indexer.ts:12`.
- `community_reports` - referenced by `src/lib/server/graph/community-graph.ts:17,260,426,526,598` and `src/lib/server/indexer/directory-summarizer.ts:9,294,331`.
- `context_buffers` - referenced by `src/lib/server/retrieval/context-buffer.ts:34,71,139`.
- `code_llm_index` - referenced by `src/lib/server/cache/code-llm-index.ts:47,254,262,272,868`, `src/lib/server/ace/context-assembler.ts:312-323`, and `src/routes/api/graph/cluster-summaries/+server.ts:4,69,88,118`.
- `ast_nodes`, `ast_edges`, `ast_file_features` - declared in `schema-postgres.ts` and referenced only by the schema file itself in this workspace.

## Real Column Drift
- `cases.priority` and `cases.status` are `text` in live DB; schema expects `case_priority` / `case_status` enums.
- `cases.assigned_attorney` is `integer` in live DB; schema expects `uuid`.
- `documents` is still on an older shape: missing `case_id`, `description`, `file_path`, `file_type`, `summary`, `embedding_id`, `metadata`, with `user_id`/`status`/timestamp drift.
- `citations.document_id` is `text` in live DB; schema expects `uuid`. `created_by` and timestamps also drift.
- `codebase_chunk_index.summary_embedding` and `signature_embedding` are `halfvec` in live DB; schema expects `vector`.
- `evidence.updated_at` / `verified_at` are timezone-inverted relative to schema.
- `code_llm_index`, `community_reports`, `context_buffers`, and `web_search_index` are not present, so all declared columns and indexes on those tables are absent.

## Missing Indexes
- `cases` is missing `idx_cases_created_at`, `idx_cases_status_priority`, and `idx_cases_status_priority_created`.
- Missing tables imply missing declared indexes on `web_search_index`, `community_reports`, `context_buffers`, `ast_nodes`, `ast_edges`, `ast_file_features`, and `code_llm_index`.

## Recommendations
- Migrate `cases` to enum-backed `priority` / `status` and restore `assigned_attorney` to `uuid` if the app still expects UUID owners.
- Land the missing tables before enabling the features that reference them: `web_search_index`, `community_reports`, `context_buffers`, `code_llm_index`.
- Keep the schema in sync for `documents`, `citations`, and `codebase_chunk_index` before adding more code paths that depend on those shapes.
- Do not delete `pgvector-utils.temp.ts` yet; it has no unique exports, so removal is safe only after the import graph is cleaned up.
