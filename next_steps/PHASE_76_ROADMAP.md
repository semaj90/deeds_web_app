# ⚡ Next Steps: Automated Engineering Loop (Phase 76)

Based on the **AST Audit (2026-04-21)** and the existing `next_steps` plans, here is the prioritized action map.

## 🔴 Priority 1: Svelte 5 Syntax Recovery
The AST audit identified **972 failed repairs**, primarily in the `src/lib/components/ai` directory.
- **Action**: Trigger the `syntax:repair` command on the top 10 bottlenecks identified in the audit.
- **Command**: `npm run syntax:repair -- --target src/lib/components/ai`
- **Goal**: Reduce total failure count by 50% through targeted LLM patching.

## 🟠 Priority 2: Inference Track Hardening
Aligning with `4_9_26_inference_tracks_cpu_fallback.md`:
- **Action**: Finalize the **VRAM Watchdog** integration to ensure that when `syntax:repair` is running, the KV cache doesn't push the GPU into OOM.
- **Goal**: Maintain 100% stability on the RTX 3060 Ti during multi-file repair sessions.

## 🟡 Priority 3: Semantic Search Integration
Aligning with `semantic-search-pipeline.md`:
- **Action**: Use the **Tiered Cache Stack** (L1 Redis / L2 Qdrant-HTTP) to store successful syntax repair patterns and tool-loop results.
- **Goal**: Drastically reduce the cost/time of repairing similar syntax errors across the 900+ failed files by reusing validated ACE context and repair responses.

## 🔵 Priority 5: Inference Calibration (RTX 3060 Ti)
Aligning with local hardware constraints (8GB VRAM):
- **Action**: Establish `llama-server.exe` (Tier 3) as the primary speed accelerator, keeping Ollama as the stable fallback.
- **Goal**: Achieve >70 tok/s on Gemma 4 using plain GGUF + FlashAttention before attempting experimental TurboQuant optimizations.

## 🏁 Verification Checklist: 3060 Ti 8GB
- [ ] **Ollama Baseline**: Confirm `gemma4-legal:latest` (Q4_K_M) responds in ~800ms via `/api/chat`.
- [ ] **Tier 3 (llama-server)**: Verify `llama-server.exe` launches with `--flash-attn on` and `--ngl 99`.
- [ ] **VRAM Audit**: Monitor `nvidia-smi` to ensure VRAM < 7.2GB at 4096 context window.
- [ ] **KV Compression**: Test `TurboQuant` (`-ctk q4_0`) ONLY if OOM occurs during long context (8k+) sessions.
- [ ] **Bifrost Wiring**: Confirm `docker logs legal-ai-bifrost` shows direct IPv4 connection to Qdrant (172.18.0.5).
- [ ] **Sync to Obsidian**: Run `node scripts/unified-sync.js` to anchor the current diagnostic state.

---
*Generated: 2026-04-21 | Grounded in AST Report*
