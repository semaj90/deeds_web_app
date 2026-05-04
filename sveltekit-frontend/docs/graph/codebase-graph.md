# Codebase Graph Plan — Fast AST (20-Gate)
> Generated: 2026-05-04T05:06:08.792Z
> Mode: `fast-ast` (CPU only)

## Stats
| Metric | Count |
|--------|-------|
| Files | 2579 |
| Routes | 874 |
| Components | 848 |
| API handlers | 582 |
| TODOs | 16 |
| Dirs | 346 |

## Gate Failures (action needed)
| Gate | Fail Count |
|------|-----------|
| G4 No auth | 42 |
| G5 No Zod  | 1 |
| G11 Localhost | 53 |
| G14 Svelte4 | 0 |
| G15 SSR unsafe | 45 |
| G16 No test | 533 |
| G20 Cyclic | 1 |

## Files with TODO/FIXME
- `src/lib/components/ui/enhanced-bits/SSRWebGPULoader.svelte` — 2 marker(s)
- `src/lib/workers/embedding-worker-enhanced.js` — 2 marker(s)
- `src/routes/(app)/admin/component-analysis/+page.svelte` — 2 marker(s)
- `src/routes/(app)/admin/phase89/+page.svelte` — 2 marker(s)
- `src/lib/ai/onnx/inference.ts` — 1 marker(s)
- `src/lib/components/RouteDecisionModal.svelte` — 1 marker(s)
- `src/lib/components/RouteInspectorWorking.svelte` — 1 marker(s)
- `src/lib/components/ui/Form.svelte` — 1 marker(s)
- `src/lib/components/yorha/dashboard/GPUMetrics.svelte` — 1 marker(s)
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
