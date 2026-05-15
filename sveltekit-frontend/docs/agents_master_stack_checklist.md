# Agents Master Stack Checklist

name: agents_master_stack_checklist
title: Agents Master Stack Checklist
description: Canonical dependency and environment matrix for the repo stack.
env: all

Purpose: keep the repo's package titles, runtime dependencies, and environment expectations explicit so build, compression, dev, test, and prod stay aligned.

Split docs:
- `docs/agents_master_stack_checklist.build.md`
- `docs/agents_master_stack_checklist.dev.md`
- `docs/agents_master_stack_checklist.test.md`
- `docs/agents_master_stack_checklist.prod.md`

## Manifest Inventory

| Manifest | Package title | Role |
|---|---|---|
| `package.json` | `yorha-legal-ai-frontend` | Top-level Node manifest for shared scripts and frontend tooling. |
| `sveltekit-frontend/package.json` | `yorha-legal-ai-frontend` | Main SvelteKit app manifest. |
| `vscode-extension/package.json` | `deeds-graph` | VS Code extension for graph navigation and plans. |
| `simd-bridge/rust/hmm-repair/package.json` | `hmm-repair` | N-API bridge package for the HMM repair addon. |
| `simd-bridge/rust/graph-engine/package.json` | `graph-engine` | N-API bridge package for the graph engine addon. |
| `src/mcp/zod-to-json-schema-bridge/package.json` | `zod-to-json-schema` | Local override bridge for Zod schema conversion. |

## Dependency Matrix

Legend: `required` means the current app or service expects it now; `optional` means feature-gated or sidecar-only; `dev-only` means tooling for local work and checks; `prod-only` means runtime expectations that should not leak into dev images.

| Package/title | Env | Requirement | Area | What it covers |
|---|---|---|---|---|
| `@sveltejs/kit` | dev/prod | required | App runtime | SvelteKit app shell and routing. |
| `svelte` | dev/prod | required | App runtime | Svelte 5 compiler/runtime. |
| `vite` | dev/prod | required | App runtime | Local dev server and production bundling. |
| `typescript` | dev/prod | required | App runtime | Type checking and TS build pipeline. |
| `@sveltejs/vite-plugin-svelte` | dev/prod | required | App runtime | Svelte integration for Vite. |
| `bits-ui` | dev/prod | required | UI | Headless UI primitives. |
| `@unocss/core` | dev/prod | required | UI | UnoCSS runtime and extraction. |
| `@unocss/preset-uno` | dev/prod | required | UI | Utility preset. |
| `@unocss/vite` | dev/prod | required | UI | Vite plugin for UnoCSS. |
| `lucide-svelte` | dev/prod | required | UI | Icon set. |
| `nes.css` | dev/prod | optional | UI | Retro style layer. |
| `sveltekit-superforms` | dev/prod | required | Forms | Form handling and validation. |
| `@modelcontextprotocol/sdk` | dev/prod | required | MCP | MCP server/tool interface. |
| `@qdrant/js-client-rest` | dev/prod | required | Search / retrieval | Qdrant vector search client. |
| `ioredis` | dev/prod | required | Search / retrieval | Redis cache and feature storage. |
| `ollama` | dev/prod | required | AI / LLM | Local model client. |
| `@google/genai` | dev/prod | optional | AI / LLM | Gemini/Google GenAI path. |
| `@langchain/community` | dev/prod | optional | AI / LLM | Community integrations. |
| `@langchain/core` | dev/prod | optional | AI / LLM | LangChain primitives. |
| `@langchain/ollama` | dev/prod | optional | AI / LLM | Ollama adapter. |
| `@langchain/openai` | dev/prod | optional | AI / LLM | OpenAI adapter. |
| `@langchain/textsplitters` | dev/prod | optional | AI / LLM | Text chunking. |
| `pg` | dev/prod | required | Data | Postgres access. |
| `drizzle-orm` | dev/prod | required | Data | Typed SQL schema and migration layer used throughout the app. |
| `minio` | dev/prod | optional | Data | Object storage integration. |
| `amqplib` | dev/prod | optional | Data | Queueing / broker integration. |
| `express` | dev/prod | optional | Data | Service adapter and compatibility layer. |
| `docling-parse` | prod-only | required | Document / vision / audio | Document parsing and layout extraction. |
| `ultralytics` | prod-only | required | Document / vision / audio | Vision / YOLO workloads. |
| `opencv-python-headless` | prod-only | required | Document / vision / audio | Image/video processing in containers. |
| `openai-whisper` | prod-only | required | Document / vision / audio | Speech transcription. |
| `transformers` | prod-only | required | Document / vision / audio | Model orchestration and document AI. |
| `torch` | prod-only | required | Document / vision / audio | Core ML runtime. |
| `safetensors` | prod-only | required | Document / vision / audio | Safe model weight loading. |
| `svelte-check` | dev-only | required | Tooling | Type and template checking. |
| `vitest` | dev-only | required | Tooling | Unit and contract tests. |
| `eslint` | dev-only | required | Tooling | Linting. |
| `prettier` | dev-only | required | Tooling | Formatting. |
| `tsx` | dev-only | required | Tooling | TS script runner. |
| `ts-morph` | dev-only | optional | Tooling | AST transforms and codemods. |

