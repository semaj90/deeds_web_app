## Memory/agent reconciliation design — 2026-09-05

The query-feature addition is an input to the existing ACE-FEATURE-SOURCE-OWNER-01
bridge, not a new compiler. Preserve ContextManifestV2 evidence, policy, and playbook
revisions and CandidateFeatureSnapshot admission. Query features must carry their
producer/corpus revisions; missing data cannot supply synthetic lineage.
Live wiring remains distinct from fixture validation. Exact prompt caches are owned
by the narrower cache-correctness change.

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

## Canonical packet identity registry (2026-10-20)

Use a dedicated, narrow logical registry rather than repurposing
`atlas_packet_registry` (projection/cache) or `atlas_stable_file_identity`
(file identity without packet kind). Keep `atlas_packets.packet_key` as a
physical storage locator. The new registry records the existing PacketKeyV2
key recipe, canonical repository UUID, the membership scope used by that
recipe, canonical source reference, and supported packet kind. It does not
contain embeddings, features, graph scores, cache state, or revisions.

Legacy-to-logical aliases live in a separate table, require explicit evidence
reference and digest, and point to both the registered logical identity and a
physical storage key. Existing prefix-only aliases are not backfilled or
reinterpreted. The read resolver verifies that the stored key recomputes from
the registered tuple and returns `identityRevisionQualified: false`; source
and workspace revision admission remains a separate gate.

**Owner decision (2026-10-27):** for the root `deeds-web-app` repository,
`PacketKeyV2@1` continues to hash membership scope `repo:root`; the registry
stores the mapped `atlas_repository_identity.repository_id` UUID
(`01a13137-1378-7df9-9968-53738dbf0e48`) alongside that scope. The packet grain
is `SOURCE_FILE`. Existing legacy packet keys remain physical storage locators;
logical coexistence requires explicit, evidence-backed alias rows. This
decision does not change the key recipe, create a packet key, authorize alias
population, or authorize a migration or datastore write.

The schema and resolver are code-only until an operator separately authorizes
the manual migration. No writer or automatic mint is included. Repository-scope
row population, per-row alias review, source/workspace revision binding, and
ACE manifest/cache wiring remain open; this registry alone cannot enable cache
admission. The decision is scoped to the root repository and does not approve
other repository-scope mappings.
