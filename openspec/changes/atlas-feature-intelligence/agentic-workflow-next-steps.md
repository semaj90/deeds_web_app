# Parent Atlas agentic workflow control-plane proof ladder

## Authority split

`WorkflowActionEventV1` remains the internal ordered runtime event and identity owner for workflow/action/receipt/resource IDs.

A2A, ACP migration records, operational task-board cards, Parent Atlas Studio views, Graphify daily plans and GPU index plans are noncanonical projections over revisioned workflow/evidence state.

The canonical feature Kanban remains the `FeatureV1` / `FeatureEvidenceV1` / `FeatureStateV1` materializer defined by `atlas-kanban-materializer`; operational workflow cards MUST NOT overwrite feature completion/state.

## Protocol direction

- New outbound agent interoperability targets A2A `1.0.0`.
- ACP is retained only as a legacy ingress compatibility boundary while it migrates into A2A.
- ACP ingress payloads MUST receive a checksum and migration receipt before becoming an Atlas A2A task projection.
- A2A `INPUT_REQUIRED` and `AUTH_REQUIRED` are interrupted states. Neither may authorize a file/database/index mutation.
- A2A Artifacts represent task outputs; workflow progress/status remains status/message metadata.

## Daily execution shape

```text
repository provenance dry-run
        ↓
graphify:daily chain
        ↓
native structural owner
        ↓
feature recommendation refresh
        ↓
QAS recommendation receipt
        ↓
GPU codebase index plan
        ↓
exact cuVS oracle
        ↓
CAGRA challenger + cluster/graph features
        ↓
retrieval parity / validation
        ↓
Qdrant projection apply
        ↓
operational Kanban refresh
        ↓
Parent Atlas Studio projection refresh
        ↓
A2A task/artifact updates
```

## GPU codebase indexing invariants

- canonical semantic dimension remains `semantic_768`.
- semantic lane vote count remains exactly `1`; executors do not produce extra fusion votes.
- CAGRA requires a cuVS exact-oracle stage in the same frozen plan.
- mutating index stages require validation receipts.
- GPU `APPLY` additionally requires an admitted `GpuResourceEnvelope` receipt/reference.
- KMeans/SOM/PageRank/PPR/Node2Vec and other derived feature stages remain noncanonical.
- all derived rows MUST align to the same frozen row-identity checksum before retrieval/index promotion.

## Graphify daily gates

`DRY_RUN` may build plans without mutation receipts.

`APPLY` is admitted only when:

```text
validated structural/source snapshot
    +
validation receipts
    +
exact semantic oracle receipt
    +
GPU resource admission (GPU index only)
    +
revision-matched graph / semantic / feature identities
```

Fallback execution MUST NOT turn an unvalidated native structural or GPU index step into a canonical write.

## Studio / task-board projection

Parent Atlas Studio should display two related but distinct surfaces:

1. Feature board — canonical feature/evidence/state projection.
2. Workflow board — ephemeral/runtime task execution projection.

Workflow cards may show:

- queued / active / blocked / verify / done / failed / canceled
- workflow/action/DAG node IDs
- lane/transport
- validation/evidence/artifact refs
- A2A task status
- GPU index/Graphify progress

A workflow card reaching `DONE` does not by itself move a canonical feature to `VERIFIED`; the feature materializer still requires its own acceptance evidence.

## Proof sequence

```text
AW-0  WorkflowActionEvent internal ownership      EXISTING
AW-1  A2A v1.0 projection contracts              WRITTEN_UNPROVEN
AW-2  ACP legacy-ingress migration receipt        WRITTEN_UNPROVEN
AW-3  operational task-board projection           WRITTEN_UNPROVEN
AW-4  Graphify daily workflow plan                WRITTEN_UNPROVEN
AW-5  GPU codebase index plan + exact oracle      WRITTEN_UNPROVEN
AW-6  Parent Atlas Studio workflow projection     WRITTEN_UNPROVEN
AW-7  bounded control-plane proof script          WRITTEN_UNPROVEN
AW-8  live Graphify/Kanban/Studio/A2A wiring      PENDING
AW-9  workstation execution + receipts            PENDING
```

## Written proof command

Build Parent Atlas first, then run:

```bash
node scripts/atlas/prove-agentic-workflow-control-plane.mjs
```

This is non-mutating by default.

An apply-mode proof is intentionally fail-closed without a GPU resource admission receipt:

```bash
ATLAS_GPU_RESOURCE_RECEIPT_ID=<receipt-id> \
node scripts/atlas/prove-agentic-workflow-control-plane.mjs --apply
```

No live Graphify, Qdrant, Kanban, Studio or remote A2A endpoint should be called by this bounded proof; it validates the control-plane composition before runtime wiring.
