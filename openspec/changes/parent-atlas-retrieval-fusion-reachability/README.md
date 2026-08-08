# parent-atlas-retrieval-fusion-reachability

Reachability census of the Parent Atlas retrieval/fusion subsystem. Corrects the assumption that a single RRF implementation governs search: proves 13 distinct fusion/scoring implementations exist across 5 independently-live retrieval pipelines with no shared candidate-identity boundary, identifies the true canonical production spine (`SearchRuntime`/`retrieve-candidates.ts`, not any of the `rrf-*.ts` modules), and lays out the ordered path to fix identity degradation at the actual live risk point instead of on an already-correct-but-non-canonical reference implementation.

## Status (2026-08-08, paused for handoff — not blocked, just out of budget)

**Done and verified**: RF1 (reachability trace), RF2 (13-implementation classification), RF3
(inventory complete — 3 files classified DEAD_ORPHAN, no 6th live pipeline found), RF4 (identity
degradation fixed at the canonical spine's actual candidate-construction boundary), and the
within-lane best-rank half of RF5. A live Postgres->Qdrant trace against one real entity found and
closed a real bug in the fix itself (`content_hash` tier added — see RF5 in `tasks.md`). 25 tests
passing across 3 new/updated test files, zero typecheck regressions, zero test regressions
(verified via `git stash` diff against baseline).

**Resume here** — see `tasks.md` for full detail, in priority order:
1. Live re-verification: re-query Qdrant for the traced entity (`codebase_chunk_index.id =
   8a56e975-ae96-4102-813c-894de6d8975a`) and confirm `content_hash` resolution now behaves as the
   unit tests predict, against real data, not just the fixture.
2. Wire `content_hash` into the 6 Postgres lexical lanes in `retrieve-candidates.ts` (their SQL
   queries don't `SELECT content_hash` yet — needs query changes, deliberately out of scope for
   the session that added the tier).
3. Neo4j and Redis legs of the round trip (not attempted at all yet).
4. RF5's remaining half: `combineViaRRF`'s same-lane double-vote bug (different, more severe than
   the one already fixed in `SearchRuntime.fuseCandidates`) — tracked under RF6.
5. RF6: per-pipeline decide/fix/retire for the other 4 live fusion owners.
6. `graphify:daily` refresh, then authority attachment proof (in that order — refresh first).
7. Deep-audit skill + GAN validation pass, once the above lands — requested but not started.

**Do not re-derive**: the reachability findings (RF1-RF3), the identity-quality fix's design (RF4),
or the `content_hash` tier's rationale (RF5) — all are evidence-linked in `tasks.md` and
`proposal.md`. Read those first if resuming in a new session.

**See also**: `parent-atlas-retrieval-lod-algorithm-taxonomy` names the target architecture RF6
should converge the 13 fusion owners toward (its domains 1 and 5) — read it before designing RF6's
per-pipeline decisions so the decisions aim at a named destination instead of an ad hoc one. It does
not change or shortcut anything in this change's own task list.

**2026-08-08 deep-audit addendum (scoped `src/lib/server/retrieval/` gate sweep, report-only)**:
- G4: `retrieval/rrf/+server.ts` and `retrieval/canonical-rerank/+server.ts` show 0 auth-guard hits
  (`locals.user`/`requireAuth`/`getSession`) — likely unguarded routes into non-canonical fusion
  pipelines (`rrf-fusion.ts` census entries). Not yet verified live; flag for RF6 or a separate
  quick auth-gate fix, whichever lands first.
- G16: of the 12 fusion-adjacent files, `identity-resolution.ts`, `retrieve-candidates.ts`,
  `rrf-fusion.ts`, `rrf-combiner.ts`, `rrf-integration.ts`, `candidate-scorer.ts` are test-paired;
  `rrf-combiner-utils.ts`, `rrf-fuse.ts`, `rrf-lane-ranker.ts`, `compute-rrf-score.ts`,
  `hybrid-score.ts`, `signal-normalizer.ts` are not — useful RF6 prioritization signal (unpaired
  files carry more regression risk when decided/fixed/retired).
- G20: 0 import cycles found among all RRF/fusion-related files — safe to refactor without cycle
  untangling as a precondition.
- Sanity check: `search-runtime.ts` typechecks clean (`npx tsgo --noEmit`, 0 errors), confirming
  RF4's earlier structural-bug fix held.
- Surprising, not yet triaged: `rrf-fuse.ts`, `rrf-fusion.ts`, `rrf-integration.ts`,
  `rrf-combiner.ts`, `rrf-multi-vector.ts`, `retrieval-fusion-rrf.ts` all coexist with overlapping
  names — likely a naming-collision hazard for RF6, not just an implementation-count one.
- G1 turned up ~33 candidate-orphan files in the wider directory (unrelated to the fusion census —
  e.g. `phase2-{autoencoder,kmeans,som}-*.ts`, `discover-clusters.ts`, `batch-search.ts`) — **not
  verified via the D9 orphan-verification pipeline**, so not actionable yet; noted here only so a
  future pass doesn't have to rediscover the candidate list from scratch.

**2026-08-08, later same day: Domains 3–5 of the LOD taxonomy wired on the canonical spine.** Per
explicit user direction, `parent-atlas-retrieval-lod-algorithm-taxonomy`'s "blocked until RF6"
gate was overridden for a narrow, disclosed slice — new `feature-matrix.ts` wires the canonical
Postgres authority table (`atlas_graph_authority_scores`) into `search-runtime.ts`'s scorer input,
and fixes a real bug where `pageRankScore` was silently dropped before reaching the blend function
(~15% of total scorer weight was inert for every query, unrelated to anything RF1-RF5 touched).
This did **not** touch RF6's scope (the other 4 fusion owners) or `combineViaRRF`'s same-lane bug
— both remain exactly as described above. Full writeup:
`parent-atlas-retrieval-lod-algorithm-taxonomy/proposal.md` "2026-08-08 addendum" section.
