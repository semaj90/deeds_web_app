# Scene Timeline Cue Manifest

## Outcome

Added optional `sceneTimelineCues` to the existing versioned scene document. A cue stores its event ID, target object IDs and roles, one explicit clock lane and time basis, half-open interval, uncertainty, illustrative status, and a deterministic visibility or movement action. Existing v1 manifests can omit the field and keep their previous shape.

Evidence-free authored blockout cues are constrained to a scene-relative clock and cannot include an evidence object. Evidence-backed cues must match a source revision already bound to the scene and an approved `videoEventBinding`, including analysis revision, clock ID, time basis, uncertainty, and interval containment. Every cue target must be an object in the same manifest. A small adapter projects a validated stored cue into the existing pure timeline evaluator; it does not align clocks or change review status.

This is a schema/runtime contract, not yet a production UI or a demonstrated database save/reopen. The curfew demo still uses synthetic fixture data and is read-only.

## Verification

- Focused scene document and timeline tests: 31/31 passed, run serially with one Vitest worker.
- A focused test through the existing `appendSceneDocumentRevisionV1` and `readSceneDocumentRevisionV1` owners passed 1/1. It verifies that an evidence-free authored cue is appended, hashed, schema-validated, and reopened without an evidence query. The transaction is mocked; this is not PostgreSQL readback.
- `npm run check:native`: attempted once concurrently with Vitest and again alone. Both runs failed before producing diagnostics because the host ran out of memory/virtual memory. The concurrent failure was avoided on the second attempt; the isolated retry still failed with `VirtualAlloc ... errno=1455`. Therefore current type-check status is unverified.
- Earlier browser smoke for `/demos/curfew-beach-scene` returned HTTP 200, rendered a WebGL canvas, selected a report, and reported no page errors. It did not test persistence.
- Not proven: signed-in case authorization, live PostgreSQL and object-store readback, authorized API save/reopen, or cross-case denial for scene cues. The scene API remains behind its existing disabled feature gate.

## OpenCode execution fields

- **likely_cause:** The canonical scene manifest could retain an event-to-video link or a synthesized walk but had no general revision-pinned actor/prop cue for deterministic timeline rendering.
- **evidence:** `sveltekit-frontend/src/lib/splat/scene-document-v1.ts`; `scene-event-visibility-v1.ts`; `scene-document-v1.spec.ts`; `scene-document-revisions-v1.spec.ts`; 31 schema/timeline tests and 1 mocked revision-owner round-trip test passed; `check:native` could not allocate host virtual memory.
- **patch_targets:** `sveltekit-frontend/src/lib/splat/scene-document-v1.ts`; `sveltekit-frontend/src/lib/splat/scene-event-visibility-v1.ts`; `sveltekit-frontend/src/lib/splat/scene-document-v1.spec.ts`; `sveltekit-frontend/src/lib/server/scene-document-revisions-v1.spec.ts`; `openspec/changes/crime-scene-reconstruction/tasks.md`.
- **safe_next_command:** `npm run check:native` from `sveltekit-frontend`, when sufficient Windows commit memory is available; run alone.
- **smoke_command:** `npm run test -- --run --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism src/lib/splat/scene-document-v1.spec.ts src/lib/splat/scene-scale-temporal-v1.spec.ts` from `sveltekit-frontend`.
- **report_path:** `docs/reports/scene-timeline-cue-manifest-20261120.md`.
