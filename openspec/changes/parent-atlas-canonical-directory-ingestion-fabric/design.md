# Parent Atlas — Canonical Directory Ingestion Fabric Design

## Architectural shape

```text
Directory / repo / docs / OpenSpec / API corpus
                    |
          deterministic inventory
                    |
             SourceArtifactV1
                    |
          revision-aware segmenter
                    |
             CanonicalChunkV1
                    |
       +------------+----------------+
       |            |                |
       v            v                v
 PostgreSQL      Enrichment       Representations
 authority          DAG
       |            |                |
       |      AST / NLP / KAG        +-- semantic_768
       |      summary / tasks        +-- lexical document
       |      OpenSpec facts         +-- structural facts
       |                             +-- LOD summaries
       |
       +------------ derived projections -------------+
       v                    v                          v
    Qdrant                Neo4j                 GPU indexes
 dense + sparse         topology               cuVS/cuGraph
       |                    |                          |
       +-------------- SearchRuntime ----------------+
                              |
                    logical-lane dedup
                              |
                       existing RRF owner
                              |
                    CandidateOrdinalMapV1
                              |
                  CandidateFeatureSnapshotV1
                              |
                      exact promotion
                              |
                    ContextManifestV2
                              |
                         ACE selection
                              |
                     SmartRpcPacketV1
                              |
                        PromptPlanV1
                              |
                        Ornith :8090
                              |
                       PrefillReceiptV1
```

## Core contracts

### SourceArtifactV1

```ts
export interface SourceArtifactV1 {
  schema: 'parent_atlas.source_artifact.v1';
  sourceRef: string;
  relativePath: string;

  contentHash: string;
  sourceRevision: string;
  workspaceRevision: string;

  byteLength: number;
  language?: string;
  extension?: string;
  mimeType?: string;

  parserRevision: string;
  producerRevision: string;

  // Diagnostics only. Never a revision authority.
  mtimeDiagnosticOnly?: string;
}
```

### CanonicalChunkV1

```ts
export interface CanonicalChunkV1 {
  schema: 'parent_atlas.canonical_chunk.v1';
  chunkId: string;

  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;

  startByte: number;
  endByte: number;
  textChecksum: string;

  headingPath?: string[];
  stableSymbolId?: string;
  symbolVersionId?: string;
  treeNodeId?: string;
  astPath?: string[];

  chunkerRevision: string;
}
```

The canonical row MAY store or reference source/chunk text, but identity MUST NOT depend on mutable text copies outside the source-revision boundary.

### RepresentationDescriptorV1

```ts
export type RepresentationKindV1 =
  | 'LEXICAL_FTS'
  | 'LEXICAL_TRIGRAM'
  | 'SPARSE_BM25'
  | 'SEMANTIC_768'
  | 'AST'
  | 'NLP'
  | 'ONTOLOGY'
  | 'GRAPH'
  | 'SUMMARY'
  | 'LOD'
  | 'OPENSPEC_TASK';

export interface RepresentationDescriptorV1 {
  schema: 'parent_atlas.representation_descriptor.v1';
  representationId: string;
  representationRevision: string;

  sourceRef: string;
  sourceRevision: string;
  chunkId: string;

  kind: RepresentationKindV1;
  producerRevision: string;
  checksum: string;

  projectionRefs?: {
    postgres?: string;
    qdrant?: string;
    neo4j?: string;
    gpuOrdinal?: number;
    bitfrost?: string;
  };
}
```

Logical materialization identity:

```text
(chunkId, sourceRevision, kind, producerRevision)
```

Physical projection identifiers are replaceable and MUST NOT be used as canonical candidate identity.

### GpuExecutionEnvironmentV1

```ts
export interface GpuExecutionEnvironmentV1 {
  schema: 'parent_atlas.gpu_execution_environment.v1';

  cudaToolkitVersion?: string;
  cudaRuntimeVersion?: string;
  cudaDriverVersion?: string;

  cublasVersion?: string;
  cuvsVersion?: string;
  cugraphVersion?: string;

  deviceComputeCapability: string;
  contextClass: 'DEFAULT' | 'GREEN';
  contextIdentity?: string;

  kernelBinaryChecksum?: string;
}
```

This contract describes execution provenance. It is not part of tensor semantic identity unless the tensor bytes themselves differ.

## PostgreSQL lexical design

The first implementation SHOULD use a generated or materialized `tsvector` equivalent to:

```sql
setweight(to_tsvector('simple',  coalesce(relative_path, '')), 'A') ||
setweight(to_tsvector('english', coalesce(heading_text, '')),  'A') ||
setweight(to_tsvector('simple',  coalesce(symbol_name, '')),   'A') ||
setweight(to_tsvector('english', coalesce(body_text, '')),     'B') ||
setweight(to_tsvector('simple',  coalesce(tag_text, '')),      'C')
```

