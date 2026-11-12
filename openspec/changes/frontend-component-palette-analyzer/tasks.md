## 1. Resolve Existing Owners and Read Boundary

- [ ] 1.1 Identify the existing YorHa theme-token source and record its exact path/revision; keep palette output unresolved if no single owner is established.
- [ ] 1.2 Identify and reuse the effective Atlas Studio admin authorization policy for component-source reads.
- [ ] 1.3 Define the allowed Svelte source catalog root, maximum file size, and stable error response before implementing the read endpoint.

## 2. Build Deterministic Analysis Core

- [ ] 2.1 Implement a pure analyzer for supported Svelte markup, scoped CSS values, CSS-variable references, and UnoCSS class tokens; report unsupported constructs as unresolved.
- [ ] 2.2 Implement explainable component-role and palette-role rules with source spans, reasons, analyzer version, source SHA-256, and theme-token revision.
- [ ] 2.3 Implement contrast calculation only for explicitly paired foreground/background values and return `NOT_COMPUTED` for unpaired values.
- [ ] 2.4 Add unit tests for determinism, source spans, unresolved/dynamic values, path-independent analyzer behavior, and contrast fixtures.

## 2A. Optional Visual Similarity and Classification Proposals

- [ ] 2A.1 Verify the configured VLM and EmbeddingGemma 2 provider's actual screenshot-input capability and model artifact identity; do not infer support from model names or start/download services.
- [ ] 2A.2 Define a bounded screenshot input contract (explicit user selection, byte/dimension limits, digest, source/view revision where known) and a stable unavailable/timeout response.
- [ ] 2A.3 Implement an opt-in VLM proposal adapter that returns structured visual labels with evidence references, model/provider revision, uncertainty, and `UNRESOLVED` abstention; keep outputs separate from deterministic findings.
- [ ] 2A.4 Implement isolated `visual_style_embedding_768` similarity for image-to-image/image-to-text candidates; prohibit canonical `semantic_768` writes/index use and persistent vector storage in v1.
- [ ] 2A.5 Evaluate on a fixed human-reviewed screenshot/reference set; report retrieval precision/ranking quality, latency, memory/VRAM use, and abstention behavior before exposing recommendations.
- [ ] 2A.6 Add tests for capability absence, bounds, timeouts, digest/model binding, deterministic rerun for fixed outputs, no persistence, and canonical-lane rejection.

## 3. Add Safe Source Selection

- [ ] 3.1 Add an authenticated, read-only component catalog limited to canonical `.svelte` files under the approved source root.
- [ ] 3.2 Add a bounded source-read endpoint that accepts catalog identities rather than arbitrary paths and returns source digest with analysis input.
- [ ] 3.3 Add tests for admin denial, path traversal, non-catalog paths, oversized files, stable error shapes, and no-write behavior.

## 4. Build the Review Modal

- [ ] 4.1 Add the Atlas Studio entry point and reusable Bits UI v2 Dialog using Svelte 5 runes and UnoCSS layout utilities.
- [ ] 4.2 Implement Structure, Styles, Palette, and Findings views with source locations, reasons, unresolved states, and source/theme revisions.
- [ ] 4.3 Add accessible color swatches, keyboard/focus behavior, reduced-motion support, responsive layout, and copy-only proposed diff output.
- [ ] 4.4 Add component tests for loading, stale-source invalidation, unresolved theme tokens, keyboard access, and copy without writes.

## 5. Verify and Document

- [ ] 5.1 Run focused analyzer, route, and modal tests plus Svelte/TypeScript checks and `git diff --check`.
- [ ] 5.2 Verify in a real browser that analysis is read-only, source revision changes invalidate results, and proposed output is never applied automatically.
- [ ] 5.3 Record exact implementation evidence, remaining limitations, and resolved token/auth owners in the owning OpenSpec ledger.
