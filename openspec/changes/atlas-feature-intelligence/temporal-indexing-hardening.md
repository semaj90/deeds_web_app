# Parent Atlas Temporal Incremental Indexing — Hardening Policy

Status: `WRITTEN_UNPROVEN`

## Principle

Daily Graphify MUST derive a revision-qualified `SourceRevisionDeltaV1[]` before structural, semantic, graph, or GPU projection work. Unchanged source identities are reused; changed identities are recomputed according to the narrowest safe invalidation boundary.

```text
previous source snapshot
        │
        ▼
content/revision diff
        │
        ▼
SourceRevisionDeltaV1[]
        │
        ├ UNCHANGED ───────────────▶ REUSE
        ├ ADDED ───────────────────▶ PARSE + EMBED + UPSERT
        ├ MODIFIED ────────────────▶ INCREMENTAL PARSE + RE-EMBED CHANGED CHUNKS
        ├ MOVED ───────────────────▶ REBIND SOURCE + REVALIDATE IDENTITY
        └ DELETED ─────────────────▶ TOMBSTONE + DELETE PROJECTIONS
```

## Modality owners

```text
CODE SYNTAX
  Tree-sitter

CODE CHUNK/XREF PROVENANCE
  treesitter-chunker / Consiliency

TYPESCRIPT SEMANTICS
  ts-morph batch project
  later tsserver/LSP for interactive open-buffer state

STRUCTURAL PATTERN RECOGNITION
  ast-grep

NATURAL-LANGUAGE POS/DEPENDENCIES
  Stanza

GROUNDED MODEL EXTRACTION
  LangExtract

DETERMINISTIC RULE DERIVATION
  Soufflé

DEEP DATAFLOW/TAINT
  CodeQL

IMAGE OBJECT RECOGNITION
  model-specific TorchVision / NVIDIA TAO / TensorRT inference adapter
```

No recognizer is a canonical identity owner. Every observation carries source/model/revision provenance and is promoted only through Atlas validation policy.

## Incremental structural parsing

For `MODIFIED` code sources, the Node Tree-sitter owner SHOULD:

1. edit the previous tree using exact source edit coordinates;
2. parse the new source with the old edited tree;
3. compute changed structural ranges;
4. rerun structured-value extraction only for changed/invalidated structural regions plus required parent/container context;
5. rerun ts-morph semantics for exact changed spans plus TypeScript semantic dependents when type effects can propagate.

A missing or stale previous tree falls back to `FULL_REPARSE` and is recorded in the daily receipt.

## Semantic vector projection

`semantic_768` remains the canonical semantic representation. Unchanged chunk identities keep their existing embedding rows. Added/modified chunks are embedded and upserted. Deleted chunks are deleted/tombstoned in projections.

Do not upsert an unchanged Qdrant point merely because a daily job ran; Qdrant upsert is itself a write and should be avoided when the application content/revision checksum is unchanged.

## Graph projection / PageRank

Graph edge deltas may be applied incrementally to the revisioned graph projection, but PageRank is treated as globally coupled. If graph topology changed:

```text
previous PageRank vector
        │
        └── initial guess only
                │
new complete graph revision
                │
                ▼
         full PageRank solve
```

The previous scores are a warm start/performance optimization, not carried-forward truth.

## CAGRA

CAGRA index extension is admitted only for pure additions. Any modified, moved, or deleted semantic row creates a new CAGRA generation in the reference policy. Exact cuVS retrieval remains the Recall@K oracle.

## Compression and deduplication

Logical deduplication happens before physical compression:

```text
logical artifact
   │
   ├ SHA-256 content identity / reuse
   ├ dictionary encoding for repeated categorical values
   ├ run-end encoding for long repeated runs
   ├ bit packing / CSR / COO for sparse binary support
   └ Arrow IPC buffer compression: ZSTD or LZ4
```

Atlas MUST NOT define a custom Huffman wire/storage format. Huffman may be used internally by a standard codec such as Zstandard, but it does not participate in canonical identity.

## GPU graph JSON

JSON/JSONL is an ingress/debug/log representation only:

```text
revisioned graph JSONL
        │
        ▼
cuDF typed DataFrame
        │
        ▼
cuGraph edge list
        │
        ▼
PageRank / PPR / traversal / sampling
```

Canonical N-ary relationships remain source-grounded relation/member facts. cuGraph consumes a projection.

## Image/object observations

Image object detection is a separate observation lane:

```text
image source_ref + source_revision + checksum
        │
        ▼
vision detector runtime
        │
        ▼
class + confidence + xyxy box + model revision
        │
        ▼
VisualObjectObservationV1
        │
        ▼
claim/evidence validator
```

A detected object is not automatically an ontology entity or HyperGraph relationship. Linking it to an existing entity requires an explicit identity-resolution/promote step.

## Daily structural validation

Every daily source snapshot MUST emit `StructuralSnapshotValidationReceiptV1` containing at least:

- workspace and source snapshot revisions;
- total/changed/validated source counts;
- native vs degraded provenance counts;
- tombstone count;
- changed-range count;
- row identity checksum;
- structural snapshot checksum;
- change-set checksum;
- status and diagnostics.

`VALID` requires coverage of the entire resulting snapshot, even though most unchanged source rows may be validated by revision/checksum reuse rather than reparsing.

## Proof sequence

```text
TI-0 source revision delta contract           WRITTEN_UNPROVEN
TI-1 content-addressed dedupe policy          WRITTEN_UNPROVEN
TI-2 incremental Tree-sitter changed ranges   WRITTEN_UNPROVEN
TI-3 ts-morph dependent closure               WRITTEN_UNPROVEN
TI-4 changed-chunk semantic/Qdrant updates    WRITTEN_UNPROVEN
TI-5 graph delta + PageRank warm start        WRITTEN_UNPROVEN
TI-6 CAGRA addition/rebuild policy            WRITTEN_UNPROVEN
TI-7 visual observation lane                  WRITTEN_UNPROVEN
TI-8 daily structural validation receipt      WRITTEN_UNPROVEN
TI-9 live Graphify daily integration          PENDING
TI-10 workstation delta/reuse benchmark       PENDING
```
