# Parent Atlas Canonical Gate, Graph Export, and Identity Audit

Date: 2026-10-28  
Mode: read-only verification; local evidence receipts only

## Result

The full Canonical Gate V2 run completed and verified its receipt and referenced evidence. Overall status is `FAIL`; the first mandatory blocker is `PACKET_IDENTITY/BLOCKED: GRAPHIFY_EXECUTION_NOT_CANONICAL`. The receipt records `canonicalAuthority=false` and `writesPerformed=false`.

Receipt: `.tmp/atlas/canonical-gate-runs/2026-10-28T15-51-34.459Z-320c06a0-e3d4-47a5-bf42-a967f1b254b5/canonical-gate-receipt-v2.json`  
Embedded checksum: `sha256:bce387be77a464933b4d2fa3f73541cabd3ee1a844821557d1fe74ecec45e871`  
Independent verification: `verifyCanonicalGateReceiptV2=true`; evidence reread valid with no reasons. Focused gate/export tests: 21/21 passed.

## Gate Matrix

| Check | Verdict | Current evidence / first blocker |
| --- | --- | --- |
| Service health | PASS | Startup validator exited 0. |
| Source snapshot | PASS | Current authority audit matches the admitted workspace and snapshot revisions. This does not grant projection authority. |
| Packet identity | BLOCKED | `GRAPHIFY_EXECUTION_NOT_CANONICAL`; packet registry, alias, and scope-map DDL are absent in the admission receipt. |
| Graph integrity | FAIL | Export validator rejects packet identity chain, feature naming, SOM coordinates, and incomplete coverage. |
| Execution authority | BLOCKED | Terminal/readback evidence does not establish canonical execution ownership. |
| Ontology schema | PARTIAL | `OKF_INTENDED_PROFILE_OWNER_VALIDATION_MISSING`. |
| Graph coverage | PARTIAL | Census only; coverage thresholds are undefined. |
| Repository coverage | PARTIAL | Registry DDL absent, nested scopes unmapped, canonical authority absent, graph coverage incomplete. |
| Projection admission | UNKNOWN | No current owner validator is configured. |

## Neo4j Export Evidence

The bounded export wrote a run-scoped local artifact and counted rejected records rather than silently asserting completeness. Source totals were 622,527 nodes and 450,349 relationships; the export considered 92,680 nodes and 224,491 selected relationship rows. It emitted 32,403 nodes and 271 edges.

- Packet nodes: 59,692 considered; 19,113 exported; 40,384 excluded for missing IDs; 195 unresolved duplicate IDs.
- Feature nodes: 13,290 considered and exported; feature labels remain unqualified by source/workspace revision.
- Concept nodes: 19,698 considered, none exported because their required IDs are absent.
- Selected relations: `USED_CONCEPT` has 173,158 unresolved endpoints; `SIMILAR_TOPOLOGY` has 51,062 unresolved endpoints and 271 exported edges.
- Read consistency is `NOT_PROVEN`; a single transaction scopes paged reads but does not attest a stable snapshot across pages.
- Source revision, workspace revision, execution ID, and coverage thresholds are absent/invalid in the export receipt. The three independent export gates are referential integrity `FAIL`, coverage `PARTIAL`, and canonical lineage `NOT_PROVEN`.
- Graph output digest: `sha256:64b11e54744451f69d368bd202ca2781bb22acb6ed733d0e7a9acd44aea4031d`.

This is evidence of bounded partial export, not the required complete, revision-qualified `NEO4J_GRAPH_EXPORT_COVERAGE_V2`. Do not add inferred IDs, labels, or revisions to make the validator pass. The missing Concept identities and endpoint classes need their authoritative source mapping; stable cross-page snapshot evidence and explicit coverage thresholds are also required.

## Registry Contract

