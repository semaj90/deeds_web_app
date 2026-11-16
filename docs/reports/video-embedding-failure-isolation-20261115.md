# Video embedding failure isolation — 2026-11-15

## Change

`durable-video-analysis-v1.ts` now catches frame and transcript semantic-embedding failures at the optional indexing stage. The worker records `embeddingStatus: UNAVAILABLE` and a bounded `embeddingError`, stops retrying the failing semantic pass, and continues to canonical media persistence and its normal source-bound readback. Successfully written vectors remain idempotent and source-revision qualified. Audio-content embedding keeps its independent feature gate and status.

## Representation contract

The video worker and PostgreSQL multimodal writer continue to use normalized 768-dimensional vectors. The repository's MRL helper supports 512/256/128 prefix projection with L2 renormalization and distinct representation IDs, but this change does not write shortened vectors into the 768-dimensional owner. A shortened search lane still needs a matching corpus representation, dimension-specific persistence/projection contract, and query executor.

Google's [EmbeddingGemma 2 model card](https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2) says to re-normalize after truncation and keep query and corpus dimensions consistent.

## Verification and limits

- `git diff --check -- sveltekit-frontend/src/lib/server/features/evidence/video/durable-video-analysis-v1.ts` — passed.
- Focused Vitest, live queue, SeaweedFS, Whisper, and authorized viewer checks — not run in this change.
- Adversarial source-path review: if frame embedding or transcript embedding throws, the semantic lane becomes unavailable and the worker proceeds to persist its media result; the overall analysis remains `PARTIAL`.
- Shared worktree was already dirty. Existing event-fusion edits in the worker and other task-ledger edits were preserved.

## Status

CREATED/WIRED: optional semantic-embedding failure handling and persisted diagnostic. PROVEN: scoped diff check only. DONE: no; live authorized upload-to-viewer remains open. OpenSpec tasks 5.1–5.10 remain open.
