# Case evidence and scene upload repair — 2026-11-17

## Findings

- The Evidence Board demo cards use IDs such as `e-002`. The viewer APIs require persisted UUID evidence IDs, so opening a demo card attempted real transcript and annotation reads and returned “Invalid evidence ID.”
- The case evidence upload page used a server action that called the upload API with global `fetch`, which does not forward the browser's Lucia cookie. That action could return 401 even when the browser was signed in. The page's direct XHR path is separate.
- The direct upload progress row accepted only HTTP 200/201 even though the upload endpoint can return 202 for an accepted durable job. It also discarded the returned evidence ID, so the user had no direct route from upload to scene placement.
- The board upload modal had a separate session preflight. That could reject the upload before the upload endpoint evaluated the request; the endpoint's authenticated POST is the authoritative check.
- Existing local 3D preflight placements and saved case-scene markers use different owners. A preflight placement is not a persisted scene marker until the case marker API confirms a save.

## Changes

- Added a case-evidence target resolver and blocked demo/unlisted items from opening the persisted evidence viewer. The board now explains that sample cards are not uploaded case evidence.
- Routed a successful board upload into Detective Mode with the uploaded exhibit selected after the authorized case list refreshes. No marker is created automatically; the investigator still chooses and saves placement.
- Changed the case upload server action to use SvelteKit's event fetch so same-origin session cookies reach the upload endpoint.
- Accepted all successful 2xx upload responses, retained the returned evidence ID, surfaced the server's upload error, and added a “Review and place this exhibit in the scene” link. A 401 now has a same-origin sign-in recovery link.
- Removed the separate upload-session preflight so a stale or divergent preflight response cannot block a valid upload. The upload POST remains same-origin with credentials; its actual 401 response keeps the selected file available and offers sign-in recovery.
- Required the upload modal response to contain a UUID-shaped saved evidence ID and a non-empty processing job ID before reporting the accepted upload to the board.
- Made every board viewer entry validate that the selected exhibit is a UUID-shaped member of the server-loaded case list. The upload callback and `view=detective` deep link now open the image-relief/Detective Mode view and its scene assistant, without placing a marker automatically.
- Aligned scene and pose component types with the validated calibration/pose contracts; no coordinate or review semantics changed.
- Kept SCENE-01, SCENE-07 and SCENE-08 open in the OpenSpec ledger. These UI changes do not prove live upload, saved marker readback, or scene reconstruction.

## Verification boundary

Focused Vitest verification passed: 6 files, 31 tests. `npm run check` reported 0 errors and 9 warnings in 3 files. Scoped `git diff --check` passed (only LF-to-CRLF notices). No authenticated browser upload, saved marker readback, live database write, or object-store write was performed. Port 5173 has a listener; that alone does not prove which checkout or user session it serves.

## Structured closeout

- **likely_cause:** A separate session probe could block the upload before the authoritative POST, and the Detective Mode deep link did not select the relief view; sample IDs could also reach viewer APIs.
- **evidence:** `src/lib/components/evidence/evidence-modal-target-v1.ts`; `src/lib/components/evidence/EvidenceUploadModal.svelte`; `src/routes/(app)/cases/[id]/board/+page.svelte`; `src/routes/(app)/cases/[id]/evidence/upload/+page.svelte`; `src/lib/components/evidence/EvidencePoseAnnotationEditor.svelte`; `src/lib/components/evidence/SceneVideoEventBindings.svelte`; `src/app.d.ts`; `openspec/changes/crime-scene-reconstruction/tasks.md`.
- **patch_targets:** Those seven source/ledger files plus this report.
- **safe_next_command:** `git diff --check -- sveltekit-frontend/src/lib/components/evidence/EvidenceUploadModal.svelte 'sveltekit-frontend/src/routes/(app)/cases/[id]/board/+page.svelte' sveltekit-frontend/src/routes/'(app)'/cases/'[id]'/evidence/upload/+page.svelte openspec/changes/crime-scene-reconstruction/tasks.md`
- **smoke_command:** `cd sveltekit-frontend; npm exec -- playwright test tests/e2e/evidence-upload-and-case-scene.spec.ts` (authorized browser proof still needed; this flow was not run).
- **report_path:** `docs/reports/case-evidence-scene-upload-ui-repair-20261117.md`.
