# TypeScript Language Server Module Cache Issue

## Problem: "Module has no exported member" Errors

### Symptoms
```typescript
// TypeScript reports error even though export exists:
import { db } from '$lib/server/db';
// Error: Module '"$lib/server/db"' has no exported member 'db'

// But the file clearly exports it:
// src/lib/server/db/index.ts
export const db = drizzle(client, { schema });
```

### Root Cause
TypeScript Language Server (TSServer) caches module shapes. When `index.ts` or barrel files are modified, the cache may not invalidate immediately, causing false positives.

### Solution
**Quick Fix:**
1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type: `TypeScript: Restart TS Server`
3. Press Enter

**Alternative Fixes:**
```bash
# Reload VS Code window
Ctrl+Shift+P → "Developer: Reload Window"

# Clear .svelte-kit cache
rm -rf .svelte-kit
npm run dev

# Restart dev server
# Stop server (Ctrl+C)
npm run dev
```

### Why It Works
- Runtime works perfectly - this is **purely an IDE/editor issue**
- TSServer maintains an in-memory cache of module exports
- Restarting TSServer forces cache invalidation and re-indexing
- The actual JavaScript/TypeScript compilation is unaffected

### Prevention
- After modifying barrel files (`index.ts`), restart TSServer
- Use `allowImportingTsExtensions: false` in `tsconfig.json` for stability
- Avoid circular dependencies between schema and db files

### Related Issues
- SvelteKit `$lib` alias resolution
- Drizzle ORM schema imports
- Vite/esbuild module resolution differences

## Tags
#typescript #vscode #tsserver #module-resolution #cache #debugging
