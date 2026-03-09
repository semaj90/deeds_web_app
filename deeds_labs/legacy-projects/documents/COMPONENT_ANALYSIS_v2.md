# Component Analysis — v2

This is a compact, actionable follow-up to `COMPONENT_ANALYSIS.md` (attached). It translates the high-level consolidation/archival strategy into a prioritized, testable TODO list, with ownership suggestions, estimated effort, quality gates, and commands you can run.

## Quick executive summary
- The repo contains ~832 component files across 70+ directories. Many are legacy/test/demo, fragmented UI/AI directories, and a mix of Svelte 4/5 patterns.
- Short-term goal: reduce noisy compile errors and developer cognitive load by archiving unused/demo components, consolidating UI/AI primitives, and migrating Svelte4 stubs to Svelte5 or archiving.
- Outcome goal (6–12 weeks): ~200 active components, coherent `src/lib/components/{ui,ai,layout,...}`, dramatically reduced TypeScript/Svelte errors and faster dev iteration.

## Mini contract (what this plan delivers)
- Inputs: current repository (no external network changes), developer time (2–3 people ideally), and CI runner.
- Outputs: archived demo/test code, consolidated directories, updated import map, migration of Svelte 4 files to archive or Svelte 5, and an automated quick-check script to validate imports and typecheck.
- Success: project builds with `npx tsc --noEmit --skipLibCheck` and Svelte compiler errors reduced >= 75% from baseline.

