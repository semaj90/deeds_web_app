# Feature: GPU Compute Plane Integration

Status: active, validation pending
Date Generated: 2026-05-21

## Objective

Build a resilient GPU compute plane for graph analysis and retrieval acceleration while keeping the CPU retrieval path and Bifrost synthesis boundary intact.

## Architectural Summary

The repository already contains a partial GPU plane that spans orchestration, GPU pipeline execution, reranking, topology projection, and audit tooling. The feature is not a standalone runtime yet; it is a coordinated set of live modules that need to stay aligned under the same retrieval contract.

### Live anchors

- `src/mcp-gpu-orchestrator.ts`
- `src/lib/server/gpu/gpu-pipeline.ts`
- `src/lib/server/retrieval/gpu-reranker.ts`
- `src/lib/server/graph/gpu-graph-analysis.ts`
- `src/lib/server/topology/gpu-topology-projection.ts`
- `src/lib/server/atlas/gpu-ast-mapper.ts`
- `src/lib/server/audit/gpu-audit-orchestrator.ts`
- `src/lib/server/ai/hermes/skills/gpu-acceleration.ts`

### Current integration shape

- GPU jobs are queued and bounded instead of being allowed to fan out unconstrained.
- GPU scoring and reranking are isolated from route handlers and routed through service modules.
- The retrieval stack still falls back to the normal KAG/ACE paths when GPU resources are unavailable.
- Direct synthesis remains behind the existing LLM gateway boundary instead of being embedded into the GPU plane.

## Validation and Safety

The GPU plane needs to preserve four invariants:

1. GPU work must always release resources.
2. GPU failures must degrade to the normal retrieval path.
3. Context output must not leak internal metadata into the final brief.
4. Database writes must remain atomic where evidence or state changes are involved.

## Relevant Repo Surfaces

### Retrieval and reranking

- `src/lib/server/retrieval/gpu-reranker.ts`
- `src/lib/server/search/gpu-rerank.ts`
- `src/lib/server/ace/context-assembler.ts`
- `src/lib/server/ace/adaptive-prefetch.ts`

### Graph and topology

- `src/lib/server/graph/gpu-graph-analysis.ts`
- `src/lib/server/topology/gpu-topology-projection.ts`
- `src/lib/server/atlas/gpu-ast-mapper.ts`
- `src/lib/server/atlas/prompt-mapper.ts`

### GPU execution

- `src/lib/server/gpu/gpu-pipeline.ts`
- `src/lib/server/gpu/gpu-monitor.ts`
- `src/lib/server/gpu/gpu-job-queue.ts`
- `src/lib/server/gpu/hybrid-gpu-context.ts`

### Storage and cache

- `src/lib/server/adapters/service-integrations.ts`
- `src/lib/server/cache/code-llm-index.ts`
- `src/lib/server/cache/redis-semantic-cache.ts`
- `src/lib/server/cache/invalidation.ts`
- `src/lib/server/ace/context-cache-planner.ts`

### Observability and audit

- `src/lib/server/audit/gpu-audit-orchestrator.ts`
- `src/lib/server/ace/ace-error-kag.ts`
- `src/lib/server/ace/error-kag-writer.ts`

## Risks To Track

- GPU memory exhaustion if cleanup is not consistently enforced.
- Output contamination if internal metadata is passed into synthesis prompts.
- State drift if evidence or metadata writes are not wrapped atomically.
- Model alias drift if the GPU plane leaks into the wrong model gateway.
- Direct Ollama callers still exist in parts of the repo and should remain outside the final synthesis path unless intentionally exempted.

## Next Steps

1. Keep the GPU plane isolated as an execution layer.
2. Validate the fallback path from GPU analysis to standard KAG/ACE retrieval.
3. Keep Bifrost as the synthesis boundary.
4. Add or update tests for any route or service that uses GPU results.
5. Reconcile this feature doc with the active atlas and feature map once the current indexing loop is fresh.

## Notes

This document is intentionally grounded in live repository anchors. It does not claim a separate `trace.cuda_graph_query` tool or a fictional dispatcher file; those concepts should only be documented if they are added to the codebase as real modules.
