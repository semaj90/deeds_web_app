# Parent Atlas Graphify Recovery — Bounded Proof Ladder

**Status**: PROPOSED. Phase 1 (real execution-chain inventory) completed and verified this
session. Phases 2–17 (proof-ladder runner extension, global lock, feature-envelope
concurrency/determinism proof, checkpointed streaming latent backfill, foreground proof run,
atomic artifact publication, Studio read-only lanes, tRPC, OpenTelemetry, test suites) are
**NOT started** — this is genuinely multi-session scope, not something to rush under one turn's
context budget. Full 18-phase source spec preserved in `tasks.md`.

`OPENSPEC_OWNER: BLOCKED_OWNER_AMBIGUITY` — see below. This change lives in a fresh directory
specifically to avoid writing into either of the two colliding roots per the source spec's own
Phase 18 instruction.

## OpenSpec ownership ambiguity (verified real, not assumed)

Confirmed two independent, diverged OpenSpec roots both containing a
`parent-atlas-graph-retrieval-proof` change with GS1.x numbering:

| Root | Path | Size |
|---|---|---|
| Repo root | `openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md` | 1047 lines |
| SvelteKit app | `sveltekit-frontend/openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md` | 121 lines |

These have substantially diverged (the repo-root copy carries this entire session's GS1.4x
work; the sveltekit-frontend copy is far shorter/older). A third, unrelated OpenSpec root also
exists at `docs/phase-110-agentic-indexing/openspec/`. Per the source spec's explicit
instruction, this change does **not** edit either conflicting `tasks.md` — an operator needs to
decide which root is authoritative (or whether the sveltekit-frontend copy should be
deleted/symlinked/archived) before GS1.x work continues in either place.

## Phase 1 — real execution chain (verified via package.json + source inspection, not assumed)

`npm run graphify:daily` (`scripts/startup/run-graphify-daily-startup.mjs`) does not implement
stages itself — it shells out via `execSync`:

1. `npm run atlas:phase109b:workflow:dry` (provenance, non-blocking pre-step)
2. `npm run graphify:daily:chain`, which is itself 6 sequential `npm run` steps:
   1. `graphify:dedup-validation:apply` → `scripts/atlas/graphify-dedup-validation.mjs --apply`
   2. `graphify:materialize:apply` → `scripts/atlas/materialize-addressable-packets.mjs --apply`
   3. `scripts/atlas/daily-graphify-cold-processing.mjs` (no npm alias, called directly)
   4. `atlas:phase8:fanout:apply` → `scripts/startup/run-atlas-phase8-fanout.mjs` (itself 9
      sub-steps per its own header comment — not individually enumerated this pass)
   5. `atlas:qdrant:tag-mirror:apply` → `scripts/atlas/qdrant-tag-mirror.mjs --apply`
   6. `atlas:qdrant:feature-map-sync:apply` →
      `scripts/atlas/sync-atlas-feature-map-from-qdrant.mjs`
3. `npm run atlas:feature-recommendations:refresh` →
   `scripts/atlas/refresh-feature-recommendations.mjs --apply --limit=500`
4. On failure only, fallback: `npm run startup:graphify-complete:no-consumer -- --skip-audit` →
   `scripts/startup/graphify-complete-startup.mjs --skip-consumer --skip-audit`

**Correction to this document's own earlier Phase 1 finding (2026-08-03, later the same
session)**: the original pass left step 4 (`atlas:phase8:fanout:apply`) as "9 sub-steps per its
own header comment — not individually enumerated." Expanding it
(`buildPhase8StepPlan()` in `scripts/startup/run-atlas-phase8-fanout.mjs`) found:

```
atlas:phase8:step3:langextract:apply       → scripts/atlas/phase8-step3-langextract-entities.mjs
atlas:summary:index:rank:apply             → scripts/atlas/summary-index-ranker.mjs
atlas:summary:envelopes:build:apply        → scripts/atlas/build-summary-envelopes-from-tuples.mjs
atlas:summary:envelopes:queue:apply        → scripts/atlas/publish-summary-envelopes-to-rabbitmq.mjs
atlas:materialize:feature-envelopes:apply  → scripts/atlas/materialize-feature-envelopes.mts
atlas:phase16:latent:apply                 → scripts/atlas/backfill-latent-vectors.mjs
atlas:phase16:som:apply                    → scripts/atlas/train-som-20x20.mjs
atlas:phase16:gds:apply                    → npm --prefix sveltekit-frontend run graphify:gds
atlas:bitfrost-semantic-cache:warm:apply   → scripts/atlas/warm-bitfrost-semantic-cache.mjs
```

