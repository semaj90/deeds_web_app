# Tasks: visual element rendering

Status words: `NOT_STARTED`, `WIRED`, `PARTIAL`, `PROVEN`, `BLOCKED`, `DONE`. Nothing is checked off until a receipt exists.

## VER-01 Vertex skinning & 3D courtroom MBVH4 picking (owner: courtroom scene)

- [x] VER-01-01 Inventory the skinned-model path: which `.glb` files load (`SceneLoader.ImportMeshAsync` + `ImportAnimationsAsync`), and where skeletal animation is set up (`result.skeletons?.[0]`, 14 `ANIM_TYPE_MAP` states). Owner: `sveltekit-frontend/src/lib/courtroom/courtroom-scene.svelte.ts`. Receipt: `docs/reports/ver-01-ver02-webgpu-rendering-audit-receipt-v1.json`. Status: `PROVEN`.
- [x] VER-01-02 Receipt for Mixamo-rigged 14-bone humanoid rig: bone count (`14`), 4-weight sum per vertex within tolerance (`maxWeightSumDeviation: 2.2204e-16 <= 1e-6`), `0` NaN weights (`inputSha256: sha256:88cd...`). Receipt: `docs/reports/ver-01-ver02-webgpu-rendering-audit-receipt-v1.json`. Status: `PROVEN`.
- [x] VER-01-03 Confirm skinning runs in the browser (`Babylon.js WebGPUEngine` / `WebGL2 Engine`) or a worker, never on the Node main thread (`nodeMainThreadExecution: false`). Receipt: `docs/reports/ver-01-ver02-webgpu-rendering-audit-receipt-v1.json`. Status: `PROVEN`.
- [x] VER-01-04 4-Wide QBVH / MBVH4 128-byte SoA slab intersection & stackless 32-bit nibble-bitmask (`bitstack: u32`) traversal in WGSL (`sveltekit-frontend/src/lib/webgpu/shaders/mbvh4_traversal.wgsl`) + TypeScript reference (`sveltekit-frontend/src/lib/webgpu/mbvh4-accelerator.ts`) & Phase 14 64-D TurboVec manifold traversal (`sveltekit-frontend/src/lib/server/indexer/karpathy-dag-subhelpers.ts`): `6/6` courtroom ray parity (`rayMismatches: 0`) and `LOD 0 -> LOD 4` promotion. Receipt: `docs/reports/mbvh4-stackless-traversal-receipt-v1.json`. Status: `PROVEN`.

## VER-02 Pixel and bitmap encoding (owner: WebGPU texture streaming)

- [x] VER-02-01 CPU reference for the RLE texture encode path in `texture-streaming.ts`: same input gives identical bytes (`deterministicMatch: true`, `compressionRatio: 16.0`). Receipt: `docs/reports/ver-01-ver02-webgpu-rendering-audit-receipt-v1.json`. Status: `PROVEN`.
- [x] VER-02-02 Byte-budget receipt against the Phase 14 limits (`2,048` B active RAM, `40,960` B total; 16×16 RGBA8 raw `1,024` B / RLE `64` B fits both). Receipt: `docs/reports/ver-01-ver02-webgpu-rendering-audit-receipt-v1.json`. Status: `PROVEN`.
- [x] VER-02-03 GPU vs CPU row-stride alignment parity (`bytesPerRow` padded from `64` B to `256` B WebGPU alignment; `maxPixelAbsDiff: 0`). Receipt: `docs/reports/ver-01-ver02-webgpu-rendering-audit-receipt-v1.json`. Status: `PROVEN`.

## VER-03 Elements (owner: Svelte DOM splitter)

- [x] VER-03-01 Template-node check against offset-preserving regex scan of element tags + byte-span containment vs `svelte/compiler` modern AST fragment nodes (`svelte-rune-crosscheck-v1.mjs`, 10 components, 0 span mismatches). Status: `PROVEN`.
- [x] VER-03-02 Event-handler check against offset-preserving regex scan of `on:` and `onX=` attributes (`svelte-handler-crosscheck-v1.mjs` & `svelte-rune-crosscheck-v1.mjs`, 10 components, 27 handlers, 0 mismatches). Status: `PROVEN`.
- Caveat for VER-03-01 and VER-03-02: the markup checks are regex-based; their receipts record `independentSyntaxParser: false`.
- Note (2026-10-17, dry-run only): `scripts/atlas/svelte-dom-splitter-v1.mjs` and `scripts/atlas/populate-nary-code-hyperedges-v1.mts` now accept SvelteKit route files (`+page.svelte`; `+` added to the path pattern, traversal guards unchanged) and look up the splitter's sanitized receipt name. Proof on `sveltekit-frontend/src/routes/(app)/admin/atlas/graph-explorer/+page.svelte`: 18 distinct arity-3 N-ary edges, deterministic across runs, `writesPerformed: false`, `canonicalAuthority: false`. Limits: receipts are named by basename only (same-named files in different folders collide; the bridge refuses a hash-mismatched receipt as `SPLITTER_RECEIPT_STALE`, so run one file at a time); SYNTAX_NODE members are provisional `svelte-span:` strings, not `tn_v1_` ids, so edges are not yet joined to `atlas_ast_nodes`; `--apply` stays refused until DDL review and operator sign-off; the two crosscheck scripts keep their own path patterns.
- [ ] VER-03-04 Independent markup check: ast-grep, using the compiled `tree-sitter-svelte` grammar and a kind-based rule (`kind: element`), agrees with the splitter's element count on 9 of 10 components. `APITesterModal.svelte` differs by one (34 vs 33). The extra match is `<svelte:window onkeydown={…} />` (line 102): the splitter counts only `RegularElement` and `Component`, so `svelte:*` elements are excluded by design. Not a parse error. Decide whether `svelte:*` belongs in the count. Grammar build: `svelte-grammar/tree-sitter-svelte.dll` (scratchpad; not in repo). Status: `PARTIAL`.
- [x] VER-03-03 Rune check: `svelte-rune-crosscheck-v1.mjs` reports 0 mismatches on 10 components (50 runes). Status: `PROVEN`.

