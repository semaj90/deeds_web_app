# Codebase Layer Mapping Note

## Purpose
Keep the old RAG layer discoverable without reactivating it, and give future searches a fast way to distinguish live code, compatibility shims, and archived modules.

## What I Am Tagging
- Root archive markers such as `LEGACY_RAG_LAYER` on the archived RAG trees.
- Per-file markers on archived server, UI, and API modules so `rg LEGACY_RAG_LAYER` finds the real code locations.
- Compatibility barrels separately from live schema files so the live path stays canonical.

## Suggested Layer Labels
- `LIVE_LAYER` for active runtime code.
- `COMPAT_LAYER` for thin shims that forward to live code.
- `ARCHIVE_LAYER` for preserved but inactive code.
- `LEGACY_RAG_LAYER` for the old RAG stack specifically.
- `JSONB_METADATA_LAYER` for live Postgres JSONB legal metadata and its derived labels.

## Search Model
Use a layered search pipeline instead of a single lookup:
1. Lexical scan with `rg` for explicit layer markers, filenames, and import paths.
2. Graph scan through import and route wiring to separate live code from archive-only code.
3. Semantic scan in Qdrant for related modules, feature names, and historical variants.
4. Cache scan in Redis for hot hits, layer tags, and quick traversal hints.

## Multi-Query Quick Traversal
For fast codebase mapping, fan out a small set of queries in parallel:
- exact marker search
- filename and path search
- import graph search
- semantic cluster search
- archive root search

Then merge the results into a single ranked view with layer tags and trust tier.

## Where Copilot or Gemini Fits
Use Copilot or Gemini as the orchestration layer, not as the source of truth.
- They can issue multi-query searches.
- They can summarize the result set.
- They should call the local codebase search, graph, and cache services instead of directly guessing from memory.

## Recommended Integration Shape
Expose a local search endpoint or tool that can:
- accept several queries at once
- query Qdrant plus the graph cache
- return layer labels, file paths, and short explanations
- keep archive results separate from live results unless explicitly requested

## Cache Idea
Store lightweight layer metadata in Redis for hot traversal:
- `layer:file:{path}` -> layer label
- `layer:cluster:{id}` -> cluster label and members
- `layer:search:{hash}` -> short-lived multi-query result set

Use Qdrant for semantic recall and Redis for fast repeat lookups.

## JSONB Metadata Mapping
Treat the JSONB legal schema as a first-class mapping surface for codebase labels and legal facets.

Canonical anchors:
- `sveltekit-frontend/src/lib/server/db/jsonb-legal-schema.ts`
- `sveltekit-frontend/src/lib/server/db/jsonb-migrations.sql`
- `sveltekit-frontend/src/lib/server/db/migrations/012_gin_jsonb_indexes.sql`

Recommended facet labels:
- `JSONB_METADATA_LAYER`
- `JSONB_CASE_LAYER`
- `JSONB_EVIDENCE_LAYER`
- `JSONB_LEGAL_DOC_LAYER`

Facet fields to map:
- `documentType`
- `practiceArea`
- `caseNumber`
- `evidenceType`
- `admissibility`
- `chainOfCustody`
- `aiMetadata`

Rule of thumb:
- Postgres JSONB is the source of truth.
- Redis stores hot labels and traversal hints.
- Qdrant stores payload facets for recall and filtering.
- ACE consumes compact cards, not raw JSONB blobs.

## Current State
- The archived RAG roots are labeled.
- The remaining archived files are being tagged directly so the marker sits where the code lives.
- The canonical live schema remains in the server schema file, not the old barrel.

## Next Step
Finish the remaining archived RAG file sweep, then wire the layer labels into the codebase mapping and search workflow.
