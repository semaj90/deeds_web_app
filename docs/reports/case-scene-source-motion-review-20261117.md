# Case Scene Source and Motion Review

## Change

The case-scoped Crime Scene page now includes the existing video event and motion review panel for source bindings stored in a scene-document revision. The server lists at most 50 latest revisions for the already-authorized case, reads each through the existing manifest hash/schema verifier, and returns only scene ID, revision, manifest hash, event bindings, and ground-plane track proposals. Mesh data is not sent to this review panel.

The panel continues to fetch exact frame and pose context through its case-authorized APIs. Image-space trails and ground-plane proposals remain review aids; this change does not convert them into calibrated 3D motion or persist a locally placed marker.

The case upload progress row now validates the accepted response's evidence ID as a UUID before creating a scene link, and labels the action **Place in scene · open in Detective Mode**. The board reads the evidence ID from the URL and selects the authorized exhibit; the investigator still chooses where to place and save its marker.

## Validation boundary

No tests, typecheck, browser session, live database query, or object-store readback were run for this change. The UI and projection are wired in source, but production readback remains unproven. Existing upload and marker workflows are independent and must still show an acknowledged server save before a user treats placement as recorded.

## Required report fields

- `likely_cause`: The case Crime Scene route did not project verified source-event and motion bindings from saved scene-document revisions into its review UI.
- `evidence`: `sveltekit-frontend/src/lib/server/scene-document-revisions-v1.ts`; `sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.server.ts`; `sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte`; `sveltekit-frontend/src/lib/components/evidence/SceneVideoEventBindings.svelte`.
- `patch_targets`: `sveltekit-frontend/src/lib/server/scene-document-revisions-v1.ts`; `sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.server.ts`; `sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte`; `openspec/changes/crime-scene-reconstruction/tasks.md`.
- `safe_next_command`: `git diff --check -- sveltekit-frontend/src/lib/server/scene-document-revisions-v1.ts "sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.server.ts" "sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte" openspec/changes/crime-scene-reconstruction/tasks.md docs/reports/case-scene-source-motion-review-20261117.md`
- `smoke_command`: `cd sveltekit-frontend; npm exec -- playwright test tests/e2e/scene-video-event-readback.spec.ts` (run only after the authorized case fixture and local services are available; this change has not been tested).
- `report_path`: `docs/reports/case-scene-source-motion-review-20261117.md`.
