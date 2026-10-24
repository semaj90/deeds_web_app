---
type: system
title: tRPC Owner (search.verifiedContext, context injection and shared-service wiring)
id: system/trpc-owner
status: active
owners:
  - legal-ai-team
source_refs:
  - sveltekit-frontend/package.json
  - sveltekit-frontend/src/lib/server/trpc/init.ts
  - sveltekit-frontend/src/lib/server/trpc/routers/search.ts
  - sveltekit-frontend/src/lib/server/trpc/routers/search.verified-context.spec.ts
  - sveltekit-frontend/src/routes/api/trpc/[...procedure]/+server.ts
  - sveltekit-frontend/src/hooks.server.ts
  - sveltekit-frontend/src/lib/server/atlas/execution/verified-context-runtime-v1.ts
related:
  - system/mastra-owner
  - system/opentelemetry-owner
---

# tRPC owner

## Responsibility

tRPC is the browser-to-server procedure boundary for the SvelteKit app. The `search.verifiedContext` procedure exposes the shared verified-context service. tRPC does not own authority, admission or synthesis; it forwards a validated request and returns the service result or refusal.

## Source and dependencies

| Item | Location and version |
|---|---|
| Packages | `@trpc/server` 11.18.0 and `@trpc/client` 11.18.0, declared in `sveltekit-frontend/package.json` |
| Mount | `sveltekit-frontend/src/routes/api/trpc/[...procedure]/+server.ts` |
| Context | `sveltekit-frontend/src/lib/server/trpc/init.ts` (line 28 type; line 44 reads `verifiedContextService` from `event.locals`) |
| Shared-service injection | `sveltekit-frontend/src/hooks.server.ts` (line 682) sets `event.locals.verifiedContextService = verifiedContextRuntimeV1` |
| Procedure | `search.verifiedContext` (`protectedProcedure`) in `sveltekit-frontend/src/lib/server/trpc/routers/search.ts` |

## Procedure behavior (verified in source)

- Input is validated by the request schema before it reaches the service.
- If `ctx.verifiedContextService` is absent, the procedure returns `refuseVerifiedContextV1(ctx.requestId, 'VERIFIED_CONTEXT_SERVICE_NOT_CONFIGURED')`.
- Otherwise it calls `ctx.verifiedContextService.execute(String(ctx.userId), request)` and returns the result unchanged.
- The procedure adds no authority of its own; workspace refusals come from the service.

## Proven

- `search.verified-context.spec.ts` passes as part of the 9/9 route and procedure refusal set (see `system/mastra-owner`).
- Shared-service wiring: the same `verifiedContextRuntimeV1` is injected into `event.locals` once in `hooks.server.ts` and read by both tRPC context and the Mastra route.

## Unproven

- A live HTTP call to `search.verifiedContext` through `/api/trpc`. The procedure has been exercised by specs, not by a real browser or HTTP tRPC request recorded in a trace.
- Trace coverage of tRPC procedure calls in Langfuse. Only the Mastra route trace has been read back.
