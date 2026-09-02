## Context

The repository already contains the revisioned ACE/BitFrost cache identity,
`CandidateOrdinalMapV1`, query-adaptive feature compilation, and ACE manifest
admission. Focused tests prove those pieces in isolation and in a pure composed
bridge, but no production caller supplies the complete bundle. Generic Atlas
runtime contexts may also derive wall-clock revisions when callers omit them.

## Goals / Non-Goals

**Goals:**

- Provide one server-owned composition boundary from SearchRuntime to ACE.
- Reuse the existing ordinal-map, feature compiler, snapshot, and admission
  owners without adding another retrieval or identity system.
- Fail closed on missing, mismatched, synthetic, or client-supplied lineage.
- Preserve read-only behavior and deterministic snapshot checksums.

**Non-Goals:**

- Do not change canonical identity, CandidateOrdinal allocation, or retrieval
  fusion ownership.
- Do not make ACE call Qdrant, Postgres, Neo4j, or Valkey directly.
- Do not enable live cache writes, production mutation, or timestamp revisions.

## Decisions

1. **Require caller-owned ordinal admission.** The producer accepts an existing
   validated `CandidateOrdinalMapV1`; it will not rebuild one from query order.
   This preserves the canonical candidate owner and prevents projection IDs from
   becoming identity.

2. **Use explicit feature resolver injection.** SearchRuntime remains the
   retrieval owner and the existing QAS compiler remains the feature owner. A
   typed resolver supplies feature evidence; absent evidence rejects the row.
   Direct store access was rejected because it would create a second retrieval
   path and bypass current revision checks.

3. **Gate all revisions before ACE admission.** The producer requires candidate
   snapshot, ordinal-map, workspace, source, feature, graph, and producer
   revisions. Wall-clock defaults and client payload revisions are rejected.

4. **Keep cache adoption separate.** Producing a valid snapshot may feed the
   existing ACE admission function, but cache writes remain behind the existing
   explicit `ContextManifestV2` opt-in until a live-admission proof passes.

## Risks / Trade-offs

- [Missing live lineage] → Keep the producer blocked and emit a typed rejection;
  never substitute `unknown`, `main`, or a timestamp.
- [Feature owner unavailable] → Reject incomplete rows rather than treating zero
  values as evidence.
- [Caller drift] → Require focused contract tests and a live-caller audit before
  marking adoption proven.

## Migration Plan

1. Validate the OpenSpec change and focused adapter tests.
2. Implement the server-owned producer behind a read-only boundary.
3. Run a bounded dry-run with a real authoritative ordinal map and resolver.
4. Prove snapshot and ACE admission checksums without cache or canonical writes.
5. Enable cache adoption only through a separately authorized live-admission
   gate; rollback by disabling the producer caller.

## Open Questions

- Which existing server retrieval entrypoint will supply the authoritative
  candidate snapshot revision and ordinal map?
- Which existing feature owner can provide the resolver output without deriving
  revisions from generic runtime context?
