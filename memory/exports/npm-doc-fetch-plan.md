# NPM Library Doc-Fetch Plan — 2026-05-31

**Total deps**: 204 across 5 package.json files
**Usage**: SERVER=45, UNUSED=108, SHARED=47, TEST=2, CLIENT=2

## Fetch order for production hardening

### DATABASE (5 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `pg` | ^8.0.0, 8.16.3 | SHARED | dependencies |
| `better-sqlite3` | 12.10.0 | SERVER | devDependencies |
| `pgvector` | 0.1.8 | SHARED | dependencies |
| `postgres` | 3.4.7 | SHARED | dependencies |
| `drizzle-orm` | 0.45.2 | SHARED | devDependencies |

**Doc fetch commands**:
- `npm view pg repository.url homepage`
- `npm view better-sqlite3 repository.url homepage`
- `npm view pgvector repository.url homepage`
- `npm view postgres repository.url homepage`
- `npm view drizzle-orm repository.url homepage`

### AUTH (3 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `@lucia-auth/adapter-drizzle` | ^1.1.0 | SERVER | dependencies |
| `lucia` | 3.2.2 | SERVER | dependencies |
| `oslo` | 1.2.1 | SERVER | dependencies |

**Doc fetch commands**:
- `npm view @lucia-auth/adapter-drizzle repository.url homepage`
- `npm view lucia repository.url homepage`
- `npm view oslo repository.url homepage`

### VECTOR (1 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `@qdrant/js-client-rest` | 1.15.1 | SHARED | dependencies, devDependencies |

**Doc fetch commands**:
- `npm view @qdrant/js-client-rest repository.url homepage`

### CACHE (2 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `ioredis` | ^5.0.0, 5.8.2 | SHARED | dependencies |
| `redis` | 5.9.0 | SHARED | dependencies |

**Doc fetch commands**:
- `npm view ioredis repository.url homepage`
- `npm view redis repository.url homepage`

### QUEUE (1 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `amqplib` | 0.10.9 | SHARED | dependencies, devDependencies |

**Doc fetch commands**:
- `npm view amqplib repository.url homepage`

### AI (5 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `@ai-sdk/openai-compatible` | 2.0.47 | SERVER | dependencies |
| `ai` | 6.0.190 | SHARED | dependencies |
| `ollama` | ^0.6.0, 0.6.3 | SHARED | dependencies, devDependencies |
| `langfuse` | 3.38.6 | SERVER | dependencies |
| `@ai-sdk/openai` | 3.0.65 | SERVER | devDependencies |

**Doc fetch commands**:
- `npm view @ai-sdk/openai-compatible repository.url homepage`
- `npm view ai repository.url homepage`
- `npm view ollama repository.url homepage`
- `npm view langfuse repository.url homepage`
- `npm view @ai-sdk/openai repository.url homepage`

### FRAMEWORK (4 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `@sveltejs/kit` | ^2.0.0, 2.59.1 | SHARED | devDependencies |
| `svelte` | ^5.0.0, 5.53.3 | SHARED | devDependencies |
| `vite` | ^6.0.0, 6.4.1 | SHARED | devDependencies |
| `@sveltejs/adapter-node` | 5.5.4 | SERVER | devDependencies |

**Doc fetch commands**:
- `npm view @sveltejs/kit repository.url homepage`
- `npm view svelte repository.url homepage`
- `npm view vite repository.url homepage`
- `npm view @sveltejs/adapter-node repository.url homepage`

### VALIDATION (2 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `sveltekit-superforms` | ^2.0.0, ^2.28.0 | SHARED | dependencies |
| `zod` | 4.4.3, 4.3.6 | SHARED | dependencies |

**Doc fetch commands**:
- `npm view sveltekit-superforms repository.url homepage`
- `npm view zod repository.url homepage`

### TESTING (3 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `vitest` | ^3.0.0, ^3.2.4 | SHARED | devDependencies |
| `@playwright/test` | ^1.55.1 | SHARED | devDependencies |
| `playwright` | ^1.55.0 | SHARED | devDependencies |

