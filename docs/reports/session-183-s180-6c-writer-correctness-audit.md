# S180-6C — Writer Correctness + Representation Ownership Audit

**Date**: 2026-08-04 | **Scope**: identity-worker.ts fix + repo-wide `atlas_packets` writer audit + representation-field producer trace
**Mutations performed**: 0 Postgres/Qdrant mutations. 3 source files changed (`identity-worker.ts` fix, `identity-worker.spec.ts` new, this report).

## Statuses

| Status | Value |
|---|---|
| `IDENTITY_WORKER_STATIC_FIX` | **PASS** |
| `IDENTITY_WORKER_FIXTURE_WRITE` | **PASS** (mocked-fixture, not live Postgres — see note) |
| `ATLAS_PACKET_WRITER_AUDIT` | **PASS** (identity-worker.ts was the only broken writer; 6 others clean) |
| `PRODUCTION_WRITER_READY` | **NOT_YET** (identity-worker.ts's separate `canWrite()` bug still blocks the real write path — see below) |
| `REPRESENTATION_ID_OWNER` | **NOT_PROVEN** (zero writers found anywhere in the repo) |
| `REPRESENTATION_ID_COVERAGE` | 0% (confirmed by session-182 live query) |
| `SOURCE_REVISION_OWNER` | **NOT_PROVEN** (no literal column; no analogue is ever written either) |
| `WORKSPACE_REVISION_OWNER` / `REPRESENTATION_REVISION_OWNER` | **NOT_PROVEN as revision counters** — columns exist, default to 0, and are read/threaded through dozens of retrieval files, but **zero writers increment them**. Their 100%-non-null "coverage" is just the unincremented default, not evidence of real revisioning. |
| `LEGACY_UNVERSIONED_COUNT` | Not computed this pass (requires live query against `source_representation_id IS NULL`; from session-182: 61,659/61,659) |

## 1. `identity-worker.ts` fix (writer correctness)

Confirmed root cause is **worse than a casing bug**: the live `atlas_packets` table has `repository_id`, `directory_id`, `file_id`, `module_id`, `symbol_id`, `chunk_id` as real raw columns, but `src/lib/server/db/schema/atlas-packets.ts` **does not model any of them** — they have no Drizzle property at all, camelCase or otherwise. So renaming `repository_id` → `repositoryId` would not have fixed anything; that property doesn't exist on the schema object either.

Fixes applied (`identity-worker.ts`):
1. `.where(eq(atlasPackets.packet_key, ...))` → `.where(eq(atlasPackets.packetKey, ...))` (both the SELECT and UPDATE where-clauses — `packet_key`/`packetKey` was the one field of the six that *does* exist on the schema).
2. `buildCanonicalEnvelope()`'s packet-row property reads switched from snake_case to the real camelCase equivalents (`sourceRef`, `featureId`, `directoryPath`, `featureLabel`, `qdrantPointId`, `neo4jNodeId`, `createdAt`). `repositoryId`/`directoryId`/`fileId`/`moduleId`/`symbolId`/`chunkId`/`userId`/`redisKey` remain unmapped (documented in a code comment) since no Drizzle property exists for them — the `|| randomUUID()` fallback was already always being taken and this is unchanged in behavior, just now honest about why.
3. `.update(atlasPackets).set({...})` reduced to **only** the four fields that are real Drizzle columns: `featureId`, `identityLane`, `identityConfidence`, `updatedAt`. The six identity-hierarchy fields (`repository_id`/etc.) were removed from the `.set()` — they cannot be legitimately written through this schema today. This is a scope boundary, not a silent drop: it's commented in the code and flagged here as a follow-up decision (extend the Drizzle schema to model those six uuid columns, or decide they're intentionally out-of-Drizzle-scope).
4. Added a duplicate-row guard: `if (packet.length > 1)` now fails closed (quarantine, `was_updated: false`) instead of silently taking `packet[0]`. `packet_key` carries a live `UNIQUE` constraint so this should be unreachable, but the code previously had no defense against it.
5. `packetRow.source_ref` (5 call sites in return statements) → `packetRow.sourceRef`.

## 2. New finding: `createPermissionManager()`/`canWrite()` call is also broken — separate bug, out of this fix's scope

`identity-worker.ts` calls:
```ts
const permissionMgr = createPermissionManager(envelope);
if (!permissionMgr.canWrite()) { ... }
```
But `src/lib/server/topology/permission-manager.ts` defines:
```ts
export function createPermissionManager(pool: any, redisClient?: any): PermissionManager
```
— it expects a **Postgres pool**, not a `CanonicalEnvelope`. And `PermissionManager` has **no `canWrite()` method at all** (`grep -n "canWrite"` → zero matches). The only comparable method is `async checkAccess(...)`, a completely different (async, pool/DB-backed) API.

