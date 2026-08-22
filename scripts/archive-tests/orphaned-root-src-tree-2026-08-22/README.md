# Archived tests — orphaned root src/ tree (2026-08-22)

These 22 test/spec files were removed from `tests/{atlas,classifier,hmm,integration,
opencode,retrieval,fixtures}/` at the repo root as part of archiving the never-built
root `src/` tree (see `docs/archive-manifest.json` and
`openspec/changes/parent-atlas-branch-merge-consolidation-aug20/workstation-todo-cross-reference-2026-08-22.md`
item 3 for the full investigation).

**They do not run as-is.** Their imports point at the root `src/lib/...` modules that
were archived alongside them (e.g. `$lib/server/retrieval/hmm-tool-selector`,
`$lib/server/classifier/domain-classifier` resolved against the orphan tree's own
tsconfig, not `sveltekit-frontend`'s). Kept here — tracked in git, not just the
gitignored `deeds_labs/archive/` cold-storage copy — per this repo's "never delete
working scripts, move them to scripts/ if they're in the wrong place" convention, so a
future session can find the parameters/test cases and adapt them against the real
`sveltekit-frontend/` implementations if any of that orphan-tree functionality (e.g. the
HMM tool router, candidate-lane provenance, multi-vector orchestrator) ever gets
properly ported.

Full source (including the non-test modules these depend on) is preserved at
`deeds_labs/archive/2026-08-22/orphaned-root-src-tree/` with a per-file SHA-256
manifest (`_manifest.json`).
