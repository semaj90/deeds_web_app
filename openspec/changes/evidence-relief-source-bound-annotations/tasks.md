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
