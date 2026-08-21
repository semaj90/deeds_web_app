## Why

17 new remote `agent/*`/`atlas/*`/`feature/*`/`codex/*`/`parent-atlas-*`
branches accumulated against this repo without a merge/duplication audit.
Local `main` was 772 commits behind `origin/main`. Separately, a stray
top-level `src/` directory (196 files, predating the branch wave) and a
stray doubled-directory scaffold pack (`parent-atlas-event-merkle-identity-pack/`)
sat at repo root, both risking the "N silently-competing owners" failure
mode this repo's CLAUDE.md explicitly names as a hard rule to avoid. This
change documents the audit, consolidation, and hardening pass that resolved
the immediately actionable parts and logs what's left for follow-up.

## What changed (retrospective — already done, logged for the record)

1. **Branch merge audit.** Surveyed all 17 branches against `origin/main`.
   Only 3 had actually landed (PR #6 `agent/parent-atlas-aug16-integration`,
   PR #7 `agent/atlas-feature-intelligence-specs`, PR #8
   `feature/parent-atlas-spectral-multihop`) — the other 14 are NOT merged.
   Found `aug16` and `aug18` (`agent/parent-atlas-integration-reconciliation-aug18`)
   are divergent siblings, not sequential despite the date-ordered naming.
2. **Local `main` fast-forwarded** to `origin/main` (stash/restore around
   local WIP, one real merge conflict resolved in
   `code-evidence-projection-worker.ts`).
3. **Merkle-identity-pack consolidated.** Compared every file against the
   live codebase before importing anything. Envelope/contract types that
   already existed (`event-fabric.ts`) were NOT duplicated. Genuine gaps
   (RFC-9162 Merkle tree hashing, graph-identity branded types, identity
   audit, kanban priority scoring, daily compiler orchestration) were
   ported to `sveltekit-frontend/src/lib/server/atlas/{merkle,identity,graph,daily}/`,
   adapted to reuse existing types where they existed. SQL migration
   templates were explicitly NOT applied (need schema reconciliation
   first). Original stray pack archived with a manifest entry. **Proven,
   not just typechecked**: confirmed all 8 pack TS files accounted for
   (7 ported, 2 deliberately reused existing infra instead), wrote test
   coverage for the 3 modules that had none, all 5 spec files across the
   port pass (19/19 tests) — determinism, empty-input rejection, payload
   shape conformance, gate logic, and the Merkle-root cross-check guard are
   all exercised, not just type-clean. **Wired to a real caller and proven
   live** (`tasks.md` 2.8): `buildAnalyticsCheckpoint()` now runs via a new
   standalone proof script (`scripts/atlas/merkle-checkpoint-demo.mts`)
   against real `analytics_events` rows, through the already-existing
   `event-fabric-analytics-projection.ts` → `analytics-sink.ts` path
   (real Postgres insert + Redis Streams write — found already wired,
   just missing a `checkpoint.commit` producer). Live run independently
   re-verified via direct `psql`: row `703eec9c-d659-4d93-b921-20cc68afb347`
   landed with `merkleRoot=51f5dddc...` matching exactly.
   `runParentAtlasDailyCompiler` deliberately NOT wired — its GPU-feature
   and recommendation-derivation ports have no real backing implementation
   anywhere in the repo yet; stubbing them would fabricate a success rather
   than prove one.
4. **Top-level `src/` duplication triaged and partially resolved.** 54
   filename collisions with `sveltekit-frontend/src/` found. 16 confirmed
   pure stubs vs. sveltekit-frontend were initially archived + removed —
   **this was wrong and corrected same session**: verification only checked
   cross-tree importers, never checked whether other root-only files (no
   sveltekit-frontend counterpart) depend on the archived files internally.
   Root `src/` is an internally-coherent mini-package with its own barrel
   `index.ts` files and cross-module imports, not scattered stray
   duplicates; 11 of the 16 had real internal dependents, including a
   live manually-runnable demo script (`scripts/atlas/pagerank-authority-demo.mts`)
   that broke. All 16 restored to their original locations; manifest
   entries updated with the corrected root-cause note. Whether root `src/`
   as a whole should eventually be archived remains genuinely undecided —
   see `tasks.md` 3.3c/3.3d. ~12 confirmed `COMPETING_REAL` implementations
   left in place, NOT archived, pending manual reconciliation. 1 file has a
   genuine value-add diff not yet ported. 15 files sized but not read.
5. **G11 (hardcoded localhost) hardening.** 19 files / 21 call sites fixed
   to use the existing `ENV` config object or an env-var-with-fallback
   pattern, matching established repo convention. One real bug (missing
   `/mcp` path suffix) caught before it shipped by checking the target env
   var's canonical usage elsewhere first, not just pattern-matching.

See `docs/parent-atlas-workstation-todo.md` (2026-08-20 entry) for full
narrative detail and `docs/archive-manifest.json` for every archived file's
hash and reasoning.

## Impact

- `sveltekit-frontend/src/lib/server/atlas/{merkle,identity,graph,daily}/` — new
- `sveltekit-frontend/scripts/atlas/merkle-checkpoint-demo.mts` — new, real
  wiring proof (standalone, not automated)
- `docs/archive-manifest.json` — 17 new entries: 1 for the merkle pack
  (genuinely archived, confirmed no dependents anywhere) + 16 for the
  root `src/` stub batch (archived, then all 16 marked `restored` same
  session after the internal-dependency gap was found — see task 3.3a)
- `deeds_labs/archive/2026-08-20/` — cold storage; the merkle pack copy is
  the durable record, the root-src-stubs copies are now redundant with the
  restored working-tree files but kept per this repo's archive-not-delete
  convention
- 19 files touched for G11 (see `tasks.md` for the full list)
- Nothing permanently deleted without a prior archive copy + manifest
  entry, per this repo's archival rules — and this session is itself the
  evidence that "verified zero external importers" is not sufficient
  justification on its own

## Not in scope for this change

- The ~12 `COMPETING_REAL` src/ collisions (needs per-file reconciliation
  decisions, tracked as open tasks below)
- G4/G5/G20 findings from the same `/deep-audit` pass (auth gaps, Zod gaps,
  cyclic imports — separate concern from duplication/hardening)
- The 15 unread src/ collisions
