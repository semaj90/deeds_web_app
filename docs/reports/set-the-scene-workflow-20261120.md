# Set the Scene Workflow · 2026-11-20

## Outcome

Implemented the Set the Scene handoff as a typed sidecar into the existing authorized case-scene page. The assistant CTA is shown after its latest response, carries the case, mode, prompt, and selected evidence IDs, and does not create another assistant, renderer, plan schema, or persistence owner. The server validates the envelope and resolves evidence IDs against the authorized case's current evidence list before passing the request to the builder.

The user now prepares a bounded proposal, reviews its environment, coordinate status, actor/primitive/placement counts, timed source-clock cues, unknown/disputed motive/method status, and source revision citations, then explicitly selects **Generate Preview**. The existing Three.js canvas supports camera presets, selectable scene object handles, source navigation, separate source-clock lanes, and the existing memory panel. Scene saving follows the server-provided `SCENE_PERSISTENCE_ENABLED` value; when false, the button is disabled with an explanation.

## Transition coverage

| Transition / case | Result |
| --- | --- |
| Access accepted → input preparation → missing inputs | Covered in XState unit test |
| Unauthorized access | Covered in XState unit test |
| Valid request → proposal review → preview ready → object review | Covered in XState unit test |
| Invalid proposal and render failure | Covered in XState unit test |
| Cancellation and retry | Covered in XState unit test; current fetch owner aborts both request stages |
| Late response after case switch / newer request | Case/request token predicate and XState reset from active review are covered; builder aborts preview and reviewed-event requests and discards the old preview when an in-place case switch occurs |
| Stale source conflict | HTTP 409/source revision response is classified stale; covered by request test |
| Save disabled by feature gate | Covered in XState unit test and UI has a disabled explanation |
| Evidence/source clock isolation | Existing source-local event lanes remain the runtime owner; full browser scrub/navigation is still open |
| Assistant handoff scope | Request schema and authorized evidence membership tested |

## Changed files

- `sveltekit-frontend/src/lib/reconstruction/set-the-scene-workflow-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/set-the-scene-workflow-v1.spec.ts`
- `sveltekit-frontend/src/lib/reconstruction/case-scene-plan-draft-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/case-scene-plan-draft-v1.spec.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-assistant-patch-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-assistant-patch-v1.spec.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-generation-plan-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/set-the-scene-workflow-v1.spec.ts`
- `sveltekit-frontend/src/lib/reconstruction/request-scene-preview-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/request-scene-preview-v1.spec.ts`
- `sveltekit-frontend/src/lib/components/ai/AIAssistantPanel.svelte`
- `sveltekit-frontend/src/lib/components/reconstruction/CaseScenePlanBuilder.svelte`
- `sveltekit-frontend/src/lib/components/reconstruction/SceneRuntimeRecipeCanvas.svelte`
- `sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.server.ts`
- `sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte`
- `sveltekit-frontend/playwright.set-the-scene.config.ts`
- `sveltekit-frontend/tests/e2e/set-the-scene-workflow.spec.ts`
- `sveltekit-frontend/tests/e2e/set-the-scene-noop-global-setup.ts`
- `openspec/changes/crime-scene-reconstruction/tasks.md`

## Verification

- Revalidation on 2026-11-20: focused plan/workflow/draft/assistant suites **19/19 passed**. The dedicated Playwright scenario was discovered and **skipped** because `PW_SCENE_CASE_ID` and signed-in storage state are not configured; this is not browser proof.
- `npm run check:native`: **2181 files, 11 errors, 1 warning**. The 11 errors remain in `StorybookAuthorities.svelte` and `storybook-authorities/+server.ts`; the warning remains in the curfew beach demo. No diagnostics point to the scene workflow files.
- No source implementation changed during this revalidation. Live browser interaction, evidence navigation, source-clock scrubbing, configured-model streaming, and authorized save/reopen remain unproven.

