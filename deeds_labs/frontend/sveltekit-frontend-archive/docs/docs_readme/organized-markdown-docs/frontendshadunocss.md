# Shadcn-Svelte + UnoCSS Styling Guide

## 1. Global Theme Import
- Import your shadcn-svelte theme CSS in your root `+layout.svelte` or `app.html` for global styles.
- Example:
  ```svelte
  <script>
    import 'shadcn-svelte/styles.css';
  </script>
  ```
- For UnoCSS, ensure your `unocss.config.ts` is set up and imported in your Vite config or SvelteKit config.

## 2. UnoCSS Best Practices
- Use utility classes for layout, spacing, and color.
- Extend the theme in `unocss.config.ts` for your brand/legal palette.
- Use `presetUno`, `presetAttributify`, and `presetIcons` for flexibility.
- Example color extension:
  ```ts
  theme: {
    colors: {
      primary: { ... },
      secondary: { ... },
      // ...
    }
  }
  ```

## 3. Shared UI Components
- Export all shared UI components from a single `index.ts` for easy imports:
  ```ts
  export { default as Button } from './Button.svelte';
  export { default as Card } from './Card.svelte';
  // ...
  ```
- For shadcn-svelte, use the provided Svelte components and wrap/extend as needed for your design system.

## 4. XState Integration Pattern
- UI components should accept `state` and `send` (event dispatcher) as props.
- Parent Svelte components connect XState machines and pass state/events down:
  ```svelte
  <Button on:click={() => send('SUBMIT')} disabled={state.matches('loading')} />
  ```
- Use stores or context for global state if needed.

## 5. Superforms, Drizzle ORM, and SSR
- Use `superforms` for robust form validation and SSR hydration.
- Use Drizzle ORM and drizzle-kit for type-safe Postgres queries.
- For pgvector, use Drizzle's vector extension and ensure server-side logic is in endpoints or `+server.ts`.

## 6. Hydration & SSR
- Always test hydration with SvelteKit's SSR enabled.
- Avoid direct DOM manipulation in shared UI components.
- Use SvelteKit's load functions for server data fetching.

## 7. Example Imports
```svelte
<script>
  import { Button, Card } from '$lib/components/ui';
</script>
```

---

- Keep this guide up to date in `frontendshadunocss.md` and reference in `claude.md` and `copilot.md`.
