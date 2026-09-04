# Parent Atlas — Canonical Directory Ingestion Fabric

## Status

Proposed integration spine. This change defines a single revision-qualified directory ingestion fabric that produces many derived retrieval representations from one canonical source/chunk identity. It does not authorize a second canonical identity owner, a second fusion owner, or a transport-specific truth store.

## Why

Parent Atlas currently has mature but separately evolved paths for lexical retrieval, semantic retrieval, Graphify/AST evidence, NLP enrichment, OpenSpec/task evidence, graph projection, GPU execution, ACE context assembly, and model synthesis. The missing unifier is not another index. It is one deterministic ingestion fabric whose canonical source and chunk identities are reused by every derived representation.

The invariant for this change is:

> Index canonically once per source revision; enrich once per producer revision; project into many retrieval/execution representations; fuse by canonical candidate identity; assemble one bounded evidence context; never allow a projection, executor, transport, or model to invent a second source identity.

## Scope

This change introduces or freezes the contracts and proof gates for:

- deterministic directory inventory and `SourceArtifactV1`;
- language-aware, byte-accurate `CanonicalChunkV1` segmentation;
- `RepresentationDescriptorV1` as the common derived-representation registry;
- PostgreSQL 18 as durable source/chunk/lexical authority with GIN-backed FTS;
- `semantic_768` materialization against the existing canonical semantic contract;
- Qdrant dense/sparse serving projection without Qdrant-owned identity;
- AST, NLP, ontology, graph, summary, OpenSpec/task, and LOD enrichments keyed by source/chunk revision;
- `CandidateOrdinalMapV1` and `CandidateFeatureSnapshotV1` as the frozen retrieval population boundary;
- `ContextManifestV2 -> ACE -> SmartRpcPacketV1 -> PromptPlanV1 -> Ornith :8090` bounded prefill assembly;
- revision-qualified incremental invalidation and tombstones;
- `GpuTensorArtifactV1` / GPU execution provenance, including CUDA execution-context/toolchain identity;
- A2A/gRPC adapters as transport projections only.

## Frozen ownership boundaries

- Source bytes and canonical source/chunk identity: PostgreSQL durable authority plus immutable source content/revision evidence.
- PostgreSQL FTS: lexical reference/authority lane; PostgreSQL 18 planner/AIO behavior remains PostgreSQL-owned and is not wrapped as a Parent Atlas-specific AIO retriever.
- `semantic_768`: one logical semantic representation. pgvector exact, Qdrant HNSW, cuVS brute force, CAGRA, IVF-PQ, or TurboVec are executors/projections, not additional semantic lanes.
- Qdrant: rebuildable dense/sparse serving projection and metadata filtering; never source identity authority.
- Neo4j: rebuildable graph topology projection; never canonical source/chunk authority.
- cuGraph: graph execution only.
- cuVS: vector execution only; brute force is the exact GPU oracle, CAGRA/IVF-PQ are challengers until frozen recall/latency/VRAM gates pass.
- 8095 NLP sidecar: revision-qualified enrichment producer only.
- Valkey/BitFrost: hot revision-qualified descriptors/cache only.
- Go Retrieval/SearchRuntime: retrieval orchestration, logical-lane dedup, candidate normalization, and the existing fusion owner.
- ACE: selects bounded evidence/LOD and compiles references; it does not own source truth.
- Ornith `:8090`: synthesis only.
- A2A/gRPC/ACP/HTTP: transport bindings only; no transport may become the canonical packet checksum or source identity format.

## Initial source namespaces

The first bounded corpus SHOULD cover deterministic subsets of:

- `next_steps/` or the repo's current next-step evidence location;
- memory/evidence documents;
- `docs/` and API documentation;
- `openspec/`;
- selected `src/` / `sveltekit-frontend/src/` source roots.

The exact roots MUST be declared in a versioned inventory policy. Hidden files, generated outputs, vendored dependencies, model binaries, caches, build artifacts, and submodules require explicit classification rather than accidental traversal.

## Canonical source identity

`SourceArtifactV1` MUST record at least:

```text
sourceRef
relativePath
contentHash
sourceRevision
byteLength
workspaceRevision
parserRevision
producerRevision
language?
extension?
mimeType?
mtimeDiagnosticOnly?
```

`sourceRevision` MUST derive from immutable source bytes or an already-proven canonical source-revision owner. `mtime` MUST NOT be used as source revision authority.

## Canonical chunk identity

`CanonicalChunkV1` MUST preserve byte-accurate source provenance:

