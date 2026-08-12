# Parent Atlas Workstation Domain Classifier

**Status**: MODULE BUILT, TYPE-CHECKED CLEAN, NOT WIRED INTO ANY LIVE ROUTE. Built 2026-08-12
in response to: "we need to copy logic then update it for parent atlas workstation logic domain
classification .okf schema based computer science engineering treechunker-sitter langextract
(llama-server.exe openai compatible 8090/v1/model...) embeddinggemma? onnx or ollama redis-valeky
centroid creation".

## What was copied and what changed

**Copied architecture** from `sveltekit-frontend/src/lib/server/ai/code-intel-service.ts` lines
~324-1060 (the "Enhanced TreeChunker + AST-grep corpus derivation pipeline" — 9-step docstring:
walk → extract concepts → chunk → index OKF ontology → classify domains → assign 4D coords →
embed → ingest Qdrant → materialize Redis centroids). That pipeline classifies into AUTH/DATA/
API/UI/SHARED (generic web-app domains) per `docs/.okf/schema.yaml`'s `domain` enum.

**New module**: `sveltekit-frontend/src/lib/server/ai/parent-atlas-workstation-domain-classifier.ts`

Classifies into the Parent Atlas Workstation lane taxonomy instead — IDENTITY, EXPORT_STORAGE,
GRAPH, TELEMETRY, EMBEDDING, OKF_ONTOLOGY, TRANSPORT, COMPILER, RUNTIME_TRAINING — derived
directly from `parent-atlas-workstation-todo.md`'s own section headers (Layer 1A/1B packet+symbol
identity, Export Stack Arrow/GIN/MsgPack, Graph Retrieval/Hierarchy/Hypergraph, Telemetry/
provenance ladder, RTX Embeddings/Vector LOD, OKF Fit/HMM Router, QUIC/gRPC/Go sidecar transport,
Layer 2 Compiler Output, Layer 4 Runtime/Training) — not invented ad hoc.

## Concrete runtime file map

This change is now aligned to the actual runtime boundaries the repo is using:

- Extraction lane:
  - `docker/miniforge-nlp-sidecar/Dockerfile`
  - `docker/miniforge-nlp-sidecar/docker-compose.yml`
  - `sveltekit-frontend/src/lib/server/analysis/ast-langextract-bridge.ts`
  - `sveltekit-frontend/src/lib/server/ai/parent-atlas-workstation-domain-classifier.ts`
- Packet synthesis lane:
  - `sveltekit-frontend/src/lib/server/analysis/source-pos-concept-packet.ts`
  - `sveltekit-frontend/src/lib/server/analysis/code-evidence-synthesizer.ts`
  - `sveltekit-frontend/src/lib/server/analysis/analysis-pass-results.ts`
  - `sveltekit-frontend/src/lib/server/analysis/code-evidence-readback.ts`
- Live worker wiring:
  - `sveltekit-frontend/src/lib/server/analysis/worker.ts`
- Graphify board consumer:
  - `sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board-recommendations.ts`
  - `sveltekit-frontend/src/lib/server/analytics/recommendation-policy.ts`
- TurboVec retrieval lane:
  - `sveltekit-frontend/src/lib/server/retrieval/turbovec-prefilter.ts`
  - `sveltekit-frontend/src/lib/server/retrieval/turbovec-rerank.ts`
  - `sveltekit-frontend/src/lib/server/grpc/turbovec-cuda-client.ts`
  - `packages/parent-atlas-retrieval/src/index.ts`

TurboVec stays in the retrieval lane only. It does not own structural extraction,
LangExtract grounding, or evidence synthesis.

## Three real upgrades over the copied source

1. **Real tree-sitter chunking.** The copied source's `chunkCodeSemanticallViaTreeChunker` is
   named "TreeChunker" but is actually a line-boundary regex heuristic — confirmed via read, it
   never imports or calls tree-sitter. This repo has `tree-sitter@0.25.1` +
   `tree-sitter-typescript@0.23.2` genuinely installed in `package.json` but, confirmed via
   repo-wide grep before writing this module, zero usage anywhere in `src/`. Verified live via
   `node -e` that `require('tree-sitter')` + `require('tree-sitter-typescript').typescript`
   actually parse TypeScript source correctly on this machine (not assumed). The new module's
   `chunkViaTreeSitter()` walks the real AST for `function_declaration`/`method_definition`/
   `class_declaration`/`interface_declaration`/`type_alias_declaration` nodes.
