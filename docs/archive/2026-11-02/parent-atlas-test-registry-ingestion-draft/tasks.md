# Tasks: Test Registry Ingestion

Owner of the writer decision: `RECEIPT-WRITER-01` (`parent-atlas-ace-rlm-bitfrost-integration/tasks.md`). Writes below need explicit approval. Status words: CREATED / WIRED / DRY_RUN_PROVEN / APPLY_PROVEN / NOT_PROVEN.

## 1. Decisions (operator)

- [ ] TREG-D1 Accept `prove-vitest-evidence.mjs` as the single registry/receipt writer, or name another. No second writer.
- [ ] TREG-D2 Receipt-only vs receipt + evidence: the script always materializes (`atlas_evidence`, 603 rows today). Choose a `--skip-evidence` option or accept evidence writes for the canary.
- [ ] TREG-D3 G1: refuse `promoteNomination` when the resolution is `ambiguous`. Fix in the caller first; change the repository only with approval.
- [ ] TREG-D4 G2: confirm `registry_revision` is mutable provenance and the readback checksum is per-revision.
- [ ] TREG-D5 G5/G6: should unresolved tests persist a `stable_test_id = NULL` receipt, and are the 32 legacy receipts accepted as permanent unlinked provenance?
- [ ] TREG-D6 Confirm which `framework` values `atlas_test_registry` accepts (only `vitest` is evidenced).
- [ ] TREG-D7 G7: the package index does not export `compileVitestJsonReport`, `createTestCaseRegistryRepository`, `createTestExecutionRepository` or the materializers, so `prove-vitest-evidence.mjs` crashes on its first call. Choose: export them from the package index, or import from `dist/core/*` in the writer. Scripts-first per CLAUDE.md, then mirror.
- [ ] TREG-D8 G8: the compiler schema requires integer `startTime`/`endTime` but Vitest 3.2.7 emits fractional values, so it rejects current output. Choose: relax the schema to a finite non-negative number, or define one documented pre-normalization (floor) that is recorded in the receipt. Do not floor silently, because it changes the report checksum.

## 2. Read-only proof (no writes)

- [x] TREG-01 Run Vitest with the JSON reporter on the two canary specs only; record the report path and SHA-256. Expect 13 passed. DONE 2026-11-02: `.tmp/atlas/vitest-treg-20261102-1129.json`, 13 passed, 0 failed, raw SHA-256 `4b6be681f655ad8e255ec823a66ef38d6081950d84bfcfd2d47e194e2751ed5d`.
- [x] TREG-02 Compile with `compileVitestJsonReport` (dry run, `COMPILED_UNAPPLIED`); assert 13 nominations, 13 distinct `test_key` values, every key in `test-key:` form. DONE WITH CAVEAT 2026-11-02: 13 nominations / 13 executions / 13 distinct keys / 13 distinct receipt ids, all `test-key:` form, framework `vitest`, all `passed`. The raw report was REJECTED by the compiler (G8: fractional `endTime`); the dry run floored `startTime`/`endTime` in memory, so the compiled checksum `c729e736…6302` differs from the raw file's. Imported from `dist/core/*.js` because the package index does not export these modules (G7).
- [x] TREG-03 `resolveNomination` for all 13 (read-only): expect 13 `unresolved`, 0 `ambiguous`. Any `ambiguous` stops the plan. DONE 2026-11-02: 13 unresolved, 0 ambiguous, 0 canonical. Row counts unchanged afterward (registry 0, aliases 0, versions 0, receipts 32); 0 of the 13 receipt ids already exist. Receipt: `.tmp/atlas/treg-dryrun-treg-20261102-1129.receipt.json` (`writesPerformed: false`).

## 3. Rehearsal (rolled-back)

- [ ] TREG-04 Build a pool adapter that runs the repositories on one client inside an outer transaction, translating inner `BEGIN/COMMIT/ROLLBACK` to `SAVEPOINT/RELEASE/ROLLBACK TO`. Put it beside the canary script, not in the repositories.
- [ ] TREG-05 Rehearse promote + persist + readback for the 13 tests inside the outer transaction, assert expected counts inside (13 registry, 26 aliases, 13 versions, 13 receipts), then `ROLLBACK`. Assert all four tables return to their pre-image (0/0/0 and 32 receipts).

## 4. Bounded apply (approval required)

- [ ] TREG-06 Apply for the 13 tests with `allow_create: true`, one `registry_revision` and `producer_revision`, evidence writes per TREG-D2.
- [ ] TREG-07 Registry readback per `stable_test_id`: `alias_count = 2`, `version_count = 1`, checksum recorded.
- [ ] TREG-08 Idempotency: run the same apply again; row counts and execution readback checksums must not change.

## 5. Negative tests (must fail loudly)

- [ ] TREG-09 `promoteNomination` with `allow_create: false` throws `TEST_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE`.
- [ ] TREG-10 Re-persist an existing `execution_receipt_id` with a different status: `TEST_EXECUTION_IMMUTABILITY_CONFLICT`.
- [ ] TREG-11 Persist with a resolution whose `test_key` differs from the observation: `TEST_EXECUTION_RESOLUTION_KEY_MISMATCH`.
- [ ] TREG-12 Ambiguous resolution is refused by the caller guard from TREG-D3.

## 6. Closeout

- [ ] TREG-13 Row counts before/after for all five tables and the legacy 32 receipts unchanged.
- [ ] TREG-14 Record the receipt path and checksums here; update the `RECEIPT-WRITER-01` note; update CLAUDE.md only with measured results.
- [ ] TREG-15 Rollback plan documented: rows are append-only, so removal is by `registry_revision` + `producer_revision` marker with a pre-image archive, FK order (receipts SET NULL, versions RESTRICT), and separate approval.

## Queued elsewhere (not part of this change)

G57 receipts, G58 contract run, backup-folder and scratch-file triage: tracked in claude-mem list `service-capability-hook`.