## Top-level problems discovered
1. Fragmented component directories (multiple `ai/`, many UI directories). This increases duplicate code and import noise.
2. Many demo/test/example components that aren't used by routes; they clutter searches and typecheck.
3. Legacy Svelte 4 components (`export let`) alongside Svelte 5 runes — incompatible patterns cause confusion and potential build issues.
4. Several large, corrupted Svelte components (you've already found a few) that produce Svelte compile errors and noise.
5. No centralized exports for UI primitives which makes refactors brittle.

## Priority TODO (phases)
High-level rule: Archive, don't delete. Make each phase atomic, testable, and reversible with Git.

Phase 0 — Immediate quick wins (1–2 days)
- [ ] Run a baseline typecheck and Svelte compile and capture the error list (save to `logs/typecheck-baseline.txt`).
- [ ] Identify and archive all obvious test/demo folders: `storybook/`, `stories/`, `tests/`, `demo/`, `examples/`, `dev/` → `src/lib/components/_archive/test-demo/`.
  - Owner: single dev. Est: 2–4 hrs.
- [ ] Add a `src/lib/components/_archive/README.md` describing move reasons and a quick map.
- [ ] Fix the 10 worst offending corrupted Svelte files (the ones producing parse errors) by either quick rewrite or temporary stub that compiles.
  - Owner: core dev. Est: 1–2 days.

Phase 1 — Consolidate UI & AI primitives (3–7 days)
- [ ] Create the consolidated directories: `src/lib/components/ui/{core,bits,nes,layout}`, `src/lib/components/ai/{chat,legal,rag,cognitive,copilot,webgpu,wasm}`.
- [ ] Move `ui/enhanced-bits` and `ui/bits-ui` into `ui/bits`; make `src/lib/components/ui/index.ts` that re-exports Button, Input, Card, etc.
- [ ] Move fragmented AI directories under `ai/` per the target structure, leaving `_archive` copies.
- [ ] Run tests and a typecheck; fix import paths using a small codemod (see commands below).
  - Owner: 1–2 devs. Est: 3–5 days.

Phase 2 — Svelte4 migration & cleanup (3–10 days)
- [ ] Locate Svelte 4 files (search for `export let`) and either migrate to Svelte5 or move to `_archive/svelte4/`.
- [ ] For migrated files, run `npx svelte-check` and fix reported issues.
  - Owner: dev(s) familiar with Svelte. Est: depends on number (32 files → ~3–7 days).

Phase 3 — Import map and route updates (2–5 days)
- [ ] Update route and module imports to use the central `ui` and `ai` exports (codemod). Validate by running `npx tsc --noEmit` and a Svelte build.
- [ ] Add lightweight integration tests (smoke tests) for top-level pages (Home, Case view, RAG interface, Upload flow).
  - Owner: dev + QA. Est: 2–4 days.

Phase 4 — Instrumentation, CI, and follow-ups (ongoing)
- [ ] Add CI job to run `npx tsc --noEmit --skipLibCheck` and `npm run check:ultra-fast` on PRs.
- [ ] Track metrics: number of Svelte errors, TypeScript errors, and time for local `npm run dev` cold start.
- [ ] Optional: add repo-wide code ownership docs and a `COMPONENT_CONVENTIONS.md` with patterns.

## Concrete commands (PowerShell friendly)
Phase 0 archive demo/test (run from `sveltekit-frontend/src/lib/components`):

```powershell
# create archive dir
New-Item -ItemType Directory -Path src\lib\components\_archive\test-demo -Force
# move common demo folders (copied then removed locally if move fails)
Move-Item storybook src\lib\components\_archive\test-demo -ErrorAction SilentlyContinue
Move-Item stories src\lib\components\_archive\test-demo -ErrorAction SilentlyContinue
Move-Item tests src\lib\components\_archive\test-demo -ErrorAction SilentlyContinue
Move-Item demo src\lib\components\_archive\test-demo -ErrorAction SilentlyContinue
Move-Item examples src\lib\components\_archive\test-demo -ErrorAction SilentlyContinue
Move-Item dev src\lib\components\_archive\test-demo -ErrorAction SilentlyContinue
```

Codemod example (Node script or ripgrep+sed) to update imports after move:
- Use `rg "from '\$lib/components/.+" -n` to find imports and a small Node script to rewrite paths to the consolidated index.

## Quality gates and checks
- Baseline: capture `npx tsc --noEmit --skipLibCheck` errors in `logs/typecheck-baseline.txt`.
- After each phase run:
  - `npx tsc --noEmit --skipLibCheck` (no new critical TS errors introduced)
  - `npm run check:ultra-fast` (Svelte checks)
  - If available, a SvelteKit build: `npm run build` (non-production if dev-only).

## Edge cases & gotchas
- Some UI/AI components may be referenced only by dynamic imports or built paths — moving them may break runtime imports. Use Git and run the build after each major move.
- Svelte preprocessors (SCSS, PostCSS) could make automatic moving harder; preserve `lang` attributes on `<style>` tags and test the build.
- Legacy tests or storybook examples may rely on global CSS; verify after archive steps.

## Risk mitigation
- Archive, don't delete. Keep a clear `_archive/` structure and README.
- Make small commits per directory moved; CI run after each PR.
- Keep a rollback branch ready when doing mass moves.

## Owners & estimates (rough)
- Core dev (1–2): fix corrupted Svelte files, phase 0 and 1 core moves — 1–2 full dev days.
- Svelte migration dev (1): migrate Svelte4 files — 3–7 days depending on complexity.
- QA/dev: write smoke tests and ensure CI checks — 2–3 days.

## Success metrics
- TypeScript errors: -75% from baseline.
- Svelte compile errors: -90% for noisy, obvious parse errors.
- Component count in `src/lib/components` (active): <= 250.
- CI PR check times reduced by 30%.

## Next immediate steps I can take for you
- A) Run a baseline typecheck and write `logs/typecheck-baseline.txt` (I can run it here and commit the file).
- B) Apply Phase 0 archive moves (I can create the `_archive/test-demo` directory and move folders you confirm).
- C) Create a `src/lib/components/ui/index.ts` that re-exports major primitives (Button, Input, Card) to make later codemods straightforward.

Tell me which immediate step you want me to run (A, B, or C), or say "Plan and run Phase 0" and I'll execute the baseline + archive-demo moves and report results.

---

If you'd like, I can also create a PR with the Phase 0 changes and the smoke-check CI job so you can review the exact diffs before merge.