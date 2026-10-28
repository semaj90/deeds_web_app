# Packet Identity Registry Upsert Pipeline Review

**Date:** 2026-10-27  
**Mode:** Source review plus PostgreSQL `READ ONLY` probes  
**Writes:** None  
**Decision:** Registry-backed identity is the right owner for later indexing, but no live DDL or upsert is authorized by this review.

## Follow-up read-only verification (2026-10-27)

- A PostgreSQL `READ ONLY` transaction found 61,718 `atlas_packets` rows, zero packet keys shared by distinct `source_ref` values, and zero `source_ref` values with multiple packet keys.
- The existing `atlas_packet_identity_aliases` table has 3,294 rows; the census found zero canonical keys with multiple aliases and zero alias keys with multiple canonical targets. This supports the draft's one-to-one shape for observed current data, but does not establish historical identity policy or authorize applying the constraint.
- `atlas_repository_identity` contains the selected root UUID `01a13137-1378-7df9-9968-53738dbf0e48` for `deeds-web-app` (`ROOT`). The admitted execution has seven Graphify membership scopes: `repo:root` (29,026 members) and six nested-repository scopes (1,079 combined). Only the root UUID mapping is established by the selected contract; the current admission planner explicitly selects `repo:root`. This contract does not yet qualify every repository scope or prove directory-by-directory analysis coverage.
- The v1 registry and alias relations remain absent. No schema, packet, alias, or projection writes were performed.
- The focused resolver/writer/PostgreSQL tests passed 29/29 after narrowing missing-table classification. SQLSTATE `42P01` maps to the typed missing-registry blocker only when the error names one of the two expected v1 relations; an unrelated missing relation is rejected as an ordinary database error.
- Current reader search confirms the migration cannot simply remove the legacy alias contract: `packet-identity-resolver.ts` queries `atlas_packet_identity_aliases`, and callers include retrieval, semantic packet writing, MCP dispatch, lexical pass execution, and grounded extraction. `domain-classification-packet-crosswalk-postgres-v1.ts` also queries that legacy relation. The new v1 resolver/planner uses `_v1` relations, so a compatibility/migration sequence remains necessary; no data migration was performed.

## Current state

- `public.atlas_packet_identity_registry_v1` and `public.atlas_packet_identity_aliases_v1` are absent from the live database.
- `public.atlas_packets` contains 61,718 rows. The read-only count found 58,362 keys matching the legacy `packet:<12 hex>` pattern and zero keys matching the PacketKeyV2 UUIDv5 format.
- Current Graphify execution `01a1763a-4355-71d7-9b81-2c7a1814a41f` is `COMPLETED` for workspace `sha256:c63620c4…`, but `canonical_authority=false`.
- The root-scope decision is reflected in the code and unapplied schema: `repo:root` maps to repository UUID `01a13137-1378-7df9-9968-53738dbf0e48`, packet kind is `SOURCE_FILE`, and legacy packet keys are storage locators.

## Existing pipeline owners

- `scripts/atlas/build-packet-key-v2-admission-manifest-v1.mts` builds a read-only, checksummed candidate manifest and classifies live identity conflicts; it does not insert rows.
- `scripts/atlas/lib/packet-key-v2-admission-v1.mjs` requires an authorization receipt and applied alias DDL before apply. Its insert builder is an explicit plain `INSERT`; unique violations become conflict receipts rather than silent skips.
- `sveltekit-frontend/src/lib/server/atlas/identity/packet-identity-registry-postgres-v1.ts` is a read-only resolver. No registry persistence adapter was found.
- `scripts/atlas/admit-packets-current-live-identity-v1.mjs` writes legacy 12-hex packet keys. It is a different identity recipe and must not be repurposed for PacketKeyV2.
- Drizzle declarations and `sveltekit-frontend/drizzle/manual/20261020_atlas_packet_identity_registry_v1_DRAFT.sql` describe the two tables but remain unapplied.

## Integration mismatch and current repair

The first review found that the read-only admission planner queried the older `public.atlas_packet_identity_aliases` model rather than the selected `public.atlas_packet_identity_registry_v1` plus `public.atlas_packet_identity_aliases_v1` model. The planner now probes for the selected v1 relations, reads V2 identities from the registry and aliases from the v1 alias table, and reports `PACKET_IDENTITY_REGISTRY_V1_DDL_REQUIRED` when the required relations or integrity constraints are absent. It no longer treats the 2026-09-25 prepared alias migration as a substitute.

A fresh isolated run then exposed a more important flaw: the planner had classified all 7,656 frozen source candidates as `ADMISSION_READY` despite the referenced Graphify execution being `COMPLETED` with `canonical_authority=false`. The planner now verifies the exact execution ID, terminal status, authority flag, and workspace revision before classifying any entry. The superseding receipt is `.tmp/atlas/packet-key-v2-admission-run-20261027-v2/packet-key-v2-admission-gate-v1.json`: `GRAPHIFY_EXECUTION_NOT_CANONICAL`, `ADMISSION_READY=0`, and all 7,656 entries rejected under that gate. The earlier isolated receipt at `.tmp/atlas/packet-key-v2-admission-run-20261027/packet-key-v2-admission-gate-v1.json` is superseded and must not be used for admission.

