## Why

A 2026-09-16 manual survey found 109 `tasks.md` files across `openspec/changes/` (root, 89 files)
and `sveltekit-frontend/openspec/changes/` (20 files), at 64% aggregate checkbox completion
(6,065/9,478). That survey also found real, non-trivial structural gaps by hand: two changes with
no `proposal.md` at all (`parent-atlas-error-research-lane`, `parent-atlas-live-graph-proof`), one
change (`parent-atlas-onnx-webgpu-embedding-promotion`) with a `proposal.md`-less directory that
was in fact accurate and not stale, and — separately — one change (`parent-atlas-live-graph-proof`)
whose entire proof tranche was silently built on a premise (`semantic_512` as canonical) that had
been operator-reversed a day before the tranche's own last edit, without ever being re-pointed.

Doing that kind of check by hand does not scale past 109 files and will not survive future growth
of this directory. This change builds a **repeatable, scriptable audit** of every `tasks.md` in
both openspec trees: completion percentage (0-100%), structural completeness (does the change have
a `proposal.md`, a non-empty `specs/` directory, a coherent `tasks.md`), and simple staleness
signals (self-declared `SUPERSEDED`/`STALE`/`BLOCKED` markers, duplicate change names across the
two trees, archived-vs-active directory mismatches).

## What Changes

- A new audit script, `scripts/atlas/audit-openspec-tasks-md-v1.mts`, that walks both openspec
  trees (root `openspec/changes/` and `sveltekit-frontend/openspec/changes/`, including each
  tree's `archive/` subdirectory), and for every `tasks.md` found:
  - computes checkbox completion (`done/total`, 0-100%);
  - computes a structural-completeness score (0-100%) from sibling-file presence (`proposal.md`,
    non-empty `specs/`, non-trivial `tasks.md`);
  - flags simple staleness signals (self-declared supersession markers, 0/0-with-no-proposal
    changes, duplicate change names across the two trees);
  - blends the two scores into a single per-change audit score (0-100%).
- The script parses its own emitted JSON report back through
  `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts`'s `fastJsonParse`/`isSimdJsonAvailable`
  (imported directly by relative path — that file has zero SvelteKit `$lib` imports, so it is
  safe to use from a plain Node/tsx script run from the repo root, unlike most `$lib`-aliased
  server modules) to prove the round-trip and honestly record whether the native addon or the
  JSON.parse fallback actually ran, rather than assuming.
- Report output follows this repo's existing Parent Atlas convention:
  `docs/reports/openspec-tasks-md-audit-v1.json` (machine-readable, re-runnable, overwritten each
  run) plus one timestamped, human-readable Markdown summary under `next_steps/active/` per run
  (not overwritten — each run is its own dated snapshot, matching this directory's existing
  `YYYY-MM-DD_slug.md` convention).

## Capabilities

- `openspec-tasks-md-audit` — a read-only, re-runnable audit that reports completion and
  structural-gap scores for every `tasks.md` in both openspec trees, without mutating any of the
  audited files, Postgres, Redis, or Qdrant. Pure filesystem read + JSON/Markdown report write.
