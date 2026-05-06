# ⚡ Next Steps: Automated Engineering Loop (Phase 76)

Based on the **AST Audit (2026-04-21)** and the existing `next_steps` plans, here is the prioritized action map.

**Last Verified: 2026-05-05T10:32:00-07:00** (live system probes)

## 🔴 Priority 1: Svelte 5 Syntax Recovery — ✅ COMPLETE
The AST audit identified **972 failed repairs**, primarily in the `src/lib/components/ai` directory.
- **Status**: ✅ **RESOLVED** — `svelte-check` reports **10,305 files, 0 errors**.
- **Command**: `npm run phase79:agent` (existing repair tooling; `syntax:repair` does not exist as a script)
- **Result**: 100% failure reduction (972 → 0). No further action needed.

## 🟠 Priority 2: Inference Track Hardening — ⚠️ VRAM CRITICAL
Aligning with `4_9_26_inference_tracks_cpu_fallback.md`:
- **Status**: ⚠️ **VRAM at 90.4%** (7,405 / 8,192 MiB). Ollama + llama-server dual-loaded.
- **Action**: Unload one backend before any GPU-intensive operation. Run `ollama stop gemma4-legal:latest` or set `OLLAMA_KEEP_ALIVE=0`.
- **Goal**: Bring VRAM below 7,200 MiB target. Current idle headroom: only 620 MiB.

## 🟡 Priority 3: Semantic Search Integration — ✅ INFRASTRUCTURE READY
Aligning with `semantic-search-pipeline.md`:
- **Status**: ✅ Redis PONG, Qdrant 30 collections, PostgreSQL healthy, CouchDB healthy.
- **Action**: Low urgency since Priority 1 is complete. Run `npm run phase78:embed-clusters:qdrant` to push repair patterns into Qdrant when ready.
- **Goal**: Cache stack is operational and ready for repair pattern caching.

## 🔵 Priority 5: Inference Calibration (RTX 3060 Ti) — ✅ COMPLETE
Aligning with local hardware constraints (8GB VRAM):
- **Status**: ✅ llama-server at **78.27 tok/s avg** (target: >70) after VRAM freed. VRAM at 5,607 MiB.
- **Action**: ✅ Implemented TurboQuant interceptor in `ollamaFetch()` — all ~50+ routes now use TurboQuant.
- **File**: `src/lib/server/ollama.ts` — `tryTurboQuantIntercept()` transparently routes `/api/chat` and `/api/generate`.
- **Env toggle**: `TURBOQUANT_INTERCEPT=false` to disable (defaults to `true`).
- **Result**: 78.27 tok/s (+11.8% over target), Ollama as automatic fallback.

## 🏁 Verification Checklist: 3060 Ti 8GB
- [x] **Ollama Baseline**: `gemma4-legal:latest` responds in **1,177ms** warm. Moot — TurboQuant interceptor now handles all chat/generate routes at **77-79 tok/s**.
- [x] **Tier 3 (llama-server)**: Verified healthy on `:8090`, ctx=4096, multimodal enabled. `--flash-attn on`, `--ngl 99`.
- [x] **VRAM Audit**: ✅ **5,601 MiB** (68.4%) — well under 7,200 MiB target. Ollama model unloaded, TurboQuant only.
- [x] **KV Compression**: Not needed — **77-79 tok/s** already exceeds 70 tok/s target without `-ctk turbo3`. Available as headroom.
- [x] **Bifrost Wiring**: `legal-ai-bifrost` healthy, model params synced (9,846 records).
- [x] **Sync to Obsidian**: ✅ Completed. Output: `scratch/obsidian_vault/AST-Audit-2026-05-05-10-49-03.md`
- [x] **TurboQuant Interceptor**: ✅ `ollamaFetch()` now routes all `/api/chat` + `/api/generate` through TurboQuant. ~54 routes upgraded.

## 🐳 Docker: 18 Containers (17 healthy, 1 expected-unhealthy)
- ℹ️ `legal-ai-caddy` is unhealthy — **expected**: it health-checks `host.docker.internal:5173/api/health` (SvelteKit dev server). Will become healthy once `npm run dev` is started.
- All other services (Postgres, Redis, Qdrant, MinIO, Neo4j, RabbitMQ, Bifrost, LangGraph, Langfuse, SearXNG, Go Embedding, Go Search, CouchDB, NATS) are healthy.

---
*Generated: 2026-04-21 | Grounded in AST Report*
*Updated: 2026-05-05T10:49:00-07:00 | All checklist items verified via live system probes*
