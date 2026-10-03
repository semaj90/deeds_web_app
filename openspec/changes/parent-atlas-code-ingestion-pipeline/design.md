# Design: Code Ingestion and Structural Evidence Ownership

## GPH-02 contract selection

GPH-02 reuses the existing layered contracts. It does not add a second Graphify identity model or copy embedding, ranking, or Qdrant fields into structural evidence.

| Evidence role | Selected owner | Boundary |
|---|---|---|
| Source span | `structuralExtractionInputSchema.chunks[]` via `treesitterChunkerChunkSchema` | `source_ref`, `source_revision`, `workspace_revision`, UTF-8 `byte_start`/`byte_end`, line coordinates, and chunk `content_hash` define the revision-qualified structural occurrence. The byte range is evidence, not symbol identity. |
| Symbol fact/nomination | `structuralSymbolNominationSchema` (`StructuralSymbolNominationV1`) | Carries source/workspace revisions, upstream file/node/chunk provenance, byte span, declaration hash, and extractor revision. It is a nomination, not a canonical symbol ID. |
| Stable symbol identity | `symbolResolutionSchema` then `symbolVersionSchema` | GIS resolution supplies `stable_symbol_id`; a revision-bound `symbol_version_id` is emitted only after canonical resolution. Upstream IDs, compatibility hashes, and paths do not become canonical identity. |
| Typed edge/reference fact | `structuralReferenceFactSchema` (`StructuralReferenceFactV1`) | Carries source/workspace revisions, upstream source/target occurrence refs, optional resolved canonical symbol refs, evidence refs, and extractor revision. Raw Tree-sitter cross-reference transport remains `treesitterChunkerXrefEdgeSchema` inside the revision-qualified extraction envelope. |

The sidecar transport `atlas.ast.evidence.v1` is the parser boundary, not a competing canonical fact owner. Its chunk/edge output is validated by `atlasAstEvidenceV1Schema`; the adapter maps it into `StructuralExtractionInputV1`, where revision qualification and nomination/reference semantics are explicit. The normalizer keeps compatibility `treeNodeId` separate from canonical symbol identity.

## Lifecycle and non-goals

The legacy AST extractor remains `MIGRATION_CANDIDATE`. GPH-02 contract selection does not prove replacement parity, stable identity persistence, Graphify daily adoption, or zero legacy imports. Those remain separate GPH-03 onward gates. No embedding, ranking, Qdrant point identity, CandidateOrdinal, or canonical persistence is owned by these contracts.
