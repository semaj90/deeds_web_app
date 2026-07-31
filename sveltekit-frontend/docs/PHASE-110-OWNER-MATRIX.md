# Phase 110 Owner Matrix

Generated from live repository discovery on 2026-07-30. This is a discovery artifact, not a completion claim.

## Summary

The repository now contains concrete owners for the core Phase 110 retrieval and packet-compression helpers. The earlier unresolved-import report is stale for most lanes.

## Owner Inventory

| Component | Definition file | Current state | Callers / notes |
| --- | --- | --- | --- |
| `embedQueryForLane` | `src/lib/server/retrieval/embedding-service.ts` | FOUND | Used by `src/lib/server/retrieval/unified-orchestrator.ts`, `retrieve-candidates.ts`, `semantic-search-workflow.ts`, and `service.ts` |
| `combineRRFLanes` | `src/lib/server/retrieval/rrf-combiner-utils.ts` | FOUND | Used by `src/lib/server/retrieval/unified-orchestrator.ts` and `compute-rrf-score.ts` |
| `resolveParentAtlasContext` | `src/lib/server/retrieval/parent-atlas-bridge.ts` | FOUND | Used by `src/lib/server/retrieval/unified-orchestrator.ts` |
| `compressFileToCard` | `src/lib/server/ai/context-compression.ts` | FOUND | Wired through `src/lib/server/features/ai/ai/kv-context-controller.ts`, `ace-builder.ts`, `dev-context-planner.ts`, and `openai-facade.ts` |
| `buildAttentionToc` | `src/lib/server/ai/context-compression.ts` | FOUND | Wired through `src/lib/server/features/ai/ai/kv-context-controller.ts` and the ACE path |
| `buildKvContextPacket` | `src/lib/server/features/ai/ai/kv-context-controller.ts` | FOUND | Used by `ace-builder.ts`, `dev-context-planner.ts`, `openai-facade.ts`, `gemma4-agent.ts`, and MCP trace tooling |
| `autoTagDocument` | `src/lib/server/ace/auto-tagger.ts` | FOUND | Called by `src/lib/server/agent/autonomous-agent.ts` |
| `hyperragExpand` | not found in current tree | MISSING | No direct symbol with this name was found in `src/lib/server` or `scripts`; current HyperRAG code uses `HyperRagRetriever` / `HyperRagFusionService` instead |

## HyperRAG Notes

The current HyperRAG implementation is present under the retrieval and ACE namespaces:

- `src/lib/server/ace/retrieval/hyperrag-retriever.ts` exports `HyperRagRetriever`
- `src/lib/server/retrieval/hyperrag-fusion-service.ts` exports `HyperRagFusionService`
- `src/lib/server/retrieval/hyperrag-packet-rpc.ts` exports the packet RPC lane

So the remaining work is not “create HyperRAG from scratch.” It is decide which of the existing HyperRAG owners is the canonical expansion boundary and align callers to that owner.

## Schema / Ingest Notes

The packet/inference boundary is already anchored by:

- `src/lib/server/features/ai/ai/kv-context-controller.ts`
- `src/lib/server/ai/ace-builder.ts`
- `src/lib/server/ai/context-compression.ts`

That means the Phase 110 next step should focus on wiring and validation, not inventing another packet shape.

## Corrected State

- `compressFileToCard`: `EXISTING_OWNER`
- `buildAttentionToc`: `EXISTING_OWNER`
- `buildKvContextPacket`: `EXISTING_OWNER`
- `autoTagDocument`: `EXISTING_OWNER`
- `embedQueryForLane`: `EXISTING_OWNER`
- `combineRRFLanes`: `EXISTING_OWNER`
- `resolveParentAtlasContext`: `EXISTING_OWNER`
- `hyperragExpand`: `NO_DIRECT_SYMBOL`

