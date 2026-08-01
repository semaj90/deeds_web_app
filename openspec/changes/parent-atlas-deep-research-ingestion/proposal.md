## Why

`parent-atlas-runtime-ownership-precall` deliberately excludes multimodal
deep-research ingestion — folding it in would make that change too broad
(runtime ownership + pre-call validation is already a full scope on its
own). This is a placeholder/scope-reservation change, not an
implementation plan: it exists so the ingestion design has an OpenSpec
home distinct from runtime ownership, and so nothing gets built ad hoc
against an undocumented shape.

**No code exists for this yet.** This proposal is intentionally
unimplemented — it records the acquisition envelope and representation
design so a future session can pick it up without re-deriving it, per
the same pattern as `atlas-hot-vector-schema-decision` (decision-only,
no premature schema).

## What Changes (design sketch, not yet built)

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

- Any actual implementation (extractor code, storage wiring).
- Choosing which extraction library/service to use for each source type.
- Wiring this into the existing evidence pipeline or MCP `ldr_research`
  tool — that's a follow-up decision once this envelope is approved.

## Impact

None yet — no code changes. This change exists to reserve the design
scope, not to implement it.
