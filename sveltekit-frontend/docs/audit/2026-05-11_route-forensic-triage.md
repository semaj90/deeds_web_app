# Route-Forensic Triage — 2026-05-11

Pre-finalization audit of user-facing SvelteKit `+page.svelte` routes. Forensic
Playwright specs written for top-25 routes, ready to execute against a live
dev server. Operator picks which fixes to apply before Drizzle finalization.

Template source: `tests/e2e/upload-button-diagnostic.spec.ts` (commit `86671e43e5`
— forensic spec that caught the Service Worker colon-corruption upload bug).

## §0 Methodology

- **Scope**: user-facing `+page.svelte` files only (NOT `+server.ts` API routes).
- **Routes enumerated**: 215 total `+page.svelte` files in `src/routes/**`.
- **Top-25 selected** by user-blast-radius: homepage, auth, cases, evidence,
  chat, search, dashboards, library, citations, reports, persons-of-interest.
  Admin / dev-tools / demos explicitly deprioritized.
- **Specs written**: 25 spec files, 55 test cases total, all parse green
  (`npx playwright test tests/e2e/route-forensic/ --list` returns
  `Total: 55 tests in 25 files`).
- **Run protocol**:
  ```bash
  cd sveltekit-frontend
  PLAYWRIGHT_SKIP_GLOBAL_SETUP=true npx playwright test tests/e2e/route-forensic/
  ```
  `PLAYWRIGHT_SKIP_GLOBAL_SETUP=true` is required because
  `tests/global-setup.ts` POSTs to `/api/cases` with an integer user.id that
  fails against the `cases.user_id uuid` mismatch (documented in
  project CLAUDE.md "Schema Mismatch" section).
- **Shared helpers**: `tests/e2e/route-forensic/_helpers.ts` —
  `attachListeners()`, `summarise()`, `loadAnyCaseId/EvidenceId/PoiId()` (PG fixture
  loaders that fall through to skip when DB is empty), `captureRouteLoad()`
  one-liner, `stubCompletedOnboarding()` route-stub helper.
- **Concurrency**: every spec is `test.describe.serial(...)` and Playwright
  config is `workers: 1, fullyParallel: false` — dev server gets one request
  at a time.
- **No code edits outside `tests/e2e/route-forensic/` and `docs/audit/`** —
  proposals only.
