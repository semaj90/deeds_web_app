# DIR-INDEX-02 — Chunk ownership audit

Status: `PASS_WITH_TERMINOLOGY_GUARD`

Date: 2026-09-04

## Finding

The repository already has a structural/chunk evidence contract under `packages/parent-atlas/src/core/structural-symbol.ts` and an 8095 adapter under `packages/parent-atlas/src/core/treesitter-chunker-evidence-adapter.ts`.

For source code, Consiliency/Tree-sitter chunk identifiers are upstream provenance and candidate join keys. They are not Parent Atlas canonical identity. The existing structural contract explicitly treats chunks and graph cuts as replaceable retrieval projections and reserves stable symbol identity for GIS/registry promotion.

The 8095 adapter preserves native `upstream_node_id`, `upstream_file_id`, `upstream_symbol_id`, and `upstream_chunk_id` where supplied, computes byte-slice content hashes, carries source/workspace/chunker revisions into the structural fabric, and emits a receipt with `canonical_identity_created: false`.

Therefore this change MUST NOT create a second globally canonical code-chunk identity owner.

## Corrected meaning of `CanonicalChunkV1`

Within this change, `CanonicalChunkV1` means a **canonical source-grounded chunk descriptor**, not a globally canonical chunk-ID authority.

Its identity semantics are namespace-aware:

1. **CODE / STRUCTURAL namespace**
   - preserve the existing upstream `upstream_chunk_id` as provenance/join identity;
   - preserve exact source/workspace revisions and byte spans;
   - never promote a compatibility ID to canonical identity;
   - never derive a second stable symbol/chunk identity when GIS/structural owners already exist.

2. **DOCUMENT / OPENSPEC namespace**
   - where no stronger pre-existing chunk owner exists, this change may derive a deterministic descriptor ID from immutable source revision + byte span + chunker revision + text checksum;
   - that descriptor remains source-grounded and replaceable if the document chunker contract changes;
   - it cannot become a symbol identity, packet identity, graph identity, or fusion identity by implication.

## Existing code-owner evidence

`structural-symbol.ts` already defines `TreesitterChunkerChunkV1` with:

- `upstream_node_id`
- `upstream_file_id`
- optional `upstream_symbol_id`
- `upstream_chunk_id`
- `source_ref`
- language / node type / kind / symbol name
- parent route/context
- `byte_start` / `byte_end`
- line bounds
- content hash
- calls/imports/exports

The structural contract states that Consiliency owns primary code structural/chunk/XRef evidence production; upstream IDs remain provenance/candidate join keys; GIS alone assigns stable symbol/version identity; chunks and graph cuts are replaceable retrieval projections and never canonical identity.

`treesitter-chunker-evidence-adapter.ts` already bridges `atlas.ast.evidence.v1` into that structural owner and emits `canonical_identity_created: false`.

## DIR-INDEX-02 task disposition

- `DIR-INDEX-02A`: `EXTEND` — define the source-grounded descriptor as a namespace-aware adapter/view. Do not create a new global code chunk owner.
- `DIR-INDEX-02B`: `PASS` — existing Tree-sitter/GIS/structural owner is identified and must be reused.
- `DIR-INDEX-02C`: `MISSING` — deterministic Markdown/API-doc segmentation still needs implementation/proof.
- `DIR-INDEX-02D`: `MISSING` — bounded JSON/YAML logical-object segmentation still needs implementation/proof or typed reject.
- `DIR-INDEX-02E`: `MISSING` — replay proof must cover descriptor ID, spans, checksums, and provenance.

## Required `CanonicalChunkV1` fields

The adapter/view should contain at minimum:

- `schema`
- `descriptorId`
- `namespace`
- `sourceRef`
- `sourceRevision`
- `workspaceRevision`
- `startByte`
- `endByte`
- `textChecksum`
- `chunkerRevision`
- `identityAuthority`
- optional `upstreamChunkId`
- optional `upstreamNodeId`
- optional `upstreamSymbolId`
- optional heading path / symbol metadata

`identityAuthority` must make the distinction observable, e.g. `UPSTREAM_STRUCTURAL_PROVENANCE` versus `SOURCE_GROUNDED_DESCRIPTOR`.

## Fail-closed rules

- Code chunks with missing native provenance may be represented as compatibility observations only if the existing adapter policy permits it; compatibility IDs cannot satisfy a canonical-identity gate.
- Descriptor byte spans must remain within the exact immutable source bytes for `sourceRevision`.
- `textChecksum` must be computed from the exact UTF-8 byte slice, not from reserialized/parser-normalized text.
- No heading parser, JSON parser, YAML parser, AST adapter, Qdrant point, Neo4j element, CandidateOrdinal, transport offset, or GPU ordinal may become canonical source/symbol identity.

## Next implementation frontier

1. Add namespace-aware `CanonicalChunkV1` descriptor contract in `packages/parent-atlas/src/core/`.
2. Add an adapter from existing `TreesitterChunkerChunkV1` / `atlas.ast.evidence.v1` output without changing upstream IDs.
3. Add deterministic Markdown section segmentation with byte-accurate UTF-8 spans and heading paths.
4. Add bounded JSON/YAML segmentation only where byte-accurate parser support is proven; otherwise typed reject.
5. Add fixed replay tests proving identical bytes + revisions + chunker revision produce identical descriptor IDs/spans/checksums/provenance.

No datastore, projection, cache, or model writes are authorized by this audit.
