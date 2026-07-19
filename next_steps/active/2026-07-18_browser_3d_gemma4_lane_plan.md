# Browser 3D + Gemma4 Lane Plan

## Decision

Use three separate lanes:

1. `Three.js` for the browser 3D scene and avatar rendering.
2. `Cannon.js` only if the scene needs simple rigid-body physics.
3. `WebGPU` for browser-side rendering and GPU compute, with `@xenova/transformers` as the browser AI fallback lane.

Keep Gemma4 multi-token prediction / speculative decoding on the server-side TurboQuant launcher. Do not try to make browser WebGPU own the authoritative Gemma4 inference path.

## Reusable source lane from Downloads

The local `LiteRT.js-Mocap-main` demo is reusable for the pose/retarget layer, not for Gemma4 text generation.

Copy or adapt these pieces first:

- `src/pose/detector.js`
- `src/pose/landmarks.js`
- `src/pose/smoothing.js`
- `src/retarget/retarget.js`
- `src/retarget/characters.js`
- `src/exporter.js`
- `src/camera.js`
- `src/hud.js`
- `src/ui.js`

Use the shipped GLB assets as reference assets only:

- `public/characters/RobotExpressive.glb`
- `public/characters/Xbot.glb`

Do not treat the demo’s pose model as a Gemma4 runtime.

## Atlas repo surfaces already present

The frontend already has browser GPU and AI surfaces that should stay in place:

- `sveltekit-frontend/src/lib/webgpu/*`
- `sveltekit-frontend/src/lib/components/webgpu/*`
- `sveltekit-frontend/src/routes/(app)/demos/webgpu-showcase/+page.svelte`
- `sveltekit-frontend/src/routes/(app)/demos/webgpu-memory-palace/+page.svelte`
- `sveltekit-frontend/src/lib/webgpu/webgpu-gemma-client.js`
- `sveltekit-frontend/src/lib/webgpu/webgpu-rag-service.ts`
- `sveltekit-frontend/src/lib/webgpu/webgpu-similarity-engine.ts`

That means the missing work is not “invent browser AI.” The missing work is a proper 3D scene lane and a strict separation between:

- browser rendering / motion / visualization
- browser-side AI fallback
- server-side Gemma4 synthesis and MTP

## Recommended implementation order

1. Add a browser 3D route that loads a Three.js scene and renders a simple avatar.
2. Add a physics adapter only if needed for the scene.
3. Reuse LiteRT pose/retarget code for skeleton-driven animation.
4. Connect the scene to the existing WebGPU demo conventions for GPU-backed effects.
5. Keep `Gemma4` in the `:8090` TurboQuant lane and use MTP only there.
6. Use `@xenova/transformers` only for browser-side lightweight models or fallback demos.

## Runtime boundaries

- `Gemma4 MTP`: server-side generation acceleration only.
- `WebGPU`: browser rendering and browser compute.
- `Xenova`: browser AI fallback or demo lane.
- `Three.js`: scene graph and rendering.
- `Cannon.js`: optional physics.

## What not to do

- Do not make browser WebGPU the authority for Gemma4 text generation.
- Do not move the TurboQuant / MTP lane into the browser.
- Do not use the 3D scene as a retrieval or identity source.
- Do not merge browser visualization state with canonical Atlas packet state.

