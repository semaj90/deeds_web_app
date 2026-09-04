# DIR-INDEX-02 Canonical Chunk Owner Audit

Status: `IMPLEMENTED_UNPROVEN`

Date: 2026-09-04

This is a read-only ownership and implementation receipt for `parent-atlas-canonical-directory-ingestion-fabric`. It does not authorize database, Qdrant, Neo4j, Valkey, source-file, model, or production Graphify writes.

## Existing owner findings

The repository already has canonical chunk and graph-identity contracts under the existing Parent Atlas / GIS / Graphify identity spine. In particular:

- `sveltekit-frontend/src/lib/server/atlas/identity/graph-identity-contracts.ts` defines `ChunkIdentityV1`, `SymbolVersionIdentityV1`, `ChunkId`, `SymbolVersionId`, `ParseNodeId`, and related graph identity coordinates.
- `sveltekit-frontend/src/lib/server/atlas/contracts/chunk-projection-identity-v2.ts` binds `chunkId`, source/workspace revision, byte spans, chunk content hash, Tree-sitter/symbol provenance, representation/projection revisions, and a tamper-detecting checksum.
- `docs/reports/chunk-projection-identity-v2.json` records a fixture proof for that projection contract and explicitly leaves live canonical chunk census/fanout work separate.

The broad indexing script `scripts/atlas/index-full-repo-for-search.mjs` is therefore not selected as a new canonical chunk owner. It currently generates retrieval/projector-local values such as `fullrepo:<path>:<ordinal>` and Qdrant IDs from path/ordinal, and its generic text fallback uses character-window segmentation. Those behaviors are useful for retrieval indexing but are not sufficient to establish a new canonical source-code chunk identity authority.

## Directory-fabric action

Added:

- `packages/parent-atlas/src/core/canonical-chunk-v1.ts`
- `packages/parent-atlas/test/canonical-chunk-v1.test.mjs`
- `scripts/atlas/prove-dir-index-02-canonical-chunk-v1.mjs`

`CanonicalChunkV1` is an adapter contract, not a new identity producer. For source-code chunks it requires an existing `chunkId` and existing source/workspace revision binding and copies optional symbol provenance. It does not derive chunk or symbol identity from path, ordinal, Qdrant ID, TreeNodeId, or text.

The contract additionally provides exact UTF-8 byte-span checksum verification and deterministic set checksum replay.

## Gate assessment

- `DIR-INDEX-02A`: `IMPLEMENTED_UNPROVEN` — adapter contract exists with byte spans, revisions, checksum, chunker revision, and optional heading/symbol/AST provenance. Local compile/test proof still required.
- `DIR-INDEX-02B`: `IMPLEMENTED_UNPROVEN` — implementation explicitly reuses caller-supplied existing chunk/symbol identity and has no competing identity derivation. Local proof runner still required before closing.
- `DIR-INDEX-02C`: `OPEN` — deterministic Markdown/API-doc section and code-example segmentation is not implemented by this tranche.
- `DIR-INDEX-02D`: `OPEN` — bounded JSON/YAML logical-object segmentation with byte-accurate source spans and typed reject is not implemented by this tranche.
- `DIR-INDEX-02E`: `PARTIAL_IMPLEMENTED_UNPROVEN` — deterministic replay and byte-span checksum tests are added for existing-owner chunks, but the full gate also covers the document segmenters from 02C/02D and therefore cannot be fully closed yet.

## Safe proof command

```powershell
node scripts/atlas/prove-dir-index-02-canonical-chunk-v1.mjs
```

Expected successful status:

```text
DIR_CHUNK_IDENTITY_PASS
```

A passing focused runner proves only the adapter/replay subset above. It does not by itself close 02C/02D or authorize production writes.

## Next safe implementation

Implement deterministic Markdown/API-doc section segmentation with stable heading paths and byte-accurate spans, then prove identical replay over fixed bytes. After that, implement bounded JSON/YAML logical-object segmentation only where exact byte-span parser support is available; otherwise return a typed rejection rather than fabricated spans.
