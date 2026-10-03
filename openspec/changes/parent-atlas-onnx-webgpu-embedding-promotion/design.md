## Context

Parent Atlas already has a local EmbeddingGemma ONNX artifact and a Tier-0 ONNX-first
embedding path, but neither constitutes a promotion decision. The promotion change must
separate execution proof, representation parity, and canonical ownership. The browser/WebGPU
lane is a challenger; PostgreSQL remains the canonical identity store and Ollama remains the
canonical `semantic_768` embedding owner until the staged gates pass.

The local artifact is checked in under `sveltekit-frontend/static/embeddinggemma_300m_onnx`.
Its metadata claims a 512-token limit, while the model family is documented at 2048 tokens.
The design therefore treats the ONNX graph's observed behavior as authoritative for the
current artifact and refuses promotion when the capacity contract is unresolved.

## Goals / Non-Goals

**Goals:**

- Prove actual WebGPU execution without WASM/CPU fallback.
- Record model, tokenizer, rendered-input, token-tensor, and output checksums.
- Verify 768-dimensional finite normalized output and repeatability.
- Measure CPU↔WebGPU parity and preserve the result as challenger evidence.
- Keep promotion staged: shadow challenger, preferred canary, then eligible primary only after
  15-row and 128/768-row parity plus restart proof.

**Non-Goals:**

- Replacing Ollama as canonical embedding owner in this change.
- Writing canonical vectors, packet identity, CandidateOrdinal, Qdrant, or PostgreSQL state.
- Treating browser cache, WebGPU availability, or a short successful probe as promotion proof.
- Resolving the separate packet-revision/workspace-lineage blocker.

## Decisions

1. **Use a fail-closed standalone proof.** The proof requests only `webgpu` and does not retry
   with WASM or CPU. A successful receipt includes artifact checksums, provider, dimensions,
   normalization, repeatability, and `writes: false`.
2. **Use the local artifact for the first proof.** This makes the proof match the asset used by
   the SvelteKit client and avoids conflating a remote model revision with the checked-in
   runtime asset. The model directory is passed to Transformers.js with an empty ONNX
   subfolder because the repository stores `model.onnx` at its artifact root.
3. **Treat graph behavior as the capacity authority.** Dynamic ONNX input metadata is
   insufficient. Required lengths are executed and recorded; a fixed internal attention
   dimension keeps the current artifact below promotion if longer inputs fail.
4. **Keep representation identity singular.** CPU, WebGPU, and Ollama are executors or
   challengers of `semantic_768`, not separate canonical representations. Model, tokenizer,
   input-format, pooling, normalization, and executor revisions remain part of the evidence.
5. **Dispose inference resources before receipt completion.** The proof copies output data,
   disposes tensors and sessions, and records any native teardown defect separately instead of
   misclassifying a valid inference receipt as promotion evidence.

## Risks / Trade-offs

- **[Native WebGPU teardown crash]** → Keep the proof process isolated and report the native
  lifecycle defect; do not promote until the exit behavior is independently understood.
- **[CPU↔WebGPU numerical drift]** → Preserve cosine and absolute-delta measurements and keep
  WebGPU shadow-only until the parity gates pass.
- **[512/2048 contract mismatch]** → Reject longer inputs in the current artifact and require a
  separately checksummed replacement before retrying promotion.
- **[Canonical-store contamination]** → Keep all proof and cache outputs local/read-only and
  prohibit writes to PostgreSQL, Qdrant, Redis/Valkey, and packet registries.

## Migration Plan

1. Run environment and `onnx-embed.ts` routing audits.
2. Run the WebGPU-only proof and capacity probes.
3. Run CPU↔WebGPU parity on the same inputs and artifact.
4. Run the frozen 15-row Ollama comparison; retain Ollama as canonical.
5. Only after the evidence gates pass, run the live `dev:gpu` smoke request and verify the
   provider receipt.
6. Scale to 128/768 rows and independently review the promotion receipt before changing lane
   eligibility.

Rollback is implicit: leave Ollama as the canonical owner, disable the challenger, and remove
   no model or cache artifacts. No database migration is part of this change.

## Open Questions

- What artifact revision, if any, provides the required 2048-token behavior?
- Is the observed CPU↔WebGPU drift acceptable for the eventual semantic parity threshold?
- Can the ORT WebGPU native teardown be made clean without masking runtime failures?
- Which independent receipt will authorize any future change to canonical embedding ownership?
