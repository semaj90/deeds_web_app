Claude Mem Integration — Usage

Server-side wrapper: `src/lib/server/memory/claude-mem.ts`

Quick examples

1) Initialize from a route or startup script

```ts
import { initClaudeMem } from '$lib/server/memory/claude-mem';

// optional worker URL: e.g. 'http://localhost:37777'
await initClaudeMem();
```

2) Get status via helper (or use the API route `/api/memory/status`)

```ts
import { getStatus } from '$lib/server/memory/claude-mem';
const status = await getStatus();
console.log(status);
```

3) Search memories

```ts
import { searchMemory, initClaudeMem } from '$lib/server/memory/claude-mem';
await initClaudeMem();
const results = await searchMemory('authentication', { limit: 10, type: 'code' });
console.log(results);
```

4) Shutdown

```ts
import { shutdownClaudeMem } from '$lib/server/memory/claude-mem';
await shutdownClaudeMem();
```

Notes
- The wrapper lazily imports `claude-mem-opencode` and exposes a singleton.
- Use `initClaudeMem()` early (startup script or the first request) to warm the worker.
- The provided API route `GET /api/memory/status` returns the current integration status.

Privacy and tags
- The underlying library supports privacy tags such as `<private>...</private>`; the wrapper does not alter that behavior.
