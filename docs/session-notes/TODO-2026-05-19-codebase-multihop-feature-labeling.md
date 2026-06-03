# TODO — 2026-05-19 Codebase Multi-Hop Feature Labeling

## Purpose
Create a production-ready feature labeling plan for codebase multi-hop traversal, AVX2/simdjson connection payload parsing, and downstream GraphRAG/Karpathy synthesis.

---

## 1. Goal
Turn connection payloads into stable graph labels and route them through:
- Redis label caches
- Qdrant point metadata/tags
- JSONL export for cluster summary generation
- ClusterCards / ClusterCard schema
- Hermes routing and MCP tool selection
- ACE compaction and prompt assembly

## 2. Core artifacts to wire
1. `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts`
2. `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts`
3. `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`
4. `sveltekit-frontend/src/mcp/trace-mcp-server.ts`
5. `sveltekit-frontend/src/lib/server/ace/cluster-tags-cache.ts`
6. `sveltekit-frontend/scripts/atlas/karpathy-gpu-enrich.mjs`
7. `sveltekit-frontend/src/lib/server/graph/*`
8. `sveltekit-frontend/src/routes/api/codebase-index/*`

## 3. Exact label schema
Normalize connection labels using:
- `connectionType`
- `sourceFile`
- `targetFile`
- `method`
- `language`
- `dependencyRole`
- `edgeKind`
- `confidence`
- `labelSource`

## 4. Live path audit commands
- `rg "fastJsonParse" sveltekit-frontend/src/lib/server/**/*`
- `rg "simdjson-bridge" sveltekit-frontend/src/**/*`
- `rg "readLatestQdrantClusterTags" sveltekit-frontend/src/**/*`
- `rg "applyKarpathyBoost" sveltekit-frontend/src/**/*`
- `rg "ace:cluster:members" sveltekit-frontend/src/**/*`
- `rg "ace:cluster:graphrag:neighbors" sveltekit-frontend/src/**/*`
- `rg "gemma4-offload" sveltekit-frontend/src/**/*`
- `rg "cluster-summary" sveltekit-frontend/src/**/*`

## 5. Production TODO list
- [ ] Add a stable `connectionLabels` metadata schema to `simdjson-bridge.ts` output.
- [ ] Emit those labels into Redis as `ace:connection:labels:{stableKey}` and related path/cluster maps.
- [ ] Persist normalized label payloads into Qdrant points during codebase indexing and cluster writes.
- [ ] Add label fields to `ClusterCard` JSON templates and summary generation prompts.
- [ ] Extend `context-assembler.ts` to use labels as a secondary boost signal alongside Karpathy and semantic relevance.
- [ ] Add an MCP/offload tool route in `trace-mcp-server.ts` for label-aware cluster search and probe diagnostics.
- [ ] Validate end-to-end with one query that exercises connection payload => label cache => cluster summary prompt.

## 6. Verification targets
- `opencode run -m turboquant/gemma4-tq --agent trace-audit "Audit simdjson connection label propagation"`
- `npm run graphify:semantic-cluster` then `npm run karpathy:gpu`
- Query `/api/codebase-index/graph` and check for `connectionType` / `dependencyRole` in payload tags.
- Verify `ace:cluster:members:*` and `ace:cluster:graphrag:neighbors:*` still function after label injection.

## 7. Notes
- Keep the feature-labeling path small: parse -> normalize -> attach -> rerank.
- Do not expand to full Obsidian/YT ingestion until the label routing path is stable.
- Preserve the runtime alignment note as the master truth source for TurboQuant + OpenCode + MCP startup.
