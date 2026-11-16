# Scene Object to Evidence Assistant Bridge

Date: 2026-11-15

## Implemented

- Scene objects can carry optional exact evidence ID/source-revision bindings. Existing scene manifests remain valid because the fields are additive and optional.
- The source-bound relief mesh reuses its stable object ID across saves and records its evidence binding directly on the object.
- “Analyze this 3D object” sends the selected object ID, scene revision, source evidence ID/revision, and single-image-hypothesis caveat through the existing case assistant callback.
- After the response arrives, a separate user action can accept it as a reviewed scene note. The client reloads the current scene revision, verifies the source binding and target object, then appends a manifest-only revision using the existing authorized scene persistence route.
- Accepted notes are bounded to 8,000 characters and schema-checked against the source revision attached to the target object. They do not modify geometry or source evidence.

## Status

- CREATED: Optional object-level source binding and reviewed-note contract.
- WIRED: Relief mesh, selected-object assistant prompt, and explicit human acceptance action through the existing scene revision client.
- PROVEN: Not yet. Only scoped diff validation was run; tests, browser checks, and live PostgreSQL/SeaweedFS independent readback were not run.
- DONE: No. ACE admission and exact citation-registry validation are still missing. The current case chat is not a typed recommendation packet, so assistant citations are not independently validated by this bridge.

## Changed files

- `sveltekit-frontend/src/lib/splat/scene-document-v1.ts`
- `sveltekit-frontend/src/lib/components/evidence/Evidence3DModal.svelte`
- `openspec/changes/parent-atlas-spz-detective-renderer/tasks.md`

## Validation

- `git diff --check -- <changed files>`: passed.
- No tests, typecheck, browser run, service startup, database write, or live storage readback was performed.

## Required next proof

Validate a typed recommendation against authorized evidence/source spans and ACE admission, accept it through the UI, independently read back the new scene revision, and verify cross-case denial and stale-revision rejection in a controlled browser/database fixture.