```text
chunkId
sourceRef
sourceRevision
workspaceRevision
startByte
endByte
textChecksum
headingPath?
stableSymbolId?
symbolVersionId?
treeNodeId?
astPath?
chunkerRevision
```

Markdown/document chunking SHOULD follow heading/section/code-example boundaries. Source code SHOULD follow module/class/function/symbol spans where structurally valid. JSON/YAML SHOULD use bounded logical objects/subtrees. Unsupported or ambiguous segmentation MUST fail explicitly rather than fabricate symbol ownership.

## Representation registry

Every derived representation MUST bind back to one canonical chunk/source revision using `RepresentationDescriptorV1` or a contract proven equivalent:

```text
representationId
representationRevision
sourceRef
sourceRevision
chunkId
kind
producerRevision
checksum
projectionRefs?
```

Initial `kind` values:

```text
LEXICAL_FTS
LEXICAL_TRIGRAM
SPARSE_BM25
SEMANTIC_768
AST
NLP
ONTOLOGY
GRAPH
SUMMARY
LOD
OPENSPEC_TASK
```

A representation materializer MUST be idempotent over the logical key `(chunkId, sourceRevision, kind, producerRevision)` and MUST NOT create a new source identity.

## Lexical boundary

The PostgreSQL reference lexical document SHOULD combine weighted path, heading, symbol name, body text, tags, and admitted concept labels into a `tsvector` and use GIN. `pg_trgm` is reserved for filename/identifier substring and typo-oriented retrieval; it is not the primary lexical ranker.

PostgreSQL 18 AIO/bitmap behavior remains an implementation detail of the PostgreSQL planner and server configuration. Parent Atlas supplies correct predicates/indexes and records query receipts; it does not introduce `ParentAtlasAioBitmapRetriever`.

## Dense/sparse boundary

Canonical semantic meaning remains `semantic_768`; dtype/compression variants MUST be named derived representations rather than silently changing canonical semantics, e.g.:

```text
semantic_768_fp32  canonical representation semantics
semantic_768_half  derived compact search projection
```

Qdrant MAY store named dense and sparse vectors on the same logical point, but sparse-vector production MUST carry its own algorithm/tokenizer/producer revisions. Server-side inference availability MUST NOT become a correctness dependency.

## Retrieval/fusion boundary

Each logical retrieval lane deduplicates canonical candidates before fusion. Executor multiplicity cannot create vote inflation.

```text
semantic_768 lane
  -> pgvector exact | Qdrant | cuVS brute force | CAGRA | IVF-PQ | TurboVec
  -> one logical semantic contribution
```

The existing SearchRuntime/RRF owner remains the only fusion owner. `CandidateOrdinalMapV1` freezes the admitted candidate population/identity map before GPU/ranking stages.

## Context/LOD boundary

Derived summaries SHOULD support progressive retrieval levels rather than whole-file injection:

```text
LOD0 identity/path
LOD1 one-line summary/tags
LOD2 symbol/section summary
LOD3 exact relevant source span
LOD4 bounded neighbors
LOD5 whole file, rare and explicit
```

ACE chooses the least expensive sufficient evidence level and emits references/checksums. `SmartRpcPacketV1` MUST remain reference-oriented rather than becoming a giant text blob.

## GPU execution provenance

Tensor identity and execution identity are distinct. `GpuTensorArtifactV1` identifies immutable tensor content/layout/representation. A GPU execution receipt MUST additionally bind execution environment information sufficient for replay analysis, including applicable CUDA toolkit/runtime/driver, library revisions, compute capability, default-vs-Green execution context class, and kernel binary checksum where custom kernels are involved.

CUDA IPC/VMM handles are process-local execution details. Raw CUDA handles MUST NOT become durable `SmartRpcPacketV1`, A2A, or canonical gRPC identity fields.

## A2A/gRPC boundary

Parent Atlas canonical contracts remain independent of A2A protobuf serialization. A2A `Task`, `Message`, and `Artifact` semantics are adapter concerns. Durable Parent Atlas results/receipts SHOULD map to A2A artifacts or durable task state; progress/control messages MUST NOT be the sole persistence mechanism for critical prefill or GPU evidence.

## Out of scope

- replacing the existing semantic-768 canonical contract;
- promoting CAGRA/IVF-PQ/TurboVec without frozen parity gates;
- changing RRF ownership or allowing one executor to create an extra vote;
- making Qdrant, Neo4j, Valkey, cuVS, A2A, protobuf, JSON, mmap, Arrow, CUDA IPC, or ACP the canonical source identity owner;
- daily full re-indexing as the normal path;
- direct patch writing by Graphify or repair-context generation.
