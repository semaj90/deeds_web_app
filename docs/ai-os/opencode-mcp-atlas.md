# OpenCode MCP Atlas

## Rules
- Do not delete existing MCP tools.
- OpenCode commands trigger workflows.
- MCP tools expose callable backend actions.
- Gemma4 synthesizes only from valid sourceRefs.
- Svelte SSR docs may enter the atlas only as sourceRef-backed docs.
- RabbitMQ remains backend-only.
- Browser cache uses Web Worker, IndexedDB, Cache API, and shader cache.
- Frontend receives updates through SSE/WebSocket.

## Memory lanes
Postgres/Drizzle = canonical records
Qdrant = semantic clusters
Redis = hot cards/cache traces
Bifrost = Gemma4 OpenAI-compatible gateway
Engram = agent memory
TRACE MCP = tool registry

## Frontend and backend separation
- SvelteKit SSR handles initial HTML and server-side data loading.
- Browser Web Worker handles client cache/search/shader preparation.
- XState v5 is optional and should be used only for complex UI state transitions.
- RabbitMQ stays in backend workers only.
- Frontend updates flow as: RabbitMQ -> backend worker -> SSE/WebSocket -> Svelte UI.

## Documentation fetch resources
Use these resources in the web documentation fetch workflow after parent-atlas indexing and cache warmup. Keep labels so downstream indexing can tag unknown package names from node_modules with domain context.

```json
{
  "resources": [
    {
      "type": "git",
      "name": "svelte",
      "url": "https://github.com/sveltejs/svelte.dev",
      "branch": "main",
      "searchPath": "apps/svelte.dev",
      "specialNotes": "Focus on docs content",
      "labels": ["docs", "sveltekit", "ssr", "frontend"]
    },
    {
      "type": "npm",
      "name": "reactNpm",
      "package": "react",
      "version": "latest",
      "labels": ["docs", "npm", "web"]
    },
    {
      "type": "npm",
      "name": "drizzleNpm",
      "package": "drizzle-orm",
      "version": "latest",
      "labels": ["postgresql", "drizzle", "contracts"]
    },
    {
      "type": "npm",
      "name": "qdrantNpm",
      "package": "@qdrant/js-client-rest",
      "version": "latest",
      "labels": ["qdrant", "clusters", "semantic"]
    },
    {
      "type": "npm",
      "name": "redisNpm",
      "package": "ioredis",
      "version": "latest",
      "labels": ["redis", "cards", "cache-trace"]
    },
    {
      "type": "npm",
      "name": "pgNpm",
      "package": "pg",
      "version": "latest",
      "labels": ["postgresql", "sql", "bitfrost"]
    }
  ]
}
```
