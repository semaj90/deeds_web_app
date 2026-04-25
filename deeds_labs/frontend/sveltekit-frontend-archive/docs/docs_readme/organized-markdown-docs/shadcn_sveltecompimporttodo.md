# shadcn-svelte Component Import & Integration TODO

## Overview

This document tracks the integration of shadcn-svelte components into the SvelteKit project, with best practices for import/export, styling, and compatibility with UnoCSS, Tailwind, and custom setups.

---

## 1. Project Setup

- **SvelteKit**: Ensure your project is initialized with SvelteKit.
- **Tailwind CSS**: Add Tailwind via `npx svelte-add@latest tailwindcss` (or ensure UnoCSS is configured with the Tailwind preset).
- **Path Aliases**: Use `$lib` for `src/lib` and configure additional aliases as needed in `svelte.config.js`.

## 2. shadcn-svelte Initialization

- Run `npx shadcn-svelte@latest init`.
- When prompted for the global CSS file, provide a new path (e.g., `src/lib/styles/theme.css`) to avoid overwriting your base CSS if using UnoCSS or custom styles.
- Clean up the generated theme file: remove `@tailwind` directives, keep only the `@layer base { :root { ... } }` variables.
- Import this theme file in your root layout (e.g., `+layout.svelte`).

## 3. UnoCSS + Tailwind Preset

- Install UnoCSS Tailwind preset: `npm install -D @unocss/preset-tailwind`.
- In `uno.config.ts`, add `presetTailwind()` to the `presets` array.
- This ensures shadcn-svelte components styled with Tailwind classes work with UnoCSS.

## 4. Component Import/Export Pattern

- Each shadcn-svelte component lives in its own folder (e.g., `ui/button/`).
- Each folder has an `index.ts` that exports the Svelte component(s):
  ```ts
  // src/lib/components/ui/button/index.ts
  export { default as Button } from "./Button.svelte";
  ```
- For multi-part components (e.g., Accordion):
  ```ts
  export { default as Accordion } from "./Accordion.svelte";
  export { default as AccordionContent } from "./AccordionContent.svelte";
  export { default as AccordionItem } from "./AccordionItem.svelte";
  export { default as AccordionTrigger } from "./AccordionTrigger.svelte";
  ```
- Usage:
  ```svelte
  <script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import { Accordion, AccordionItem } from '$lib/components/ui/accordion';
  </script>
  ```

## 5. Prop/Class Merging Best Practices

- Use `twMerge` (from `tailwind-merge`) to combine base and custom classes in your components.
- In Svelte, extract `class` and `...rest` from `$$props`:
  ```svelte
  <script lang="ts">
    import { twMerge } from 'tailwind-merge';
    let { class: extraClass = '', ...rest } = $$props;
    const baseClass = 'font-semibold py-2 px-4 rounded';
    const mergedClass = twMerge(baseClass, extraClass);
  </script>
  <button class={mergedClass} {...rest}><slot /></button>
  ```

## 6. State Management & Barrel Files

- Use Svelte stores for global UI state (e.g., theme, sidebar, notifications).
- Organize stores in `/src/lib/stores/` and export from an `index.ts` barrel file for clean imports.
- Use XState for complex state machines (multi-step forms, wizards, etc.), and sync with Svelte stores if needed.

## 7. Superforms, SSR, and Multiple Schemas

- For multi-step forms, define a Zod schema for each step.
- In `+page.server.ts`, select the schema based on the current step and use `superValidate`.
- Pass the correct form object to the client for SSR hydration.
- Superforms will handle hydration and validation seamlessly.

## 8. Session & Global User State

- Use SvelteKit's `$page.data.user` for session-aware UI.
- The server checks the session cookie and provides user data to the client via the root layout's load function.
- All UI can reactively subscribe to `$page.data.user`.

---

## TODO

- [ ] Audit all shadcn-svelte component folders for proper `index.ts` exports.
- [ ] Ensure all imports use the barrel file pattern.
- [ ] Confirm UnoCSS Tailwind preset is active and theme variables are imported.
- [ ] Refactor custom components to use `twMerge` for class merging.
- [ ] Document any deviations or customizations in this file.

---

_This file is a living document. Update as you add, refactor, or customize shadcn-svelte components and related state management patterns._
