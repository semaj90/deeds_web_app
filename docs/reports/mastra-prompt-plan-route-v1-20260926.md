# Mastra PromptPlan route wiring — 2026-09-26

## Status

The authenticated SvelteKit endpoint now executes an existing admitted `AceContextManifestAdmissionV1` and compiled `PromptPlanV1` using a request-scoped, tool-free Mastra Agent. Candidate selection, packet-key identity, ContextManifest construction, and PromptPlan construction remain owned upstream. This is fixture-proven application wiring; a live request using an owner-produced same-snapshot manifest has not been run.

## Boundary and behavior

- The route accepts only an admission envelope, PromptPlan, and ordinal-bound segment bytes; there is no free-form prompt field.
- It verifies the ContextManifest identity checksum, admission checksum coordinate, PromptPlan request/checksum binding, selected packet-key membership, and exact evidence-reference set before model resolution.
- Segment checksums, PromptPlan checksum, ordinal continuity, and token budget are checked by the existing Atlas PromptPlan adapter owner.
- The loaded model ID comes from `resolveLoadedLlamaModel(ENV.LLAMA_SERVER_URL, ENV.LLAMA_SERVER_MODEL)` and is passed verbatim to Mastra. No model alias/resolver was added.
- Mastra has no tools, memory, storage, durable-agent wrapper, or workflow persistence configured. The response marks `canonicalAuthority=false`, `writesPerformed=false`, `durableStatePersisted=false`.
- The runtime model artifact revision is unresolved (`null`); the live model ID alone is not immutable encoder/model provenance.

## Verification

- Mastra executor fixture tests: 3/3 passed (resolved model ID preserved, plan bytes sent, checksum drift blocked pre-request, hidden-reasoning marker rejected).
- SvelteKit route fixture tests: 3/3 passed (valid admitted packet-key/evidence plan, identity drift blocked before model resolution, unauthenticated request blocked).
- `@deeds/atlas-orchestrator` TypeScript build/typecheck: passed.
- `npx openspec validate parent-atlas-agentic-file-compiler --strict`: passed.
- Scoped `git diff --check`: passed.
- Full `npm run check` was stopped after the `svelte-check` process grew to approximately 4.4 GB without diagnostics; repository-wide Svelte diagnostics remain unverified.

## Still open

- AFC-14B-02: authenticated live route replay with an owner-produced packet-key CandidateOrdinal snapshot, admitted ContextManifestV2, and matching PromptPlanV1.
- Immutable model-artifact/checkpoint revision from the serving endpoint.
- AFC-15 suspend/resume restart parity and fake Mastra shim retirement.

## Side effects

PostgreSQL writes: 0; Qdrant writes: 0; Valkey/Redis writes: 0; RabbitMQ publishes: 0; Neo4j writes: 0; Graphify runs: 0. No live model inference was invoked in this tranche.

likely_cause: The app endpoint previously returned 501 because only Mastra package installation/imports existed, without an execution adapter or validated ContextManifest-to-PromptPlan request boundary.

evidence: `sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.ts`; `packages/atlas-orchestrator/src/models/prompt-plan-agent.ts`; focused tests in those directories; AFC-14B entries in `openspec/changes/parent-atlas-agentic-file-compiler/tasks.md`.

patch_targets: `packages/atlas-core/package.json`; `packages/atlas-core/tsconfig.prompt-adapter.json`; `packages/atlas-core/src/langgraph/ornith-prompt-plan-adapter.ts`; `packages/atlas-orchestrator/package.json`; `packages/atlas-orchestrator/src/models/prompt-plan-agent.ts`; `packages/atlas-orchestrator/src/models/prompt-plan-agent.spec.ts`; `sveltekit-frontend/package.json`; `sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.ts`; `sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.spec.ts`; `openspec/changes/parent-atlas-agentic-file-compiler/tasks.md`.

safe_next_command: `rg --files docs/reports .tmp/atlas | rg "(context-manifest|prompt-plan).*\\.json$"` to locate an owner-produced, explicitly pinned ContextManifest/PromptPlan artifact before planning the live replay; do not substitute a fabricated candidate fixture.

smoke_command: `cd sveltekit-frontend; node node_modules/vitest/vitest.mjs run src/routes/api/atlas/mastra-agent/+server.spec.ts`

report_path: `docs/reports/mastra-prompt-plan-route-v1-20260926.md`
