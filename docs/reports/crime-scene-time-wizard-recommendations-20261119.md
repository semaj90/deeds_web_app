# Crime Scene Time Wizard Recommendations

## Current evidence

- No `TimeWizard`, `time-wizard`, or `timeline-wizard` component was found under `sveltekit-frontend/src`.
- The current scene-intent demo can select among the fictional case's six scene timelines. Its fixture keeps source clock domains and scene coordinate frames separate: `sveltekit-frontend/src/lib/server/reconstruction/fixtures/fictional-bank-case-seed-v1.ts`.
- The crime-scene schema distinguishes measured events from hypotheses and requires evidence citations: `sveltekit-frontend/src/lib/server/reconstruction/crime-scene-schema.ts`.
- The task ledger records a deterministic source-time animation preview and fixture-backed asset readback, with live durable writes and signed-in replay still pending: `openspec/changes/crime-scene-reconstruction/tasks.md` (animation entry near line 572).
- Downloads contains `parent_atlas_face_primitives_starter (1)/parent_atlas_face_primitives`. Its `face-math.ts` generates a small parametric head with semantic landmarks; `face-three.ts` builds a Three.js group and optional hair cards. The starter labels masculine/feminine presets as art direction, not inferred sex or gender. Its Svelte example still has a placeholder scene reference. It is not integrated into the app.

## Recommended user flow

Keep **Build a blockout** and **Add evidence first** as equal entry choices. Both lead to the same case scene revision, but neither silently chooses coordinates or time alignment for the other.

| Wizard step | User action and recommendation | Output |
|---|---|---|
| 1. Choose a starting point | Choose a schematic blockout first, or select evidence first. Permit adding evidence and changing the blockout later. Label uncalibrated layouts as illustrative. | Draft scene revision and explicit coordinate status |
| 2. Add sources | Select authorized evidence items. Display each source's own media clock, wall-clock metadata, timezone when known, duration, and uncertainty. Keep uploads and original hashes immutable. | Source manifest with distinct clock domains |
| 3. Align time | Initially show sources on separate lanes. Let the user choose shared visual/audio events as alignment anchors; propose an offset and residual/uncertainty interval. Require review before linking lanes. If anchors are insufficient, preserve separate clocks and mark alignment unresolved. | Revisioned, reviewed source-to-case time transforms; no forced global ordering |
| 4. Select scenes and events | Choose source intervals to form scene chapters. Offer scene-cut, transcript, OCR, detector, and event proposals as separate evidence-linked items. Show skipped stages, failures, unknown areas, and conflicting observations. | Scene chapters with source spans and coverage state |
| 5. Add actor placeholders | Create stable pseudonymous actor IDs such as `ACTOR-01`; record appearance observations separately from legal identity, role, or guilt. A reviewer may link observations across sources; the AI must not join a POI to a detained person from appearance alone. | Actor registry and explicitly reviewed cross-source links |
| 6. Choose representation | Default to a neutral proxy. Offer the downloaded starter's style presets as optional generated art direction; keep hairstyle independent. Attach a portrait as a separately authorized evidence reference or reviewed visual aid. Do not bake it into a mesh by default or present the resulting head as an identification. | Generated placeholder recipe/GLB reference, distinct from source image |
| 7. Place and annotate | Start with image-space boxes, masks, and polygon outlines tied to source dimensions and exact frame time. Offer an uncalibrated blockout. Enable calibrated placement only after the user supplies or accepts calibration and scale evidence. | Editable scene cells with evidence citations, uncertainty, and transform status |
| 8. Review and save | Let the reviewer accept, edit, dispute, or leave each event/annotation unresolved. Save a new scene revision and immutable derived artifact references; never overwrite original evidence. Show a generated event report with related evidence and all unresolved items. | Revisioned scene, review decisions, event report, and artifact hashes |

## How AI recommendations should work

Give AI only the selected case, source revision, time window, approved observations/transcript spans, and current review state through the existing canonical context path. Each suggestion should include its cited source and interval, model/run version, confidence as a proposal score, and a clear `unknown` or `conflict` option. Do not let model output create identity joins, synchronize clocks, calibrate geometry, or auto-accept events.

Use the existing durable job/analysis owners for extraction and generation. ACP packets can carry bounded, validated procedure requests and artifact references; A2A can coordinate registered agents if that existing path is needed. Neither transport should become a second scheduler or a route for arbitrary tool execution.

## Implementation boundaries

- **SSR:** load authorized case metadata, source manifests, scene revision, and review state.
- **CSR:** run the interactive timeline, annotation editor, and existing Three.js viewport after mount; keep one renderer and reuse the current scene.
- **XState v5:** model wizard step, pending edits, validation, and resumable UI transitions. Persist canonical checkpoints through the existing case/scene APIs rather than treating client state as authoritative.
- **Workers:** reserve bounded workers for measured CPU-heavy frame decoding, contour compilation, and large batch operations. Keep one small procedural head on the main client path; it does not justify N-API, SIMD, or a new worker pool by itself. Gate GPU tasks through the existing resource lease.
- **Redis/Valkey:** cache revision-keyed progress and derived manifests with bounded expiry. PostgreSQL remains canonical for case identity, revisions, and review; SeaweedFS stores larger immutable GLB/image/video artifacts.
- **Exports:** provide a reviewer-readable event/evidence report and scene revision export. Keep animation/GLB export as a separate optional presentation artifact that cites the event, source-time mapping, and scene revision.

## Use of the downloaded face starter

Use its deterministic mesh math and Three.js adapter as an optional placeholder head after a neutral actor proxy and scene workflow already load. Preserve its own generated-asset provenance and recipe revision. Store the recipe and registry metadata in the existing scene/asset owners, then store the exported GLB through the existing content-addressed artifact path. Do not copy its starter Svelte component wholesale, create another canvas, import its Node-API addon into the browser, or use its presets as evidence-derived labels. Its supplied sample GLBs and TypeScript tests are package artifacts; their app compatibility and authorized save/reopen are not verified.

The portrait workflow should remain separate: preserve original image evidence; if the user requests a visual reference, create a derived crop with source hash, crop transform, reviewer, and revision. Attach the reference to the actor card without treating it as mesh texture truth or a biometric match.

## First shippable slice

1. Add a Time Wizard entry choice for blockout-first or evidence-first.
2. Show independent source lanes with clock metadata and uncertainty; support manual reviewed anchor pairs and keep unresolved clocks separate.
3. Select one scene interval, create a neutral placeholder actor, and attach source-linked annotations.
4. Save and reopen the reviewed scene revision and produce a report of accepted, disputed, and unresolved events with exact evidence links.
5. Only then integrate the generated face asset as an optional actor head and add animation/export.

## Proof gates

- **Created:** wizard contracts and UI exist.
- **Wired:** authorized source, timeline, observation, actor, and scene owners connect through actual callers.
- **Proven:** a signed-in browser test saves and reopens a scene, verifies source revisions and alignment transforms, and reads back artifact hashes independently.
- **Done:** user review, failure/unknown handling, access control, persistence, and export all pass the owning acceptance criteria.

Progress update (2026-11-19): the existing global `SetupWizard.svelte` now includes an optional Case Scene Workspace step after its case and evidence steps. The explicit CTA closes the general tour and opens the case list; it does not open Detective Mode. The AI setup step reads the loaded chat model through the authenticated llama-server status route and no longer shows Ollama pull commands. This is only an onboarding entry point. A case-bound Time Wizard, cross-source alignment UI, actor/face asset integration, generated report, and authorized save/reopen proof remain unimplemented.