2. **Real LLM chunk summaries via llama-server.** The copied source uses `chunk.lines[0]` as a
   fake "summary". The new module's `summarizeChunkViaLlamaServer()` calls
   `streamText({ model: llamaServer(LOCAL_VLM_MODEL) })` — the exact working pattern already
   proven live in `vlm-lane.ts`. Per CLAUDE.md's hard rule (Ollama = embeddings only, llama-server
   = the only chat/synthesis path), this never touches Ollama for text generation. Gated behind
   an explicit `withLlmSummary` option (default `false`, CLI flag `--with-llm-summary`) because
   it is a real LLM call per chunk — not something to fire unbounded by default.
3. **Embeddings unchanged, reused as-is.** `generateSingleEmbedding` from
   `grpc/embedding-client.js` was NOT touched — it already correctly cascades gRPC → QUIC →
   Ollama HTTP (`embeddinggemma`) → ONNX-local fallback, matching the embeddinggemma-via-Ollama
   hard rule. Confirmed via read before reuse, not assumed.

## Deliberately separate namespace (DUPLICATE_OWNER avoidance)

Per this repo's own governance rule ("One Canonical Runtime Owner Per Capability" in CLAUDE.md):
this is a genuinely distinct capability (a different taxonomy over the same kind of source
material), not a peer overwrite of the existing AUTH/DATA/API/UI classifier. To avoid becoming an
uncoordinated second owner of the same storage keys:

| Store | Existing (code-intel-service.ts) | New (this module) |
|---|---|---|
| Qdrant collection | `code_intel_corpus` (512-dim MRL) | `parent_atlas_workstation_corpus` (768-dim canonical) |
| Redis centroid hash | `corpus:centroids` | `workstation:centroids` |
| Redis concept hash | `corpus:concepts` | `workstation:concepts` |

768-dim was chosen (not 512) because CLAUDE.md's canonical embedding-dimension policy names
768-dim embeddinggemma as the project-wide canonical dimension; the existing classifier's 512-dim
choice is explicitly labeled an "MRL evaluation candidate lane" in its own docstring, not the
canonical dimension.

## Verified, not assumed

- `node -e "require('tree-sitter'); require('tree-sitter-typescript').typescript..."` — real
  parse output confirmed live on this machine before writing any chunking code.
- `curl http://127.0.0.1:8090/v1/models` — confirmed llama-server live, model `hforf.gguf`.
- `npx tsc --noEmit -p .` — confirmed zero errors reference the new file (42 pre-existing errors
  found in the run belong to other concurrent, unrelated uncommitted work in this repo — not
  caused by or related to this module).

## Explicit scope boundary — not done, on purpose

- **Not wired into any live route, startup hook, or npm script.** This is a standalone module +
  CLI entry point only (`npx tsx .../parent-atlas-workstation-domain-classifier.ts --file=<path>
  [--with-llm-summary]`), matching the existing `ace-domain-evidence-extractor.mts` CLI
  convention. Per this session's established discipline ("record findings, don't
  fix-while-auditing" / get explicit approval before broadening scope), live wiring (a batch
  script over `sveltekit-frontend/src/lib/server/**`, a startup-hook trigger, an npm script
  alias) is a separate, explicitly-approved follow-up task — see `tasks.md`.
- **Not run against the full codebase yet.** Verified only against synthetic/small inputs during
  development (implicit in the `tsc` type-check) — has not yet been run end-to-end against a real
  file with real Qdrant/Redis writes. That's the natural next verification step before any
  broader wiring is considered.
- **Not registered in `docs/architecture/runtime-ownership-registry.json` yet** — should be, as
  `CANONICAL_OWNER` for the new "Parent Atlas Workstation domain classification" capability,
  once the first real end-to-end run is proven (not before — registry entries should describe
  proven capability, not aspirational capability).