**This reverses the "not currently part of the daily chain at all" claim previously written
here.** `materialize-feature-envelopes.mts` (fixed for keyset pagination this session, GS1.45–47,
and already carrying the `ATLAS_PACKETS_BULK_WRITER_LOCK_KEY` Postgres advisory lock) **is**
exercised by the real daily chain — nested three levels down (`graphify:daily` →
`graphify:daily:chain` step 4 → `atlas:phase8:fanout:apply` → substep 5), not at the top level.
Same correction for `backfill-latent-vectors.mjs` (this session's TDZ/memory-diagnostic fixes) —
also daily-chain substep 6. The keyset-pagination fix likely *does* matter for
`GRAPHIFY_DAILY`/`FEATURE_MAP_CURRENT` after all; disregard the earlier claim otherwise.
`materialize-addressable-packets.mjs` (top-level chain step 2) remains a genuinely separate
script — both run, at different points in the chain.

**Chain map now confirmed complete.** Checked the remaining 4 top-level steps
(`graphify-dedup-validation.mjs`, `daily-graphify-cold-processing.mjs`, `qdrant-tag-mirror.mjs`,
`sync-atlas-feature-map-from-qdrant.mjs`) for further `execSync`/`spawn` nesting the way
`run-atlas-phase8-fanout.mjs` had — none found. So the full `graphify:daily` execution surface
is now genuinely enumerated: 6 top-level steps, with step 4 expanding to the 9 substeps listed
above, 14 real script executions total (plus the coordinator's own pre-step provenance dry-run
and post-step feature-recommendations refresh). Against this now-complete map: Karpathy map
(`karpathy:gpu` → `scripts/atlas/karpathy-gpu-enrich.mjs`) and KAG-notes-missing
(`graphify:kag-notes:missing` → `scripts/graphify-kag-notes-missing.mjs`) are **confirmed absent**
— genuinely not part of the daily chain, not a repeat of the earlier incomplete-check mistake.
D9 orphan audit and "Tier H analytics" remain unresolved to a specific script/alias (grepped
`audit:d9`/`d9:`/`tier-h`/`tierH`/`orphan` — only `atlas:qdrant:prune-orphans*` matched) — needs
a follow-up search against `orphan-detector.sh` and the "20/47/55-gate" audit docs referenced in
root `CLAUDE.md`.

`scripts/validate-parent-atlas-integration-proof.mjs` **already exists** (901 lines, working
tree already had it as modified at session start) with a gate-runner architecture that closely
matches what Phase 2 of the source spec asks for: `gateHandlers` map, per-gate dependency graph
(`gateDefinitions`), `STATUS` constants, JSON+Markdown report emission, `gate <name>` CLI
selection. **However its current gates are a different proof ladder entirely** — `env`,
`identity`, `okf`, `classification`, `semantic`, `ann`, `clustering`, `graph`, `ace`, `mcp` — not
the Graphify-recovery gates this new spec calls for (`graphify_lock`, `feature_envelope`,
`latent_diagnostic`, `latent_bounded`, `graph_artifact`, `studio`). The right move for Phase 2 is
almost certainly to **extend this existing runner with new gates**, not build a second parallel
runner — but that's an architectural judgment call worth confirming with the operator before
committing to it, since the existing gates' purpose/ownership wasn't otherwise documented in
this session's context.

## Not yet done (all of Phases 2–17, explicitly)

No PostgreSQL advisory lock work, no concurrency tests, no `materialize-addressable-packets.mjs`
determinism rewrite, no latent-backfill diagnostic report, no checkpointed streaming rewrite of
`backfill-latent-vectors.mjs`, no foreground Graphify proof run, no atomic artifact publication
logic, no Parent Atlas Studio lane UI/tRPC procedures, no OpenTelemetry instrumentation, no new
test suites. All gate statuses for these remain `NOT_RUN`.

Historical baseline snapshot repeated from the source spec, not independently re-verified this
pass (carried over, not re-checked): historical baseline `GRAPHIFY_DAILY: FAIL`, `GRAPH_ARTIFACT_CURRENT: FALSE`,
`FEATURE_MAP_CURRENT: FALSE`, `CONCURRENT_ATLAS_PACKETS_WRITERS: PROVEN`,
`DUPLICATE_FEATURE_ENVELOPE_INVOCATION: NOT_PROVEN`,
`FEATURE_ENVELOPE_LOCK_PATCH: IMPLEMENTED_NOT_PROVEN`,
`LATENT_BACKFILL_MEMORY_SAFE: FAIL_OR_NOT_PROVEN`, `LATENT_BACKFILL_RESUMABLE: NOT_PROVEN`,
`RAPIDS_ENVIRONMENT: BLOCKED`, `CUVS_PARITY: NOT_RUN`, historical `GRAPH_SNAPSHOT: BLOCKED`,
`PAGERANK: BLOCKED`, `KMEANS: BLOCKED`, `SOM_20X20: BLOCKED`.

## Explicit stop boundary (unchanged from source spec)

Do not proceed into: RAPIDS installation, cuVS/cuGraph PageRank consolidation, KMeans/SOM/Neo4j
GDS changes, Qdrant collection rebuilds, symbol identity migration, packet/tree-node identity
changes, Kafka integration, automatic agent recommendations.