**This means even with the Drizzle fix, `processPacketIdentity()` still cannot reach the real database update** — `permissionMgr.canWrite()` throws `TypeError: canWrite is not a function`, caught by the outer `try/catch`, silently returning a quarantine-style error result. This was **not** part of what was asked to fix here (it's a different subsystem mismatch, not a Drizzle property-naming issue), so it was intentionally left alone and instead **mocked out** in the regression test (`createPermissionManager: () => ({ canWrite: () => true })`) so the test could isolate and prove the Drizzle fix specifically.

**This is why `IDENTITY_WORKER_FIXTURE_WRITE` is marked PASS against a mocked fixture, not a live Postgres round-trip** — a true end-to-end fixture write is still blocked by this second bug. Recommend a follow-up S180-6C-2 task to either implement a synchronous `canWrite()` on `PermissionManager`, swap in `checkAccess()` with proper params, or remove the permission gate if it's not yet load-bearing.

## 3. Regression test — `identity-worker.spec.ts` (3/3 pass)

- `existing packet gets canonical packetKey` — asserts `eq()` is called with the real `packetKey` sentinel (never `undefined`), asserts `.set()` keys are exactly `['featureId','identityConfidence','identityLane','updatedAt']` (no `repository_id`/`packet_key`/`feature_id`).
- `missing target: zero rows found` — asserts `db.update` is never called, `action: 'skipped'`, `identity_lane: 'quarantine'`.
- `duplicate target: more than one row matches` — asserts `db.update` is never called, fails closed with a `duplicate packet_key` validation error.

```
✓ src/lib/server/workers/identity-worker.spec.ts (3 tests) — all pass
```

## 4. Writer audit — every `atlas_packets` `.update()`/`.insert()` call site

| File | Operation | Identity predicate | Property style | Status |
|---|---|---|---|---|
| `workers/identity-worker.ts` | UPDATE | `eq(atlasPackets.packetKey, ...)` (fixed) | camelCase (fixed) | **FIXED** (was FAIL — see §1-2) |
| `ace/features/som-clustering.ts:284` | UPDATE (`kmeansCluster`,`somRow`,`somCol`,`somIndex`) | `eq(atlasPackets.packetKey, ...)` | camelCase | ✅ PASS |
| `generation/packet-summary-pipeline.ts:214` | UPDATE (`summary`,`updatedAt`) | `eq(atlasPackets.packetKey, ...)` | camelCase | ✅ PASS |
| `indexer/feature-label-enricher.ts:213` | UPDATE (`metadata` via `sql\`jsonb_set...\``, `updatedAt`) | `sql\`${atlasPackets.packetKey} = ${packetKey}\`` | camelCase (raw sql template referencing real column) | ✅ PASS |
| `indexer/summary-freshness-checker.ts:145` | UPDATE (`metadata`,`updatedAt`) | `eq(atlasPackets.packetKey, ...)` | camelCase | ✅ PASS |
| `routes/api/admin/batch-embeddings/embed/+server.ts:81` | UPDATE (`updatedAt`) | `eq(atlasPackets.packetKey, ...)` | camelCase | ✅ PASS |
| `hyperrag/hyperrag-packet-pipeline.ts:233` | INSERT + `onConflictDoUpdate` | `target: atlasPackets.packetKey` | camelCase, but `.insert()` call is cast `(this.db as any)` and passes `embeddingModel: packet.embeddingModel` — **not a real Drizzle column** (grep confirms no `embeddingModel` field in schema). Silently dropped by Drizzle's insert builder, not identity-breaking, but dead code — minor finding, not fixed this pass. | ⚠️ MINOR (non-identity field only) |

**Conclusion**: `identity-worker.ts` was an isolated bug, not a systemic pattern — all other writers correctly use `atlasPackets.packetKey` and camelCase `.set()`/`.values()` keys.

## 5-6. Representation/revision field ownership trace

Searched for any `.update(atlasPackets)` / `.insert(atlasPackets)` call site that writes `sourceRepresentationId`, `projectionRepresentationId`, `workspaceRevision`, or `representationRevision`:

- `sourceRepresentationId` / `projectionRepresentationId`: **zero writers found anywhere in the repository.** Only the schema file declares the columns. This matches session-182's live finding of 0% coverage exactly — there is no dead/unused code path silently populating them; they are structurally unreachable as currently wired.
- `workspaceRevision` / `representationRevision`: dozens of files **read/thread these values** through retrieval (`hydrate-candidates.ts`, `retrieve-candidates.ts`, `search-runtime.ts`, `qdrant-packet-projection.ts`, etc.) and Zod contracts (`canonical-chunk-contract.ts`), but **none of the 7 `atlas_packets` writer call sites ever set them**. They only ever hold their `DEFAULT 0`. The "100% populated" figure from session-182 is the unincremented default, not proof of a working revisioning system.

**Per the user's instruction, no `source_revision` column was added and no `representationId` default was introduced.** Do not treat `workspace_revision`/`representation_revision` as equivalent to `source_revision` — they are the wrong revision granularity (workspace-wide / representation-contract, not per-source-occurrence) and, as shown, are not even actively incremented by anything today.

## Not done this pass (explicitly out of scope, per the bounded task)

- No Qdrant reads/writes (S180-6F/G).
- No `graphify:daily` run.
- No structural-orphan repair for `chunk_id`/`symbol_id` (S180-6E — still `FAIL_OR_ORPHANED` per session-182).
- No fix to the `createPermissionManager`/`canWrite()` bug (§2) — flagged as a separate follow-up, not conflated with the Drizzle fix.
- No `source_ref` fan-out measurement query (user's step 7 — `GROUP BY source_ref HAVING COUNT > 1`) — recommend as the next bounded SQL-only task if structural reconciliation work resumes.