## VER-04 HTML5 design (owner: Semantic DOM + Canvas/WebGPU Viewport Surfaces + UnoCSS + Bits UI)

"HTML5 designs" is defined concretely as **HTML5 Custom Elements / Semantic DOM & Canvas/WebGPU Viewport Surfaces**: the extracted template element hierarchy (`phase3b2-semantic-splitter-pipeline.mjs`, `svelte-dom-splitter-v1.mjs`), `data-*` / ARIA attribute contracts (`svelte-a11y-warning-remediation`), and `<canvas>`/WebGPU surfaces bridged by `courtroom-scene.svelte.ts`, `texture-streaming.ts`, and `src/lib/server/ocr/hybrid.ts`, styled via UnoCSS tokens (`sveltekit-frontend/uno.config.ts`) and Bits UI v2 namespace imports.

- [x] VER-04-01 Design & surface contract chosen: HTML5 semantic template elements + ARIA attribute contracts + `<canvas>`/WebGPU viewport surfaces + UnoCSS tokens + Bits UI v2 primitives. Status: `WIRED`.
- [x] VER-04-02 Token owner assigned: `sveltekit-frontend/uno.config.ts`. Primitive owner: `bits-ui`. Viewport owners: `courtroom-scene.svelte.ts`, `texture-streaming.ts`. Status: `WIRED`.
- [x] VER-04-03 Receipt: theme keys and shortcuts named in VER-04-01 audited against `uno.config.ts` (`docs/reports/ver-04-unocss-design-token-receipt-v1.json`). Status: `PROVEN`.
- [x] VER-04-04 Receipt: bounded sample of live `.svelte` files audited (`totalInlineStyles: 0`, `totalLegacySlots: 0`, `totalSemanticElements: 8`; `docs/reports/ver-04-unocss-design-token-receipt-v1.json`). Status: `PROVEN`.

## Verification

- [x] VER-99-01 Each lane's receipt is written with input SHA-256 revisions and exact test commands. Status: `PROVEN` for VER-01/02/04 (`docs/reports/ver-01-ver02-webgpu-rendering-audit-receipt-v1.json`, `docs/reports/ver-04-unocss-design-token-receipt-v1.json`) and the MBVH4 lane (`docs/reports/mbvh4-stackless-traversal-receipt-v1.json`). The VER-03 receipts are not under `docs/reports/`; they are `.tmp/atlas/svelte-rune-crosscheck-v1-*.json`, `.tmp/atlas/svelte-handler-crosscheck-v1-*.json` and `.tmp/atlas/svelte-dom-split-v1-*.json` (gitignored; regenerate before citing). Status for VER-03: `PARTIAL` until the receipts are promoted to a tracked path.

## Handoff (compact)

Read this section first in a new session. Everything above is the authoritative status.

**Done (evidence in place)**
- VER-01, VER-02, VER-04: receipts under `docs/reports/`.
- VER-03-03: runes 50/50 agree with ast-grep (`scripts/atlas/svelte-rune-crosscheck-v1.mjs`).
- VER-03-04 (still `PARTIAL`): independent ast-grep element count matches the splitter on 9 of 10 components. The one difference (`APITesterModal.svelte`, 34 vs 33) is `<svelte:window>`, which the splitter excludes by design.
- Strict UTF-8 to UTF-16 helper (`_strict_utf8_to_utf16_offset`) is a candidate in `python/miniforge_nlp_sidecar.py`, unwired and not in this change's task list. Tested by extraction only; not imported (module needs `fastapi`).

**Open**
- Decide whether `svelte:*` elements count toward the splitter's element total. This decides whether VER-03-04 moves to `PROVEN`.
- Restore/keep regex caveat on VER-03-01 and VER-03-02 (`independentSyntaxParser: false`).
- Grammar DLL: `tree-sitter-svelte.dll` (46 KB) and probe `sgconfig.yml` live in the scratchpad, not the repo. Location is an open decision. Build used clang with minimal libc shims and `mem.c`; `expandoChar` effect is untested.
- Pasted DSPy/LUT/PS2 plan: `dspy-repair-output-v1.ts` and `dspy_policy_program.py` are not in the repo. The Python metric has a `NameError` (`rec` used before assignment) and an attribute mismatch (`oakOptionInsert` vs `oak_option_insert`). Not started.
- Host Python has no `fastapi`; sidecar tests need Miniforge/WSL with it installed (not installed; dependency rule).
- `sveltekit-frontend/package.json` has an uncommitted script-path change from another session (not ours).

**Do not**
- Commit or push without an explicit request.
- Apply DDL. The lane draft is `drizzle/manual/proposed_20261015_atlas_hyperedges_revision_lane.sql` (validated in a rolled-back transaction only).
- Create `atlas_hypergraph_edges`; use the existing `atlas_hyperedges` / `atlas_hyperedge_members`.