The current owners are the registry-v1 DDL at `sveltekit-frontend/drizzle/manual/20261020_atlas_packet_identity_registry_v1_DRAFT.sql`, Drizzle mirror `sveltekit-frontend/src/lib/server/db/schema/atlas-packet-identities.ts`, pure resolver `sveltekit-frontend/src/lib/server/atlas/identity/packet-identity-registry-v1.ts`, and PostgreSQL adapter `sveltekit-frontend/src/lib/server/atlas/identity/packet-identity-registry-postgres-v1.ts`.

| Contract field | Current representation | Review status |
| --- | --- | --- |
| Canonical packet key | UUIDv5-style `packet:` key; `PacketKeyV2@1`; `SOURCE_FILE` only | Consistent in the registry DDL and Drizzle mirror. |
| Repository identity | `repository_id UUID` referencing `atlas_repository_identity`; scope mapping is a separate owner | Requires exact persisted mapping and repository-authority readback; six nested scopes remain unresolved. |
| Execution scope | `membership_repository_scope` with composite scope/repository mapping | Do not treat `repo:root` as a repository UUID or use it to invent repository identity. |
| Source identity/revision | Registry stores `source_ref`; source/workspace revisions are not columns in this DDL | Registry identity alone is not revision-qualified admission. Missing/stale revision remains a hard blocker. |
| Storage locator / alias | `atlas_packet_identity_aliases_v1`, alias kind `PACKET_KEY_V1_STORAGE_TO_V2`; storage key references `atlas_packets` | DDL and resolver use v1 names; alias source guard is a separate unapplied draft. |
| Uniqueness and foreign keys | Unique repository/source/kind and scope/source/kind; canonical key and alias/storage constraints | Must be checked against the exact applied contract before any writer path. |
| Current DB state | Packet-admission read reports registry, alias, and scope-map tables absent | `REGISTRY_DDL_NOT_APPLIED`; no migration or insert was attempted. |

Legacy `atlas_packet_identity_aliases` still has active readers. Do not remove or replace those reads until a dual-read/backward-compatibility plan and actual runtime callers are verified. The registry and admission planner remain separate from the `atlas_source_refs` reconciliation planner; do not conflate their identities or receipts.

## Related Writer Fix

The current worktree also changes `sveltekit-frontend/src/routes/api/tasks/packets/+server.ts`: creation now resolves the supplied key or exact source reference through the existing packet resolver, writes that resolved key, and returns a conflict when identity is absent or ambiguous. It does not mint keys. TypeScript syntax and `git diff --check` pass; Vitest and `npm run check` stalled before reporting results, so this edit is not test-verified. Live migration remains unapplied, and the draft column alignment is still required for select-all/returning queries.

## Required Next Gates

1. Preserve the failed gate status. Obtain an authorized canonical Graphify execution and exact snapshot/selection receipt; rerun packet admission without applying it.
2. Resolve and persist all in-scope repository UUID mappings only through the existing repository identity owner and explicit migration authorization. Then prove forward and reverse registry lookup in a disposable database.
3. Expand graph export diagnostics to account for every in-scope relationship class and missing endpoint reason. Establish stable cross-page read consistency, source/workspace/execution identity, and reviewed coverage thresholds before calling export complete.
4. Implement or identify the projection-admission owner; until then leave it `UNKNOWN`.
5. Rerun the full gate and require evidence reread. Never treat `CURRENT_SNAPSHOT_PROVEN` as `SAFE_TO_PROJECT`.

## Side Effects and Validation

- PostgreSQL, Neo4j, Qdrant, Valkey, Graphify promotion, S3, GPU, and service writes: none attempted.
- Local side effect: one unique `.tmp/atlas/canonical-gate-runs/...` directory with diagnostic receipts and exported JSON artifacts.
- Tests: 21/21 focused gate/export tests passed; full gate ran and returned expected nonzero status because blockers remain; receipt and evidence verification passed.
- Not verified: UI/DB integration for the task packet route; complete graph export; projection admission; registry-v1 live DDL; end-to-end source-to-retrieval-to-ACE lineage.