- **Dev server NOT running at audit time** — specs are static. Run results
  will populate §3 fix proposals; the cluster inventory in §2 is the
  **predicted** failure surface based on static analysis (CLAUDE.md "schema
  fragmented" + "graceful error" + known patterns) and prior-session signals.

## §1 Route Prioritization (Top 25)

| # | Route                                  | Auth? | `+page.server.ts`? | Dynamic | Rationale                          |
|---|----------------------------------------|-------|--------------------|---------|-------------------------------------|
| 1 | `/`                                    | mixed | yes                | no      | Front door; every user lands here  |
| 2 | `/login`                               | no    | yes                | no      | All auth flows                     |
| 3 | `/register`                            | no    | no                 | no      | Onboarding gate                    |
| 4 | `/cases`                               | yes   | yes                | no      | Primary list, drives detail        |
| 5 | `/cases/[id]`                          | yes   | yes (redirect)     | yes     | Case canvas root                   |
| 6 | `/cases/[id]/evidence`                 | yes   | yes                | yes     | Evidence list per case             |
| 7 | `/cases/[id]/evidence/upload`          | yes   | yes                | yes     | Where 86671e43e5 bug lived         |
| 8 | `/cases/new`                           | yes   | yes                | no      | Case-creation form                 |
| 9 | `/evidence`                            | yes   | yes                | no      | Cross-case evidence list           |
|10 | `/evidence/[id]/view`                  | yes   | yes                | yes     | Inline evidence preview            |
|11 | `/evidence-library`                    | yes   | yes                | no      | Gallery-style evidence view        |
|12 | `/dashboard`                           | yes   | no                 | no      | Default landing for authed users   |
|13 | `/chat`                                | yes   | yes                | no      | Primary AI surface                 |
|14 | `/global-search`                       | yes   | no                 | no      | Cross-domain search                |
|15 | `/citations`                           | yes   | no                 | no      | Citation panel hub                 |
|16 | `/reports`                             | yes   | no                 | no      | Report list                        |
|17 | `/persons-of-interest`                 | yes   | yes                | no      | POI list                           |
|18 | `/persons-of-interest/[id]`            | yes   | yes                | yes     | POI detail (photos + timeline)     |
|19 | `/library`                             | yes   | yes                | no      | Library documents                  |
|20 | `/active-cases`                        | yes   | yes                | no      | Filtered cases (active only)       |
|21 | `/command-center`                      | yes   | yes                | no      | Health/metrics command surface     |
|22 | `/analysis-center`                     | yes   | yes                | no      | Combined evidence+case analysis    |
|23 | `/analytics`                           | yes   | yes                | no      | Per-user weekly summary            |
|24 | `/rag-search`                          | yes   | no                 | no      | RAG-driven query lane              |
|25 | `/legal-corpus`                        | yes   | yes                | no      | Statutes + glossary index          |

Excluded explicitly: all `/admin/*` (52 routes), all `/demos/*` (74 routes),
all `/(dev)/*` (8 routes), all `/(analysis)/*` shadow routes (6 routes,
duplicate with `@`-prefixed variants), `/(analysis)@/*` shadow routes.

## §2 Cluster Summary (predicted, populate from run)

Each cluster maps to one root cause family. Counts are blank until the suite
runs against a live dev server — operator runs the suite, fills in counts.

| Cluster              | Predicted Count | Example Routes                                | Typical Root Cause                                                                          |
|----------------------|-----------------|-----------------------------------------------|----------------------------------------------------------------------------------------------|
| `AUTH_REDIRECT`      | ~7              | `/cases`, `/dashboard`, `/chat`, `/cases/new`  | Spec runs without dev-bypass auth → load throws `redirect(302, '/login')` (expected, but masks content tests) |
| `404_MISSING_HANDLER`| 0-1             | `/cases/[id]/evidence/upload` (rare)           | Page route exists but `+page.server.ts` returns 404 from `throw error(404)` outside try/catch |
| `SSR_THROW`          | ~3-5            | `/cases/[id]`, `/cases/[id]/evidence`, `/persons-of-interest/[id]` | `cases.user_id uuid` mismatch — `eq(cases.userId, locals.user.id)` with integer user.id returns 0 rows; if downstream code assumes a row, throws |
| `HYDRATION_FAIL`     | ~1-2            | `/chat`, `/command-center`                     | bits-ui Dialog SSR TDZ (project CLAUDE.md "bits-ui Dialog SSR TDZ"). Affects routes that render Dialog at SSR time without `export const ssr = false` |
| `BROKEN_FETCH`       | ~2-3            | `/citations`, `/rag-search`, `/global-search`  | Client-side fetch to `/api/...` that 4xx/5xx (e.g. POST without auth in client fetch) |
| `MISSING_IMPORT`     | 0-1             | (none expected)                                | Module import fails at runtime in browser. Rare — would show in earlier suite runs |
| `CONSOLE_NOISE`      | ~10+            | many                                          | Non-blocking warnings: HMR overlay, deprecation warnings, missing `data-testid`s, lucide icon fallback |
| `BUTTON_INERT`       | ?               | `/cases/new`, `/reports`, `/persons-of-interest/create` | Submit handler bound to `$state` ref that is never wired; superforms `enhance` missing |

### Why predictions vs. measured counts

The forensic suite is the **measurement instrument** — running it against a
live dev server produces real counts. The predictions above are derived from:

1. Documented schema mismatch (24 `uuid user_id` tables vs. integer `users.id`)
2. Documented graceful-error policy (page loads should never `throw error(500)`,
   so SSR throws should be **rare** but not zero)
3. Prior-session evidence: `/cases` renders empty-state when SSR query runs
   with integer user.id (project CLAUDE.md "Known degradations")
4. Service Worker colon-corruption pattern (commit `86671e43e5`) — the kind of
   bug only forensic capture catches; we are not predicting another but the
   capture surface will catch it if present

## §3 Top 5 Fix Proposals

Operator picks 0-5 of these to apply BEFORE Drizzle finalization. Each ranks
on (user-blast-radius × ease).

### Proposal 1 — Auth-bypass header for forensic specs
- **Cluster**: AUTH_REDIRECT
- **Root cause hypothesis**: Specs hit `/cases`, `/dashboard`, `/chat`,
  `/cases/new`, etc. without `locals.user` set → SvelteKit hooks redirect to
  `/login`. Specs see this as a redirect, the content-affordance tests skip
  the real content path.
- **Files involved**:
  - `src/hooks.server.ts` (already supports `DEV_BYPASS_AUTH=true` per
    project CLAUDE.md)
  - `tests/e2e/route-forensic/_helpers.ts` — add `setForensicAuthCookie(page)`
    that sets a dev-bypass cookie OR header before `page.goto`
- **Effort**: 15 min — one helper function + import update across 20 specs
  (or one shared `beforeEach`)
- **Risk**: low — opt-in, scoped to spec dir

### Proposal 2 — `cases.user_id uuid → integer` finalization
- **Cluster**: SSR_THROW + AUTH_REDIRECT downstream
- **Root cause hypothesis**: Project CLAUDE.md explicitly says 24 tables have
  `user_id uuid` that will NEVER return data for integer-PK Lucia users.
  `/cases`, `/cases/[id]` content, `/evidence`, `/persons-of-interest`,
  `/active-cases` ALL filter on these columns → load returns empty arrays →
  pages render empty-state with no actionable feedback.
- **Files involved**:
  - 24 Drizzle schema entries in `src/lib/server/db/schema-postgres.ts`
  - One `ALTER TABLE … ALTER COLUMN user_id TYPE integer USING NULL` per
    table (most are empty/low-row; verify with `\d table` first)
  - Update `src/lib/server/db/seed.ts` to populate post-migration
  - Schema-mismatch coding pattern (project CLAUDE.md) becomes uniform
- **Effort**: 1-2 days (mostly verification + per-table `\d` audits)
- **Risk**: HIGH if any of the 24 tables has live data → drops it. Operator
  already accepted that finalization is destructive, so this fits the moment.
- **Companion**: §5 schema usage map identifies which tables have live
  consumers among top-25 routes; the rest are candidates for finalization drop.

### Proposal 3 — Audit `bits-ui` Dialog SSR usage
- **Cluster**: HYDRATION_FAIL
- **Root cause hypothesis**: Project CLAUDE.md documents `bits-ui v2.16.2
  Dialog uses let props = $props() which triggers TDZ in Svelte 5.46.0 SSR.
  Routes rendering Dialog at SSR time need export const ssr = false`. The
  forensic specs will surface pageerrors on any route that renders Dialog
  during SSR.
- **Files involved**:
  - grep for `import.*Dialog.*from.*bits-ui` in `src/routes/**/+page.svelte`
    and child components reachable from top-25 routes
  - Add `export const ssr = false` to offending routes, OR wrap Dialog in
    `{#if browser}` guard
- **Effort**: 30-60 min (grep + 2-5 route edits)
- **Risk**: low — `ssr = false` is the documented workaround

### Proposal 4 — Wire missing `+page.server.ts` for dashboard / chat / rag-search
- **Cluster**: BROKEN_FETCH (page does work client-side that should be SSR)
- **Root cause hypothesis**: 8 of the top-25 routes have NO `+page.server.ts`:
  `/register`, `/dashboard`, `/global-search`, `/reports` (list),
  `/reports/new`, `/rag-search`, `/knowledge`, `/citations`. They likely
  use client-side `onMount` fetch — fine for some, but `/dashboard` should
  almost certainly SSR (loaded first by every authed user).
- **Files involved**:
  - `src/routes/(app)/dashboard/+page.server.ts` (NEW) — read user summary
    from `analytics` table or `cases` count
  - Skip the others; client-mount is fine for search-style routes
- **Effort**: 20-40 min for `/dashboard` only
- **Risk**: low (adds SSR, doesn't replace existing logic)

### Proposal 5 — `/cases/[id]` redirect-only load → add basic case fetch
- **Cluster**: SSR_THROW (downstream) + BUTTON_INERT
- **Root cause hypothesis**: `src/routes/(app)/cases/[id]/+page.server.ts`
  is currently just `throw redirect if !locals.user`. Sub-routes
  (`/board`, `/canvas`, `/chat`, `/evidence`, `/notes`, `/overview`,
  `/persons`, `/reports`) each re-fetch the case independently. If the
  parent loaded the case once and exposed it via `parent()` data, every
  sub-route gets graceful "case not found" handling for free.
- **Files involved**:
  - `src/routes/(app)/cases/[id]/+page.server.ts` — add `safe()`-wrapped
    case fetch matching the §5 pattern in project CLAUDE.md
- **Effort**: 15 min
- **Risk**: low — additive

## §4 Backlog

These are spec-discoverable findings the suite will surface that we don't
recommend immediate fixes for (operator chooses if/when):

| Finding | Spec | One-line |
|---------|------|----------|
| `/register` has no SSR data | `register.diagnostic.spec.ts` | Client-only form — acceptable; flag if hydration is slow |
| `/persons-of-interest/create` not in top-25 | (intentional omission) | Sub-CTA on POI list — covered transitively |
| `/cases/[id]/canvas` not in top-25 | (intentional omission) | Heavy WebGPU client-only; covered by client-inference suite |
| `/citations/[...label]` rest-route | (omitted) | Pattern-matching detail — separate triage if cited content breaks |
| `/library/[documentId]/reader` | (omitted) | Reader UI not gated on schema finalization |
| Console-warn floor | every spec | Expect 5-15 warns per route from HMR + bits-ui — categorize once we have run output |
| Lighthouse perf | (out-of-scope) | This audit captures correctness, not perf |
| `/evidence/[id]/view` lightbox | `evidence-view.diagnostic.spec.ts` | If preview fails, MediaViewer fallback chain is the suspect |

## §5 Schema Usage Map (Top-25 Routes)

Grepped `db.select().from(...)`, `.insert(...)`, `.update(...)`, `.delete(...)`
across each route's `+page.server.ts`. Tables with **zero** top-25 consumers
are strong finalization-drop candidates.

| Route                                  | Drizzle tables read/written                              |
|----------------------------------------|----------------------------------------------------------|
| `/`                                    | `cases`, `evidence`, `criminals`, `auditLog`            |
| `/login`                               | `users`                                                  |
| `/register`                            | (no +page.server.ts — likely `users` via form action)   |
| `/cases`                               | `cases` (read, insert, update)                          |
| `/cases/[id]`                          | (none — redirect-only guard)                            |
| `/cases/[id]/evidence`                 | `evidence`                                               |
| `/cases/[id]/evidence/upload`          | `cases` (existence check)                                |
| `/cases/new`                           | `cases` (read, insert)                                   |
| `/evidence`                            | `evidence` (read, insert, update, delete)                |
| `/evidence/[id]/view`                  | `evidence`                                               |
| `/evidence-library`                    | `evidence`                                               |
| `/dashboard`                           | (no +page.server.ts — client-only)                      |
| `/chat`                                | `chatMessages` (insert), `JSON` (false match)            |
| `/global-search`                       | (no +page.server.ts — client-only)                      |
| `/citations`                           | (no +page.server.ts)                                     |
| `/reports`                             | (no +page.server.ts)                                     |
| `/persons-of-interest`                 | `personsOfInterest`                                      |
| `/persons-of-interest/[id]`            | `personsOfInterest`, `poiPhotos`                         |
| `/library`                             | raw SQL: `library_documents`, `jurisdictions`, `legal_nodes`, `legal_chunks` (NOT Drizzle) |
| `/active-cases`                        | `cases`                                                  |
| `/command-center`                      | raw SQL: `cases`, `evidence` (count queries)             |
| `/analysis-center`                     | `cases`, `evidence`                                      |
| `/analytics`                           | analytics service (no direct table access)               |
| `/rag-search`                          | (no +page.server.ts)                                     |
| `/legal-corpus`                        | `statutes`, `legalGlossary`                              |

### Surprises (operator: read these before finalizing)

- **`/cases/[id]` does NO data fetch** — it's a redirect guard. Every child
  route re-fetches independently. **Proposal 5** above addresses this.
- **`/library` bypasses Drizzle entirely** — uses raw `pool.query()`. It hits
  `library_documents`, `jurisdictions`, `legal_nodes`, `legal_chunks`. These
  tables MUST be preserved through finalization or `/library` 500s.
- **`/command-center` bypasses Drizzle for metrics** — uses `db.execute(sql\`...\`)`.
  Counts `cases` and `evidence`; safer through finalization than schema
  references.
- **8 routes have NO `+page.server.ts`**: `/register`, `/dashboard`,
  `/global-search`, `/citations`, `/reports`, `/rag-search`, plus 2 not in
  top-25. These won't break from schema changes — they fetch via client API.
- **`criminals` table** is referenced by the homepage load but NOT by any
  other top-25 page. If schema finalization touches this table, only the
  home-page count is affected.
- **`poiPhotos` table** only consumed by `/persons-of-interest/[id]`.
  Finalization candidate if POI photos aren't a shipped feature.
- **`legalGlossary` + `statutes`** only consumed by `/legal-corpus` (and its
  `[id]` detail). If those routes are degraded acceptable, schema changes
  here are low-blast-radius.
- **`auditLog` read** by homepage — finalization affects user-visible "Recent
  activity" panel.
- **`chatMessages` insert** in `/chat` is commented out (see
  `routes/(app)/chat/+page.server.ts:57`). The table exists but live chat
  doesn't write to it. Finalization candidate.

## Appendix — Spec Inventory

All 25 specs under `tests/e2e/route-forensic/`:

```
_helpers.ts                          (shared, ~200 LoC)
active-cases.diagnostic.spec.ts
analysis-center.diagnostic.spec.ts
analytics.diagnostic.spec.ts
case-detail.diagnostic.spec.ts
case-evidence-upload.diagnostic.spec.ts
case-evidence.diagnostic.spec.ts
cases-list.diagnostic.spec.ts
cases-new.diagnostic.spec.ts
chat.diagnostic.spec.ts
citations.diagnostic.spec.ts
command-center.diagnostic.spec.ts
dashboard.diagnostic.spec.ts
evidence-library.diagnostic.spec.ts
evidence-list.diagnostic.spec.ts
evidence-view.diagnostic.spec.ts
global-search.diagnostic.spec.ts
homepage.diagnostic.spec.ts
legal-corpus.diagnostic.spec.ts
library.diagnostic.spec.ts
login.diagnostic.spec.ts
persons-of-interest.diagnostic.spec.ts
poi-detail.diagnostic.spec.ts
rag-search.diagnostic.spec.ts
register.diagnostic.spec.ts
reports.diagnostic.spec.ts
```

Total: 55 test cases. All pass `--list` parse. None modify routes or apply
fixes — proposals only. Cleanup: `rm -rf tests/e2e/route-forensic/` removes
all evidence with zero downstream impact.
