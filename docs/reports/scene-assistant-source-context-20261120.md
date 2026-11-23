# Scene Assistant Source Context

Date: 2026-11-20

## Change

The case scene assistant's draft snapshot now carries the selected event window and, when loaded, the selected video's revision-pinned timeline: evidence ID, source SHA-256 revision, analysis revision, evidence-local clock ID, and approved/admitted event intervals. This context is included in the base-draft SHA-256 token and in the prompt. The prompt explicitly treats it as context rather than a finding, forbids inferred clock offsets, and distinguishes a reviewed source event from a draft hypothesis.

Before accepting an assistant response and again before applying its selected changes, the client re-reads the authorized video-event endpoint and compares the current case, evidence ID, source revision, analysis revision, and approved/admitted event intervals. A mismatch leaves the draft unchanged and asks the user to reload the timeline and request fresh suggestions. The existing server-side scene-plan resolver remains responsible for canonical source/review validation.

## Verification

- `npm test -- --run src/lib/reconstruction/scene-assistant-patch-v1.spec.ts src/lib/reconstruction/case-scene-plan-draft-v1.spec.ts`: 2 files / 11 tests passed.
- `npm run check:native`: 2181 files, 11 errors, 1 warning. Errors remain in `StorybookAuthorities.svelte` and its API route; the warning remains in the curfew-beach demo. No diagnostics point to the changed assistant component or contract.
- Signed-in configured-model streaming and browser interaction were not run. No database or object-store writes were made.

## Remaining limits

Only the selected video timeline has a live source-revision recheck in the assistant handoff. Other selected evidence sources are authoritatively revalidated when the server resolves the scene plan. The assistant remains a proposal generator; it cannot review evidence, align clocks, or save the scene.
