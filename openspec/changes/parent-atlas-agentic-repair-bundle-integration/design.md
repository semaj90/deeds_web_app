## Context

This change coordinates an external agentic-repair bundle with the existing Parent Atlas repair, retrieval, evidence, graph, and promotion owners. The bundle is not currently present in the repository, and the existing repository already contains partial implementations for repair loops, evidence compilation, RRF, graph projections, and vector challengers. The design therefore treats the bundle as an optional staged input and prevents it from creating a second context engine, fusion owner, identity system, or mutation path.

The integration must remain read-only until each capability has a current evidence receipt. PostgreSQL remains the canonical identity/revision owner; SearchRuntime remains the cross-lane normalization and fusion owner; Qdrant, Neo4j, NetworkX, cuGraph, and cuVS remain projections or executors. Any repair action must remain behind the existing authorization, validation, and independent-readback gates.

## Goals / Non-Goals

**Goals:**

- Stage and inventory the bundle without overwriting canonical files.
- Reuse existing repair-loop, evidence, semantic_768, FeatureRow, SearchRuntime, graph, and promotion owners.
- Define a phased path from fixture/read-only proof to independently verified repair execution.
- Bind every derived result to source/revision/evidence metadata and preserve fail-closed behavior.
- Keep RRF/RFF, PageRank, latent representations, graph projections, and cuVS as bounded challengers until their parity receipts pass.
- Provide explicit rollback and evidence requirements for each integration phase.

**Non-Goals:**

- Obtaining or silently importing the external bundle.
- Replacing existing canonical repair, context, identity, or fusion owners.
- Applying database, Qdrant, Valkey, Neo4j, Graphify, or source-data mutations.
- Promoting RFF, learned repair, PageRank, latent128, cuGraph, or cuVS based on fixture output alone.
- Making an external agent, model, or generated patch an authority without validation and readback.

## Decisions

### 1. Stage first, then classify

The bundle must be placed in an isolated temporary integration directory and hashed before any comparison. Each file is classified as `REUSE`, `ADAPTER`, `ORACLE_ONLY`, `REVIEW_REQUIRED`, or `REJECTED`. No staged file is imported into a canonical source tree by this change.

**Alternative rejected:** copying the bundle over similarly named repository files. That would obscure ownership and make rollback/review impossible.

### 2. One owner per boundary

The existing repair spine owns repair execution; `trace_dynamic_context` and ACE own context assembly; SearchRuntime owns lane normalization and RRF; PostgreSQL owns identity and revisions; derived graph/vector systems own only their projections. Bundle code may call adapters to these owners but may not persist directly to stores or introduce parallel representations.

**Alternative rejected:** allowing the bundle's local `rrf.ts`, context builder, or graph code to become a new production owner merely because it is convenient for a fixture.

### 3. Evidence ladder before mutation

Each phase emits a receipt with input checksums, source/workspace revisions where available, producer revision, validation status, canonical authority, and writes performed. The ladder is: staged inventory, fixture replay, read-only current evidence, bounded candidate, explicit authorization, apply, independent readback. Missing or stale evidence produces `WAITING` or `UNPROVEN`, never inferred success.

### 4. Semantic and graph challengers share canonical inputs

RFF/latent vectors, NetworkX/cuGraph PageRank, and cuVS exact KNN consume the existing revision-qualified semantic matrix, CandidateOrdinal/graph maps, or frozen snapshots. They do not derive identity from array order, Qdrant point order, or graph node order. RFF remains reranking-only and is not indexed into Qdrant until an explicit promotion decision exists.

### 5. Evaluation owns promotion decisions

Domain 10 evaluation, repair replay, and parity receipts decide whether a challenger is eligible for review. They do not directly change task state or production stores. A repair candidate remains a candidate until schema/lineage/authorization gates and independent readback succeed.

### 6. Workflow receipts remain the execution evidence owner

Agentic repair runs use the existing `WorkflowActionEventV1`/run-receipt path. The bundle must not add a second run identity or telemetry ledger. Inner tool calls may be evidence, but the coordinator-level receipt is the unit used for OpenSpec reconciliation.

## Risks / Trade-offs

- [External bundle is absent] → Keep T0 explicitly waiting and prove repository-local contracts independently; do not fabricate bundle evidence.
- [Duplicate context or fusion implementation] → Require an owner matrix and reject files that create a second canonical owner.
- [Stale source or graph snapshot] → Include revision/checksum fields in every receipt and invalidate stale proofs.
- [Challenger output is mistaken for authority] → Emit `canonicalAuthority: false` and `writesPerformed: false` until explicit promotion gates pass.
- [Repair loop mutates too early] → Preserve dry-run default, bounded candidate artifacts, explicit authorization, and independent readback.
- [Large Graphify or JSON artifacts exceed memory] → Use size caps and bounded parsing; report skipped artifacts rather than silently admitting partial data.
- [Rollback cannot restore derived projections] → Record input/output checksums and use rebuildable projections; never treat cache warmth or Qdrant state as the only source of truth.

## Migration Plan

1. Confirm the bundle is absent or stage it in an isolated directory and produce a manifest/checksum.
2. Diff and classify bundle files against the existing repair and evidence owners.
3. Run fixture-only repair, semantic, RRF, graph, and vector proofs with writes disabled.
4. Connect accepted observations through existing evidence/context adapters and emit receipts.
5. Run current-source read-only replay only when the required source/revision authority is current.
6. Prepare bounded candidate manifests and side-effect manifests; do not apply them in this change.
7. If a later operator-authorized apply is approved, execute through existing promotion queues and verify independent readback.

Rollback is to discard the isolated staging directory and derived receipts/candidates. Canonical source, PostgreSQL identity, Qdrant, Valkey, Neo4j, Graphify, and model state remain untouched by the initial tranche.

## Open Questions

- Where will the external bundle be supplied, and what checksum identifies the reviewed version?
- Which existing change owns any eventual `record-repair-episode` integration after the bundle is available?
- What exact current source/revision cohort is eligible for live repair replay?
- Which evaluation thresholds and held-out corpus are required before any challenger can be promoted?
- Does the future bundle contain a compatible workflow journal, or should it use the existing coordinator receipt adapter?
