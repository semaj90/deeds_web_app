Move .svelte.ts companion files into helpers/headless/ (preview)

Goal

- Reduce duplicate TS compilation inputs caused by co-located `.svelte` and `.svelte.ts` companion files.
- Non-destructive: create shims at original paths that re-export implementations from the new `helpers/headless/` location.
- Minimal runtime impact: original imports remain valid; only file layout changes.

Strategy

1. Move companion files from their existing locations, e.g.:

- `src/lib/components/AIAssistant.svelte.ts` -> `src/lib/helpers/headless/AIAssistant.svelte.ts`
- `src/lib/stores/aiAssistant.svelte.ts` -> `src/lib/helpers/headless/aiAssistant.svelte.ts`

2. At the original path create a shim file that re-exports the moved module. Example shim content:

// src/lib/components/AIAssistant.svelte.ts (shim)
export * from '$lib/helpers/headless/AIAssistant.svelte.ts';

3. Optionally update tsconfig.json to exclude `src/lib/helpers/headless/**/*.svelte.ts` from being direct TS inputs, or instead exclude the original companion glob if preferred.

Benefits

- Fixes "would be overwritten by multiple input files" without touching `.svelte` files.
- Keeps original import paths working via re-export shims.
- Allows gradual, audited refactor of helpers.

Risks & Mitigations

- If companion files are imported by path-sensitive tooling, re-exports preserve compatibility.
- Must ensure new helpers path is included in project resolution (no change usually required).

Preview example (diff-like):

*** Move (preview) ***
- Delete: src/lib/components/AIAssistant.svelte.ts
+ Add:    src/lib/helpers/headless/AIAssistant.svelte.ts
+ Add:    src/lib/components/AIAssistant.svelte.ts  (shim re-export)

shim content:
export * from '$lib/helpers/headless/AIAssistant.svelte.ts';

Automation

A small Node script `tools/generate-shims.js` is included that scans for `.svelte.ts` companion files, moves them to `src/lib/helpers/headless/` (or optionally copies), and creates shim files at the original locations. The script prints a dry-run by default; use `--apply` to actually rename files.

Next steps

- If you approve, I can apply a conservative batch: move a small set of high-impact companions (e.g., `AIAssistant.svelte.ts`, `aiAssistant.svelte.ts`, `sessionManager.svelte.ts`) and leave the rest staged for later.
- Or I can apply the previously-prepared tsconfig exclude patch which is less intrusive.

Reply with which approach to apply or request changes to the plan.
