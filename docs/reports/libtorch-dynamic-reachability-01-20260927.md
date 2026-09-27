# LIBTORCH-DYNAMIC-REACHABILITY-01 — 2026-09-27

Status: **PROVEN_STATIC_CALLERS / prior zero-caller premise invalid**

Scope: read-only source audit. No native export was removed, no addon was loaded,
and no GPU/model/cache/datastore operation was executed.

The earlier five-export "zero static caller" classification was produced by a
search that was too narrow. Whole-repository identifier/call-site inspection
finds direct callers for every export, so none may be classified
`DEAD_NO_RUNTIME_REACHABILITY`. Dynamic/string/reflection reachability is no
longer required to rescue these exports: ordinary static calls already prove
reachability.

| Export | Status | Direct caller evidence | Consequence |
|---|---|---|---|
| `trainSOM` | PROVEN_STATIC_CALLER | `scripts/atlas/dir-pipeline.mjs`, `scripts/atlas/train-som-20x20.mjs`, `scripts/atlas/som-clustering-pipeline.mjs`, `scripts/atlas/pytorch-qdrant-redis-som-index.mjs`, `sveltekit-frontend/src/lib/workers/gpu-worker.mjs` | Not a removal candidate in this tranche. |
| `clusterEmbeddings` | PROVEN_STATIC_CALLER | `sveltekit-frontend/src/routes/api/gpu/compute/+server.ts`, `src/routes/api/codebase/analyze/+server.ts`, `src/lib/server/gpu/background-analyzer.ts`, `src/lib/server/workers/compute-pool.ts` | Live wrapper/API reachability exists. |
| `computeCaseEmbedding` | PROVEN_STATIC_CALLER | `sveltekit-frontend/src/routes/api/gpu/compute/+server.ts`, `src/lib/server/gpu/background-analyzer.ts`, `sveltekit-frontend/scripts/atlas/prototype_feature_extract.mjs` | Live wrapper/API reachability exists. |
| `attentionScoreGPU_fp16` | PROVEN_STATIC_CALLER | `scripts/atlas/karpathy-gpu-enrich.mjs`, `scripts/karpathy-gpu-enrich.mjs`, `sveltekit-frontend/scripts/run-hypergraph.ts`, `src/lib/server/gpu/libtorch-bridge.ts` | Live direct and wrapper callers exist. |
| `rewardScoreGPU_fp16` | PROVEN_STATIC_CALLER | `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts`, mirrored `packages/parent-atlas-retrieval/src/gpu/libtorch-bridge.ts` | Wrapper has an explicit native call path. |

## Related exports

### topKIndicesGPU

**BLOCKED_REPLACEMENT_PARITY.** It is currently called by
`sveltekit-frontend/src/lib/server/gpu/pytorch-graph.ts` and
`gpu-pipeline.ts`. The existing CUB/radix work is not sufficient evidence for
replacement. A replacement must first prove the same ordering, tie handling,
NaN handling, K bounds, dtype behavior, and device/host ownership.

### pageRankGPU

**PROVEN_STATIC_CALLER / CANONICAL_OWNER_TRACE_OPEN.** The LibTorch export is
reachable through `sveltekit-frontend/src/lib/server/gpu/pytorch-graph.ts`,
the GPU worker, and `src/lib/server/ff1/planner.ts`. Therefore it cannot be
classified dead or duplicate solely from caller count. The canonical PageRank
owner still needs an ownership/semantic parity trace before any removal or
consolidation decision.

## Dynamic/string/reflection conclusion

The requested dynamic-reachability search was intended to prevent false
negative dead-code classification. That safety condition is satisfied more
strongly here: all five targets have direct static callers. String tables,
computed-property access, N-API export lookup, dynamic loaders, MCP/tool
registries, tests, and generated bindings may add more paths, but are not
needed to establish runtime reachability and cannot justify a dead status.

No export removal is authorized by this report.
