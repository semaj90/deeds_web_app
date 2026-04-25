# N64 UI components

Lightweight Svelte components and utilities for rendering Nintendo 64–style UI elements (controller, buttons, HUD) used in the project's gaming UI.

## Overview
This package provides presentational components only (no rom/emulation). Use them to render N64-themed controls, layouts and visual states inside SvelteKit pages.

## Installation / import
Copy the components into your project or import directly from the lib path:

```svelte
<script>
    import N64Controller from '$lib/components/ui/gaming/n64/N64Controller.svelte';
    import N64Button from '$lib/components/ui/gaming/n64/N64Button.svelte';
</script>
```

## Components & API

N64Controller
- Props:
    - controllerState: object — { a: boolean, b: boolean, c: { up, down, left, right }, joystick: { x, y } }
    - size: 'small' | 'medium' | 'large' (default: 'medium')
- Events:
    - on:press — dispatched with { button: 'A' | 'B' | ... }
- Usage:
```svelte
<N64Controller
    bind:controllerState
    size="large"
    on:press={(e) => console.log(e.detail.button)}
/>
```

N64Button
- Props:
    - variant: 'a' | 'b' | 'z' | 'start' (default: 'a')
    - pressed: boolean
    - disabled: boolean
- Slots:
    - default — label or icon
- Usage:
```svelte
<N64Button variant="start" on:click={() => startGame()}>
    Start
</N64Button>
```

HUD / Icon components
- Small presentational components for health, score, or cartridge-style frames. Props and slots follow standard Svelte conventions.

## Accessibility
- Components expose semantic roles where applicable (buttons use <button>).
- Provide keyboard handlers for button activation and focus styles.
- Ensure any custom controls update aria-pressed or aria-valuenow when state changes.

## Styling & theming
- Components use CSS variables for theming:
    - --n64-bg
    - --n64-accent
    - --n64-shadow
- Override in parent scope or pass a wrapper class.

Example:
```css
:root {
    --n64-bg: #2b2b2b;
    --n64-accent: #ffcc00;
}
```

## Tips
- Keep controller state in a store when multiple components read/write it.
- Debounce joystick updates before syncing to network.

## Tests & stories
- Add stories in your Storybook or small Svelte pages to verify layout at different sizes and states.

## License
Follow the repository license. These components are UI-only; remove or adapt art assets with proper rights.

# N64 UI Components

This folder contains a set of NES / N64-inspired UI components and helpers used by the demo and gaming-style pages.

## Purpose

These components provide a small, opinionated retro UI kit used by the demo pages (neural sprite engine and other retro-styled interfaces). They are intentionally lightweight and framework-agnostic inside Svelte components.

## Components (current files)

- `N643DButton.svelte` — 3D-style button with press animation
- `N64Badge.svelte` — small badge/pill component
- `N64Canvas.svelte` — Fabric.js canvas wrapper used by the neural sprite demo
- `N64Checkbox.svelte` — retro-styled checkbox
- `N64FormGrid.svelte` — grid layout helpers for form UIs
- `N64Modal.svelte` — modal dialog wrapper
- `N64Panel.svelte` — panel / framed container component
- `N64Progress.svelte` — progress indicator / bar
- `N64Select.svelte` — dropdown/select control
- `N64Slider.svelte` — slider control
- `N64Surface.svelte` — general surface/container (background, padding, border)
- `N64TextArea.svelte` — styled textarea
- `N64TextField.svelte` — styled text input
- `N64Theme.css` — shared theme variables and base styles
- `N64Toaster.svelte` — toast UI component (visual)
- `N64ToastStore.ts` — store / API for managing toasts
- `N64Toggle.svelte` — toggle switch UI
- `parallaxDynamic.js` — lightweight parallax helper for layered UIs
- `retroPerformanceGuard.ts` — runtime guard to disable heavy retro effects on low-capacity devices
- `tokens.ts` — design tokens (colors, spacing)
- `useRetroTransform.js` — small transform helper for motion/tilt effects
- `__tests__/` — unit/integration tests for components (if present)

> Note: `index.ts` exists in this folder but currently contains no exports — see "Barrel export" below if you want a single import entrypoint.

## Suggested import usage

If you prefer explicit imports (no barrel):

```js
import N64Badge from '$lib/components/ui/gaming/n64/N64Badge.svelte';
import N64Panel from '$lib/components/ui/gaming/n64/N64Panel.svelte';
```

If you add a barrel (`index.ts` that re-exports components) you can do:

```js
import { N64Badge, N64Panel, N64Toaster } from '$lib/components/ui/gaming/n64';
```

## Suggested `index.ts` (barrel) snippet

If you want me to create a barrel file to simplify imports, add these exports to `index.ts`:

```ts
export { default as N643DButton } from './N643DButton.svelte';
export { default as N64Badge } from './N64Badge.svelte';
export { default as N64Canvas } from './N64Canvas.svelte';
export { default as N64Checkbox } from './N64Checkbox.svelte';
export { default as N64FormGrid } from './N64FormGrid.svelte';
export { default as N64Modal } from './N64Modal.svelte';
export { default as N64Panel } from './N64Panel.svelte';
export { default as N64Progress } from './N64Progress.svelte';
export { default as N64Select } from './N64Select.svelte';
export { default as N64Slider } from './N64Slider.svelte';
export { default as N64Surface } from './N64Surface.svelte';
export { default as N64TextArea } from './N64TextArea.svelte';
export { default as N64TextField } from './N64TextField.svelte';
export { default as N64Toaster } from './N64Toaster.svelte';
export { default as N64Toggle } from './N64Toggle.svelte';
```

## Files you edited recently

- `N64Theme.css`, `N64TextField.svelte`, `N64TextArea.svelte`, `N64Surface.svelte`, `N64Slider.svelte`, `N64Select.svelte`, `N64Progress.svelte`, and `N64Panel.svelte` have manual edits in the workspace — keep backups or confirm before overwriting them.

## Missing / optional files

- The current set appears complete for the demo. If you expected additional helper files (icons, spritesheets, compiled wasm assets) they may live elsewhere in the repo (for example `static/wasm` for the BVH accelerator stub).

If you'd like, I can:
- Create the `index.ts` barrel automatically (non-destructive).
- Create a brief usage README in the parent `gaming/` folder to catalogue other themes.
- Run a quick local compile/test for Svelte components (I will only run tests if you ask).

Reply with one of:
- `create barrel` — I will create/update `index.ts` to export the components.
- `create full README` — I will also write a parent `gaming/README.md` summarizing both `ps1.css` and `n64/`.
- `nothing` — no further changes.
