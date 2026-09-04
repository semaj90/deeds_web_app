# DIR-INDEX-03 — Representation ownership audit

Status: `PASS_WITH_SCOPE_GUARD`

Date: 2026-09-04

## Finding

The repository already has `sveltekit-frontend/src/lib/server/atlas/tensors/representation-artifact-v1.ts` for corpus/tensor-level representation artifacts. That contract owns frozen representation-family metadata such as representation ID/revision, dimensions, dtype, normalization, producer/model/transform revision binding, population checksums, and `canonicalAuthority: false`.

DIR-INDEX-03 MUST NOT replace or fork that artifact contract.

The missing layer is a lightweight **per-source-grounded representation descriptor registry** that attaches lexical, semantic, AST, NLP, ontology, graph, summary, LOD, and OpenSpec-task outputs to an existing source-grounded chunk descriptor.

## Scope distinction

`RepresentationArtifactV1`
- corpus/run/family-level artifact
- tensor/model/transform provenance
- population-level digests/counts
- noncanonical derived artifact

`RepresentationDescriptorV1`
- per source-grounded chunk descriptor
- identifies representation kind + producer revision + representation revision
- binds checksum and optional projection references
- carries dependency/invalidation metadata
- cannot claim source/symbol/chunk/fusion authority

The descriptor MAY reference a `RepresentationArtifactV1` by opaque evidence/projection reference where appropriate, but it cannot restate that artifact as canonical identity.

## Frozen kinds

Initial registry kinds:

- `LEXICAL_FTS`
- `LEXICAL_TRIGRAM`
- `SPARSE_BM25`
- `SEMANTIC_768`
- `AST`
- `NLP`
- `ONTOLOGY`
- `GRAPH`
- `SUMMARY`
- `LOD`
- `OPENSPEC_TASK`

## Logical idempotency

The initial logical idempotency key is:

`(chunkDescriptorId, sourceRevision, kind, producerRevision)`

A replay with the same logical key and identical normalized descriptor is idempotent.

A second descriptor with the same logical key but different representation revision, checksum, projection reference set, or dependency metadata is a conflict and MUST fail closed with a duplicate-owner/conflicting-replay error.

This key intentionally does not make a datastore projection ID authoritative.

## Projection references

Projection references are optional locator metadata only, such as:

- PostgreSQL row/key
- Qdrant collection/point
- Neo4j element
- Valkey/BitFrost key
- cuVS/cuGraph artifact/ordinal receipt
- external artifact receipt

They MUST have `canonicalAuthority: false` semantics and may be rebuilt without changing source/chunk identity.

## Dependency and invalidation metadata

Each descriptor should carry explicit revision dependencies sufficient to determine whether it is stale. At minimum the registry supports dependencies on:

- source revision
- workspace revision
- chunker revision
- producer revision
- optional input representation revision(s)
- optional model/policy/ontology/graph revision(s)

The registry does not execute invalidation; DIR-INDEX-13 will own incremental invalidation execution. DIR-INDEX-03 only makes dependency metadata explicit and deterministic.

## Ownership guards

- No second `semantic_768` producer is created here.
- No second RRF/fusion owner is created here.
- No Qdrant/Neo4j/Valkey/GPU/transport identifier becomes canonical identity.
- No replacement for `RepresentationArtifactV1` is created.
- No database writer/table is authorized by this audit.

## DIR-INDEX-03 disposition

- `DIR-INDEX-03A`: implement `RepresentationDescriptorV1` and frozen initial kinds.
- `DIR-INDEX-03B`: implement logical idempotency and conflicting duplicate-owner rejection.
- `DIR-INDEX-03C`: prove projection references are noncanonical locators only.
- `DIR-INDEX-03D`: implement deterministic dependency/invalidation metadata.

Promotion gate remains `REPRESENTATION_REGISTRY_PASS` and must come from executable proof, not this audit alone.
