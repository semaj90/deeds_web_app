# Tasks: case investigation layer (WHO / WHAT / WHY / HOW, AI summary export, review)

Status key: DONE = verified by the test named. PARTIAL = implemented, not fully covered. OPEN = not started.
Scope: the investigation layer only. Scene markers and the Noir view are tracked in `evidence-relief-source-bound-annotations` §6.

## 1. Schema (manual sidecar migrations, applied to live 2026-11-15/16 after rollback rehearsal)

- [x] 1.1 `case_investigation_facets`, `investigation_facet_evidence`, `case_ai_summary_exports` (append-only trigger). Files: `drizzle/manual/20261115_case_investigation_facets_v1_DRAFT.sql`. Registered in `drizzle/sidecar-migrations.json`.
- [x] 1.2 `investigation_facet_notes` (junction to `case_notes`), `case_ai_summary_export_sources` (lineage, append-only), `case_ai_summary_export_reviews` (review ledger, append-only), `evidence_analysis_cache` review columns, multi-column indexes, facet to `persons_of_interest` FK. File: `drizzle/manual/20261116_investigation_relations_review_v2_DRAFT.sql`.
- [x] 1.3 Drizzle declarations match live columns: 44 columns across six tables, counted. File: `src/lib/server/db/schema/investigation.ts`.
- [ ] 1.4 Rename `_DRAFT` files once no further change is expected, and update the registry entries to match. Not renamed yet, deliberately, so registry and file names stay aligned.
- [ ] 1.5 Rehearse 1.1 and 1.2 on a disposable PostgreSQL 18 database as the project rule asks. Only live rehearsal (rolled back) has been run.

## 2. Service and API

- [x] 2.1 Facet create, link and unlink evidence, link and unlink case notes, all scoped to one case. Cross-case evidence, note and person refusals tested (`investigation-relations.scratch.spec.ts`, 8 tests).
- [x] 2.2 AI summary export: bounded evidence text, manifest hashes, citations admitted only if linked to the case, lineage rows written in the same transaction, idempotent on command ID (`investigation-e2e.scratch.spec.ts`, 12 tests including HTTP routes).
- [x] 2.3 Four-eyes review: the export's author cannot review it (403, tested). Review rows are append-only (update and delete rejected, tested).
- [x] 2.4 Analysis review status (accept, reject, unreviewed), scoped to the case, tested.
- [x] 2.5 Manifest contract: deterministic hashing, citation extraction, fail-closed on unsupported citations (`investigation-manifest-v1.spec.ts`, 11 tests).
- [x] 2.6 Concurrent duplicate `commandId` no longer returns 500: a unique violation on `command_id` now returns the committed revision as a replay (`isCommandUniqueViolation` in `investigation-v1.ts`). Tested by `investigation-race.scratch.spec.ts`: two concurrent requests give one row, one replay. Caveat: that test does not prove the catch path ran, because the second request may have seen the first commit in its pre-check.
- [~] 2.7 WHY and HOW sections without facets: the prompt now says to write a section only when a facet of that kind exists, and otherwise to write "No facet recorded." Unit-tested for the prompt text only. Not yet verified: a live model summary on a case with no WHY facet. Needs one real run before it is marked done.

## 3. UI

- [x] 3.1 Investigation tab in the detective canvas: facets by kind, link evidence, export, approve and reject with the server's four-eyes error shown (`CaseInvestigationPanel.svelte`). Browser-tested with one user.
- [ ] 3.2 Note linking and person linking have API routes but no UI.
- [ ] 3.3 Second-user approval is not browser-tested. Dev sign-in provides user 1 only. Covered at service and route level.
- [ ] 3.4 Export of a report file (with hashes and source lineage) is not built. The summary is stored and displayed; no file is produced.

## 4. Crime-scene page (SSR)

- [x] 4.1 `/cases/[id]/crime-scene` loads case, markers, facets and export status on the server from PostgreSQL 18, degrades to empty data with a message (`+page.server.ts`).
- [x] 4.2 Native `<dialog>` mini-modals render in SSR HTML and open on click after hydration (browser-tested, screenshots taken).
- [ ] 4.3 The page is not linked from the main navigation; it's reached from the Investigation panel.

## 5. Open decisions

1. Export home: `case_ai_summary_exports` is kept. `case_reports` (0 rows, no readers) is intentionally left alone. Confirm before any merge.
2. Facets stay in their own table. `case_notes` stays the summary table and is linked through the junction.
3. Whether reviews need a second reviewer role beyond the four-eyes rule.

## 6. Verification commands (run from `sveltekit-frontend`, scratch database only)

```
INVESTIGATION_SCRATCH_E2E=1 DATABASE_URL=<...legal_ai_live_integration_scratch> npx vitest run src/lib/server/investigation/
npx svelte-check-native --workspace . --output machine
```

Last recorded results: investigation suites 33 of 33 (manifest 12, e2e 12, relations 8, race 1). Native check: no hits in investigation files; workspace still shows the same 5 pre-existing errors in unrelated files. Browser scripts are in the session scratchpad, not the repository. No test writes to live PostgreSQL.

## 7. Next safe milestone

Close 2.6 and 2.7 with tests, then rehearse tasks 1.1 and 1.2 on a disposable PostgreSQL 18 database before any further live change.
