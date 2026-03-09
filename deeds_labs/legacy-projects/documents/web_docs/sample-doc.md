# Phase46 sample doc
This page documents handling of TS2322 errors when migrating to SvelteKit 2 and Bits-UI SSR.

## Steps
1. Ensure `npm run dev:quic` is running after Ollama endpoints are configured.
2. Configure Drizzle ORM migrations with Postgres and pgvector.
3. Enable UnoCSS and NES.css for consistent styling.

```ts
// Example: src/routes/+page.svelte
const value: string = 42; // TS2322
```

## Remediation
- Cast numeric inputs with `String(value)` before assignment.
- Update Svelte 5 components to use typed stores.
- Verify Redis + Neo4j health via `/api/system/cluster-status`.