and a GIN index on that document. Exact schema names are deferred to repository schema-owner inspection. The change MUST reuse an existing canonical chunk/source table if one already owns the same logical identity rather than creating a duplicate table by default.

`pg_trgm` may be added for partial identifiers, path fragments, misspellings, and symbol substrings after a bounded query set demonstrates value.

## Semantic design

`semantic_768` is one logical representation. The directory fabric materializes it once per admitted source/chunk/producer revision and may create multiple physical serving projections.

```text
semantic_768
  canonical/reference metadata -> PostgreSQL
  persistent serving           -> Qdrant
  exact GPU oracle             -> cuVS brute force
  ANN challenger               -> CAGRA
  compressed challenger        -> IVF-PQ + exact refinement
```

No executor creates a second RRF vote. Half-precision or quantized forms require a distinct representation/projection descriptor and checksum.

## Sparse design

The sparse production receipt MUST state algorithm, tokenizer/normalization revision, producer revision, source revision, and chunk identity. Qdrant may host the sparse vector, but Qdrant server-side inference is optional. The ingestion fabric remains capable of producing sparse vectors outside Qdrant.

## Enrichment DAG

Each enrichment node is incremental and revision-qualified:

```text
CanonicalChunkV1
  +-> lexical document
  +-> semantic_768
  +-> AST/symbol facts
  +-> NLP entities/domain concepts
  +-> ontology nominations/linked tuples
  +-> graph edge observations
  +-> section/file summaries
  +-> OpenSpec/task observations
  +-> LOD artifacts
```

An enrichment failure MUST be isolated to the representation kind/producer revision and MUST NOT invalidate the canonical source/chunk row unless the source/chunk contract itself is invalid.

## OpenSpec / next-step evidence

Task-like documents are first-class evidence, not prompt boilerplate. The first parser SHOULD normalize fields such as:

```text
status
owner
openspecChange
dependency
blocker
proof
safeNextCommand
reportPath
```

into a `NextStepObservationV1`-equivalent derived representation and optionally a `KanbanTaskV1` projection. LLM synthesis may recommend status changes but MUST NOT promote prose to canonical status without an admitted state owner/receipt.

## Incremental invalidation

Normal operation:

```text
inventory source
  content hash unchanged -> zero representation work
  content hash changed   -> new sourceRevision
                         -> rechunk
                         -> rematerialize only dependent representations
  source removed         -> revision-qualified tombstone
```

A full daily rebuild is a maintenance/recovery operation, not the default correctness path.

## Retrieval and ordinals

Every lane returns observations that resolve to canonical candidate identity. Before GPU/ranking stages, build a deterministic `CandidateOrdinalMapV1` over the frozen admitted population. All exact/ANN executor comparisons MUST use the same map and population revision.

Within-lane dedup happens before fusion. Executor choice is captured in diagnostics/receipts and never changes the logical lane count.

## Context assembly

`ContextManifestV2` records selected canonical evidence, representation revisions, LOD levels, checksums, and token budget. ACE emits a compact `SmartRpcPacketV1` with references. The assembler expands only selected evidence into `PromptPlanV1`.

Critical evidence MUST remain recoverable from durable artifact/receipt state; A2A streaming messages or transport-local buffers are insufficient persistence.

## GPU/tensor boundary

Use three separate identities:

```text
TensorIdentity
ExecutionIdentity
PrefillIdentity
```

Conceptual checksum hierarchy:

```text
GpuTensorArtifactV1
  = tensor bytes + shape + dtype + layout + representation revision

GpuExecutionReceiptV1
  = input artifact checksums
  + executor revision
  + algorithm parameters
  + CUDA execution environment
  + kernel/library revisions

PrefillReceiptV1
  = ContextManifest checksum
  + PromptPlan checksum
  + model revision
  + adapter revision
  + evidence revisions
  + execution receipt references
```

Raw CUDA IPC/VMM handles are ephemeral execution descriptors. Durable contracts carry artifact/lease references and reproducible provenance, never bare process-local handles.

## Transport mapping

### gRPC

Use small typed control envelopes and references for large immutable tensors/artifacts. Existing Arrow/mmap/CUDA-local mechanisms remain bulk transport/execution details behind the compute adapter.

### A2A

Map Parent Atlas durable results to task/artifact semantics; use messages for request/control/progress where appropriate. The A2A proto/binding is an external serialization contract, not Parent Atlas checksum authority.

### SmartRpcPacketV1

Keep small and reference-oriented:

```text
requestId
query/intent reference
candidateSnapshotRevision
ordinalMapChecksum
selectedEvidence[] {
  ordinal
  packetKey/sourceRef/chunkId
  representationRevision
  lod
  evidenceChecksum
}
tokenBudget
goal
gpuArtifactRef?
gpuExecutionReceiptRef?
```

## Proof strategy

No projection write is promoted from this design alone. Each DIR-INDEX gate requires a bounded dry-run/read-only audit first, then a separately explicit write gate where persistence is required. Existing canonical owners win over proposed duplicate tables or writers.
