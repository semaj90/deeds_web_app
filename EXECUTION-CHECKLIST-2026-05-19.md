# EXECUTION CHECKLIST 2026-05-19

## Purpose
Capture the current runtime truth, required infra fixes, validation steps that bypass `svelte-check`, remaining P2 scope, and the next production slice for GraphRAG / Karpathy + AVX2/simdjson feature labeling.

---

## 1. Current runtime truth
- `TURBO_KV_K=q8_0` and `TURBO_KV_V=turbo3` are the active KV flags in `sveltekit-frontend/.env`.
- `sveltekit-frontend/scripts/ensure-llama-server.mjs` already wires these via `-ctk` / `-ctv` and now prefers `models/gemma4-legal-iq4xs-direct.gguf` when present.
- `LLAMA_SERVER_PATH` is configured to the local CUDA llama-server binary.
- `simdjson-bridge.ts` is already in use across Redis, Qdrant, GraphRAG, codebase indexing, and inference tooling.

## 2. Two required infra patches
1. `KV env mapping fix`
   - Ensure `LLAMA_CACHE_TYPE_K` / `LLAMA_CACHE_TYPE_V` override path is supported.
   - Confirm startup uses `-ctk q8_0 -ctv turbo3` reliably.
2. `Caddy route hygiene`
   - Confirm `/mcp*` and `/llama/*` are routed through the local proxy layer.
   - Avoid binding `:8888` for SearXNG; use `:8889`.

## 3. Validation steps that bypass `svelte-check`
- Runtime startup: validate `ensure-llama-server.mjs` successfully launches and healthchecks `http://127.0.0.1:8090/health`.
- Native bridge: verify `simdjson-bridge.ts` can load `../simd-bridge/cpp/build/Release/tensorrt_bridge.node` or fallback gracefully.
- Qdrant/Redis path: verify GraphRAG label paths work end-to-end via existing API routes, not just typecheck.
- Host prerequisite: confirm Windows permissions and `EPERM` fix path before building native addon.

## 4. Remaining P2 work
- ClusterCard schema + label propagation into codebase artifacts.
- GraphRAG / Karpathy finish line: connect codebase cluster labels into search rerank and summary prompts.
- AVX2 / simdjson connection labeling pipeline.
- Codebase multi-hop traversal feature labeling, especially cluster grouping and dependency/method coverage.

## 5. Recommended next build slice
1. Lock runtime patch: `ensure-llama-server.mjs` env mapping + startup args.
2. Stabilize Caddy proxy routes for MCP + llama-server.
3. Add explicit label propagation for GraphRAG cluster summaries.
4. Wire `simdjson-bridge.ts` parsed connection payloads into cluster/label metadata.
5. Validate with a small end-to-end cluster-label query using existing GraphRAG APIs.

## 6. What not to waste time on
- Deep VLM notebook surgery or vision tower reattachment until GraphRAG/Karpathy labeling is stable.
- Photorealistic 3D reconstruction or browser-only UI polish before the label/graph baseline is complete.
- Large dataset ingestion or Obsidian/YT transcript modes until the runtime + graph routing path is validated.

## 7. Host prerequisite for EPERM fix
- Windows host must allow native addon load from `simd-bridge/cpp/build/Release/tensorrt_bridge.node`.
- Ensure `process.cwd()` resolution matches `sveltekit-frontend` runtime path.
- Confirm file permission / antivirus policy is not blocking `.node` load.

## 8. Feature-labeling execution plan
### Goal
Use AVX2/simdjson parsing to normalize connection payloads into stable labels, then feed those labels into Redis, Qdrant, JSONL export, ClusterCards, Hermes routing, ACE compaction, and cluster-summary prompts.

### Steps
- Identify every payload parsing path that already uses `simdjson-bridge.ts`.
- Normalize parsed payloads to a stable schema: `connectionType`, `sourceFile`, `targetFile`, `method`, `language`, `dependencyRole`, `edgeKind`, `confidence`.
- Attach those labels to:
  - Redis blobs and key metadata
  - Qdrant point tags / metadata fields
  - JSONL export records used by cluster summary generators
  - ClusterCards and codebase graph artifacts
- Feed labels into downstream scoring:
  - Hermes routing / tool selection
  - ACE compaction / prompt assembly
  - GraphRAG / Karpathy cluster-summary prompt templates

## 9. Codebase multi-hop traversal checklist
- Run ripgrep over existing cluster/graph/retrieval files to capture current dependency surface.
- Group relevant files by cluster, language, method, and edge semantics.
- Validate that label propagation is present in:
  - `src/lib/server/gpu/simdjson-bridge.ts`
  - `src/lib/server/vector/qdrant-manager.ts`
  - `src/lib/server/graph/*`
  - `src/lib/server/retrieval/*`
  - `src/routes/api/codebase-index/*`
- Create a production TODO list for each live artifact, including:
  - `ClusterCard` schema changes
  - `Qdrant` label writes
  - `Redis` label cache writes
  - codebase traversal edge extraction
  - prompt template consumption
- Consolidate the multi-hop traversal feature-labeling playbook with exactly these artifacts:
  1. `simdjson-bridge.ts` connection parse paths → stable label schema
  2. `cluster-tags-cache.ts` / `karpathy-gpu-enrich.mjs` cluster metadata writes
  3. `context-assembler.ts` retrieval rerank / semantic boost wiring
  4. `trace-mcp-server.ts` MCP JSON tool support and `gemma4-offload` help
  5. cluster-summary prompt templates / JSONL export paths
- Deliver an actionable production TODO for each of the five paths above, with one `rg` command per path and one verify test per pipeline.

## 10. Immediate action items
- Audit cluster grouping with `rg` for `simdjson-bridge` + `fastJsonParse` + `GraphRAG` points.
- Label the live path: connection payload → normalized graph label → cluster artifact → summary prompt.
- Block on host `EPERM` only if the native addon cannot load.
- Keep the next release slice focused on runtime + label routing, not large-scale data expansion.

## 11. Runtime alignment reference
- Added `TODO-2026-05-19-runtime-alignment.md` to capture:
  - TurboQuant VS Code task and launcher wiring
  - `ensure-llama-server.mjs` runtime guard behavior
  - GraphRAG/Karpathy/Qdrant/Redis retrieval path
  - exact repo file mapping for follow-up validation.
