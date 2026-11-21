# Scene Runtime Recipe → Three.js Consumer

## Implemented

- Added optional, typed presentation actions to scene-generation events and preserved those actions through the recipe compiler.
- Corrected the authenticated plan endpoint to validate with the canonical scene-generation-plan schema. Explicitly typed its evidence lookup map so the current native checker can resolve evidence row fields.
- Added `createSceneRuntimeThreeV1`, which consumes a Zod-validated runtime recipe and constructs its Three.js root using the existing environment, primitive, and neutral-avatar modules.
- Applies actor/primitive/asset placements and exposes target lookup plus event selection for a future inspector.
- Supports absolute-time visibility and movement actions on one selected source-clock lane at a time. A visibility-gated target starts hidden outside its interval. Movement is a presentation path and is not treated as measured action.
- Requires an explicit asset resolver and custom-environment resolver; does not fetch arbitrary URLs. It does not change authorization, persist data, or own canonical case state.

## Verification

- Focused generation-plan, resolver, runtime-recipe, runtime-renderer, and scene-document suites: **46 passed**.
- `npm run check:native`: **2,177 files checked; 11 errors, 0 warnings**. The remaining errors are in the existing `StorybookAuthorities.svelte` component and `storybook-authorities/+server.ts`; the new runtime files, plan API, and modified scene-cue files report no diagnostics.
- No browser/Playwright run, signed-in API exercise, PostgreSQL readback, SeaweedFS access, or scene save/reopen was performed in this slice.
- `git diff --check`: passed for tracked touched files; Git emitted only LF-to-CRLF notices for existing files.
- `openspec validate crime-scene-reconstruction --strict`: passed.

## Remaining integration

The new consumer has no caller in the case workspace yet. The next required work is a case-bound UI that obtains a server-resolved plan, compiles and displays it in the existing Three.js editor, provides scene selection and source-clock controls, then saves and reopens through the authorized scene-revision owner. Camera-driven cell streaming and its memory/frame-time measurements also remain open. OpenSpec `CASE-SCENE-E2E-02c-2` and `02c-3` remain partial.
