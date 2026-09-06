## Why

`parent-atlas-runtime-ownership-precall` deliberately excludes multimodal
deep-research ingestion — folding it in would make that change too broad
(runtime ownership + pre-call validation is already a full scope on its
own). This existing scope reservation is promoted to a bounded implementation
plan on 2026-09-05. It owns reproducible discovery observations and their handoff
to existing acquisition owners, not a new crawler, source registry or datastore.

The current repo already has SearXNG discovery in
`sveltekit-frontend/src/lib/server/retrieval/web-search.ts`, consumed by the agent
tool adapter, and versioned HTML acquisition in `python/atlas_external_docs.py`.
Snapshot identity and the end-to-end handoff remain to be implemented/proven under
DISCOVERY-01..05. Existing source/acquisition contracts are reused, never duplicated.

## What Changes (implementation plan, not execution proof)

Add derived SearchObservationV1/SearchSnapshotV1 around existing discovery results.
Freeze normalized query/checksum, normalizer revision, requested and effective
engines/categories/language/timeRange, provider/fallback, observedAt, ordered results,
resultSetChecksum and snapshotChecksum. Distinguish an empty successful result from
provider failure or curated fallback. These observations are not document evidence.

Route selected URLs to the existing versioned-doc acquisition owner (and existing
media-specific owners after census). Fetched bytes, content hashes and exact spans
enter the canonical acquisition envelope through existing PostgreSQL admission.
Do not turn SearXNG snippets into canonical documents or add a direct Qdrant writer.

The broader representation sketch below remains downstream reference scope, not an
instruction to implement visual/latent/GPU representations in the discovery tranche.

Canonical acquisition envelope for every ingested source, regardless of
type:

```
source_id, source_type, canonical_url, content_hash, retrieved_at,
mime_type, title, license, workspace_revision, extractor_version
```

Then branch by source type:

- **HTML**: DOM extraction (metadata, headings, links), code blocks,
  tables, screenshot only when visual layout matters.
- **PDF**: text extraction, page images, tables, figures, page-level
  provenance.
- **Image**: vision description, OCR only when necessary, region
  metadata, image embedding.
- **API**: OpenAPI endpoints/schemas/examples, authentication, version
  metadata.

Generate multiple representations per source rather than one overloaded
embedding:

- `semantic_768` — text meaning
- `visual_512` (or model-native) — screenshot/image similarity
- sparse terms — exact API/function identifiers
- schema/AST tuples — structured relationships
- `latent_64` — routing/clustering only, never search

**Hard rule**: every extracted claim needs a source span (page, DOM
selector, or image region) so ACE can cite rather than synthesize from
untraceable summaries.

## Explicitly out of scope for now

- New crawler or independent acquisition/source identity owner.
- Library/framework installs, public broad crawling, paid acquisition, datastore
  writes or new media/embedding projections in this planning pass.
- Automatic LDR/MCP promotion without the owning admission and authorization gates.

## Impact

Planning artifacts now define the discovery snapshot and acquisition handoff tests.
No production runtime is changed. Build bounded contracts/fixtures in scripts/atlas
before package promotion. Existing DOC-04/05/06A/27 owners retain byte provenance,
PostgreSQL admission and version selection; this change consumes their receipts.
