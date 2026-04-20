# Unsloth, VLM, and CHR97 Next Steps — 2026-04-02

## Verified Current State

- SSE chat already has graph-informed retrieval expansion and graph-aware reranking in `src/routes/api/sse/chat/+server.ts` and `src/lib/server/retrieval/graph-informed-retrieval.ts`.
- Triton is already a first-class text inference backend through `src/lib/server/triton-llm.ts` and `src/lib/server/inference/inference-router.ts`.
- A Triton VLM route already exists at `src/routes/api/ai/tensorrt/vlm/+server.ts`; VLM is not limited to image resize utilities anymore.
- CHR97 cartridge generation exists in `src/lib/server/cartridge/chr97-builder.ts` and cartridge APIs already exist, but the feature remains internal.
- The glyph prompt-fragment cache is live in `src/lib/server/glyph-prompt-cache.ts` and is currently used by SSE chat for prompt fragment reuse.
- The Go search service exists in `services/go-search-service/main.go` and remains optional infrastructure rather than the default runtime path.
- Unsloth work exists as notebooks and roadmap material, but adapter merge and deployment are not integrated into the application runtime.

## Actual Gaps

### P0: Surface Triton VLM Readiness

- The VLM route hardcodes Triton model names and does not expose readiness through infrastructure status.
- Operators cannot distinguish Triton text readiness from Triton VLM readiness.
- This is the smallest useful production-facing improvement because it makes the VLM path observable and configurable without changing the core inference contract.

### P1: Adapter Merge Pipeline Integration

- There is no checked-in merge/export script chain for taking trained Unsloth adapters to a runtime-consumable artifact.
- There is no application-visible status or artifact manifest for merged adapters.
- The practical runtime target should be: merged Hugging Face weights first, then GGUF for Ollama, and TensorRT export only after the merge path is reproducible.

### P2: VLM Feature Wiring Beyond the Raw Route

- The VLM route is present, but it is not yet folded into evidence workflows, operator health, or clear downstream storage contracts.
- The highest-value next integration is evidence-focused analysis, not a general-purpose chat feature.
- The useful follow-up path is: evidence image analysis route -> stored summary/tags -> optional embedding/image vector path.

### P3: CHR97 as a Retrieval Acceleration Layer

- CHR97 is implemented as a binary tensor cache format, but the user-facing platform still treats it as internal infrastructure.
- The short-term role should stay narrow: accelerate reusable retrieval state for case-scoped evidence/search, not become a general persistence layer.
- The next useful increment is a status surface and operator-facing stats before any UI exposure.

## Recommended Order

1. Make Triton VLM configurable and visible in infrastructure health.
2. Add an adapter artifact manifest and merge script path for Unsloth outputs.
3. Wire VLM into evidence analysis with a stable storage contract.
4. Add CHR97 export/search stats to operator tooling before exposing it in UI.

## Concrete Implementation Targets

### Now

- Add `TRITON_VLM_MODEL` and `TRITON_VISION_MODEL` env support.
- Report `inference.tritonVlm` in `/api/infrastructure/status`.
- Make `/api/ai/tensorrt/vlm` use env-driven model names instead of hardcoded Triton identifiers.

### Next Session

- Add `scripts/unsloth-training/merge-adapters.py` or equivalent checked-in merge script.
- Add an artifact manifest format for merged adapters, exported models, and deployment targets.
- Add a minimal admin/status route that reports which merged adapter artifact is active.

### After That

- Add evidence-oriented VLM analysis persistence.
- Add CHR97 operator stats and route-level observability.
- Revisit whether Go search should become an active retrieval tier or remain optional infrastructure.

## Architecture Positioning

- Bifrost remains the gateway/cache layer, not the knowledge layer.
- Qdrant plus graph retrieval remain the primary grounding path.
- Triton should become the production acceleration path for text and VLM when available.
- Ollama should remain the development and degraded fallback path.
- CHR97 and glyph caches should stay as acceleration layers under the main retrieval stack, not replacements for Qdrant or Redis.