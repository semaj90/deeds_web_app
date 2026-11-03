# Proposal: Test Registry Ingestion Through the Governed Repositories

**Status**: DRAFT for review (2026-11-02) | **Writes performed by this draft**: none

## TL;DR

`atlas_test_registry`, `atlas_test_aliases` and `atlas_test_versions` are empty. The only governed way to fill them is `createTestCaseRegistryRepository(pool)` (`packages/parent-atlas/src/core/test-case-registry.ts`), with execution receipts through `createTestExecutionRepository(pool)`. This change defines a bounded, rehearsed, readback-verified ingestion of a small known set of Vitest specs. It extends `RECEIPT-WRITER-01` in `parent-atlas-ace-rlm-bitfrost-integration/tasks.md` and adds **no second writer**. No raw SQL seeding. Service smoke results are out of scope (they live in `service_capabilities`).

## Verified state (2026-11-02, read-only)

| Table | Rows | Note |
|---|---|---|
| `atlas_test_registry` / `_aliases` / `_versions` | 0 / 0 / 0 | never populated |
| `atlas_test_execution_receipts` | **32** | all `vitest`, all `passed`, `stable_test_id` NULL, 3 runs on 2026-10-19, producer `vitest@3.2.7`, specs under `patch-tournament.spec.ts` |
| `atlas_evidence` / `atlas_evidence_entities` | 603 / 0 | the materializer writes here too |

**The 32 legacy receipts use `path::title` test keys. 0 of 32 match the `test-key:<hash>` form from `deriveTestCaseKey()`**, so `resolveNomination` can never link them. Earlier notes saying this table had 0 rows are stale.

## Lifecycle (from the code)

| Step | Function | Behavior that matters |
|---|---|---|
| 1 nominate | `deriveTestCaseKey`, `deriveTestCaseNominationId` | key = hash(framework, normalized source_ref, suite_path, title); line/column are provenance only |
| 2 resolve | `resolveNomination` | read-only; `canonical` / `ambiguous` / `unresolved` by `canonical_key` or alias |
| 3 promote | `promoteNomination` | throws unless `allow_create: true`; ONE transaction: registry row + 2 aliases + version |
| 4 readback | `readback` | checksum over registry + aliases + versions |
| 5 execute | `createTestExecutionRepository.persist` | append-only `ON CONFLICT DO NOTHING`; `stable_test_id` only from a canonical resolution whose `test_key` matches |
| 6 execution readback | `readback` with `expected` | throws `TEST_EXECUTION_IMMUTABILITY_CONFLICT` on any difference |

## Gaps found in review (decisions, not fixes)

| # | Gap | Evidence |
|---|---|---|
| G1 | `promoteNomination` on an `ambiguous` resolution still derives a new `stable_test_id` and inserts, instead of refusing | `existing.status === 'canonical'` is the only branch checked |
| G2 | Re-promotion mutates `registry_revision` and `updated_at` (`ON CONFLICT DO UPDATE`), so the readback checksum is not stable across revisions | repository SQL |
| G3 | The existing apply loop (`scripts/atlas/prove-vitest-evidence.mjs --apply`) has no all-or-nothing transaction: promote is one transaction per test, materialization is separate | script lines 63-83 |
| G4 | The apply path also writes `atlas_evidence` (then `atlas_evidence_entities`); it is not receipt-only | `materializeCanonicalTestExecution` |
| G5 | Unresolved tests get no execution receipt from the script although the repository supports `stable_test_id = NULL` | script lines 76-82 |
| G6 | 32 legacy receipts can never gain a `stable_test_id` (append-only, different key scheme) | counts above |
| G7 | `prove-vitest-evidence.mjs` calls `atlas.compileVitestJsonReport` and `atlas.createTestCaseRegistryRepository` on `dist/index.js`, which exports neither (verified 2026-11-02), so it cannot run | `dist/index.js` exports; modules exist under `dist/core/` |
| G8 | The compiler rejects current Vitest output: `endTime` is fractional (e.g. `1793647789950.9387`) but the schema is `.int()` | ZodError on a real 2026-11-02 report |

## Scope

In: a 13-test canary (`helper-registry-v1.spec.ts` 6, `helper-capability-snapshot-v1.spec.ts` 7), dry-run, rollback rehearsal, bounded apply, negative tests, readback. Out: bulk ingestion of the suite, migrating legacy receipts, schema changes, any change to the repositories (G1/G2 are recorded as proposals needing approval).

## Impact

Planning only. No datastore mutation is performed by this draft. Apply steps need explicit operator approval.
