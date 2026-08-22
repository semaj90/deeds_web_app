# Graph / PageRank / OKF Fanout Hardening — Session Handoff (2026-08-21)

Status: **PROVEN** — all 12/12 tests across the 4-spec suite pass live, reproduced twice, ~10s total runtime.

## Context

This session's work replayed findings from a parallel session operating in a
different clone (`deeds-web-app-post17-clean`) that had run a graph/PageRank/
OKF/Qdrant-fanout audit and reported gaps. Rather than trust that clone's
summary, this session independently reproduced the failures in **this**
repo (`C:\Users\james\Videos\deeds-web-app`) by running the real test suite,
then fixed what was verifiably broken here.

Command used to reproduce (from `sveltekit-frontend/`):
```
node_modules/.bin/vitest run --config vitest.lane-contracts.config.ts \
  src/lib/server/atlas/graph/graph-qdrant-fanout-alignment.spec.ts \
  src/lib/server/atlas/graph/okf-schema-validation.spec.ts \
  src/lib/server/atlas/graph/atlas-rapids-pagerank-client.spec.ts \
  src/lib/server/atlas/graph/pagerank-parity.spec.ts
```

Final result (both runs): `Test Files 4 passed (4)` / `Tests 12 passed (12)`, ~10s.

## Fixed and verified live

- [x] **RAPIDS PageRank async-rejection bug** — `sveltekit-frontend/src/lib/server/atlas/graph/atlas-rapids-pagerank-client.ts`.
  `pagerank: (input) => { assertPageRankRequest(input); ... }` was a plain
  synchronous arrow function. `assertPageRankRequest()` throws synchronously
  on invalid input (duplicate seeds, too many candidates, etc.), which meant
  the throw happened **before** any Promise existed — so
  `await expect(client.pagerank(...)).rejects.toThrow(...)` in the spec
  couldn't catch it; the test itself crashed instead of asserting a
  rejection. Fixed by making the function `async`, so any synchronous throw
  inside it now correctly becomes a rejected Promise.

- [x] **OKF schema vocabulary mismatch** — `sveltekit-frontend/src/lib/server/atlas/graph/okf-schema.ts`.
  `RelationshipNameSchema` and the `node_types` enum were missing values
  that the real `.okf/manifest.yaml` at repo root actually uses. Extracted
  the exact, complete vocabulary directly from the manifest's
  `relationships:` and `graph_projection:` blocks (not from the truncated
  error message) and added:
  - relationships: `specifies`, `uses_table`, `uses_column`, `auth_guards`,
    `validates`, `blocks`, `observed_at_runtime`,
    `authorized_resource_mutation`
  - node_types: `feature`, `evidence`, `relationship`

- [x] **`pagerank-parity.spec.ts` hang — ROOT CAUSE FOUND AND FIXED.** This
  was NOT a single bug — it was **two independent scripts sharing the same
  flawed default-fixture-selection pattern**, compounded by a real perf bug
  in one of them:

  1. `python/parent_atlas_networkx_pagerank.py:106` — `argparse` default
     for `--fixture` is `DEFAULT_FROZEN_FIXTURE if DEFAULT_FROZEN_FIXTURE.exists()
     else DEFAULT_FIXTURE`, where `DEFAULT_FROZEN_FIXTURE =
     graphify/frozen-graph-snapshot-v2.json`. That file **exists locally and
     is 486,654,818 bytes**. Confirmed via direct count: **162,234 nodes /
     108,156 edges**. NetworkX `pagerank()` on a graph that size is slow but
     survivable.
  2. `scripts/atlas/compute-pagerank-neo4j-v2.mjs:18-24` has the **exact same
     default-fixture bug** (same frozen-snapshot-if-it-exists logic), but
     it's far more severe here: the script writes fixture data into Neo4j
     with **one sequential `await session.run(...)` per node, then one
     sequential `await session.run(...)` per edge** (lines 76-101) — no
     batching, no `UNWIND`. For the 486MB snapshot that's **270,390
     sequential Cypher round-trips**, each individually awaited. This is
     what actually produced the multi-minute hangs (two separate background
     vitest runs were killed via `TaskStop` earlier this session after 10+
     minutes each) — not slow JSON parsing as originally suspected.

  **Fix applied**: `pagerank-parity.spec.ts` now explicitly passes
  `--fixture <path-to-the-6-node/5-edge-test-fixture>` to BOTH subprocess
  invocations (`run('python', [pythonOracle, '--fixture', pythonFixture])`
  and `run('node', [gdsRunner, '--fixture', pythonFixture, '--json'])`),
  removing any dependency on either script's own default-selection logic.
  Root cause and fix are documented inline in the spec file as a comment.

  **Verified**: full 4-spec suite now runs in ~10s and passes 12/12, twice
  in a row. `NEO4J_GDS_PROVEN: true`, Spearman correlation `1.0`, max score
  delta `2.75e-9` — Neo4j GDS is genuinely available and passes parity in
  this environment (updates the prior assumption in this repo's docs that
  Neo4j GDS / RAPIDS parity was NOT_PROVEN — GDS specifically now IS proven;
  RAPIDS/cuGraph GPU parity was not exercised by this suite and remains
  unaddressed).

- [ ] **Not fixed, deliberately out of scope for this handoff**: the
  `compute-pagerank-neo4j-v2.mjs` sequential-write pattern (270K un-batched
  awaited Cypher calls) is a real, separate perf bug in that script
  independent of the test-fixture issue. It only matters when the script is
  invoked without `--fixture` against the full frozen snapshot (e.g., a real
  production PageRank run, not this parity test). If that script is ever
  meant to run against the full corpus, it needs `UNWIND`-based batched
  writes before it's usable at that scale — flagged here, not fixed.

## Next steps (in priority order)

1. **Commit the 5 touched files** (see below) — they are still uncommitted
   local changes on `main` as of this handoff.
2. **If `compute-pagerank-neo4j-v2.mjs` is ever meant to run against the full
   ~162K-node frozen snapshot in production** (not just this fixture test),
   rewrite its node/edge ingestion to use batched `UNWIND $rows AS row
   CREATE (...)` instead of one `session.run()` per row — this is a real,
   separate, unaddressed perf bug.
3. Decide on RAPIDS/cuGraph GPU PageRank parity — genuinely NOT_PROVEN in
   this repo (not addressed this session — Neo4j GDS parity specifically IS
   now proven, but that's a different lane from RAPIDS GPU).
4. Do **not** trust the parallel clone's (`deeds-web-app-post17-clean`)
   reported fixes without re-verifying them here first, the same way this
   session did for all 3 issues above — its file paths and specific claims
   do not necessarily reflect this repository's actual state.

## Files touched this session

- `sveltekit-frontend/src/lib/server/atlas/graph/atlas-rapids-pagerank-client.ts` — `pagerank` made `async`.
- `sveltekit-frontend/src/lib/server/atlas/graph/okf-schema.ts` — vocabulary alignment.
- `sveltekit-frontend/src/lib/server/atlas/graph/pagerank-parity.spec.ts` — `maxBuffer` added to `run()`; both subprocess calls now pin `--fixture` to the small test fixture explicitly instead of relying on either script's own default-selection logic.

No graph, Qdrant, Postgres, Neo4j, or Valkey writes occurred outside the
existing fixture-isolated test path (the Neo4j GDS runner creates and tears
down its own `:AtlasContextNode` fixture nodes scoped to a random
`fixture_run_id`, per its existing design). No commit was made for these
files yet — they are uncommitted local changes on `main` at the time of this
handoff.
