# DIR-INDEX-00 — Ownership Audit

Status: `PASS_WITH_GUARDS`

Date: 2026-09-04

This audit is read-only architecture evidence for `parent-atlas-canonical-directory-ingestion-fabric`. It does not authorize database, Qdrant, Neo4j, Valkey, filesystem, or GPU writes.

## Frozen rule

The directory ingestion fabric may add deterministic inventory, source/chunk adapters, representation descriptors, and bounded orchestration only where no existing canonical owner exists. It must reuse existing identity, semantic, retrieval-fusion, graph, enrichment, context, and execution owners.

## Ownership matrix

| Capability | Existing owner / evidence | Classification | Directory-fabric action |
| --- | --- | --- | --- |
| Source/workspace identity | PostgreSQL canonical state plus Parent Atlas identity contracts (`SourceRef`, `SourceRevision`, `ChunkId`, symbol/packet IDs) | `EXTEND` | Define `SourceArtifactV1` only as an aggregate/view over existing canonical identifiers and immutable file bytes. Do not invent a new source revision algorithm where the existing owner already supplies one. |
| File inventory | Existing Graphify/code-ingestion pipeline and Stage-1 inventory work | `EXTEND` | Reuse proven path/exclude/revision rules; add a deterministic directory-facing inventory adapter only after exact owner readback. |
| Canonical chunk identity | PostgreSQL packet/chunk authority; GIS/Graphify identity; Tree-sitter byte-span evidence | `EXTEND` | `CanonicalChunkV1` must bind existing canonical chunk/symbol identity where available. Markdown/JSON/YAML chunks may add deterministic chunk identity only in namespaces not already owned by Graphify/GIS. |
| CST/AST observations | 8095 Tree-sitter + ast-grep; Graphify/GIS owns canonical symbol relationships | `REUSE` | Consume source spans and structural observations. Never let the directory chunker become a parser/symbol authority. |
| NLP/domain/concept enrichment | 8095/miniforge NLP sidecar + LangExtract-related producer contracts | `REUSE` | Invoke once per revision-qualified input/producer revision and persist as derived evidence only. |
| Ontology/KAG admission | Existing ontology kernel / linked-tuple admission owner | `REUSE` | Directory enrichment may nominate concepts/tuples but cannot self-admit ontology truth. |
| PostgreSQL lexical FTS | PostgreSQL 18 native FTS is the live lexical authority (`POSTGRES_FTS_AST` for current AST evidence) | `EXTEND` | Reuse canonical tables/queries where equivalent; add heading/path/tag weighting and GIN only after table-owner audit. PostgreSQL AIO/bitmap behavior stays planner-owned. |
| Canonical `semantic_768` | PostgreSQL `codebase_chunk_index.content_embedding_768` / frozen semantic-768 contract | `REUSE` | No second embedding owner. Materialize only against admitted canonical chunk bindings and existing semantic producer revision. |
| Qdrant dense projection | Existing rebuildable `semantic_768` projection under vector key `content` | `EXTEND` | Enrich payload lineage and optional sparse representation only after bounded round-trip proof. Qdrant IDs remain projection IDs. |
| Sparse retrieval | Existing lexical policy; sparse serving remains separate from Postgres canonical lexical authority | `EXTEND` | Add a revision-qualified BM25 serving projection only if deployment/producers are proven. Do not create a second fusion owner. |
| Retrieval normalization/fusion | SearchRuntime / existing RRF owner | `REUSE` | Directory-derived lanes normalize to canonical identity and contribute at most one vote per logical lane. |
| Candidate ordinals | Existing `CandidateOrdinal*` / candidate-feature execution fabric | `REUSE` | Feed the existing deterministic ordinal map; do not derive ordinals from Qdrant ordering, stream order, graph ordinals, or local executor IDs. |
| Graph truth / projection | Graphify/canonical relationship evidence; Neo4j is derived; cuGraph is executor/feature lane | `REUSE` | Consume canonical edges and project only through existing graph ownership paths. No summary/NLP-created graph truth when structural evidence exists. |
| BitFrost/Valkey | Revision/checksum-qualified cache for manifests, candidates, ACE cards, residency descriptors | `REUSE` | Cache descriptors/references only; never canonical source truth, tensors, KV cache, or hidden reasoning. |
| ContextManifest / ACE | Existing ACE context compiler / `ace-context-manifest` owner | `REUSE` | Directory fabric emits selected evidence refs/LODs into the existing context compiler rather than creating `ContextManifestV2` as a competing owner. Version extension requires compatibility proof. |
| PromptPlan / prefill / mutation workflow | `parent-atlas-agentic-file-compiler`: CandidateOrdinal -> ExactPromotion -> existing ContextManifest -> PromptPlanV1 -> PrefillArtifactV1 -> bounded mutation/validation/refresh | `REUSE` | Directory fabric stops at feeding the existing compiler. Any `PrefillReceiptV1` addition must extend the existing receipt lineage rather than fork it. |
| gRPC / A2A | Existing transport-memory-boundaries ownership: gRPC native polyglot compute, A2A independent-agent delegation, neither owns Parent Atlas identity | `REUSE` | Add adapters only after canonical contracts are proven. Protobuf/A2A IDs remain transport mappings, not canonical checksums/identity. |
| GPU tensor/execution provenance | Existing tensor/residency/execution contract work has overlapping contracts under audit | `SUPERSEDE_AFTER_PROOF` | Do not create another GPU artifact contract from this change yet. First select/extend the existing tensor artifact owner, then add CUDA toolkit/library/context provenance there. |

