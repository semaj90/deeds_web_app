# Graphify Recovery Proof Ladder Design

## Context

The repository already has several projection contracts with overlapping names
but different jobs. `atlas/qdrant-collection-contracts.ts` describes Qdrant
payload/index fields; `graph/graph-projection-manifest.ts` describes Neo4j GDS
relationship projection configuration and freshness; `graph/graph-projection-manifest-v1.ts`
compares graph snapshot membership/ordinal assignments; and
`atlas/graph/graph-projection-manifest.ts` describes the ALT/precompute executor
input. None is a fan-out execution receipt.

There are also two incompatible `GraphProjectionReceiptV1` shapes declaring the
same `atlas.graph-projection-receipt.v1` identity: a strict Zod schema in
`atlas/graph/graph-projection-receipt-v1.ts` and an unused interface in
`atlas/graph/graph-runtime-contracts.ts`. Static caller search found no imports
of either receipt type. The Zod contract is selected as the single receipt
owner because it already validates lineage, counts, status, and checksums.

## Goals / Non-Goals

**Goals:**

- Keep Qdrant payload identity (`packet_key`, `source_ref`) separate from Neo4j
  internal IDs and graph projection addresses.
- Keep each existing manifest in its current layer; do not create a parallel
  generic manifest.
- Use one strict, bounded `GraphProjectionReceiptV1` for future fan-out proof
  artifacts, carrying revision lineage, aggregate counts, and bounded sample
  evidence.
- Prove contract behavior with unit tests before any projection execution.

**Non-Goals:**

- Do not run Graphify or projection scripts in this contract tranche.
- Do not write PostgreSQL, Neo4j, Qdrant, Valkey, or filesystem projection data.
- Do not add Qdrant payload indexes for optional fields without a demonstrated
  retrieval need.
- Do not make feature/community/rank values canonical identity.

## Decisions

1. **Layer existing owners instead of renaming manifests.** The Qdrant
   collection contract remains the payload/index owner. The GDS manifest
   remains the projection-configuration/freshness owner. The generic V1
   snapshot manifest remains the membership/ordinal/edge-count comparison
   owner. The ALT manifest remains specific to its executor. The fan-out
   receipt references revisions and bounded row evidence; it does not replace
   those manifests.

2. **Narrow the Qdrant contract claim to fields it actually owns.** It owns
   `packet_key`, `source_ref`, and `graph_revision` payload/index semantics.
   `community_id` and `page_rank` are optional payload properties, not indexed
   identity. `feature_id` and `projection_revision` are not currently in that
   contract. Do not add them solely to satisfy an overbroad task description.

3. **Select the Zod receipt schema as the receipt owner.** The parallel
   interface in `graph-runtime-contracts.ts` describes runtime traversal
   snapshots and has a different shape. Give that runtime envelope a distinct
   schema/type identity before it is consumed; do not silently merge its fields
   into the fan-out receipt.

4. **Bound receipt samples.** Aggregate counts describe the full run. A
   `sampleRows` array carries at most 20 rows for audit/debugging and includes
   only source/packet/feature/community/rank evidence. It is not an index or a
   replacement for canonical rows.

5. **Projection writes remain later gates.** The dry-run artifact must be
   generated first and have a bounded, immutable input set. Neo4j/Qdrant apply,
   readback, and idempotence are separate gates and require explicit
   authorization at their mutation boundary.

## Risks / Trade-offs

- [Two existing receipt declarations may have external consumers not found by
  source search] → Keep the change additive at the type level until package and
  generated-code consumers are checked; do not change persisted data.
- [Narrowing the Qdrant field list may leave feature/community/rank absent from
  some projections] → Keep those as optional derived payload/sample fields and
  report their coverage; do not manufacture values.
- [A receipt may be mistaken for proof of successful projection] → Status and
  write/readback flags must distinguish plan, dry-run, apply, and verified
  readback; a schema parse alone is contract proof only.

## Migration Plan

No database or projection migration is part of the contract tranche. Run static
caller searches and focused tests. Any later bounded apply must freeze the
sample, record before-state checksums, use an idempotent projection key, and
perform independent readback. Rollback must be documented before requesting
authorization.

## Open Questions

- Which existing fan-out script is the first safe dry-run producer? The static
  inventory names candidates, but its exact input and downstream projection
  effects must be confirmed before execution.
- Which caller, if any, consumes the runtime receipt interface outside the
  checked source tree? No current source import was found.
