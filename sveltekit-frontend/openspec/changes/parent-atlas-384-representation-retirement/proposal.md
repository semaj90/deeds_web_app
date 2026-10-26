## Why

The repository contains legacy 384-dimensional columns, collections, registry entries, scripts, and documentation. A dimension is only a shape: it does not identify the encoder, input recipe, model revision, training objective, or source lineage. The existing migration note incorrectly treats all 384-dimensional data as one direct EmbeddingGemma slice and proposes routing to other representations without proving compatibility.

This change creates a repository-wide, evidence-backed retirement/isolation plan. It does not migrate vectors, change live routing, delete collections or snapshots, or declare historical data invalid. PostgreSQL remains the identity and source-lineage authority; Qdrant and GPU indexes remain projections.

Ownership boundary: the root-level `openspec/changes/parent-atlas-retire-384-lane/` change owns decisions and any eventual archive/schema disposition for `atlas_packets.content_embedding_384`. This frontend change owns only the cross-repository census and caller/representation classification; it must feed findings to that owner rather than duplicate its mutation steps.

## What Changes

- Inventory every 384-dimensional writer, reader, schema column, index, collection, alias, fixture, validation script, environment setting, and documentation claim.
- Classify each use as active, historical, fixture-only, reference-only, unknown, or already absent, with owner/caller evidence.
- Record model, exact representation and recipe identity where proven; dimension alone must never establish compatibility.
- Define a staged migration: containment, caller replacement, parity and lineage validation, then separately authorized archival/decommissioning.
- Correct the existing staging-planes migration note so it no longer claims that all 384 vectors are direct EmbeddingGemma slices or that another representation can replace them by width alone.

## Non-goals

- No vector generation, model training, database migration, Qdrant mutation, alias change, snapshot deletion, cache write, or production deployment.
- No blanket replacement of 384 with 768, 512, 256, 128, or latent dimensions.
- No assertion that MiniLM's 384-dimensional output is interchangeable with an EmbeddingGemma MRL representation.

## Impact

- OpenSpec migration ledger and representation policy documentation.
- Later implementation work may touch scripts, schemas, retrieval callers, and projections only after this inventory identifies active owners and exact compatibility contracts.