## Checklist

### Build
- [ ] Pin Node version and keep `package-lock.json` or workspace lockfile committed.
- [ ] Keep Dockerfile system deps explicit for Python images (`git`, `curl`, `ffmpeg`, OpenCV libs).
- [ ] Cache large Python wheels and avoid rebuilding heavy ML layers when app code changes.
- [ ] Split optional ML services from the core app image when they are not required at runtime.
- [ ] Keep `prod-only` packages out of dev images unless a smoke truly needs them.

Build should stay reproducible and layer-stable. The main risk is repeated download of large wheels like `torch`, so the build path should separate shared runtime layers from app-specific layers.

### Compression
- [ ] Precompress production assets where the deploy target supports it.
- [ ] Remove duplicate runtime copies across Node, Python, and addon images.
- [ ] Keep optional integrations out of the primary bundle unless they are always used.
- [ ] Prefer runtime sidecars for large model workloads instead of bundling them into the UI image.
- [ ] Reuse base layers for `prod-only` ML packages so wheel downloads are not repeated across builds.

Compression here means artifact and image compression, not source minification alone. The biggest wins come from reducing duplicated ML payloads and avoiding full rebuilds of unchanged layers.

### Dev
- [ ] `npm run dev` and `npm run dev:full` should start cleanly.
- [ ] `svelte-check`, `vitest`, `eslint`, and `prettier` must remain runnable from the app workspace.
- [ ] Local services should be documented for Postgres, Redis, Qdrant, MinIO, and Ollama.
- [ ] Any dev bypasses must be explicit and isolated from production code paths.
- [ ] Keep `dev-only` packages available in local installs even when prod images omit them.

Development needs fast feedback and predictable local service wiring. The checklist keeps the dev surface close to production so feature work does not drift into environment-specific hacks.

### Testing
- [ ] Keep unit tests under the repo's configured Vitest include paths.
- [ ] Cover API contract behavior for auth, validation, and degraded response shapes.
- [ ] Add image/build smokes for Python services that install heavy dependencies.
- [ ] Keep one smoke for each critical external service integration.
- [ ] Validate that `optional` packages fail gracefully when sidecars are absent.

Testing should cover both code and packaging boundaries. The current failure mode was a build-time dependency gap, so smokes need to protect against both app regressions and container regressions.

### Prod
- [ ] Pin runtime versions for the app, Python services, and native addons.
- [ ] Document required environment variables for every external service.
- [ ] Keep optional integrations fail-open or behind a feature boundary.
- [ ] Ensure prod images do not ship dev-only tooling or extra build caches.
- [ ] Ship only `required` and `prod-only` packages in production images; exclude `dev-only` packages.

Production should be small, explicit, and boring. Anything not required to answer live traffic should stay out of the runtime image or be isolated behind a separate service boundary.

## Summary

The stack is centered on a SvelteKit 2 / Svelte 5 app with UnoCSS, Bits UI, Superforms, MCP tooling, Drizzle ORM, and a set of AI, search, and data services. The repo also includes a VS Code extension, native addon packages, and a Zod bridge override, so dependency tracking needs to cover app runtime, image builds, schema tooling, and service sidecars together.
