# Phoenix Wright Courtroom Integration

## Status

The Phoenix Wright-style courtroom scene is already live in the app.

### Wired surfaces

- Route: `sveltekit-frontend/src/routes/(app)/demos/courtroom-sim/+page.svelte`
- Server load: `sveltekit-frontend/src/routes/(app)/demos/courtroom-sim/+page.server.ts`
- Scene manager: `sveltekit-frontend/src/lib/courtroom/courtroom-scene.svelte.ts`
- Types and timeline: `sveltekit-frontend/src/lib/courtroom/courtroom-types.ts`, `sveltekit-frontend/src/lib/courtroom/timeline-engine.svelte.ts`
- HUD: `sveltekit-frontend/src/lib/components/courtroom/CourtroomHUD.svelte`
- Sidebar entry: `sveltekit-frontend/src/lib/components/layout/YorhaSidebar.svelte`

## What the archived note contributes

The archived research in `next_steps/archive/3D_PROSECUTOR_SIMULATION_DEEP_RESEARCH.md` gives the legal realism and fictional-case model. That should remain the content/governance reference, while the live route remains the playable surface.

## Remaining work

1. Keep the courtroom scene as a presentation lane only.
2. Keep fictional case generation and legal-canon sourcing in the backend pipeline.
3. Avoid merging courtroom UI state with canonical Atlas packet state.
4. Add richer character models, animations, and evidence stand assets only if they do not change the authority boundary.
5. Keep the fallback manifest covered by a route-level smoke test so the demo stays usable when courtroom rows are not seeded.

## Integration rule

Use the courtroom scene for interactive presentation, objections, and trial flow. Use the Atlas retrieval and packet layers for sourcing, evidence, and provenance. Do not let the scene become the source of truth.
