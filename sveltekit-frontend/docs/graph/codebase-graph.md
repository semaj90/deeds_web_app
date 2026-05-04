# Codebase Graph Plan — Fast AST (20-Gate)
> Generated: 2026-05-04T01:10:46.577Z
> Mode: `fast-ast` (CPU only)

## Stats
| Metric | Count |
|--------|-------|
| Files | 2576 |
| Routes | 873 |
| Components | 848 |
| API handlers | 581 |
| TODOs | 27 |
| Dirs | 349 |

## Gate Failures (action needed)
| Gate | Fail Count |
|------|-----------|
| G4 No auth | 54 |
| G5 No Zod  | 160 |
| G11 Localhost | 94 |
| G14 Svelte4 | 0 |
| G15 SSR unsafe | 529 |
| G16 No test | 532 |
| G20 Cyclic | 36 |

## Files with TODO/FIXME
- `src/lib/utils/dynamic-imports.ts` — 7 marker(s)
- `src/lib/components/ui/enhanced-bits/SSRWebGPULoader.svelte` — 2 marker(s)
- `src/lib/workers/embedding-worker-enhanced.js` — 2 marker(s)
- `src/routes/(app)/admin/component-analysis/+page.svelte` — 2 marker(s)
- `src/routes/(app)/admin/phase89/+page.svelte` — 2 marker(s)
- `src/lib/ai/onnx/inference.ts` — 1 marker(s)
- `src/lib/components/RouteDecisionModal.svelte` — 1 marker(s)
- `src/lib/components/RouteInspectorWorking.svelte` — 1 marker(s)
- `src/lib/components/ui/Form.svelte` — 1 marker(s)
- `src/lib/components/yorha/dashboard/GPUMetrics.svelte` — 1 marker(s)
- `src/lib/server/auth/password.ts` — 1 marker(s)
- `src/lib/server/error-brain/transport/redis.ts` — 1 marker(s)
- `src/lib/server/redis.ts` — 1 marker(s)
- `src/lib/services/error-analysis/LearningPipeline.ts` — 1 marker(s)
- `src/routes/(app)/chat/+page.server.ts` — 1 marker(s)
- `src/routes/(app)/demos/yorha/components/dashboard/GPUMetrics.svelte` — 1 marker(s)
- `src/routes/api/synthesis/generate/+server.ts` — 1 marker(s)

## ACE usage
Redis `code:index:manifest`, `code:index:tag:{word}`, `code:index:gate-stats`, `wiki:note:dir:*`
Score cap: 0.07 (fast-ast), 0.08 (KAG dir notes)

## Full GPU
```bash
npm run index:codebase:full
```
