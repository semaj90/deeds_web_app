# SvelteKit 2 Quick Reference

SvelteKit 2 is a modern framework for building robust, performant web applications with Svelte 5. It provides SSR, file-based routing, and seamless integration with Vite for fast development.

## Key Concepts

- **File-based Routing:** Pages and endpoints are defined by files in the `src/routes` directory.
- **SSR by Default:** Server-side rendering is enabled for all routes unless explicitly disabled.
- **Load Functions:** Use `load` in `+page.ts`/`+page.server.ts` for data fetching. Use `actions` for form handling.
- **Type Safety:** Use TypeScript for type-safe endpoints and components.
- **Vite Integration:** Leverages Vite for fast HMR and build optimizations.

## Best Practices

- Use `+page.svelte` for UI, `+page.ts`/`+page.server.ts` for data loading.
- Prefer server-side data loading for sensitive or large data.
- Use `export let` for all props in Svelte components.
- Avoid unused CSS selectors to prevent Svelte warnings.
- Use default imports for Svelte components: `import MyComponent from './MyComponent.svelte'`.

## Common Gotchas

- Do not use `import * as ...` for Svelte components.
- Remove all unused CSS selectors from `<style>` blocks.
- Ensure all props passed to components are defined with `export let ...`.
- Use the new `actions` API for form submissions.

## References

- [SvelteKit Docs](https://kit.svelte.dev/docs/introduction)
- [Svelte Tutorial](https://svelte.dev/tutorial)
