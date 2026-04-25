# TypeScript Error: Module has no exported member 'db'

## Symptoms
- TypeScript reports `Module '"$lib/server/db"' has no exported member 'db'`
- Runtime works correctly (dev server starts, endpoints function)
- The file `src/lib/server/db/index.ts` clearly contains `export const db = ...`

## Root Causes
1. **Language Server Caching**: The TypeScript Language Server (TSServer) in VS Code often caches module shapes. When a file is created or significantly modified (like changing exports), the cache might not invalidate immediately.
2. **Module Resolution**: SvelteKit uses `$lib` aliases. If `tsconfig.json` or `.svelte-kit/tsconfig.json` isn't updated or reloaded, the alias might point to a stale location or fail to resolve the new exports.
3. **Extension Confusion**: Importing from `.js` vs `.ts` in the barrel file (`index.ts`). If `index.ts` imports from `./schema.js` but the file is `schema.ts`, TypeScript might get confused if `allowImportingTsExtensions` isn't perfectly aligned with the build tool (Vite/esbuild).

## Resolution
1. **Restart TSServer**: `Ctrl+Shift+P` -> `TypeScript: Restart TS Server`.
2. **Verify Imports**: Ensure `src/lib/server/db/index.ts` imports schema correctly (e.g., `import * as schema from './schema-postgres';`).
3. **Check Circular Dependencies**: Ensure `schema-postgres.ts` doesn't import `db` from `index.ts`.
4. **Explicit Type Exports**: Sometimes explicitly exporting the type helps: `export type DB = typeof db;`.

## Context Tags
- #typescript
- #sveltekit
- #drizzle-orm
- #module-resolution
- #vscode
