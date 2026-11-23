# Scene revision report export — 2026-11-20

## Change

Added an authenticated, revision-pinned JSON export for saved case scene documents. The route reads a specific revision through the existing scene revision owner, requires case access, respects `SCENE_PERSISTENCE_ENABLED`, and emits no report when revision persistence is unavailable. The projection recomputes the canonical manifest SHA-256 before export.

The Three.js scene panel now has a distinct **Export saved revision report** action. It requests the exact saved revision, checks the response's case/scene/revision/hash against the current panel state before downloading, and aborts if the scene/case scope changes. The existing local preview export remains separate.

The existing authorized Set the Scene Playwright flow now asserts that saved-report export remains disabled before a saved revision exists. The isolated Playwright command executed and skipped its one test because `PW_SCENE_CASE_ID` and staging storage state are not configured; this is not browser verification.

The report includes scene objects and transforms, actor handles, evidence/source revisions, approved source events with their individual clock IDs and time bases, saved image/video chapter citations, source-bound visual cues, annotations, unresolved narrative questions, and derived asset UUID/hash/byte references. Its limitations explicitly state that illustrative cues do not prove events and that the report does not align clocks or establish identity.

## Verification

- Follow-up: the report includes procedural geometry placements, source-event references and approved clock uncertainty. The saved draft accepts notes on declared actor and prop IDs. A report regression test carries a prop placement and note through the manifest into the export. The report and scene revision suites passed 23/23.

- Focused Vitest: 2 files, 5 tests passed.
- `npx openspec validate crime-scene-reconstruction --strict`: passed.
- `npm run check:native`: 2181 files checked; 11 errors remain in the existing Storybook Authorities files, with no diagnostics in the new report files. One warning remains in the curfew beach demo.
- Isolated Set the Scene Playwright: 1 test discovered, skipped without an authorized staging case/session.
- New files have no trailing whitespace. Targeted `git diff --check` for the OpenSpec task ledger passed; a workspace-wide diff check also surfaced unrelated existing trailing whitespace in `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml`.
- Browser download, authorized live database/object-store readback, and save/reopen were not run. The export remains behind the existing scene persistence gate; no gate or database setting was changed.

## OpenSpec status

`CASE-SCENE-E2E-09-report` is **partial (created and wired)**. Browser download/navigation, signed-in staging readback, transcript spans where no saved chapter citation exists, reviewed actor-link decision data, and end-to-end report verification remain open. The parent `CASE-SCENE-E2E-09` stays open.
