# PostgreSQL 17.6 → 18 Schema Audit

## Executive Summary
- The table-wise delta between PostgreSQL 17.6 and 18 is not a storage-format issue.
- The practical work is schema drift, index coverage, and extension compatibility.
- The live database currently exposes only one canonical research table: `research_summaries`.
- The repo already has the Drizzle bridge and additive migrations needed to carry provenance into durable rows.

## Live Database Facts
- PostgreSQL: `17.6`
- Extensions:
  - `btree_gin 1.3`
  - `pg_trgm 1.6`
  - `plpgsql 1.0`
  - `uuid-ossp 1.1`
  - `vector 0.8.0`
- Live `public.research_summaries`:
  - rows: `53`
  - rows with `output_meta`: `0`
  - rows with `source`: `53`
  - rows with `url`: `5`
  - indexes: `research_summaries_pkey` only

## Live Table Shape
### Present
- `research_summaries`

### Absent from live DB
- `task_semantic_packets`
- `summary_cards`
- `glyph_records`
- `card_source_refs`

## Schema Drift
### `research_summaries`
- Live DB has:
  - `output_meta jsonb NOT NULL DEFAULT '{}'::jsonb`
- Repo now models:
  - `source_ref`
  - `source_refs`
  - `outputMeta`
- Missing live indexes now planned by migration:
  - `source_ref` btree
  - `source_refs` GIN
  - `entity_tags` GIN
  - `output_meta` GIN
  - `pipeline/relevance_score/id`
  - `entity_type/relevance_score/id`
  - `source/relevance_score/id`
  - `user_id/created_at`
  - `query_hash`
  - HNSW on `embedding`

## Canonicalization Guidance
- Treat `research_summaries` as the live canonical research table.
- Do not invent parallel durable stores when the existing table can absorb provenance.
- Preserve provenance on the bridge:
  - `sourceRef`
  - `sourceRefs`
  - `citationLabel`
  - `sectionPath`
  - `outputMeta`

## Repo Consolidation Buckets
### Production-ready / ship path
- `sveltekit-frontend/src/lib/server/analytics/ldr-ace-bridge.ts`
- `sveltekit-frontend/src/lib/server/features/cases/research-summaries-db.ts`
- `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`
- `sveltekit-frontend/src/lib/server/cache/ace-packet-cache.ts`
- `sveltekit-frontend/src/lib/server/search/qdrant-search.ts`

### Planned production / not yet live
- `task_semantic_packets`
- `summary_cards`
- `glyph_records`
- `card_source_refs`
- `atlas_*` profile tables

### Experimental / keep out of canonical ship set
- `local-deep-research` SQLite boundary
- cuVS / CAGRA swap lane
- legacy backup trees and archived migration snapshots
- `.tmp`, `.cache`, backup reports, and generated scratch artifacts

## Next Safe Steps
1. Apply the additive `research_summaries` provenance/index migration.
2. Backfill provenance for existing `research_summaries` rows where source URLs exist.
3. Re-run parent-atlas and kanban-to-atlas sync from the production-ready feature list.
4. Move archive candidates out of the ship set and keep the repo focused on source, schemas, scripts, and docs.

