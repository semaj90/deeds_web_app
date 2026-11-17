## 1. Confirm Existing Owners and Contracts

- [ ] 1.1 Trace the current modal depth URL to its authenticated route and define the canonical manifest fields without adding a parallel route.
- [ ] 1.2 Select the existing case/evidence authorization helper and verify the disposable PostgreSQL and SeaweedFS integration targets are independently allowlisted.
- [ ] 1.3 Confirm the annotation owner and migration entrypoint; do not reuse generic canvas JSON unless it can enforce the complete source/depth contract.

## 2. Verify Source-Bound Depth Artifacts

- [ ] 2.1 Add manifest schema validation for evidence ID, source digest/revision, frame identity, dimensions, depth digest, and model revision.
- [x] 2.2 Verify the exact fetched depth bytes by SHA-256 and validate decoded dimensions before labeling/rendering the artifact as stored depth. The route now requires the recorded digest and manifest dimensions, verifies the fetched PNG bytes and IHDR dimensions, and the viewer decodes both images and requires exact source/depth pixel-dimension parity; focused route/geometry tests pass. A live authorized evidence row currently has no source-bound depth artifact, so real artifact readback is still a separate open gate.
- [ ] 2.3 Add real-dependency API tests for valid, stale, wrong-source, corrupt, missing, and unauthorized artifacts using disposable fixtures.

## 3. Persist Revision-Bound Markers

- [ ] 3.1 Implement normalized UV marker validation, stable IDs, idempotency, actor/audit fields, and optimistic concurrency in the canonical writer.
- [ ] 3.2 Generate and review the migration; rehearse it on disposable PostgreSQL 18 and verify catalog, constraints, migration journal, and exact tuple readback.
- [ ] 3.3 Implement authorized marker read/write routes that reject stale source/depth bindings and preserve stable JSON response shapes.
- [ ] 3.4 Run real PostgreSQL and SeaweedFS save/readback integration tests against only the allowlisted disposable database and isolated object prefix.

## 4. Connect the Existing Viewer

- [ ] 4.1 Use source UV anchors with the active displaced relief geometry for marker placement, picking, dragging, projection, and LOD changes.
- [ ] 4.2 Load and save annotations through the authorized routes while retaining the current modal, editor controls, clear unavailable-depth fallback, and cleanup behavior.
- [ ] 4.3 Add stale-revision and concurrent-edit conflict UI without silently overwriting or rebinding annotations.

## 5. Prove End-to-End Behavior and Gate Promotion

- [ ] 5.1 Run authenticated Playwright against the actual app and disposable dependencies: open evidence, verify paired depth, place/move/delete, save, close/reopen, and verify exact UV/readback.
- [ ] 5.2 Verify unauthorized access, wrong-source/depth rejection, duplicate retries, concurrent edits, resize/close disposal, and zero page/console errors.
- [ ] 5.3 Record separate results for live read-path proof, disposable write/readback proof, browser proof, and hardware WebGPU; mark any unavailable service or hardware gate BLOCKED.
- [ ] 5.4 Obtain separate operator approval before any production migration, source/depth artifact write, evidence URI rewrite, or production annotation write.

## 6. Handoff: scene markers, Noir view and investigation layer (2026-11-15)

Status key: DONE = verified by a test named below. PARTIAL = implemented, not covered by the gate it belongs to. OPEN = not started.

### What is verified

| Area | Status | Evidence |
|---|---|---|
| Marker create, move, delete through shared authorization (owner or assigned attorney only; admin gets no case access; non-members get 404) | DONE (scratch) | `src/lib/server/scene-markers/scene-authz.scratch.spec.ts`, 6 tests |
| Same-case evidence check inside the create transaction, for admins too | DONE (scratch) | `create-marker.scratch.spec.ts`, 4 tests; browser: cross-case returns 422 |
| Idempotent create replay compares evidence ID, label and position against the original `MARKER_CREATED` payload; legacy events without those fields are rejected | DONE (scratch) | `create-marker.scratch.spec.ts` (mismatch refused, replay after a later move still matches) |
| Optimistic concurrency on move (stale revision returns 409 with current revision) | DONE (scratch) | `scene-authz.scratch.spec.ts`, browser Noir test |
| Marker save and create run through `src/lib/machines/marker-save-machine.ts` | DONE (browser) | Noir browser test: saved at revision 3 after the change |
| Server-side scene snapshot loaded on every board request, never cached | DONE (browser) | Noir browser test reads the header and inspector from PostgreSQL |
| Investigation facets, evidence links, notes, AI summary export, four-eyes review | DONE (scratch + browser) | `investigation-e2e.scratch.spec.ts` (12), `investigation-relations.scratch.spec.ts` (8), `investigation-flow` browser run |
| Schema for `scene_markers` anchors (IMAGE_UV columns, source revision columns) | DONE (live, applied 2026-11-15 after rehearsal) | `drizzle/manual/scene_markers_anchor.sql`, sidecar registry |

### What is not done

- **Marker create and move do not accept UV anchors.** The `scene_markers` table has `anchor_kind`, `anchor_u`, `anchor_v` and the source-revision columns, but the marker routes accept only x, y, z. This is task 3.1 and 3.3 in part: UV validation and revision binding are missing from the writer.
- **Task 3.2 is not met.** The anchor migration was applied to the live database after a rollback rehearsal on live. The task asks for a disposable PostgreSQL 18 rehearsal, not live.
- **Task 3.4 and the SeaweedFS side are not started.** No object storage is involved in the marker work so far.
- **Section 4 (viewer connection) is not started.** The relief viewer is not connected to the scene marker routes. The Noir view uses CrimeSceneViewer3D, not the relief viewer.
- **Whole-scene revision save is not built.** The revision API (`scene-document-revisions-v1.ts`) validates manifests (HYPOTHESIS status only, unverified SOURCE assets rejected), but nothing in the UI builds a manifest or calls it.
- **2D icon markers on the detective board are not built.** No board-space or image-space placement is stored for them.
- **Primitive identity in the inspector is unlinked.** There is no primitive-to-evidence registry, so `ExhibitInspectorPanel` shows every 3D primitive as unlinked.
- **Second-user approval and report export are not browser-tested.** Dev sign-in only provides one user.

### Open decisions

1. Admin access to case scenes: the shared helper gives admins no case access. This matches the board, investigation API and revision routes. It should be documented in the product permissions, not only in code.
2. Which evidence gets 2D UV markers: photo exhibits only is the suggested default, because video and audio have no fixed image plane.
3. Whether board icons are stored by image position (existing IMAGE_UV columns) or by board-canvas position (needs a new column, so a reviewed migration).

### Commands used for verification (run from `sveltekit-frontend`, scratch database only)

```
INVESTIGATION_SCRATCH_E2E=1 DATABASE_URL=<...legal_ai_live_integration_scratch> npx vitest run src/lib/server/scene-markers/
INVESTIGATION_SCRATCH_E2E=1 DATABASE_URL=<...legal_ai_live_integration_scratch> npx vitest run src/lib/server/investigation/
npx svelte-check-native --workspace . --output machine
```

Browser scripts used during this work live in the session scratchpad, not in the repository. Live PostgreSQL was not written to by any test.

### Next safe milestone

Add UV anchor support to the marker create path, with same-case checks, replay comparison and a rejection test for anchors outside 0..1, then rehearse on a disposable PostgreSQL 18 database before touching the live database.
