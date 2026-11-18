# Case evidence and scene workflow fix — 2026-11-16

## Findings

- The local SPZ renderer screenshot is in `PRE-CASE LOCAL TEST` mode. That mode deliberately exports locally and does not write a case asset or marker. The saved marker count on the case page reads the case-scoped `scene_markers` owner.
- A durable marker can be placed from the case Evidence Board's Detective Mode. The Crime Scene page did not link users to that entry point, making the empty state look like placement had failed.
- The upload modal maps HTTP 401 to “sign-in session unavailable.” In development, a stale `auth_session` cookie could prevent the configured development identity from being used for that request. Production remains fail-closed.
- The modal's picker listed video formats but its validator rejected those extensions, and the submitted evidence type labeled non-images as documents. Audio was not selectable.
- The evidence viewer opened transcript APIs for any truthy evidence ID, including non-UUID local/demo IDs that the APIs correctly reject.
- The supplied New Report screenshot shows an empty report editor, which is the expected initial state; it does not show a save failure.

## Changes now present in the shared checkout

- `sveltekit-frontend/src/hooks.server.ts`: development-only fallback to the seeded local identity after clearing an invalid session cookie; production behavior remains fail-closed.
- `sveltekit-frontend/src/lib/components/evidence/EvidenceUploadModal.svelte`: accepts supported video/audio extensions, classifies image/video/audio uploads accurately, and keeps the existing 100 MB limit.
- `sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte`: shows transcript controls only for UUID-shaped persisted evidence IDs.
- `sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte`: adds upload, board, and Detective Mode actions; explains that local preflight placement is not saved; adopts the existing dossier cream tokens/surface.

The Evidence Board already calls `invalidateAll()` after a successful upload. Therefore, a successful case-scoped upload should reload the server-owned evidence list; it does not automatically place the new exhibit as a scene marker. The user must choose it in Detective Mode and save the marker.

## Verification and limits

- Targeted `git show --check` for the four files: no whitespace errors reported.
- No tests or typecheck were run in this turn.
- Browser proof is outstanding. At the time of the read-only probe, port 5173 had a listener but its HTTP request timed out; port 5174 refused the connection. No server was restarted.
- The shared checkout's HEAD advanced to `9bb108bb8d7` during this work and now contains these edits. I did not run a commit command. Remaining unrelated checkout state includes the `claude-mem`, `turbovec`, and `granite-docling-258M` entries.

## Status

- **CREATED:** actionable upload and scene-placement entry points; invalid local IDs no longer trigger transcript requests.
- **WIRED:** upload session fallback is restricted to development bypass; board refresh remains the existing post-upload path; scene page links to the existing marker writer.
- **PROVEN:** source changes are present and scoped whitespace check is clean.
- **DONE:** no. Authenticated upload, evidence-board refresh, marker save/reopen, and transcript behavior need a responsive app and browser verification.

```yaml
likely_cause: Local preflight assets were mistaken for saved case scene data, while an invalid development session cookie and non-persisted fixture IDs exposed separate upload and transcript errors.
evidence:
  - sveltekit-frontend/src/hooks.server.ts
  - sveltekit-frontend/src/lib/components/evidence/EvidenceUploadModal.svelte
  - sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte
  - sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte
  - read-only port probe: 5173 listener timed out; 5174 refused connection
patch_targets:
  - sveltekit-frontend/src/hooks.server.ts
  - sveltekit-frontend/src/lib/components/evidence/EvidenceUploadModal.svelte
  - sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte
  - sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte
safe_next_command: "git show --check --format= HEAD -- sveltekit-frontend/src/hooks.server.ts sveltekit-frontend/src/lib/components/evidence/EvidenceUploadModal.svelte sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte 'sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte'"
smoke_command: "From the operator's responsive signed-in app: upload one small image to the case, confirm it appears on the Evidence Board, open Detective Mode, save a marker, reopen Crime Scene, and confirm the saved marker; also open a saved video transcript and a local non-persisted preview."
report_path: docs/reports/case-evidence-scene-workflow-fix-20261116.md
```

## Live follow-up (2026-11-17)

- Port 5173 now responds; 5174 is not listening. A fresh local request to `/api/auth/session` returns an authenticated development session. An empty, no-file POST to `/api/evidence/upload` passes the auth guard and stops at multipart validation (400); no file or evidence record was submitted.
- Read-only requests for the case ID supplied with the screenshots return `Case not found` from both the evidence and scene-marker APIs, and the crime-scene page returns 404 in this local development identity. The first 50 cases visible to that identity contain no title matching “bridge.” This does not establish what the user's logged-in browser session sees, but it prevents a safe save/reopen proof against the supplied case from this session.
- Clarified the selected-image board action from “Set the scene” to “Place evidence marker.” It opens the case-linked image relief; its marker queue saves through the existing case/evidence-scoped marker API. The separate SPZ pre-case screen remains a local preview and does not create case records.
- No live upload or marker write was attempted. The case-specific save/reopen path remains unverified until the supplied case is visible to the active application session.

## Follow-up (2026-11-17)

- `EvidenceTranscriptPanel.svelte` now rejects non-UUID local/demo IDs before requesting transcript data and shows a preview-only explanation. This prevents the screenshot's `Invalid evidence ID` response from being presented as a transcription failure. Its tests now use persisted-ID-shaped fixtures and cover the non-persisted preview case.
- The Crime Scene page now distinguishes Evidence Board pins and local preflight placements from case-scoped saved scene markers, and labels the Detective Mode action as “Place and save evidence marker.” Existing evidence-linked marker writes remain the owner.
- The board loader auth spec now isolates `loadSceneSnapshot` and uses the real Drizzle exports with only query helpers mocked. Focused upload, transcript, board-loader, and marker-save tests passed: 4 files, 25 tests.
- `svelte-check` started but produced no completion output and was interrupted after an extended wait. No live browser was available: ports 5173 and 5174 had no listener at the time of inspection. Authenticated upload and save/reopen therefore remain unproven in the running app.

```yaml
likely_cause: The transcript drawer treated a local demo identifier as a persisted evidence UUID, while users conflated board-layout pins and local preflight placements with evidence-linked case-scene markers.
evidence:
  - sveltekit-frontend/src/lib/components/evidence/EvidenceTranscriptPanel.svelte
  - sveltekit-frontend/src/lib/components/evidence/EvidenceTranscriptPanel.spec.ts
  - sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte
  - sveltekit-frontend/src/routes/(app)/cases/[id]/board/board-page-server-auth.spec.ts
patch_targets:
  - sveltekit-frontend/src/lib/components/evidence/EvidenceTranscriptPanel.svelte
  - sveltekit-frontend/src/lib/components/evidence/EvidenceTranscriptPanel.spec.ts
  - sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte
  - sveltekit-frontend/src/routes/(app)/cases/[id]/board/board-page-server-auth.spec.ts
safe_next_command: "git diff --check -- sveltekit-frontend/src/lib/components/evidence/EvidenceTranscriptPanel.svelte sveltekit-frontend/src/lib/components/evidence/EvidenceTranscriptPanel.spec.ts sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte sveltekit-frontend/src/routes/(app)/cases/[id]/board/board-page-server-auth.spec.ts"
smoke_command: "With the current app running at 5173, upload a small case image, confirm it appears on the board, save an evidence-linked marker in Detective Mode, verify it on Crime Scene, then open both a persisted video and a local preview transcript."
report_path: docs/reports/case-evidence-scene-workflow-fix-20261116.md
```
