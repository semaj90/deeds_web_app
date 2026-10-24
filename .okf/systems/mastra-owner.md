---
type: system
title: Mastra Owner (orchestrator, verified-context tool and agent registration)
id: system/mastra-owner
status: active
owners:
  - legal-ai-team
source_refs:
  - packages/atlas-orchestrator/package.json
  - packages/atlas-orchestrator/src/tools/verified-context-tool.ts
  - packages/atlas-orchestrator/src/tools/verified-context-tool.spec.ts
  - packages/atlas-orchestrator/src/models/prompt-plan-agent.ts
  - sveltekit-frontend/src/lib/server/atlas/atlas-mastra-adapter.ts
  - sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.ts
  - sveltekit-frontend/src/lib/server/atlas/mastra-agent-route.spec.ts
related:
  - system/trpc-owner
  - system/opentelemetry-owner
---

# Mastra owner

## Responsibility

Mastra executes approved read-only tool and agent requests inside the orchestrator package. It has no admission authority. Workspace authority, evidence admission and synthesis gates stay with the verified-context service and its providers, not with Mastra.

## Source and dependencies

| Item | Location and version |
|---|---|
| Owning workspace | `packages/atlas-orchestrator` (its own `package.json`; no lockfile in that workspace) |
| Declared | `@mastra/core` 1.71.0, `@mastra/pg` 1.27.1, `@mastra/redis` 1.4.6 |
| Resolvable | `@mastra/core` resolves from `packages/atlas-orchestrator/node_modules`; it does not resolve from the SvelteKit app and is not in the app's dependencies |
| App boundary | `sveltekit-frontend/src/lib/server/atlas/atlas-mastra-adapter.ts`; the app does not import `@mastra` directly (per the adapter's comment) |

## Registrations (verified in source)

| Kind | Name / file | Notes |
|---|---|---|
| Tool | `createTool` in `packages/atlas-orchestrator/src/tools/verified-context-tool.ts` (line 52) | Calls the verified-context path; read-only |
| Agent | `new Agent` in `packages/atlas-orchestrator/src/models/prompt-plan-agent.ts` (line 55) | Prompt planning |
| Workflow | none found | No `createWorkflow` in the orchestrator |
| Mastra instance | none found | No `new Mastra(...)` in the orchestrator |

## Refusal contract (route)

`POST /api/atlas/mastra-agent` (`sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.ts`) calls the shared verified-context service from `event.locals`:

| Condition | HTTP | Body |
|---|---|---|
| Service not injected | 503 | `VERIFIED_CONTEXT_SERVICE_NOT_CONFIGURED`, `writesPerformed: false` |
| Service throws | 503 | `VERIFIED_CONTEXT_SERVICE_FAILED`, `writesPerformed: false` |
| Authority or provider refusal | 409 (live) | `TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE`, `firstFailingBoundary: WORKSPACE_AUTHORITY`, receipt `atlas.verified-context-receipt.v1` |

## Proven

- Tool spec: `packages/atlas-orchestrator/src/tools/verified-context-tool.spec.ts` 5/5 pass (run with the workspace's own vitest binary).
- Route and tRPC refusal specs: `mastra-agent-route.spec.ts` and `search.verified-context.spec.ts` 9/9 pass together.
- Live refusal (2026-10-23): one `POST /api/atlas/mastra-agent` returned 409 with `WORKSPACE_AUTHORITY`. Its trace reached Langfuse and was read back by ID (see `system/opentelemetry-owner`).

## Unproven

- Any successful Mastra tool execution. A refusal does not prove tool execution.
- Agent or tool run IDs from a real run. None exists yet.
- Live synthesis. Blocked by design until current workspace authority and admitted feature snapshots exist.
- Workflow registration. None is present.
- Mastra telemetry. Mastra does not emit spans into the SvelteKit OpenTelemetry SDK, as far as the source shows; this has not been verified at runtime.
