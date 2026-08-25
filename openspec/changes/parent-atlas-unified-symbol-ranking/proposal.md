## Why

Parent Atlas already owns, separately, every signal needed for a strong "final rank" of a code
symbol/chunk: graph/spectral authority (Katz/eigenvector, PageRank, betweenness, k-core, CheiRank
under `sveltekit-frontend/src/lib/server/graph/*-analysis-adapter.ts` and
`sveltekit-frontend/src/lib/server/atlas/{spectral,graph}/*`), AST-grep lexical/structural
extraction (the `AST-ID-01..06`, `GRAPHIFY-AST-SCOPE-01..04`, `CALLABLE-03` work in
`openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md`), a canonical reranker
(`sveltekit-frontend/src/lib/server/retrieval/canonical-rerank-executor.ts`), an ACE/Bitfrost
KV-cache layer (root `CLAUDE.md`'s "Karpathy GPU Authority Blend + Redis ACE Cache" and "Redis L1
+ Bifrost L2" sections), and a source-kind classifier that already distinguishes
`ai_generated`/`user_note`/`spec`/`code` (`sveltekit-frontend/src/lib/server/classifier/
source-kind-classifier.ts`) — but that classifier is scoped to documentation files only, never
applied to code symbols/chunks.

No existing owner combines these into one final rank: AST-grep lexical signals (nouns, imported
modules, LSP-protected identifiers) + graph/spectral authority + static-vs-dynamic code
classification + user-vs-AI-generated provenance, feeding a single ACE/RPC packet. Root
`CLAUDE.md`'s own prior audit already found 5 competing PageRank implementations and 14
unclassified reranker files from past sessions building parallel owners instead of extending the
canonical ones — this proposal exists specifically to avoid repeating that failure mode while
still closing the real gap.

## What Changes

- Extend `canonical-rerank-executor.ts` (the confirmed canonical reranker) with new input signal
  slots for: graph/spectral authority score (consumed, not recomputed, from the existing
  `graph-analysis-runner.ts`/spectral adapters), static-vs-dynamic code classification, and
  user-vs-AI-generated provenance. Do not create a second reranker.
- Extend `source-kind-classifier.ts`'s existing `SourceKind` taxonomy (`ai_generated`,
  `user_note`, `code`, `spec`, ...) to apply to code symbols/chunks, not just documentation files.
  Do not create a second classifier.
- Add a static-vs-dynamic code classification signal sourced from the existing AST-grep
  extraction pipeline (`AST-ID-01..06`) — e.g. literal/const declarations and pure functions
  classed static, runtime-computed/side-effecting symbols classed dynamic. New derivation logic
  only; no new AST parser or extraction engine.
- Define the blended "final rank" formula as an explicit, versioned weight vector (mirroring the
  existing documented ACE scoring spine in root `CLAUDE.md`: `semantic_vector*0.60 +
  tag_score*0.12 + ast_graph*0.10 + som_boost*0.08 + hyperedge*0.10`) rather than an implicit or
  undocumented blend, so a future audit can verify it the same way prior blends were verified.
- Wire the blended rank into the existing ACE/RPC packet assembly path (consuming
  `canonical-rerank-executor.ts`'s output), not a new packet type.
- **Explicitly out of scope / not built**: a new graph algorithm, a new PageRank/Katz/eigenvector
  implementation, a new reranker, a new source-kind classifier, a new KV-cache layer, and any new
  CUDA kernel. Every one of those already has a canonical owner; this change consumes them.
- CUDA token-feature mapping for tokenization: **unverified, not yet in scope**. The existing GPU
  bridge exports (`kmeansWithCentroids`, `trainSOM`, `pageRankGPU`, `attentionScoreGPU`,
  `rewardScoreGPU` per root `CLAUDE.md`'s GPU Acceleration Stack section) do not obviously include
  token-level feature mapping — this needs a dedicated read-only audit before any proposal, and is
  deferred to a follow-up change rather than guessed at here.

## Capabilities

### New Capabilities

- `unified-symbol-rank`: the blended final-rank formula and its versioned weight contract —
  combines AST-grep lexical signals, graph/spectral authority, static-vs-dynamic classification,
  and user-vs-AI-generated provenance into one score per symbol/chunk, consumed by the existing
  ACE/RPC packet assembly.

### Modified Capabilities

(none — no existing `openspec/specs/*` capability's requirements change; this adds new signal
inputs to existing implementations without altering their documented external contracts)

## Impact

- **Extended, not replaced**: `sveltekit-frontend/src/lib/server/retrieval/
  canonical-rerank-executor.ts` (new input signals), `sveltekit-frontend/src/lib/server/
  classifier/source-kind-classifier.ts` (taxonomy extended to code symbols).
- **Consumed, read-only**: `sveltekit-frontend/src/lib/server/graph/*-analysis-adapter.ts`,
  `sveltekit-frontend/src/lib/server/atlas/{spectral,graph}/*`, the AST-grep extraction pipeline
  (`openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md`'s `AST-ID-*` work), ACE/Bitfrost
  cache layers.
- **New**: the blended weight-vector contract and its versioning/audit surface (`unified-symbol-rank`).
- **Explicitly not touched**: graph algorithm implementations, PageRank/Katz/eigenvector code,
  CUDA/N-API bridge, KV-cache infrastructure, `atlas_chunk_packet_identity_links` (separately
  gated by `S512-ID3`/`S512-ID4` in `parent-atlas-semantic-512-canonicalization` — not a dependency
  of this change).

## Correction (post-implementation, 2026-08-25)

Two premises above were unverified when written and turned out wrong on inspection — recorded
here rather than silently edited away, matching this repo's own convention:

- **"Graph/spectral authority (Katz/eigenvector...)" does not exist.** `grep -rni katz
  sveltekit-frontend/src` matches exactly one string in the entire codebase — *Katz v. United
  States*, a Fourth Amendment case in legal seed data, unrelated to graph algorithms. The
  `atlas/spectral/*` files compute Laplacian spectral **clustering**, not centrality, and the one
  checked (`spectral-rtx-alignment-fixture-v1.ts`) is schema-enforced `MOCK_CPU_REFERENCE` /
  `FIXTURE_ONLY` / `promotionEligible: false` — not eligible to feed a live reranker regardless.
  See design.md Decision 3 / tasks.md 4.2 for the full finding. No graph-authority wiring was
  attempted as a result — correctly out of scope per this proposal's own Non-Goals, not silently
  dropped.
- **Extension landed one layer lower than stated.** "What Changes" said `canonical-rerank-
  executor.ts` would gain new input signal slots; implementation instead extended
  `retrieval/candidate-scorer.ts` (which feeds `runtime-reranker.ts`'s `blendScores()`, the
  actual base contract `canonical-rerank-executor.ts` wraps — see design.md's Context) and added
  two new focused modules, `retrieval/static-dynamic-classifier.ts` and
  `classifier/code-symbol-provenance.ts` (+ its `git-commit-provenance.ts` evidence adapter).
  `canonical-rerank-executor.ts` itself was not edited — it already imports and uses
  `runtime-reranker.ts`'s real weights/blend function, so the new signals reach it unchanged.
- **User-vs-AI-generated provenance required a genuinely new evidence source.** The assumed
  "existing commit/authorship metadata sources already available in the AST-grep/Graphify
  pipeline" turned out not to exist — `atlas_source_refs.commit_sha` is schema-only, 0% populated
  live. `git-commit-provenance.ts` (git CLI, not the empty DB column) was added as the real
  evidence source, documented explicitly as new rather than claimed as reuse.
