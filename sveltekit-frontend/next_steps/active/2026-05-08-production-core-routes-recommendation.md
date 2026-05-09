# Production Core Routes Recommendation - 2026-05-08

## Scope

Reviewed the production-facing core routes and compared them against the current `next_steps/active/` backlog.

Core routes checked:

- `/evidence`
- `/evidence/upload`
- `/library`
- `/legal-corpus`
- `/recommendations`
- `/admin/search-intelligence`
- `/codebase-graph`
- `/persons-of-interest`
- `global-search`

## What Is Already Covered

These existing plans already cover most of the product work:

- `03-evidence-improvements.md`
- `01-reports-next-steps.md`
- `11-wiring-production-quality.md`
- `12-app-wiring-consolidation.md`
- `2026-05-05_unwired-features-wiring-plan.md`
- `2026-05-08_schema-consolidation-production-ready.md`
- `2026-05-08_pipeline-driven-next-actions.md`
- `2026-05-08_reconstruction-track-production-ready.md`

## Route-Level Read

| Route | Current state | Existing next_steps coverage |
|------|---------------|------------------------------|
| `/evidence` | Best shape, auth + Zod + paired tests | `03-evidence-improvements.md` |
| `/evidence/upload` | Healthy bridge into reconstruction | `2026-05-08_reconstruction-track-production-ready.md` |
| `/legal-corpus` | Validation + pairing gaps remain | `01-reports-next-steps.md` / `11-wiring-production-quality.md` |
| `/library` | Validation + pairing gaps remain | `01-reports-next-steps.md` / `12-app-wiring-consolidation.md` |
| `/recommendations` | Validation gap remains | `2026-05-08_schema-consolidation-production-ready.md` |
| `/admin/search-intelligence` | Validation + pairing gaps remain | `11-wiring-production-quality.md` / `2026-05-08_pipeline-driven-next-actions.md` |
| `/codebase-graph` | Mostly stable, still has test pairing gap | `2026-05-08_pipeline-driven-next-actions.md` |
| `/persons-of-interest` | Validation gap remains | `11-wiring-production-quality.md` |
| `global-search` | Wiring risk, bypasses typed search stack | `11-wiring-production-quality.md` |

- `src/routes/(app)/evidence` is the most production-ready surface. It already has auth, Zod, and paired tests.
- `src/routes/(app)/evidence/upload` is also healthy and is the right bridge into the reconstruction lane.
- `src/routes/(app)/legal-corpus`, `src/routes/(app)/library`, `src/routes/(app)/recommendations`, and `src/routes/(app)/admin/search-intelligence` still carry the highest hardening gaps.
- `src/routes/(app)/codebase-graph` is mostly stable but still needs test pairing on at least one route.
- `src/routes/(app)/persons-of-interest` is production-relevant, but its input validation and coverage are still incomplete.
- `global-search` is a wiring risk because it still sits outside the typed route stack and should be aligned with the canonical search/recommendation surfaces.

## Recommendation Order

1. Fix route validation and pairing on the legal/search core first: `legal-corpus`, `library`, `recommendations`, `admin/search-intelligence`.
2. Align `global-search` with the typed search stack and `/api/ace/recommendations` so the same retrieval spine is used everywhere.
3. Close the remaining route test gaps on `codebase-graph` and `persons-of-interest`.
4. Keep `evidence` and `evidence/upload` as the stable reference path while the other routes are hardened.
5. Defer new feature work until the above routes are validated, paired, and wired through the canonical search/recommendation flow.

## Concrete Gaps To Burn Down

- Add Zod validation to the remaining unvalidated route handlers.
- Add paired route tests for the legal and search pages.
- Remove any remaining hardcoded localhost usage in route/server code.
- Unify `global-search` with the typed search endpoints already described in `11-wiring-production-quality.md`.
- Keep `codebase-graph` and `recommendations` aligned with `2026-05-08_schema-consolidation-production-ready.md`.

## Bottom Line

The app is not blocked by missing major features. It is blocked by uneven route hardening across the legal/search core. Finish validation, pairing, and search wiring first, then resume feature expansion.
