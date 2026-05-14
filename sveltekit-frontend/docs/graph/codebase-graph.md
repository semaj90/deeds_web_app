# Codebase Graph Plan — Fast AST (20-Gate)
> Generated: 2026-05-14T00:50:34.872Z
> Mode: `fast-ast` (CPU only)

## Stats
| Metric | Count |
|--------|-------|
| Files | 4980 |
| Routes | 1013 |
| Components | 884 |
| API handlers | 705 |
| TODOs | 49 |
| Dirs | 451 |

## Gate Failures (action needed)
| Gate | Fail Count |
|------|-----------|
| G4 No auth | 0 |
| G5 No Zod  | 0 |
| G11 Localhost | 127 |
| G14 Svelte4 | 0 |
| G15 SSR unsafe | 0 |
| G16 No test | 3 |
| G20 Cyclic | 0 |

## Files with TODO/FIXME
- `scripts/phase104-backups/src/lib/services/vector-service.ts` — 13 marker(s)
- `scripts/phase104-backups/src/lib/server/ai/feedback-loop.ts` — 6 marker(s)
- `scripts/phase104-backups/src/lib/server/services/recovery.service.ts` — 3 marker(s)
- `scripts/phase104-backups/src/lib/services/cuda-vector-integration.ts` — 3 marker(s)
- `scripts/phase104-backups/src/routes_parked/api/ai/summarize/cache/[key]/+server.ts` — 3 marker(s)
- `src/lib/components/ui/enhanced-bits/SSRWebGPULoader.svelte` — 2 marker(s)
- `src/lib/workers/embedding-worker-enhanced.js` — 2 marker(s)
- `scripts/phase104-backups/src/lib/services/ace-web/ace-context-service.ts` — 2 marker(s)
- `src/lib/ai/onnx/inference.ts` — 1 marker(s)
- `src/lib/components/RouteDecisionModal.svelte` — 1 marker(s)
- `src/lib/components/RouteInspectorWorking.svelte` — 1 marker(s)
- `src/lib/components/ui/Form.svelte` — 1 marker(s)
- `src/lib/components/yorha/dashboard/GPUMetrics.svelte` — 1 marker(s)
- `src/routes/(app)/demos/yorha/components/dashboard/GPUMetrics.svelte` — 1 marker(s)
- `src/routes/api/synthesis/generate/+server.ts` — 1 marker(s)
- `scripts/enrich-agents-md.mjs` — 1 marker(s)
- `scripts/phase104-backups/src/crewAIOrchestrationMachine.ts` — 1 marker(s)
- `scripts/phase104-backups/src/lib/server/orchestrator/gemma-agent.ts` — 1 marker(s)
- `scripts/phase104-backups/src/lib/server/services/vector-service-simple.ts` — 1 marker(s)
- `scripts/phase104-backups/src/lib/stores/_archive/old-stores/enhanced-auth.svelte.ts` — 1 marker(s)

## ACE usage
Redis `code:index:manifest`, `code:index:tag:{word}`, `code:index:gate-stats`, `wiki:note:dir:*`
Score cap: 0.07 (fast-ast), 0.08 (KAG dir notes)

## Full GPU
```bash
npm run index:codebase:full
```
