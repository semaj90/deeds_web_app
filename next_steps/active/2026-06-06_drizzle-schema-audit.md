# Drizzle Schema Audit — 2026-06-06

## Status

349 live tables in `public`. 308 unique table names declared across non-archived schema files.

| | Count |
|---|---|
| In both schema and DB | 243 |
| In schema, missing from DB | ~51 remaining (deferred) |
| DB-only (no schema declaration) | ~87 |

## Applied 2026-06-06

Migration: `drizzle/manual/20260606_missing_tables.sql`

14 tables created:
- `error_brain_analysis`
- `error_brain_diffs`
- `error_cluster`
- `evidence_items`
- `evidence_media_assets`
- `evidence_transcript_segments`
- `evidence_processing_jobs`
- `evidence_frames`
- `ingested_documents`
- `web_pages`
- `web_embeddings`
- `web_crawl_jobs`
- `user_analytics`
- `ai_chat_sessions`

**Round 2 (same session) — active consumers found:**
- `charges` — imported by `/api/charges/add/+server.ts`
- `case_timeline` — declared alongside charges in `schema-charges.ts`
- `ocr_processing_queue` — used by ingestion pipeline
- `vector_search_logs` — analytics consumer
- `embedding_cache_enhanced` — used by embedding cache layer

## Deferred Scaffolding (do not create yet)

These tables are declared in schema files but have no active consumers in routes or server lib.
Create only when the feature lane is activated.

### prosecutor_* (5 tables)
- `prosecutor_cases`
- `prosecutor_persons`
- `prosecutor_case_persons`
- `prosecutor_evidence`
- `prosecutor_reports`

Schema: `sveltekit-frontend/src/lib/server/db/schema-prosecutor.ts`

### shader_* (6 tables)
- `shader_cache_entries`
- `shader_compilation_queue`
- `shader_dependencies`
- `shader_preload_rules`
- `shader_recommendations_view`
- `shader_user_patterns`

Schema: (scattered across schema-canvas / schema-phase78)

### test_rag_* (3 tables)
- `test_rag_documents`
- `test_rag_embeddings`
- `test_rag_search_sessions`

Schema: `sveltekit-frontend/src/lib/server/db/schema-test-rag.ts`

### ast_* (3 tables)
- `ast_nodes`
- `ast_edges`
- `ast_file_features`

Schema: `sveltekit-frontend/src/lib/server/db/schema/codebase-intelligence.ts`

### Other deferred
- `ace_packets`
- `ai_memory`
- `atlas_chunks`
- `atlas_dependency_edges`
- `atlas_feature_profiles`
- `atlas_hot_keyword_clusters`
- `atlas_profile_cards`
- `atlas_retrieval_events`
- `case_timeline`
- `cases_jsonb`
- `centroid_registry`
- `charges`
- `codebase_audit_events`
- `context_buffers`
- `conversations`
- `document_relationships_jsonb`
- `embedding_cache_enhanced`
- `entities`
- `entity_edges`
- `ingested_documents` (created)
- `legal_documents_jsonb`
- `messages`
- `model_artifacts`
- `predictive_todos`
- `rag_cards`
- `rag_edges`
- `rag_embeddings`
- `rg_search_results`
- `scenarios`
- `search_centroids`
- `user_timeline`

## Known Type Mismatches (column-level, not missing tables)

These tables exist in both schema and DB but have type drift:

| Table | Column | DB type | Schema type | Impact |
|---|---|---|---|---|
| `parent_atlas_documents` | `id` | `bigint` | likely `integer`/`uuid` | Low — serial seq works |
| `parent_atlas_jobs` | `status` | `varchar(32)` | likely `text` | None — Postgres coerces |

Fix via `ALTER TABLE` when the feature is actively developed. Not blocking.

## DB-Only Tables (87) — No Schema Declaration

These were created by manual migrations, sidecar scripts, or runtime. No action needed unless
a route starts importing them — at that point add a schema declaration.

Notable examples:
- `ace_chunks`, `ace_context_packets`, `ace_context_sources`, `ace_docs`, `ace_hit_logs`
- `agent_actions`, `agent_context_files`, `agent_memory_observations`, `agent_sessions`
- `atlas_feature_map_history`, `card_source_refs`, `directory_context_bindings`
- `code_relations_v1`, `codebase_graph_analysis`, `codebase_wiki_pages`

## Next Actions (when ready)

1. `prosecutor_*` — create when prosecutor feature lane activates
2. `ast_*` — create when codebase-intelligence AST pipeline activates  
3. Column-level type fixes — `ALTER TABLE parent_atlas_documents ALTER COLUMN id TYPE integer` after confirming no uuid consumers
4. Add DB-only tables to schema declarations as they gain Drizzle consumers (use `drizzle-kit introspect` to generate)
