## Context

The current YorHa application styles combine global CSS variables, Svelte component-scoped CSS, and UnoCSS utilities. The Legal Corpus search section shows how a component can use its own hard-coded palette and diverge from the lighter Cases theme. This change provides an admin review surface for explaining that drift without introducing a second design-token registry or automatically rewriting application styles.

The feature is read-only. Its baseline analyzes source declarations and utility classes deterministically; it does not compile or execute selected Svelte files. An explicitly invoked visual-analysis mode may inspect a user-selected screenshot with the configured VLM and EmbeddingGemma 2, but does not send component source to either model. Model results remain proposals and are not merged into the deterministic source findings.

## Goals / Non-Goals

**Goals:**
- Let an authenticated admin select an existing Svelte source file and inspect component-role and style findings.
- Bind every analysis to an exact relative source reference and SHA-256 of the bytes analyzed.
- Compare literal colors and existing theme-token references with the selected YorHa theme tokens, report contrast, and explain each suggested role.
- Provide an accessible Bits UI v2 modal that follows the Svelte 5 and UnoCSS conventions already used by the app.
- Keep the analyzer proposal-only and allow copying a review diff without applying it.
- Optionally compare user-selected screenshots and short style descriptions with EmbeddingGemma 2; keep this visual representation separate from canonical `semantic_768` and do not persist it in v1.
- Optionally request structured VLM labels for visible interface traits (surface, typography, spacing, hierarchy, and interaction affordances), each tied to the screenshot digest and labeled as model-proposed.

**Non-Goals:**
- Editing source files, applying global CSS, writing database/cache records, or changing component behavior.
- Executing or compiling selected component source in the browser.
- Treating model labels or similarity scores as design-system authority, canonical component identity, accessibility proof, or automatic palette selection.
- Replacing the canonical text `semantic_768` embedding lane with EmbeddingGemma 2, adding visual vectors to its existing index, or persisting a second representation in v1.
- Automatically loading/downloading a model, requiring GPU availability, making an external model call, or introducing Redis caching or a new persistence schema.
- Claiming WCAG conformance for an entire page based only on source-level color pairs.

## Decisions

1. **Place the entry point in Atlas Studio and use a Bits UI v2 Dialog.** Reuse the existing admin surface and accessible dialog primitive instead of adding a standalone settings route or custom focus management. Use Svelte 5 runes, UnoCSS utilities for layout, and existing theme variables for color. If the current theme-token owner cannot be identified during implementation, show token comparison as `UNRESOLVED` instead of defining replacement tokens.

2. **Constrain source access to an explicit server-provided component catalog.** The server lists `.svelte` files under the approved `sveltekit-frontend/src` root, verifies canonical paths remain within that root, and returns bounded source content only for a selected catalog item. Require the existing effective admin policy; reject synthetic development-admin sessions if the route's security policy requires it. Responses are private/no-store. Enforce a documented file-size ceiling and never accept an arbitrary filesystem path from the browser.

3. **Keep source analysis deterministic and model output separate.** A server-side library extracts Svelte markup/class attributes and scoped CSS declarations without evaluating the source. It recognizes literal colors, `var(--token)` references, UnoCSS class tokens, and a bounded set of semantic component cues. Every source finding includes spans and a reason. Unsupported syntax or ambiguous roles produce `UNRESOLVED`. Optional VLM output is a separate, user-triggered proposal with screenshot digest, provider/model revision, structured labels, and uncertainty. It cannot overwrite or promote source findings.

4. **Separate observed style values from suggested palette roles.** A source hash identifies the analyzed bytes. The selected YorHa theme-token set and its revision are reported independently. Mapping a value to a role (surface, text, border, action, focus, or status) is a proposal, never identity or authority. Contrast is calculated only for explicitly paired foreground/background values; otherwise it is `NOT_COMPUTED`.

5. **Render findings, not arbitrary source.** The modal shows component identity, Structure, Styles, Palette, and Findings sections with source locations, confidence/reasons, color swatches, and contrast results. It does not dynamically compile or mount the selected component. Copying a proposed diff copies text only and does not write a file.

6. **Do not cache or persist initial results.** Source reads are bounded and the result is small; compute on request and return the source and token-set digests. This avoids introducing stale cache invalidation or another evidence store. A later cache requires measured benefit and keys including source hash, analyzer version, and theme-token revision.

7. **Treat EmbeddingGemma 2 as a visual similarity scorer, not a VLM.** When the configured adapter demonstrably supports image input, generate image-to-image or image-to-text similarity proposals from an explicitly selected screenshot and a bounded reference set. Identify this experiment as `visual_style_embedding_768`; do not call it canonical `semantic_768`, reuse the canonical retrieval index, or persist vectors in v1. Bind each score to model artifact revision and input digests. Similarity ranks visual neighbors; it does not decide that a palette, component, or design is correct.

8. **Keep model execution optional and resource-bounded.** Opening the modal or running deterministic source analysis must not load a model. Visual analysis requires an explicit user action, a configured local provider/model capability, bounded image dimensions/bytes, and a time/resource budget. If unavailable, show a stable `VISUAL_MODEL_UNAVAILABLE` state and retain deterministic findings. Do not auto-download weights or require a GPU. Evaluate a fixed, human-reviewed screenshot set before showing similarity as a recommendation.

## Risks / Trade-offs

- [Scoped CSS and UnoCSS syntax can be dynamic or generated] → Report only statically observed values and list unsupported/dynamic expressions as unresolved.
- [Visual embedding proximity may reflect content or layout rather than intended style] → Present nearest examples with matched dimensions and model identity; require a reviewed fixture set and never translate score directly into a palette change.
- [VLM descriptions can be incomplete or wrong] → Preserve abstention, screenshot digest, provider/model revision, and a reviewer decision; never treat a generated label as a human gold label.
- [Optional model execution can compete for local memory/VRAM] → Keep it opt-in, provider-resolved, budgeted, and independent of `:8090`; fall back without affecting modal usability.
- [A color token may have context-dependent contrast] → Do not infer a foreground/background pair from co-occurrence; show contrast only for explicitly paired values.
- [Source analysis may expose proprietary code] → Admin authorization, allowlisted roots, bounded files, private/no-store responses, and no external model calls.
- [The app may not have one authoritative YorHa token source] → Resolve and document the existing owner before implementing suggestions; keep findings unresolved if ownership remains unclear.
- [Preview styling may diverge from the running page] → Present source findings and palette swatches only; do not claim browser-computed rendering or page-level accessibility proof.

## Migration Plan

No database or deployment migration is required. Add the read-only admin UI and analyzer behind an explicit entry point. Rollback consists of removing the entry point and route/library; no persisted state needs cleanup.

## Open Questions

- Which existing file or CSS-variable set is the approved YorHa token owner for palette comparisons?
- Which exact admin role/session policy should authorize listing component source in Atlas Studio?
- What maximum component source size should the catalog enforce based on current repository component sizes?
- Which existing local VLM and EmbeddingGemma 2 provider/API can safely accept screenshot inputs, and what fixed reviewed screenshot set will measure style-similarity usefulness? Verify installed capability before wiring; the proposal does not assume Ollama multimodal API support.
