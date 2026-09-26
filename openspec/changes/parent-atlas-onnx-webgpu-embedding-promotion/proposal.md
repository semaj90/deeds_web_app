## Why

Added 2026-09-16 — this change previously had no `proposal.md` (flagged by the
`parent-atlas-openspec-tasks-audit-fabric` audit, `structuralScore: 60`). This file summarizes
intent without changing any task in `tasks.md`.

A prior session reordered `embedding-client.ts`'s 5-tier embedding fallback chain to try
ONNX-local first (was Tier 5/last-resort), per an explicit "ONNX primary, Ollama fallback"
instruction — but did this **before** running the standalone WebGPU proof script
(`services/embedding-onnx-webgpu/prove-embeddinggemma-onnx-readonly.mjs`) or checking the model's
actual token-capacity export (2048 per EmbeddingGemma's model card vs. `max_sequence_length: 512`
reported by the local ONNX export's `model_info.json`). The code reorder is real and already live;
it must not be treated as a validated promotion decision on its own.

This change freezes the corrected validation order (11 gated steps in `tasks.md`) that must pass
before the Tier-0 ONNX-first reorder can be trusted: settings/env inspection, `onnx-embed.ts`
correctness review, a fail-closed WebGPU proof variant, the 512-vs-2048 token-capacity gate,
CPU-vs-WebGPU parity, a 15-row then 128/768-row Ollama-vs-ONNX parity gate, and a staged promotion
ladder (shadow challenger → preferred canary → eligible primary) that never deprecates Ollama in
the same tranche as any earlier step.

## What Changes

See `tasks.md` for the full 11-step corrected order — this proposal introduces no new step and
reorders nothing. As of 2026-09-16 (re-verified live, not assumed): only step 1 has been attempted;
steps 2-11 have not started, and the Tier-0 reorder in `embedding-client.ts:819-873` remains live
but unvalidated exactly as `tasks.md` describes.

## Not the same model as the unrelated 2026-09-06 ONNX finding

Root `CLAUDE.md` separately records that an ONNX export of `AtlasGemmaRankV1` (a from-scratch
Gemma4 reranker checkpoint) is numerically broken (delta 4.386 vs. PyTorch). **That finding is
unrelated to this change** — this change concerns `onnx-community/embeddinggemma-300m-ONNX`, the
community fp32 ONNX export of the embedding model already canonical for `semantic_768`. Verified
this distinction directly (not assumed) before treating this change as blocked or superseded by
that unrelated finding; it is neither.

## Capabilities

No new capability — this documents the existing `embedding-client.ts` Tier-0 ONNX-local
validation gate already specified in `tasks.md`.
