# Phase 2 — Migration Roadmap (Svelte 5 / Imports / Drizzle)

Summary
- Goal: reduce TypeScript/build errors via a targeted, phased plan.
- Phases: 2A (Svelte 5 runes), 2B (import path resolution), 2C (Drizzle query fixes).
- Metrics: use TypeScript error counts and CI green checks to measure progress.

Phase 2A — Complete Svelte 5 runes migration
- Target: reduce errors to ~2,600
- Focus: component modernization, replace deprecated runes/usages, update components to Svelte 5 syntax
- Timeline: short, high-impact iterations (2-5 day sprint)
- Tasks:
  1. Run a global grep to find runes/usages:
     - npm run grep -- " $state(" || use: rg '[$]state\(|\$derived\(|\$bindable\('
  2. Create an automated codemod (or use sed/ts-morph) for common rune patterns:
     - Examples: $state(value) -> useState(value) (project-specific mapping)
  3. Update components in priority order (high-traffic first):
     - Header, dashboard, chat, evidence canvas, profile
  4. Validate:
     - npx tsc --noEmit --skipLibCheck
     - npm run dev and visit key pages
- Acceptance:
  - TypeScript errors reduced to ~2,600
  - Critical pages render in dev without runtime parse errors

Phase 2B — Resolve import path issues
- Target: reduce errors to ~2,000
- Focus: module resolution, consistent alias usage ($lib vs relative)
- Timeline: systematic (3–7 days)
- Tasks:
  1. Build an import conformance report:
     - node tools/report-imports.js (create if missing) or use eslint-import-resolver.
  2. Normalize aliases:
     - Prefer $lib, $routes, $components per repo convention.
     - Update tsconfig/tsconfig.paths / vite alias to match.
  3. Fix broken/ambiguous imports in batches:
     - Start with top modules by error frequency (tsserver output).
  4. Add pre-commit lint rule to catch new bad imports.
- Acceptance:
  - Error count near ~2,000
  - No unresolved imports on CI

Phase 2C — Fix Drizzle query chains
- Target: reduce errors to ~1,500
- Focus: database type safety and query builder usage
- Timeline: deeper work (1–2 weeks)
- Tasks:
  1. Audit patterns that produce types errors (ReturnType issues, RowList casts).
  2. Introduce helper types:
     - type DBRow<T> = ReturnType<typeof drizzle<T>> ...
  3. Replace unsafe casts with typed wrappers and small refactors.
  4. Add unit tests to ensure query shapes remain stable.
- Acceptance:
  - Error count near ~1,500
  - Core DB flows tested locally

Cross-phase practices
- Branch strategy: feature/* per task, small PRs (~10–30 files).
- CI gates: require tsc (noEmit) and unit tests on PR.
- Owners: assign a primary owner for each phase; rotate reviewers.
- Quick commands:
  - Validate TS: npx tsc --noEmit --skipLibCheck
  - Dev: npm run dev
  - Find Svelte runes: rg '\$state\(|\$derived\(|\$bindable\(' src || grep -R
  - Find duplicate routes: node tools/find-route-conflicts.js

Quick checklist for first week
- [ ] Run static scan: tsc, rg for runes, report-imports script
- [ ] Complete codemod for 30 highest-impact runes
- [ ] Normalize aliases via tsconfig/vite
- [ ] Merge small PRs to reduce error count and keep momentum

Risks & mitigations
- Large codemods may break runtime behavior — mitigate with staged rollout and feature-flagged changes.
- Import fixes can create transient CI failures — fix in batches, update CI cache/build as needed.
- Drizzle typing changes may affect many files — add small adapters and incremental typing.

Contact / owners
- Phase 2A owner: frontend-engineer@example.com
- Phase 2B owner: infra-engineer@example.com
- Phase 2C owner: backend-engineer@example.com

Notes
- This document is intentionally actionable. If you want, I can:
  - generate a starter codemod template (ts-morph) for runes,
  - add a `tools/report-imports.js` script,
  - or create the initial Phase 2A PR touching top-10 files.

