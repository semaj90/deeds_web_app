# parent-atlas-kv-cache-adaptation-research

RotorQuant/IsoQuant KV-cache compression (temporary inference memory) and QLoRA/Ornith 9B adaptation (trained model behavior) are separate research tracks, kept explicit and never the default runtime. Bounded first slice: KV-cache Stage 1-2 numerical fixture only; QLoRA Stage A prompt-baseline evaluation only. Hard rule: never train directly from live web fetches.

**2026-08-05 evidence log added to proposal.md**: receipted audit found the
`gemma4-e2b-rotorquant-iq4xs` GGUF has zero embedded evidence of RotorQuant
transformation (filename-only claim, all 47 metadata keys and 601 tensors
are standard IQ4_XS), the live `llama-server-cuda` binary has zero
RotorQuant/TurboQuant/IsoQuant KV-cache support, and Ornith 1.0 9B
(`hforf.gguf`) is a `qwen35` **hybrid attention+SSM** architecture — a
structural (not just unproven) limit on KV-cache rotation techniques,
which only apply to attention K/V tensors. See proposal.md for full
receipts and reasoning.

**2026-08-05 addendum — opposite finding for `gemma4-legal-iq4xs-direct.gguf`**:
this model's architecture (pure attention, D=256 SWA / D=512 global head
dims) matches a **real, non-stub, end-to-end `turbo3`/`turbo4`
(TurboQuant) implementation** confirmed present in
`llama-cpp-turboquant-gemma4` — CUDA flash-attention kernel
(`fattn-turbo4.cuh`), full ggml type-trait table, and real KV-cache/graph
dispatch branches all traced directly. Status: `WIRED` (source-level,
unbuilt) — the fork has never been compiled, so no runtime evidence
exists yet, but this is the strongest, most concrete lead in this
proposal. See proposal.md Evidence Log Addendum.
