# Codebase Graph Plan — Fast AST (20-Gate)
> Generated: 2026-05-12T17:13:20.251Z
> Mode: `fast-ast` (CPU only)

## Stats
| Metric | Count |
|--------|-------|
| Files | 3966 |
| Routes | 1002 |
| Components | 883 |
| API handlers | 680 |
| TODOs | 11 |
| Dirs | 414 |

## Gate Failures (action needed)
| Gate | Fail Count |
|------|-----------|
| G4 No auth | 11 |
| G5 No Zod  | 0 |
| G11 Localhost | 19 |
| G14 Svelte4 | 0 |
| G15 SSR unsafe | 2 |
| G16 No test | 46 |
| G20 Cyclic | 1 |

## Files with TODO/FIXME
- `src/lib/components/ui/enhanced-bits/SSRWebGPULoader.svelte` — 2 marker(s)
- `src/lib/workers/embedding-worker-enhanced.js` — 2 marker(s)
- `src/lib/ai/onnx/inference.ts` — 1 marker(s)
- `src/lib/components/RouteDecisionModal.svelte` — 1 marker(s)
- `src/lib/components/RouteInspectorWorking.svelte` — 1 marker(s)
- `src/lib/components/ui/Form.svelte` — 1 marker(s)
- `src/lib/components/yorha/dashboard/GPUMetrics.svelte` — 1 marker(s)
- `src/routes/(app)/demos/yorha/components/dashboard/GPUMetrics.svelte` — 1 marker(s)
- `src/routes/api/synthesis/generate/+server.ts` — 1 marker(s)

## ACE usage
Redis `code:index:manifest`, `code:index:tag:{word}`, `code:index:gate-stats`, `wiki:note:dir:*`
Score cap: 0.07 (fast-ast), 0.08 (KAG dir notes)

## Full GPU
```bash
npm run index:codebase:full
```