- Focused Vitest suites: **7 files, 63 tests passed**, covering the Set the Scene coordinator, assistant patches, draft-plan compile/reopen, plan validation, runtime recipe, timeline/clock evaluation, and scene-document cues. Added multi-target event editing; a round trip preserves two actor targets and a prop target on one source clock, and duplicate targets are rejected. The coordinator test covers resetting from active object review to a new case. The builder aborts the selected video's pending event-timeline fetch on source change, case change, or unmount.
- `npm run check:native`: **2180 files, 11 errors, 0 warnings**. All 11 are the existing baseline in `StorybookAuthorities.svelte` and its `storybook-authorities/+server.ts`; no changed-file diagnostics.
- `npx playwright test --config=playwright.set-the-scene.config.ts` loaded its test and reported **1 skipped** because `PW_SCENE_CASE_ID` and `PW_SCENE_STORAGE_STATE` were not supplied. The test requires an authorized staging session and is intentionally read-only. No browser screenshot or live authorized case was available.
- An initial Playwright command used the repository default config, whose global setup attempted stale-test cleanup while the database was unavailable (`CONNECTION_REFUSED`). It was stopped; no test data was changed. The dedicated config uses a no-op setup and does not seed or clean application data.

- The blockout persistence scenario is available in the dedicated config. It authors a box, a scene-time cue and a note, appends one revision, reads it via a separate authorized GET, reloads the page, and checks the downloaded report against the save receipt. Run it only with an authorized staging case and its existing persistence gate enabled. Supply `PW_SCENE_VERIFY_STAGING_WRITE=1`, `PW_SCENE_BASE_URL`, `PW_SCENE_CASE_ID`, and `PW_SCENE_STORAGE_STATE`. The focused run discovered two scenarios and skipped both. Separate database readback and the evidence-backed path remain unverified.
- No scene write gate was enabled. PostgreSQL/SeaweedFS save, independent readback, fresh-session reopen, and browser interaction remain unverified.

## Remaining work

Keep `CASE-SCENE-LIVE-01-set-the-scene`, `CASE-SCENE-LIVE-02`, and `CASE-SCENE-LIVE-07` partial/open until a reviewer-signed browser run proves the assistant CTA, authorized source handoff, proposal inspection, object selection, evidence navigation, source-clock scrubbing, case-switch cancellation, and draft preservation. Test save/reopen later in an authorized staging case only if the existing feature gate is already enabled.

**likely_cause:** The assistant, case-authorized scene builder, and Three.js preview existed as separate features without a typed handoff or explicit proposal-review transition.

**evidence:** `AIAssistantPanel.svelte`, `CaseScenePlanBuilder.svelte`, `SceneRuntimeRecipeCanvas.svelte`, the case-scoped crime-scene `+page.server.ts`, focused test output, and Playwright's skipped result without `PW_SCENE_CASE_ID`.

**patch_targets:** `sveltekit-frontend/src/lib/components/reconstruction/CaseScenePlanBuilder.svelte`, `sveltekit-frontend/src/lib/reconstruction/set-the-scene-workflow-v1.ts`, `sveltekit-frontend/src/lib/reconstruction/case-scene-plan-draft-v1.ts`, `sveltekit-frontend/src/lib/reconstruction/scene-assistant-patch-v1.ts`, `sveltekit-frontend/src/lib/reconstruction/scene-generation-plan-v1.ts`, their focused specifications, and `openspec/changes/crime-scene-reconstruction/tasks.md`.

**safe_next_command:** `npx playwright test --config=playwright.set-the-scene.config.ts` after setting an authorized staging case and storage-state path.

**smoke_command:** `npx vitest run src/lib/reconstruction/set-the-scene-workflow-v1.spec.ts src/lib/reconstruction/request-scene-preview-v1.spec.ts src/lib/reconstruction/scene-runtime-recipe-v1.spec.ts src/lib/server/reconstruction/scene-generation-plan-v1.spec.ts`

**report_path:** `docs/reports/set-the-scene-workflow-20261120.md`
