# Parent Atlas Production-Hardening DAG — Dependency Syntax

Status: `WRITTEN_UNPROVEN`

This document distinguishes four edge meanings that MUST NOT be conflated in implementation diagrams or orchestration code.

## Edge legend

```text
A ──depends-on──▶ B
```

`B` may execute only after `A` has produced the required validated receipt/artifact for the same revision scope.

```text
A ──projects-to──▶ B
```

`B` is a noncanonical view/materialization of `A`; projection does not transfer identity ownership.

```text
A ──streams-as──▶ B
```

An already-owned internal event is serialized into an external protocol event. This is not a DAG dependency for unrelated internal work.

```text
A ──authorizes──▶ B
```

`A` is explicit authorization/validation evidence required for a mutating `B`. A state such as A2A `AUTH_REQUIRED` never satisfies this edge.

---

## Capability proof vs daily data proof

The bounded SV-4/SV-6 fixture proves that the implementation path is capable of preserving:

- Node Tree-sitter source spans and ordering;
- exact-span upstream treesitter-chunker provenance attachment;
- exact UTF-8 byte ↔ UTF-16 ts-morph enrichment;
- nested Arrow IPC file serialization;
- PyArrow mmap reconstruction/checksum parity.

It is a **capability receipt**, not the daily source-snapshot validation receipt.

```text
StructuredValueCrossRuntimeProofV1
        capability proof
              │
              ├── required before enabling native TS/JS structured pipeline
              │
              └── does NOT authorize a daily source-snapshot projection by itself
```

Every Graphify daily run still requires revision-qualified observations for the data it is about to project:

```text
source_snapshot_revision
        │
        ▼
StructuralSnapshotValidationReceiptV1
        │
        ├ source_ref/source_revision coverage
        ├ native/degraded provenance counts
        ├ AST/structured-value validation
        └ row/source identity checksum
```

---

## Correct production flow

```text
CAPABILITY GATES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SV-4/SV-6 cross-runtime capability proof
GPU executor capability/parity proofs
A2A v1 wire-schema proof
        │
        ▼
capabilities admitted for use


DAILY REVISIONED DATA DAG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Repository/source snapshot
        │
        ▼
STRUCTURAL_REFRESH
Tree-sitter / treesitter-chunker / ast-grep / ts-morph
        │
        ▼
StructuralSnapshotValidationReceiptV1
        │
        ├──────────────depends-on──────────────┐
        ▼                                      ▼
SEMANTIC_768_REFRESH                    GRAPH_REFRESH
        │                               AST/N-ary graph
        ▼                                      │
SemanticSnapshotReceiptV1                     ▼
                                        GraphSnapshotReceiptV1
        │                                      │
        ├────────────────┬─────────────────────┘
        ▼                ▼
CUVS_EXACT_ORACLE     PageRank/PPR
        │                │
        ▼                │
CAGRA_CHALLENGER         │
        │                │
        └────────┬───────┘
                 ▼
       FeatureSignalAlignmentV1
                 │
                 ▼
         RetrievalParityReceiptV1
                 │
                 ├──authorizes──▶ QDRANT_PROJECTION_APPLY
                 │
                 ├──projects-to──▶ FEATURE_KANBAN_REFRESH
                 │
                 ├──projects-to──▶ WORKFLOW_KANBAN_REFRESH
                 │
                 └──projects-to──▶ PARENT_ATLAS_STUDIO_REFRESH
```

`CAGRA_CHALLENGER` MUST NOT execute as the correctness oracle. The semantic lane remains one logical vote; cuVS exact/Qdrant/CAGRA are executors or projections within that lane.

---

## Workflow events and A2A streaming are orthogonal to the materialization chain

Every internal stage emits ordered `WorkflowActionEventV1` records as it progresses:

```text
STRUCTURAL_REFRESH ───────┐
SEMANTIC_768_REFRESH ─────┤
GRAPH_REFRESH ────────────┤
CUVS_EXACT_ORACLE ────────┤
CAGRA_CHALLENGER ─────────┤
QDRANT_PROJECTION_APPLY ──┤
KANBAN_REFRESH ───────────┤
STUDIO_REFRESH ───────────┘
                         │
                         ▼
                WorkflowActionEventV1
                         │
                         ├──projects-to──▶ operational workflow board
                         │
                         ├──projects-to──▶ Parent Atlas Studio live workflow view
                         │
                         └──streams-as───▶ A2A v1 Task/Status/Artifact events
```

A2A streaming therefore occurs **during the workflow**, not only after Studio refresh.

The external A2A stream is a transport projection of internal workflow progress. It never becomes the ordering or authorization owner for the internal DAG.

---

## A2A v1 production wire shape

Use release/spec `1.0.0`, but advertise `AgentInterface.protocolVersion = "1.0"`.

Core binding names:

```text
JSONRPC
GRPC
HTTP+JSON
```

A `Task` carries:

```text
id
contextId?
status
artifacts?
history?
metadata?
```

Atlas workflow/action/revision fields belong in `metadata` rather than flattening them into the A2A Task object.

A `Part` has exactly one content member:

```text
text | raw | url | data
```

Streaming uses `StreamResponse` oneof members:

```text
task
message
statusUpdate
artifactUpdate
```

Do not emit legacy v0.x `kind` discriminators or `final` status-event fields.

`TASK_STATE_INPUT_REQUIRED` and `TASK_STATE_AUTH_REQUIRED` are interrupted states. Neither is a mutation-authorization receipt.

---

## Promotion / APPLY gate

A production write must satisfy the target's exact gate.

```text
QDRANT_PROJECTION_APPLY
    requires RetrievalParityReceiptV1
    + source/semantic revision equality
    + exact oracle evidence

GPU_CODEBASE_INDEX APPLY
    additionally requires GpuResourceAdmissionReceiptV1

NATIVE_STRUCTURAL APPLY
    requires native provenance readiness
    + zero forbidden compatibility-ID promotion
    + per-snapshot validation receipt

FILE MUTATION APPLY
    requires AgenticFileMutationPlanV1
    + exact-promotion receipt
    + before-image CAS
    + validators
```

No A2A status transition, Kanban card state, Studio UI action, PageRank score, ANN result, model diagnosis, or QAS recommendation substitutes for these receipts.

---

## Recommended Graphify daily stage syntax

```text
REPOSITORY_PROVENANCE_DRY_RUN
        │
        ▼
STRUCTURAL_REFRESH
        │
        ▼
STRUCTURAL_VALIDATE
        │
        ├───────────────┐
        ▼               ▼
SEMANTIC_REFRESH     GRAPH_REFRESH
        │               │
        ▼               ▼
SEMANTIC_VALIDATE    GRAPH_VALIDATE
        │               │
        ├───────┬───────┘
        ▼       ▼
CUVS_EXACT   GRAPH_RANK
        │       │
        ▼       │
CAGRA        PageRank/PPR
        └───┬───┘
            ▼
FEATURE_ALIGNMENT
            │
            ▼
RETRIEVAL_PARITY
            │
            ├── QDRANT_PROJECT
            ├── FEATURE_KANBAN_REFRESH
            ├── WORKFLOW_KANBAN_REFRESH
            └── STUDIO_REFRESH
```

Each stage emits `WorkflowActionEventV1`; any configured remote observer receives the corresponding A2A wire projection in sequence.

---

## Proof status

This document defines the intended production syntax only. Until the Graphify daily owner consumes these typed receipts and a workstation run demonstrates the full revision-qualified sequence, status remains `WRITTEN_UNPROVEN`.
