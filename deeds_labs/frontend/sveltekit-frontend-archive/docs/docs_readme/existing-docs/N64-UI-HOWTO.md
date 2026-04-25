# 64bit Headless UI — HOWTO

Purpose

- Provide a concise guide to building unstyled, accessible (headless) UI primitives for a 64‑bit
  SvelteKit frontend.
- Headless components expose behavior and accessibility (state, focus, keyboard handling, ARIA) but
  leave styling to the consumer.

When "64bit" matters

- UI code in Svelte is architecture-agnostic. “64bit” matters only for native modules, Node
  binaries, or WASM builds. Ensure your local Node/npm binaries and any native deps are built for
  x64 (or target platform) when running dev/build pipelines.

Prerequisites

- Node.js (x64) recommended for local dev and CI.
- SvelteKit project.
- Familiarity with Svelte stores, actions, and SSR caveats.

Design principles

- Keep components unstyled and composable.
- Export minimal API: open state, events, and actions.
- Ensure keyboard and focus management for accessibility.
- Support SSR: avoid direct use of window/document during initial render.

Project layout (suggested)

- src/lib/headless/
  - Dialog.svelte
  - Menu.svelte
  - Select.svelte
  - stores.ts
  - actions/focusTrap.ts

Example: Minimal headless Dialog (Svelte)

- Behavior: controlled or uncontrolled open state, focus trap on open, close on Escape, ARIA
  attributes.

Dialog.svelte

```svelte
<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';

  export let open: boolean | undefined; // controlled if provided
  const internal = writable(false);
  const dispatch = createEventDispatcher();

  let dialogEl: HTMLElement | null = null;

  $: isOpen = open ?? $internal;

  function openDialog() {
    if (open === undefined) internal.set(true);
    dispatch('open');
  }
  function closeDialog() {
    if (open === undefined) internal.set(false);
    dispatch('close');
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closeDialog();
  }

  onMount(() => {
    document.addEventListener('keydown', onKey);
  });
  onDestroy(() => {
    document.removeEventListener('keydown', onKey);
  });
</script>

{#if isOpen}
  <div role="dialog" aria-modal="true" bind:this={dialogEl}>
    <slot />
    <button on:click={closeDialog} aria-label="Close">Close</button>
  </div>
{/if}
```

Usage

```svelte
<script>
  import Dialog from '$lib/headless/Dialog.svelte';
  let show = false;
</script>

<button on:click={() => (show = true)}>Open</button>
<Dialog bind:open={show}>
  <p>Headless dialog content</p>
</Dialog>
```

Accessibility checklist

- role and aria-modal for dialogs.
- Manage focus: focus first meaningful element on open and restore on close (implement focusTrap
  action).
- Keyboard interactions: Escape to close, arrow/home/end for menus/lists.
- Expose necessary aria-\* attributes to let consumers wire labels.

SSR considerations

- Avoid accessing window/document at module top-level. Use onMount for any DOM ops.
- Provide deterministic markup for server render; toggle interactivity post-hydration.

Testing and CI (64-bit notes)

- Run tests in Node x64 containers or CI runners matching target platform to avoid native module
  mismatch.
- For native deps, run npm rebuild or install from CI with correct architecture.
- Use Playwright/Chromium on CI to validate keyboard/focus behavior.

Troubleshooting

- If native modules fail on CI: rebuild or use prebuilt x64 binaries.
- If focus management fails under SSR: ensure focus code runs only onMount.
- If styling leaks in: document recommended class hooks and slots so consumers can style reliably.

Further reading

- Accessibility guides (WAI-ARIA Authoring Practices)
- Svelte docs: stores, actions, onMount/onDestroy

Keep each primitive small, test interactions cross-platform, and document the API so consumers can
style freely.

## Assets & performance: mipmaps and caching

When rendering textures (WebGL/WebGPU), enable mipmaps for power-of-two textures and sample with a
mip-filter (e.g., `LINEAR_MIPMAP_LINEAR`). Reasons:

- Fewer cache misses: sampling lower mip levels reduces texture cache thrashing at smaller on-screen
  sizes.
- Lower bandwidth: GPU fetches smaller texels, improving throughput on animating/scrolling scenes.
- Better quality: trilinear filtering avoids shimmering/aliasing as elements scale.

Guidelines

- Generate mipmaps once per texture and let the sampler pick LOD automatically; you don’t need to
  manually swap resolutions.
- Use power-of-two texture dimensions where possible to get native mipmap support everywhere.
- For UI images (non-WebGL), prefer responsive images (`srcset`/`sizes`) or pre-generated
  thumbnails; browsers cache the smallest acceptable asset for the current DPR/viewport.
- Caching: smaller assets improve hit ratio and reduce transfer time. Set far-future cache-control
  with revisioned URLs; use `ETag`/`immutable` where appropriate.

Rule of thumb

- If the on-screen size is much smaller than the source, sampling from a lower mip level is both
  faster and cleaner. Keep originals for zoom/HD, let the pipeline (mipmaps or responsive images)
  serve the right level.