**Doc fetch commands**:
- `npm view vitest repository.url homepage`
- `npm view @playwright/test repository.url homepage`
- `npm view playwright repository.url homepage`

### STATE (2 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `@xstate/svelte` | 5.0.0 | SERVER | dependencies |
| `xstate` | 5.24.0 | SHARED | devDependencies |

**Doc fetch commands**:
- `npm view @xstate/svelte repository.url homepage`
- `npm view xstate repository.url homepage`

### UI (4 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `bits-ui` | ^2.0.0, 2.16.2 | SHARED | dependencies, devDependencies |
| `lucide-svelte` | ^0.500.0 | SERVER | dependencies |
| `@unocss/svelte-scoped` | ^66.5.1 | SERVER | devDependencies |
| `unocss` | 66.5.11 | SERVER | devDependencies |

**Doc fetch commands**:
- `npm view bits-ui repository.url homepage`
- `npm view lucide-svelte repository.url homepage`
- `npm view @unocss/svelte-scoped repository.url homepage`
- `npm view unocss repository.url homepage`

### GRAPH (1 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `neo4j-driver` | 6.0.1 | SHARED | dependencies |

**Doc fetch commands**:
- `npm view neo4j-driver repository.url homepage`

### STORAGE (1 packages)

| Package | Versions | Usage | Sections |
|---|---|---|---|
| `minio` | ^7.0.0, 7.1.3 | SHARED | dependencies |

**Doc fetch commands**:
- `npm view minio repository.url homepage`

## Untagged but used (audit later)

62 deps. Top 30:
- `@ast-grep/cli` (SERVER)
- `@aws-sdk/client-s3` (SERVER)
- `@babel/parser` (SHARED)
- `@babel/traverse` (SHARED)
- `@grpc/grpc-js` (SHARED)
- `@grpc/proto-loader` (SHARED)
- `@huggingface/transformers` (TEST)
- `@iconify-json/lucide` (SERVER)
- `@langchain/community` (SERVER)
- `@langchain/core` (SERVER)
- `@langchain/langgraph` (SERVER)
- `@langchain/ollama` (SERVER)
- `@langchain/textsplitters` (SERVER)
- `@mendable/firecrawl-js` (SERVER)
- `@modelcontextprotocol/sdk` (SHARED)
- `@msgpack/msgpack` (SERVER)
- `@node-rs/argon2` (SERVER)
- `@paralleldrive/cuid2` (SERVER)
- `@testing-library/svelte` (TEST)
- `@unocss/reset` (CLIENT)
- `@webgpu/types` (SERVER)
- `bcryptjs` (SERVER)
- `chokidar` (SERVER)
- `clsx` (SERVER)
- `cross-env` (SERVER)
- `d3` (SHARED)
- `dexie` (SERVER)
- `dotenv` (SERVER)
- `drizzle-zod` (SERVER)
- `eslint` (SERVER)

## Unused (consider removing)

108 deps had no in-tree imports detected. **Review before removing** — config-only or peer deps may show as UNUSED.
- `@babel/core`
- `@babel/generator`
- `@babel/types`
- `@babylonjs/core`
- `@babylonjs/gui`
- `@babylonjs/loaders`
- `@babylonjs/materials`
- `@eslint/js`
- `@google/genai`
- `@iconify-json/heroicons`
- `@julr/unocss-preset-forms`
- `@langchain/langgraph-checkpoint-postgres`
- `@langchain/openai`
- `@mapbox/node-pre-gyp`
- `@mozilla/readability`
- `@opencode-ai/plugin`
- `@playwright/mcp`
- `@sveltejs/vite-plugin-svelte`
- `@testing-library/jest-dom`
- `@tiptap/core`
- `@tiptap/extension-bubble-menu`
- `@tiptap/extension-collaboration`
- `@tiptap/extension-floating-menu`
- `@tiptap/extension-image`
- `@tiptap/extension-placeholder`
- `@tiptap/pm`
- `@tiptap/starter-kit`
- `@types/amqplib`
- `@types/bcryptjs`
- `@types/cheerio`