## Key overlap findings

### 1. `SourceArtifactV1` is an aggregate gap, not a new identity namespace

The repository already defines and uses `SourceRef`, `SourceRevision`, `ChunkId`, `PacketKey`, and symbol-version identity. The new contract may gather path/content metadata around those identities, but it must not redefine their semantics.

### 2. `CanonicalChunkV1` must be namespace-aware

For source code, GIS/Graphify/Tree-sitter already participate in canonical source/symbol/chunk binding. The directory fabric must reuse those bindings. For Markdown/API docs and bounded JSON/YAML subtrees, the fabric may define deterministic chunk IDs only when no existing canonical chunk owner is already assigned to that corpus.

### 3. The downstream agentic compiler already exists

`parent-atlas-agentic-file-compiler` already freezes the path:

```text
QueryClassificationV1
  -> FileMutationIntentV1
  -> existing retrieval CandidateOrdinal[]
  -> CandidateFeatureRowV1
  -> ExactPromotionV1
  -> existing ContextManifest compiler
  -> PromptPlanV1
  -> PrefillArtifactV1
  -> bounded workflow/mutation/validation
  -> incremental AST -> semantic_768 -> graph refresh
```

Therefore DIR-INDEX-12 must be integration with that owner, not creation of a parallel prefill stack.

### 4. GPU artifact contracts are already overlapping

The candidate-feature execution work records overlapping numeric-artifact contracts (`tensor-artifact-contract.ts`, `tensor-artifact-manifest-v1.ts`, `representation-artifact-v1.ts`, `artifact-work-item-v1.ts`) and explicitly warns against adding another contract before owner selection. DIR-INDEX-14 remains blocked on that owner-selection proof.

## Guard decisions

`DIR-INDEX-00C` passes only under these guards:

1. No new table or writer before an exact existing-owner/table census.
2. No new canonical `semantic_768` producer.
3. No new RRF/fusion owner.
4. No new Graphify/GIS symbol or graph-truth owner.
5. No new `ContextManifest` or prefill workflow owner.
6. No new GPU tensor artifact contract until the existing overlap is resolved.
7. Qdrant, Neo4j, cuVS/cuGraph, Valkey, A2A, gRPC, Arrow/mmap, and CUDA IPC remain projections/executors/transports and never identity owners.

## Safe implementation frontier

The next safe work is narrower than the original proposal implied:

```text
DIR-INDEX-01
  deterministic inventory adapter
      -> existing SourceRef/SourceRevision semantics

DIR-INDEX-02
  deterministic document chunk adapter
      -> existing canonical source/chunk/symbol bindings where present

DIR-INDEX-03
  RepresentationDescriptorV1 registry/view
      -> references existing representation owners

DIR-INDEX-04
  audit/extend PostgreSQL FTS over admitted chunks
```

Do not start DIR-INDEX-05+ bulk writes until 01-04 have read-only replay and identity proofs.

## Promotion verdict

- `DIR-INDEX-00A`: `PASS` — relevant code-ingestion, transport/memory, semantic, retrieval, NLP, candidate-feature, and agentic-file-compiler ownership was reviewed.
- `DIR-INDEX-00B`: `PASS` — matrix above records `REUSE`/`EXTEND`/`SUPERSEDE_AFTER_PROOF` decisions.
- `DIR-INDEX-00C`: `PASS_WITH_GUARDS` — implementation is safe only while the guard decisions above remain enforced.

Next gate: `DIR-INDEX-01A..D` as a read-only deterministic inventory proof. No production writes are authorized by this audit.
