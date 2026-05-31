# Next Moves Recommendation — 2026-05-31

## Overall posture

- **Testing coverage**: 106/143 tasks lack tests (74%) — this is the largest gap.
- **Architecture hot spots**: 0 tasks touch load-bearing modules without test coverage.
- **NPM surface**: 204 deps across 5 package.json files; 34 are tagged production-risk.

## Top kanban tasks by rank score

| Rank | Status | Score | Title | Recommended actions |
|---|---|---|---|---|
| 1 | DONE | 72.3% | memory › episodic | none |
| 2 | DONE | 56.0% | ai › llm synthesis | none |
| 3 | DONE | 52.3% | gpu › som topology | none |
| 4 | DONE | 49.3% | knowledge › atlas pipeline | Run npm run audit:contracts to verify schema alignment |
| 5 | DONE | 45.7% | api › sveltekit routes | none |
| 6 | DONE | 45.7% | analysis › entity extraction | none |
| 7 | TODO | 43.3% | search › hyperrag | none |
| 8 | DONE | 42.7% | workspace › scripts | none |
| 9 | DONE | 42.7% | legal › evidence | none |
| 10 | DONE | 42.7% | db › drizzle schema | Run npm run audit:contracts to verify schema alignment |
| 11 | DONE | 42.7% | legal › case management | none |
| 12 | DONE | 42.7% | search › retrieval | none |
| 13 | DONE | 42.7% | cache › redis bifrost | none |
| 14 | DONE | 42.7% | ace › context assembly | none |
| 15 | DONE | 42.7% | graph › neo4j traversal | none |
| 16 | DONE | 42.7% | legal › citations | none |
| 17 | DONE | 42.7% | api › mcp tools | none |
| 18 | DONE | 42.7% | gpu › libtorch bridge | none |
| 19 | DONE | 42.7% | auth › authentication | none |
| 20 | DONE | 42.7% | knowledge › wiki notes | none |

## Critical gaps (load-bearing, no tests)

No critical gaps — all architecture-heavy tasks have some testing signal.

## Production-hardening doc fetch order

Pull docs in this order. Each section lists the package + the upstream doc URL.

### DATABASE

- [`pg`](https://github.com/brianc/node-postgres) — PostgreSQL client - pure javascript & libpq with the same API
- [`better-sqlite3`](http://github.com/WiseLibs/better-sqlite3) — The fastest and simplest library for SQLite in Node.js.
- [`pgvector`](https://github.com/pgvector/pgvector-node) — pgvector support for Node.js, Deno, and Bun (and TypeScript)
- [`postgres`](https://github.com/porsager/postgres) — Fastest full featured PostgreSQL client for Node.js
- [`drizzle-orm`](https://orm.drizzle.team) — Drizzle ORM package for SQL databases

### AUTH

- [`@lucia-auth/adapter-drizzle`](https://github.com/pilcrowOnPaper/lucia#readme) — Drizzle ORM adapter for Lucia
- [`lucia`](https://github.com/pilcrowOnPaper/lucia#readme) — A simple and flexible authentication library
- [`oslo`](https://github.com/pilcrowOnPaper/oslo#readme) — A collection of auth-related utilities

### VECTOR

- [`@qdrant/js-client-rest`](https://github.com/qdrant/qdrant-js#readme) — This repository contains the REST client for the [Qdrant](https://github.com/qdrant/qdrant) vector search engine.

### CACHE

- [`ioredis`](https://github.com/luin/ioredis#readme) — A robust, performance-focused and full-featured Redis client for Node.js.
- [`redis`](https://github.com/redis/node-redis) — A modern, high performance Redis client

### QUEUE

- [`amqplib`](http://amqp-node.github.io/amqplib/) — An AMQP 0-9-1 (e.g., RabbitMQ) library and client.

### AI

- [`@ai-sdk/openai-compatible`](https://ai-sdk.dev/docs) — This package provides a foundation for implementing providers that expose an OpenAI-compatible API.
- [`ai`](https://ai-sdk.dev/docs) — AI SDK by Vercel - build apps like ChatGPT, Claude, Gemini, and more with a single interface for any model using the Vercel AI Gateway or go direct to OpenAI, Anthropic, Google, or any other model provider.
- [`ollama`](https://github.com/ollama/ollama-js) — Ollama Javascript library
- [`langfuse`](https://www.npmjs.com/package/langfuse) — n/a
- [`@ai-sdk/openai`](https://ai-sdk.dev/docs) — The **[OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the OpenAI chat and completion APIs and embedding model support for the OpenAI embeddings API.

### FRAMEWORK

- [`@sveltejs/kit`](https://svelte.dev) — SvelteKit is the fastest way to build Svelte apps
- [`svelte`](https://svelte.dev) — Cybernetically enhanced web apps
- [`vite`](https://vite.dev) — Native-ESM powered web dev build tool
- [`@sveltejs/adapter-node`](https://svelte.dev/docs/kit/adapter-node) — Adapter for SvelteKit apps that generates a standalone Node server

### VALIDATION

- [`sveltekit-superforms`](https://superforms.rocks) — Making SvelteKit forms a pleasure to use!
- [`zod`](https://zod.dev) — TypeScript-first schema declaration and validation library with static type inference

### TESTING

- [`vitest`](https://vitest.dev) — Next generation testing framework powered by Vite
- [`@playwright/test`](https://playwright.dev) — A high-level API to automate web browsers
- [`playwright`](https://playwright.dev) — A high-level API to automate web browsers

### STATE

- [`@xstate/svelte`](https://github.com/statelyai/xstate/tree/main/packages/xstate-svelte#readme) — XState tools for Svelte
- [`xstate`](https://github.com/statelyai/xstate/tree/main/packages/core#readme) — Finite State Machines and Statecharts for the Modern Web.

### UI

- [`bits-ui`](https://github.com/huntabyte/bits-ui#readme) — The headless components for Svelte.
- [`lucide-svelte`](https://lucide.dev) — A Lucide icon library package for Svelte applications.
- [`@unocss/svelte-scoped`](https://unocss.dev) — Use UnoCSS in a modular fashion with styles being stored only in the Svelte component they are used in: Vite plugin for apps, Svelte preprocessor for component libraries
- [`unocss`](https://unocss.dev) — The instant on-demand Atomic CSS engine.

### GRAPH

- [`neo4j-driver`](https://github.com/neo4j/neo4j-javascript-driver#readme) — The official Neo4j driver for Javascript

### STORAGE

- [`minio`](https://github.com/minio/minio-js#readme) — S3 Compatible Cloud Storage client

## Immediate next moves (do these this week)

- Write Playwright spec for top REVIEW tasks
- Add Vitest unit tests for top server modules
- Run npm run audit:contracts after each schema change
- Refresh docs/graph/codebase-graph.json (3 days stale)
- Move CHR97 training-ready clusters (language|c10, outcome|c16) into Unsloth pipeline

## How to act on each task

Recommended actions surface in `kanban-board.json` under `recommendedActions[]` on each task. Concrete patterns:

- **"Add Vitest unit test"** → create `sveltekit-frontend/tests/server/<area>.test.ts` with `@vitest-environment node`
- **"Add Playwright spec"** → create `sveltekit-frontend/tests/e2e/<area>.spec.ts` capturing console + network + page errors
- **"Audit gate before merge"** → run `npm run audit:contracts` and `node scripts/atlas/mcp-opencode-health-probe.mjs`
- **"MCP tool verification"** → call via `mcp-opencode-health-probe.mjs` and inspect `memory/exports/mcp-health-probe.json`
- **"Schema alignment"** → `cd sveltekit-frontend && npm run audit:contracts`
