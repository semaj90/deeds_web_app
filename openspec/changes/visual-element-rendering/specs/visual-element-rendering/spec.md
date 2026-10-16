## ADDED Requirements

### Requirement: Visual Element Rendering and HTML5 Viewport Surface Ownership
The system SHALL separate vertex skinning (`courtroom-scene.svelte.ts`), WebGPU texture/bitmap streaming (`texture-streaming.ts`), Svelte 5 template element/rune/handler splitting (`svelte-dom-splitter-v1.mjs`, `phase3b2-semantic-splitter-pipeline.mjs`), and HTML5 design tokens (`uno.config.ts`, `bits-ui`) into explicit single-owner contracts without polluting `svelte-a11y-warning-remediation`.

#### Scenario: Independent Svelte 5 Rune, Handler, and Element Span Verification
- **WHEN** `svelte-rune-crosscheck-v1.mjs` and `svelte-handler-crosscheck-v1.mjs` evaluate `.svelte` components
- **THEN** all rune spans (`$state`, `$derived`, `$props`, `$effect`), template event handlers (`onclick`, `on:*`), and template elements (`RegularElement`, `Component`) MUST agree in both count and UTF-8 byte-span containment with zero canonical datastore writes

#### Scenario: HTML5 Semantic DOM and WebGPU Viewport Surface Alignment
- **WHEN** HTML5 designs and viewport surfaces are indexed or rendered
- **THEN** template element hierarchies (`svelte-dom-splitter-v1.mjs`), ARIA attribute contracts (`svelte-a11y-warning-remediation`), and `<canvas>`/WebGPU surfaces (`courtroom-scene.svelte.ts`, `texture-streaming.ts`, `src/lib/server/ocr/hybrid.ts`) MUST reference their single assigned owner and adhere to UnoCSS token and byte-budget limits
