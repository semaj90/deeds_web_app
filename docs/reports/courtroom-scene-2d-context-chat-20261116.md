# Courtroom scene 2D view and contextual chat demo

Date: 2026-11-16

## Change

Extended the existing `/demos/courtroom-palette-chat` page with a perspective 3D / orthographic 2D presentation switch. Both modes render the same imported OBJ, indexed palette material, and optional local video texture. The 2D mode adds a cream dialogue card that describes the view as illustrative and focuses the existing contextual chat input.

Updated `ContextualChatDemo` to accept an optional input ID, removed the demo's hard-coded `demo-user` identity from client requests, and corrected its model description. The courtroom demo uses the existing authenticated `/api/contextual/chat` route with tool calls disabled by default. That route calls the environment-configured local llama-server model; it does not force a particular model alias or establish case-grounded retrieval.

## Verification

- `git diff --check` passed for the touched tracked files.
- `npm run check:fast` reported five errors outside the changed demo page and chat component. The visible diagnostics included `src/lib/client/video-editor/opfs-video-cache.ts`, `src/lib/server/atlas/fsm/nes-fsm-native-runtime-v1.ts`, `src/lib/splat/generated-scene-asset-provenance-v1.ts`, and two diagnostics in `src/lib/splat/scene-primitive-registry-v1.ts`.
- `openspec validate parent-atlas-gpu-prellm-recommendation-v1 --strict` passed.
- No browser run or chat submission was performed. OpenSpec task 10.16 remains open.
- This is an orthographic 2D presentation of existing 3D geometry, not a 3D reconstruction or mesh conversion.
- No evidence is uploaded; the video picker remains local to the browser.

## Status

- CREATED: orthographic presentation state and dialogue overlay.
- WIRED: overlay action focuses the existing assistant; chat uses the configured local model route.
- PROVEN: scoped whitespace check only.
- DONE: no; browser interaction and runtime-model confirmation remain open.

## Handoff

- likely_cause: The demo had a Three.js perspective view and a generic chat panel, but no flat presentation mode or dialogue-style connection between them.
- evidence: `sveltekit-frontend/src/routes/(app)/demos/courtroom-palette-chat/+page.svelte`, `sveltekit-frontend/src/lib/components/ai/ContextualChatDemo.svelte`, and the existing `/api/contextual/chat` route using the configured llama-server provider.
- patch_targets: `sveltekit-frontend/src/routes/(app)/demos/courtroom-palette-chat/+page.svelte`, `sveltekit-frontend/src/lib/components/ai/ContextualChatDemo.svelte`, `openspec/changes/parent-atlas-gpu-prellm-recommendation-v1/tasks.md`.
- safe_next_command: `git diff --check -- sveltekit-frontend/src/lib/components/ai/ContextualChatDemo.svelte openspec/changes/parent-atlas-gpu-prellm-recommendation-v1/tasks.md`.
- smoke_command: `cd sveltekit-frontend; npm exec -- playwright test tests/e2e/courtroom-palette-chat.spec.ts` (browser proof pending; use the existing dev session and do not start queue workers as a side effect).
- report_path: `docs/reports/courtroom-scene-2d-context-chat-20261116.md`.
