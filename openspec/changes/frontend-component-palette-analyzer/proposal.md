## Why

Frontend styles are split between Svelte-scoped CSS, global theme tokens, and UnoCSS utilities, so a component can drift from the YorHa palette without a clear, reviewable explanation. Add a source-bound analyzer that classifies component structure and palette usage while keeping its findings advisory and preventing automatic edits.

## What Changes

- Add a reusable Bits UI v2 modal for reviewing a selected Svelte component's structure, styles, and palette roles.
- Classify component roles and observed colors with deterministic, explainable rules; optionally add VLM-generated visual labels as evidence-backed proposals, with `UNRESOLVED` when evidence is insufficient.
- Offer opt-in visual style similarity using a separate EmbeddingGemma 2 multimodal embedding lane for screenshot-to-screenshot and screenshot-to-style-description comparisons.
- Bind findings to the selected workspace-relative source path and content revision, and invalidate them when the source changes.
- Preview palette-role suggestions and contrast results using the existing YorHa theme tokens; allow copying a proposed diff for review.
- Keep the feature read-only: no source writes, global stylesheet changes, database persistence, or automatic palette application. Model calls are optional, local/configured-provider only, and never triggered by opening the modal.

## Capabilities

### New Capabilities
- `component-style-analysis`: Source-bound analysis and review of Svelte component roles, scoped styles, utility classes, and palette classification.

### Modified Capabilities
- None.

## Impact

- Atlas Studio frontend and reusable Svelte components; SvelteKit server-side source selection/read path if needed.
- Existing Svelte 5 runes, Bits UI v2 Dialog, UnoCSS utilities, and YorHa theme tokens.
- Optional VLM classification and EmbeddingGemma 2 similarity are proposal-only, separately identified from canonical `semantic_768`, and require a measured local/provider capability before use.
- No database table, persistent cache, MCP tool, model auto-download, or runtime dependency is required for the initial analyzer.
