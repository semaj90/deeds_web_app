# FF1 Compute Planner — `src/lib/server/ff1/`

<!-- AGENTS-GEN v1 · do not edit below this line -->

## Snapshot
| Metric | Value |
|--------|-------|
| Files | 7 (planner.ts, registry.ts + 5 sub-module files) |
| Purpose | Runtime backend selection: Redis → LibTorch GPU → simdjson → WASM → JS |
| Tags | compute, gpu, cache, inference |

## Module Layout

```
ff1/
  planner.ts          — ff1() dispatch entry point (auto-selects fastest backend)
  registry.ts         — FF1FunctionName enum + capability registry
  agent/
    gemma4-repair-planner.ts  — Gemma4-based agentic repair planning
    tool-registry.ts          — MCP-style tool registry for ff1 agents
  audit/
    diagnostic-collector.ts   — Collects svelte-check/tsc diagnostics for agent input
  graph/
    graph-schema.ts           — Zod schema for graph node/edge types
```

## Priority Ladder

1. **Redis cache** ~0.2ms — exact-match via SHA-256 key
2. **LibTorch N-API GPU** ~1-5ms — CUDA cuBLAS on RTX 3060 Ti (`tensorrt_bridge.node`)
3. **simdjson N-API** ~0.5ms — SIMD JSON ops only
4. **WASM SIMD** ~5-20ms — 128-bit lanes, server-side
5. **JS fallback** ~20-200ms — V8 JIT, always available

## Usage

```typescript
import { ff1 } from '$lib/server/ff1/planner.js';
const score = await ff1('embedding.cosine', vecA, vecB);
const top   = await ff1('graph.pagerank', { nodes, edges, iters: 40 });
```

## Agentic Hints

- To run a repair plan: call `gemma4-repair-planner.ts:buildRepairPlan(diagnostics)`
- Diagnostics are collected by `diagnostic-collector.ts:collectDiagnostics()`
- Tool names are declared in `tool-registry.ts` — search by `FF1_TOOL_*` prefix
- `graph-schema.ts` exports `GraphNodeSchema` / `GraphEdgeSchema` for Zod validation
