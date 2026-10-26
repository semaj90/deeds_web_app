# Visual element rendering

## Why

The repo has rendering and element-level code in several places, but no OpenSpec change owns them together. Skinning (courtroom 3D), pixel and bitmap encoding (WebGPU), Svelte element splitting (`scripts/atlas`) and HTML5 design are separate concerns. Without an owner, each gets its own unproved claims.

## What

This change adds no new runtime. It records the four lanes, names the existing owner of each, and defines the proof each lane needs before any of them can be called done.

| Lane | Existing owner | Gap |
|---|---|---|
| Vertex skinning | `sveltekit-frontend/src/lib/courtroom/courtroom-scene.svelte.ts` (Mixamo `.glb`, skeletal animation) | No receipt for skeletal load or bone-weight validity |
| Pixel and bitmap encoding | `sveltekit-frontend/src/lib/webgpu/texture-streaming.ts`, Gaussian-splat renderer | No CPU reference or byte-budget receipt |
| Elements | `scripts/atlas/svelte-dom-splitter-v1.mjs`, `scripts/atlas/svelte-rune-crosscheck-v1.mjs` | Runes checked against ast-grep; template nodes and handlers not independently checked |
| HTML5 design | `sveltekit-frontend/uno.config.ts` (UnoCSS tokens/shortcuts) + Bits UI v2 primitives | No receipt that live components use those tokens; screens are examples, not authority |

## Non-goals

- No new renderer, no new owner for an existing lane, and no 3D work on the Node main thread.
- No database writes and no changes to canonical retrieval.

## Constraints

- Svelte 5 runes only; UnoCSS; Bits UI v2.
- A lane is `DONE` only with a receipt, its exact test command, and an input revision.
- Browser shims in `src/lib/shims/*` are not modified.
