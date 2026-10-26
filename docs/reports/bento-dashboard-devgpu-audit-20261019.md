# Bento Dashboard and dev:gpu Audit — 2026-10-19

## Findings

- `/demos/bento-dashboard` contained inert Fast Tracks buttons, a simulated search spinner that never searched, and an Analyze button that displayed “Extracted” without extracting or saving anything.
- The read-only request to `http://127.0.0.1:5173/demos/bento-dashboard` returned HTTP 500. The response and Playwright error context show Vite failing to read the virtual path `\0virtual:__sveltekit/environment` (`ERR_INVALID_ARG_VALUE`). Earlier reported Vite output also had a missing `.vite/deps` chunk. This is consistent with stale/broken Vite optimizer state; it was not repaired because doing so would require touching the active dev server/cache.
- The pasted 400 from `/api/analytics/events`, AnalysisJobs PostgreSQL timeout, and RabbitMQ heartbeat `ECONNRESET` are separate backend failures. The supplied evidence does not establish that `npm run dev:gpu` caused them or identify the invalid analytics event payload.
- `npm run dev:gpu` was not launched: it may manage GPU/model processes. The existing `dev-gpu-runtime.mjs` passed Node syntax checking. No llama-server, database, queue, or GPU process was stopped or restarted.

## Changes

- Fast Tracks are links to the existing `/cases/new` and `/evidence/upload` pages.
- Knowledge search filters the prototype's local sample results and provides an empty state; it no longer shows a fake asynchronous search spinner.
- The generator prepares a deterministic local draft, reports missing notes, and clearly says it has not saved or created a case. Clear and collapse controls are accessible and functional.
- Added a focused Playwright spec for controls, links, empty results, and responsive grid columns, with a standalone config that avoids the repository's DB-seeding global setup.

## Validation

- Svelte compiler: passed, 0 warnings.
- `node --check scripts/startup/dev-gpu-runtime.mjs`: passed.
- Focused `git diff --check` for the dashboard file: passed.
- Playwright was attempted against the already-running app; the first page-render test failed because the route returned the Vite 500 before the dashboard rendered. Screenshot and trace are under `sveltekit-frontend/test-results/bento-dashboard-Bento-dash-6d827-tions-to-existing-workflows/`.
- `svelte-check` did not finish within the bounded attempt and was interrupted. No full end-to-end pass is claimed.

## Next gate

After a separately coordinated Vite-only restart/cache repair (without touching llama-server), rerun `npx playwright test --config playwright.bento.config.ts`. Then investigate analytics validation with a captured, sanitized request shape and separately inspect PostgreSQL/RabbitMQ connectivity.

likely_cause: Bento controls were placeholders, while the current browser test blocker is the active Vite server's virtual-module/dependency-optimizer failure.
evidence: `sveltekit-frontend/src/routes/(app)/demos/bento-dashboard/+page.svelte`; Playwright error context; live route returned HTTP 500 with `ERR_INVALID_ARG_VALUE`; `sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs` passed syntax check.
patch_targets: `sveltekit-frontend/src/routes/(app)/demos/bento-dashboard/+page.svelte`, `sveltekit-frontend/tests/e2e/bento-dashboard.spec.ts`, `sveltekit-frontend/playwright.bento.config.ts`.
safe_next_command: `cd sveltekit-frontend; node --check scripts/startup/dev-gpu-runtime.mjs`
smoke_command: `cd sveltekit-frontend; npx playwright test --config playwright.bento.config.ts`
report_path: `docs/reports/bento-dashboard-devgpu-audit-20261019.md`
