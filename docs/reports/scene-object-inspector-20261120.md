# Scene Object Inspector Progress

Date: 2026-11-20
OpenSpec: `crime-scene-reconstruction` / `CASE-SCENE-LIVE-01-selection-inspector`

## Change

Selecting a scene actor, primitive, asset, or mask-derived object now renders a read-only inspector projection from the resolved scene plan. It shows the object handle/type, available description and placement, matching event IDs and review labels, each event's own clock/interval/uncertainty, and source revisions for citations present in the plan. A citation that is not in the resolved source list is shown as unresolved and receives no link.

The synthetic beach demo explicitly disables source navigation because its evidence item is fixture metadata, not an authorized case evidence record. The case builder retains the existing case-scoped evidence URL; that route remains responsible for authorization.

## Verification

- Vitest: `scene-object-inspector-v1.spec.ts` and `scene-runtime-three-v1.spec.ts`, 8/8 passed.
- Playwright Chromium/WebGL2: `parent-atlas-v2-character-runtime.spec.ts`, 1/1 passed, including object selection, description, event ID, source clock/interval, and suppression of synthetic evidence links.
- `npm run check:native`: 2182 files, 0 errors, 1 existing warning in `routes/(app)/demos/curfew-beach-scene/+page.svelte` for a non-reactive canvas ref; no changed-file diagnostics.
- `openspec validate crime-scene-reconstruction --strict`: passed.
- Scoped `git diff --check`: passed; Git reported only the existing LF-to-CRLF working-copy notice.

## Remaining proof

The browser test uses the synthetic demo. Signed-in case evidence navigation, case authorization behavior, source-review freshness, scene persistence, and fresh authorized reload were not exercised. No database, SeaweedFS, or feature-gate state was changed.

## Patch targets

- `sveltekit-frontend/src/lib/reconstruction/scene-object-inspector-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-object-inspector-v1.spec.ts`
- `sveltekit-frontend/src/lib/components/reconstruction/SceneRuntimeRecipeCanvas.svelte`
- `sveltekit-frontend/src/routes/(app)/demos/curfew-beach-scene/+page.svelte`
- `sveltekit-frontend/tests/e2e/parent-atlas-v2-character-runtime.spec.ts`
- `openspec/changes/crime-scene-reconstruction/tasks.md`
