# SvelteKit Frontend TOC

Navigation for the SvelteKit 2 application. This is an index, not a second
runtime or ownership registry; use the linked implementation and contract
owners as the source of truth.

## Application surfaces

- Routes and server endpoints: [`src/routes`](../../sveltekit-frontend/src/routes/)
- Shared UI components: [`src/lib/components`](../../sveltekit-frontend/src/lib/components/)
- Server-side services and domain logic: [`src/lib/server`](../../sveltekit-frontend/src/lib/server/)
- Request hooks and cross-route policy: [`src/hooks.server.ts`](../../sveltekit-frontend/src/hooks.server.ts)

## Core Parent Atlas integration

- Retrieval fusion owner: [`search-runtime.ts`](../../sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts)
- Database client: [`client.ts`](../../sveltekit-frontend/src/lib/server/db/client.ts)
- Search boundaries and executor adapters: [`src/lib/server/retrieval`](../../sveltekit-frontend/src/lib/server/retrieval/)
- Atlas contracts and integrations: [`src/lib/server/atlas`](../../sveltekit-frontend/src/lib/server/atlas/)

## Semantic evidence and context assembly

- Retrieval and fusion owner: [`search-runtime.ts`](../../sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts)
- MCP integration surface: [`acp-mcp-integration.ts`](../../sveltekit-frontend/src/lib/server/acp/acp-mcp-integration.ts)
- ContextManifest admission and contracts: [`src/lib/server/atlas/context`](../../sveltekit-frontend/src/lib/server/atlas/context/)
- PromptPlan implementation and schema: [`prompt-plan-v1.ts`](../../sveltekit-frontend/src/lib/server/atlas/prefill/prompt-plan-v1.ts) and [`prompt-plan.v1.okf`](../../sveltekit-frontend/schemas/atlas/context/prompt-plan.v1.okf)
- ContextManifest schema: [`context-manifest.v1.okf`](../../sveltekit-frontend/schemas/atlas/context/context-manifest.v1.okf)

`SemanticEvidenceV1` and an `atlas_query_semantic_evidence` MCP adapter are
proposed contract work, not confirmed shipped interfaces. Implement them as
adapters over these owners—not as a second search engine or fusion path. Keep
representation qualification (model, recipe, dimension, metric and vector
provenance) separate from source-lineage and ContextManifest admission. A
similarity score nominates relevant evidence; it does not establish that a
claim is true. Hash vectors and unqualified embeddings must not qualify for the
production semantic lane.

## Playwright and agentic diagnostics

- Main Playwright configuration: [`playwright.config.ts`](../../sveltekit-frontend/playwright.config.ts)
- Route verification: [`route-verification.spec.ts`](../../sveltekit-frontend/tests/e2e/route-verification.spec.ts)
- Admin and demo route coverage: [`all-routes-admin-demos.spec.ts`](../../sveltekit-frontend/tests/e2e/all-routes-admin-demos.spec.ts)
- Route forensic diagnostics: [`tests/e2e/route-forensic`](../../sveltekit-frontend/tests/e2e/route-forensic/)
- Playwright health-check endpoints: [`/api/playwright/run-health-check`](../../sveltekit-frontend/src/routes/api/playwright/run-health-check/) and [`/api/phase78/playwright-check`](../../sveltekit-frontend/src/routes/api/phase78/playwright-check/)
- Live recorder: [`playwright-live-recorder.mjs`](../../sveltekit-frontend/scripts/diagnostics/playwright-live-recorder.mjs)
- Repair skill registry and loop: [`repair-registry.ts`](../../sveltekit-frontend/scripts/agents/repair-registry.ts) and [`repair-loop.ts`](../../sveltekit-frontend/scripts/agents/repair-loop.ts)
- Repair memory: [`fixer-memory.ts`](../../sveltekit-frontend/src/lib/server/fixer/fixer-memory.ts)
- Agentic error demo routes: [`demos/agentic-errors`](../../sveltekit-frontend/src/routes/(app)/demos/agentic-errors/)

These are implementation and test entry points, not proof that every route,
button, health endpoint, or repair workflow passes end-to-end. Run the targeted
Playwright spec against its configured server and dependencies before making a
live behavior claim. Repair execution remains subject to existing validation,
authorization, and bounded-execution gates.

## Build and validation

- Vite configuration: [`vite.config.ts`](../../sveltekit-frontend/vite.config.ts)
- SvelteKit adapter and compiler configuration: [`svelte.config.js`](../../sveltekit-frontend/svelte.config.js)
- Unit and integration tests: [`tests`](../../sveltekit-frontend/tests/)
- Package scripts: [`package.json`](../../sveltekit-frontend/package.json)

The reported production build took 22 minutes 14 seconds. That duration is a
measurement from one run, not a profiled bottleneck. Capture phase-level timing
before changing production minification, adapter compression, or route
prerendering; use targeted checks while diagnosing build performance.
