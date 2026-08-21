# Qdrant collection contract freeze — 2026-08-20

## Status

`CONTRACT_PROVEN_LIVE_MIGRATION_BLOCKED`

## Frozen dense contract

- Collection target: `codebase_chunks_768_v2`
- Logical representation: `semantic_768`
- Model lineage: EmbeddingGemma, native 768
- Physical vector name: `content`
- Dimension/distance: `768` / `Cosine`
- Sparse vectors: none in this contract; EMB3B remains separate

## Payload ownership

`packet_key`, `source_ref`, `canonical_id`, `tree_node_id`, and
`symbol_version_id` are identity/provenance payload fields. Workspace/source/
representation revisions are lineage fields. `domain_class`, taxonomy tags,
4D topology coordinates, KMeans/SOM/community labels, and PageRank are
filter or derived routing metadata; they are not additional semantic vector
dimensions or independent fusion lanes.

## Migration guard

The contract exposes a read-only plan for future revision indexes, but every
planned entry is marked `BLOCKED_UNTIL_LINEAGE_POPULATED`. EMB3A found that
live upstream revision authority and Qdrant payload coverage are not proven.
No collection, payload, index, Postgres, Valkey, or projection mutation was
performed.

## Validation

- `qdrant-collection-contracts.spec.ts`: 8/8 passed
- TypeScript no-emit compilation: passed with no diagnostics
- `git diff --check`: passed; existing line-ending warnings remain in the dirty worktree

## Next gate

Prove the first populated revision lineage boundary (canonical source →
immutable snapshot/outbox → Qdrant payload) with a bounded read-only audit.
Only after that proof should a separate dry-run index plan be reviewed.