The v1 alias DDL originally lacked cross-table protection that the referenced `atlas_packets.source_ref` matches the registry source. A separate unapplied draft, `sveltekit-frontend/drizzle/manual/20261027_atlas_packet_identity_registry_v1_source_guard_DRAFT.sql`, now proposes an insert-time source match and rejects alias updates. The planner requires this named trigger before reporting registry contract readiness. Neither draft has been applied, and the updated planner has not yet produced a fresh live receipt.

Workspace/source revisions and the admission receipt remain cohort evidence, not stable registry identity columns. The source admission manifest and its checksum must remain linked to every planned write. The registry resolver remains read-only and only resolves storage locators when an exact alias exists.

## Safe indexing/upsert contract

1. Freeze an admitted source cohort and verify exact repository scope, source ref, source digest/revision, workspace revision, and manifest checksum.
2. Classify every candidate against the full live packet and alias state. Any duplicate, ambiguous source, key collision, stale revision, or unsupported packet kind excludes the row; do not infer a mapping from path similarity.
3. After separate schema and data authorization, insert the V2 identity and its proven legacy storage alias in one transaction. Exact already-present identity is an idempotent no-op; mismatched identity is a hard conflict. Do not use `ON CONFLICT DO UPDATE` on identity columns.
4. Independently read back canonical identity → storage locator and storage locator → canonical identity, checking exact source/repository/grain and admission evidence before indexing or retrieval consumes the mapping.

## Field contract and gaps

| Field | Registry owner | Alias owner | Current qualification |
|---|---|---|---|
| Canonical packet key | `atlas_packet_identity_registry_v1.packet_key` PK | FK to registry key | Deterministic PacketKeyV2 candidate; not persisted |
| Repository identity | `repository_id` FK to `atlas_repository_identity.repository_id` | Inherited through canonical key | Live root UUID exists, but the planner still derives the key from the text scope and does not yet resolve that UUID per candidate |
| Execution scope | `membership_repository_scope` (`repo:root`) | Not duplicated | Membership locator, not a repository UUID; live execution membership stores this field as text |
| Source reference and grain | `source_ref`, `packet_kind=SOURCE_FILE` | Source equality enforced by the separate draft trigger | Exact source ref required; no fuzzy path fallback |
| Source/workspace revisions | Not stored in either draft table | Not stored | Must remain in the immutable admission evidence and be revalidated before any proposed write/readback |
| Physical storage key / legacy alias | Not stored | `alias_key` and `storage_packet_key`, FK to `atlas_packets.packet_key` | Draft requires alias key equal physical locator and unique canonical mapping; ambiguities reject |
| Recipe and evidence | `key_recipe_revision=PacketKeyV2@1` | `evidence_ref`, `evidence_digest` | Evidence digest format checked; evidence must bind the exact source/revision cohort |

The main remaining design mismatch is repository scope resolution: `repo:root` is a Graphify membership label and PacketKeyV2 input, while `repository_id` must be loaded from `atlas_repository_identity`. The resolver has a PostgreSQL lookup but also hardcodes the selected root UUID; the planner currently classifies membership using the scope label and does not carry the database-resolved UUID into its insert proposal. The current draft is root-only and does not cover the six other execution scopes. Do not create or populate the tables until those owners agree on one mapping contract and the focused tests prove it.

The current noncanonical execution fails the required data-authorization gate. Both read-only planner paths now query registry-v1 instead of the legacy alias owner, and pure parameterized INSERT builders target the registry and alias relations. However, no transactional writer executes them; the database relations and source guard are unapplied. The corrected isolated receipt verifies the fail-closed execution gate against the current database state. The safe next action is an explicit execution-owner decision followed by schema review; not DDL application, row upsert, packet minting, or a Qdrant/Neo4j write.

## Evidence and validation

- Fresh read-only planner receipt: `.tmp/atlas/packet-key-v2-admission-run-20261027-v2/packet-key-v2-admission-gate-v1.json`; 7,656/7,656 accounted, zero admission-ready, Graphify authority gate blocked, V2 relations absent, `writesPerformed=false`.
- The same receipt observed 61,718 `atlas_packets` rows; the earlier detailed count of 58,362 legacy keys is prior evidence and was not recomputed by this run.
- Static owner files listed above; planner type-check passed with `tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --types node scripts/atlas/build-packet-key-v2-admission-manifest-v1.mts`.
- Planner change has not been executed against PostgreSQL; no live receipt proves registry-v1 gate behavior yet.
- Admission helper tests passed 8/8; `register-orphaned-chunks.mjs` syntax check passed; strict OpenSpec validation passed. No database mutation was performed.

`likely_cause`: Read-only planning and SQL statement construction now target registry-v1, but the schema is unapplied, transactional writer/readback are absent, and the current execution is noncanonical.

`evidence`: PostgreSQL read-only queries plus the admission manifest builder, admission helper, resolver, legacy writer, and unapplied DDL.

`patch_targets`: `scripts/atlas/build-packet-key-v2-admission-manifest-v1.mts`; `scripts/atlas/register-orphaned-chunks.mjs`; `scripts/atlas/lib/packet-key-v2-admission-v1.mjs`; registry DDL drafts; this review report.

`safe_next_command`: Resolve the Graphify execution-owner decision for the exact c636 workspace; do not promote it or apply DDL without separate explicit authorization.

`smoke_command`: `node --test scripts/atlas/lib/packet-key-v2-admission-v1.test.mjs`.

`report_path`: `docs/reports/packet-identity-registry-upsert-pipeline-review-2026-10-27.md`.
